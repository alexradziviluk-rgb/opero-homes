import { createHash, randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type AuditRole = "admin" | "manager" | "employee" | "cleaner" | "maintenance" | "guest" | "propertyOwner";
export type AuditAccount = { role: AuditRole; email: string; password: string; id: string };
export type RoleAuditFixture = {
  prefix: string;
  organizationId: string;
  apartmentPublishedId: string;
  apartmentDraftId: string;
  clientId: string;
  confirmedBookingId: string;
  pendingBookingId: string;
  cleaningTaskId: string;
  maintenanceTaskId: string;
  ownerBlockId: string;
  lifecycleApartmentIds: string[];
  accounts: Record<AuditRole, AuditAccount>;
  storagePaths: string[];
};

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
const CLEANUP_TIMEOUT_MS = 15_000;

export function assertRoleAuditLocalEnv() {
  if (process.env.E2E_LOCAL !== "true" || !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url)) {
    throw new Error("Role audit fixtures require local E2E_SUPABASE configuration.");
  }
  if (!serviceRoleKey || !anonKey) throw new Error("Local Supabase keys are required for role audit fixtures.");
}

function adminClient(): SupabaseClient {
  assertRoleAuditLocalEnv();
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      fetch: async (input, init) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), CLEANUP_TIMEOUT_MS);
        try {
          return await fetch(input, { ...init, signal: controller.signal });
        } finally {
          clearTimeout(timer);
        }
      },
    },
  });
}

function runLocalSql(statement: string) {
  const file = join(tmpdir(), `role-audit-sql-${randomUUID()}.sql`);
  writeFileSync(file, statement, "utf8");
  try {
    execFileSync("cmd.exe", ["/d", "/s", "/c", `supabase db query --local --file ${file}`], { encoding: "utf8", stdio: "pipe", timeout: CLEANUP_TIMEOUT_MS, killSignal: "SIGTERM" });
  } finally {
    unlinkSync(file);
  }
}

function localEmail(prefix: string, role: AuditRole) {
  return `${prefix.toLowerCase()}-${role}@local.test`;
}

async function createAccount(admin: SupabaseClient, prefix: string, role: AuditRole, firstName: string, authRole: string): Promise<AuditAccount> {
  const email = localEmail(prefix, role);
  const password = `${randomBytes(18).toString("base64url")}A1!`;
  const result = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { first_name: firstName, last_name: "E2E Role Audit", role: authRole, e2e_prefix: prefix } });
  if (result.error || !result.data.user) throw new Error(`Unable to create local ${role}: ${result.error?.message ?? email}`);
  console.info("[role-audit-fixture]", { event: "auth-created", role, fixture: prefix, userPresent: Boolean(result.data.user), at: new Date().toISOString() });
  return { role, email, password, id: result.data.user.id };
}

async function insertOrThrow(admin: SupabaseClient, table: string, values: Record<string, unknown> | Record<string, unknown>[]) {
  void admin;
  const rows = Array.isArray(values) ? values : [values];
  const columns = Object.keys(rows[0]);
  const literal = (value: unknown) => {
    if (value === null || value === undefined) return "null";
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    if (typeof value === "object") return `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
    return `'${String(value).replaceAll("'", "''")}'`;
  };
  const statement = `insert into public.${table} (${columns.join(",")}) values ${rows.map((row) => `(${columns.map((column) => literal(row[column])).join(",")})`).join(",")};`;
  const file = join(tmpdir(), `role-audit-${randomUUID()}.sql`);
  writeFileSync(file, statement, "utf8");
  try {
    execFileSync("cmd.exe", ["/d", "/s", "/c", `supabase db query --local --file ${file}`], { encoding: "utf8", stdio: "pipe" });
  } catch (error) {
    const details = error as { message?: string; stderr?: string; stdout?: string };
    throw new Error(`Unable to seed ${table}: ${details.message ?? String(error)}\nstderr: ${details.stderr ?? ""}\nstdout: ${details.stdout ?? ""}`);
  } finally {
    unlinkSync(file);
  }
}

export async function seedRoleAuditFixtures(): Promise<RoleAuditFixture> {
  const admin = adminClient();
  runLocalSql("grant select, update on public.profiles to authenticated;");
  runLocalSql("grant select on public.bookings, public.clients, public.notifications, public.notification_events to authenticated;");
  runLocalSql("grant select on public.bookings to service_role;");
  const prefix = `E2E-ROLE-AUDIT-${Date.now()}`;
  console.info("[role-audit-fixture]", { event: "seed-start", fixture: prefix, at: new Date().toISOString() });
  const roleSpecs: Array<[AuditRole, string, string]> = [
    ["admin", "E2E Admin", "owner"],
    ["manager", "E2E Manager", "manager"],
    ["employee", "E2E Employee", "employee"],
    ["cleaner", "E2E Cleaner", "cleaner"],
    ["maintenance", "E2E Maintenance", "maintenance"],
    ["guest", "E2E Guest", "guest"],
    ["propertyOwner", "E2E Property Owner", "guest"],
  ];
  const accounts = {} as Record<AuditRole, AuditAccount>;
  for (const [role, name, authRole] of roleSpecs) accounts[role] = await createAccount(admin, prefix, role, name, authRole);
  runLocalSql(`update public.profiles set phone = '+79990001111' where id = '${accounts.guest.id}';`);

  const organizationId = randomUUID();
  const apartmentPublishedId = randomUUID();
  const apartmentDraftId = randomUUID();
  const clientId = randomUUID();
  const confirmedBookingId = randomUUID();
  const pendingBookingId = randomUUID();
  const cleaningTaskId = randomUUID();
  const maintenanceTaskId = randomUUID();
  const ownerBlockId = randomUUID();
  const eventId = randomUUID();
  const now = new Date();
  const dueAt = new Date(now.getTime() + 86_400_000).toISOString();
  const startDate = new Date(now.getTime() + 10 * 86_400_000).toISOString().slice(0, 10);
  const endDate = new Date(now.getTime() + 12 * 86_400_000).toISOString().slice(0, 10);

  await insertOrThrow(admin, "organizations", { id: organizationId, name: `${prefix} Organization`, slug: prefix.toLowerCase(), owner_id: accounts.admin.id });
  await insertOrThrow(admin, "organization_members", roleSpecs.slice(0, 5).map(([role]) => ({ organization_id: organizationId, user_id: accounts[role].id, role: role === "admin" ? "owner" : role, role_code: role === "admin" ? "owner" : role, status: "active", invited_by: accounts.admin.id })));
  await insertOrThrow(admin, "apartments", [
    { id: apartmentPublishedId, organization_id: organizationId, name: `${prefix} Published Apartment`, title: `${prefix} Published Apartment`, city: "Alanya", address: `${prefix} Published Address`, price: 100, daily_price: 100, rental_types: { daily: true }, max_guests: 4, status: "Свободно", availability: "Свободен", publication_status: "published", publish_status: "published", responsible_user_id: accounts.employee.id, backup_manager_user_id: accounts.manager.id },
    { id: apartmentDraftId, organization_id: organizationId, name: `${prefix} Draft Apartment`, title: `${prefix} Draft Apartment`, city: "Alanya", address: `${prefix} Draft Address`, price: 120, daily_price: 120, rental_types: { daily: true }, max_guests: 4, status: "Свободно", availability: "Свободен", publication_status: "draft", publish_status: "draft", responsible_user_id: accounts.employee.id, backup_manager_user_id: accounts.manager.id },
  ]);
  await insertOrThrow(admin, "clients", { id: clientId, organization_id: organizationId, name: `${prefix} Guest`, email: accounts.guest.email, phone: "+79990001111" });
  await insertOrThrow(admin, "bookings", [
    { id: confirmedBookingId, organization_id: organizationId, apartment_id: apartmentPublishedId, client_id: clientId, guest_name: `${prefix} Confirmed Guest`, guest_email: accounts.guest.email, guest_phone: "+79990001111", check_in: startDate, check_out: endDate, check_in_date: startDate, check_out_date: endDate, total_amount: 1000, payment_status: "pending", status: "confirmed", request_status: "confirmed" },
    { id: pendingBookingId, organization_id: organizationId, apartment_id: apartmentPublishedId, client_id: clientId, guest_name: `${prefix} Pending Guest`, guest_email: accounts.guest.email, guest_phone: "+79990002222", check_in: new Date(now.getTime() + 20 * 86_400_000).toISOString().slice(0, 10), check_out: new Date(now.getTime() + 22 * 86_400_000).toISOString().slice(0, 10), check_in_date: new Date(now.getTime() + 20 * 86_400_000).toISOString().slice(0, 10), check_out_date: new Date(now.getTime() + 22 * 86_400_000).toISOString().slice(0, 10), total_amount: 1200, payment_status: "pending", status: "pending", request_status: "pending" },
  ]);
  await insertOrThrow(admin, "operational_tasks", [
    { id: cleaningTaskId, organization_id: organizationId, apartment_id: apartmentPublishedId, booking_id: confirmedBookingId, title: `${prefix} Cleaning Task`, description: `${prefix} cleaning`, task_type: "cleaning", priority: "normal", status: "assigned", assigned_user_id: accounts.cleaner.id, due_at: dueAt, created_by: accounts.admin.id },
    { id: maintenanceTaskId, organization_id: organizationId, apartment_id: apartmentPublishedId, booking_id: confirmedBookingId, title: `${prefix} Maintenance Task`, description: `${prefix} maintenance`, task_type: "technical", priority: "normal", status: "assigned", assigned_user_id: accounts.maintenance.id, due_at: dueAt, created_by: accounts.admin.id },
  ]);
  const ownerAccessId = randomUUID();
  await insertOrThrow(admin, "apartment_owner_access", { id: ownerAccessId, organization_id: organizationId, apartment_id: apartmentPublishedId, user_id: accounts.propertyOwner.id, owner_name: `${prefix} Property Owner`, owner_email: accounts.propertyOwner.email, status: "active" });
  await insertOrThrow(admin, "availability_blocks", { id: ownerBlockId, organization_id: organizationId, apartment_id: apartmentPublishedId, start_date: new Date(now.getTime() + 30 * 86_400_000).toISOString().slice(0, 10), end_date: new Date(now.getTime() + 32 * 86_400_000).toISOString().slice(0, 10), block_type: "owner_block", reason: "owner_stay", reason_code: "owner_stay", private_note: `${prefix} private owner note`, owner_access_id: ownerAccessId, block_source: "owner", created_by: accounts.propertyOwner.id, status: "active" });
  await insertOrThrow(admin, "employee_invitations", { organization_id: organizationId, email: `${prefix.toLowerCase()}-invited@local.test`, phone: "+79990003333", first_name: "E2E", last_name: "Invited", role_code: "employee", token_hash: createHash("sha256").update(randomBytes(32)).digest("hex"), invited_by: accounts.admin.id, expires_at: new Date(now.getTime() + 86_400_000).toISOString(), delivery_channel: "email", delivery_status: "pending" });
  await insertOrThrow(admin, "notification_events", { id: eventId, organization_id: organizationId, event_type: "booking_created", entity_type: "booking", entity_id: pendingBookingId, booking_id: pendingBookingId, apartment_id: apartmentPublishedId, payload: { prefix }, idempotency_key: `${prefix}-notification`, created_by_user_id: accounts.admin.id });
  await insertOrThrow(admin, "notifications", roleSpecs.slice(0, 5).map(([role]) => ({ organization_id: organizationId, recipient_user_id: accounts[role].id, event_id: eventId, title: `${prefix} Notification`, message: `${prefix} notification`, action_url: `/bookings/${pendingBookingId}` })));

  const fixture = { prefix, organizationId, apartmentPublishedId, apartmentDraftId, clientId, confirmedBookingId, pendingBookingId, cleaningTaskId, maintenanceTaskId, ownerBlockId, lifecycleApartmentIds: [], accounts, storagePaths: [] };
  console.info("[role-audit-fixture]", { event: "seed-finish", fixture: prefix, recordsSeeded: true, at: new Date().toISOString() });
  return fixture;
}

export async function signInRole(account: AuditAccount) {
  assertRoleAuditLocalEnv();
  const client = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const result = await client.auth.signInWithPassword({ email: account.email, password: account.password });
  if (result.error || !result.data.session) throw new Error(`Unable to sign in ${account.role}: ${result.error?.message ?? account.email}`);
  return result.data.session;
}

export async function uploadApartmentPhotoForAudit(account: AuditAccount, organizationId: string, apartmentId: string, fileName: string) {
  const session = await signInRole(account);
  const client = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const sessionResult = await client.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
  if (sessionResult.error) throw new Error(`Unable to establish ${account.role} storage session: ${sessionResult.error.message}`);

  const storagePath = `organizations/${organizationId}/apartments/${apartmentId}/${randomUUID()}-${fileName}`;
  const result = await client.storage.from("apartment-photos").upload(storagePath, new Blob(["e2e-photo"], { type: "image/png" }), {
    contentType: "image/png",
    upsert: false,
  });
  return { storagePath, error: result.error?.message ?? null };
}

export async function uploadApartmentPhotoAnonymouslyForAudit(organizationId: string, apartmentId: string, fileName: string) {
  const client = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const storagePath = `organizations/${organizationId}/apartments/${apartmentId}/${randomUUID()}-${fileName}`;
  const result = await client.storage.from("apartment-photos").upload(storagePath, new Blob(["e2e-photo"], { type: "image/png" }), {
    contentType: "image/png",
    upsert: false,
  });
  return { storagePath, error: result.error?.message ?? null };
}

export async function readBookingForAudit(bookingId: string) {
  const admin = adminClient();
  const result = await admin
    .from("bookings")
    .select("id,organization_id,apartment_id,primary_guest_id,guest_name,guest_email,guest_phone,guest_comment,check_in,check_out,check_in_date,check_out_date,guests_count,status,request_status")
    .eq("id", bookingId)
    .maybeSingle();

  if (result.error) throw new Error(`Unable to read booking audit row: ${result.error.message}`);
  return result.data;
}

export async function readApartmentForAuditByTitle(title: string) {
  const admin = adminClient();
  const result = await admin
    .from("apartments")
    .select("id,organization_id,name,publication_status,daily_price,rental_types")
    .eq("name", title)
    .maybeSingle();

  if (result.error) throw new Error(`Unable to read apartment audit row: ${result.error.message}`);
  return result.data ? { ...result.data, title: result.data.name } : null;
}

export async function readApartmentForAuditById(apartmentId: string) {
  const admin = adminClient();
  const result = await admin
    .from("apartments")
    .select("id,organization_id,name,publication_status,daily_price,rental_types")
    .eq("id", apartmentId)
    .maybeSingle();

  if (result.error) throw new Error(`Unable to read apartment audit row: ${result.error.message}`);
  return result.data ? { ...result.data, title: result.data.name } : null;
}

function cleanupLog(event: "start" | "finish" | "timeout" | "error", step: string, detail?: string) {
  console.info("[role-audit-cleanup]", { event, step, at: new Date().toISOString(), ...(detail ? { detail } : {}) });
}

async function cleanupStep(step: string, action: () => Promise<void>) {
  cleanupLog("start", step);
  try {
    await Promise.race([
      action(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`cleanup timeout after ${CLEANUP_TIMEOUT_MS}ms`)), CLEANUP_TIMEOUT_MS)),
    ]);
    cleanupLog("finish", step);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    cleanupLog(detail.includes("timeout") ? "timeout" : "error", step, detail);
  }
}

export async function cleanupRoleAuditFixtures(fixture?: RoleAuditFixture) {
  cleanupLog("start", "cleanup");
  if (!fixture) {
    cleanupLog("finish", "cleanup", "no fixture");
    return;
  }
  const admin = adminClient();
  await cleanupStep("organization", async () => {
    for (const apartmentId of [fixture.apartmentPublishedId, fixture.apartmentDraftId, ...fixture.lifecycleApartmentIds]) {
      const prefix = `organizations/${fixture.organizationId}/apartments/${apartmentId}`;
      const listed = await admin.storage.from("apartment-photos").list(prefix, { limit: 1000 });
      if (listed.error) throw new Error(`Unable to list photo objects: ${listed.error.message}`);
      const paths = (listed.data ?? []).filter((item) => item.name).map((item) => `${prefix}/${item.name}`);
      if (paths.length > 0) {
        const removed = await admin.storage.from("apartment-photos").remove(paths);
        if (removed.error) throw new Error(`Unable to remove photo objects: ${removed.error.message}`);
      }
    }
    runLocalSql(`delete from public.organizations where id = '${fixture.organizationId}';`);
  });
  for (const account of Object.values(fixture.accounts)) {
    await cleanupStep(`auth:${account.role}`, async () => {
      const result = await admin.auth.admin.deleteUser(account.id);
      if (result.error && result.error.status !== 404) throw new Error(`Unable to cleanup ${account.role}: ${result.error.message}`);
    });
  }
  await cleanupStep("storage", async () => {
    for (const storagePath of fixture.storagePaths) rmSync(storagePath, { force: true });
  });
  cleanupLog("finish", "cleanup");
}

export function storagePath(prefix: string, role: AuditRole) { return join(tmpdir(), `${prefix}-${role}-storage.json`); }
