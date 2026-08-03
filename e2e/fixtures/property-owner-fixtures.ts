import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unlinkSync, writeFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const LOCAL_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const LOCAL_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
export const LOCAL_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
export const TEST_PASSWORD = "LocalOwner!2026";

export type OwnerFixture = {
  organizationA: string;
  organizationB: string;
  apartmentA: string;
  apartmentB: string;
  organizationOwner: { id: string; email: string };
  manager: { id: string; email: string };
  activeOwner: { id: string; email: string };
  pausedOwner: { id: string; email: string };
  confirmedBooking: string;
  pendingBooking: string;
  ownerBlock: string;
  adminBlock: string;
};

export function assertLocalFixtureEnv() {
  if (process.env.E2E_LOCAL !== "true" || process.env.E2E_BASE_URL !== "http://localhost:3201") {
    throw new Error("Property owner fixtures require E2E_LOCAL=true and E2E_BASE_URL=http://localhost:3201.");
  }
  if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(LOCAL_SUPABASE_URL)) {
    throw new Error("Property owner fixtures require local NEXT_PUBLIC_SUPABASE_URL.");
  }
  if (!LOCAL_SERVICE_ROLE_KEY || !LOCAL_ANON_KEY) {
    throw new Error("Property owner fixtures require local Supabase service and anon keys.");
  }
}

function adminClient(): SupabaseClient {
  assertLocalFixtureEnv();
  return createClient(LOCAL_SUPABASE_URL, LOCAL_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function createAuthUser(admin: SupabaseClient, email: string, firstName: string, role: string, phone = "+79990009999") {
  const result = await admin.auth.admin.createUser({ email, password: TEST_PASSWORD, email_confirm: true, user_metadata: { first_name: firstName, last_name: "Fixture", phone, role } });
  if (result.error || !result.data.user) throw new Error(`fixture auth user failed: ${result.error?.message ?? email}`);
  const user = result.data.user;
  return { id: user.id, email };
}

function sql(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) return `array[${value.map(sql).join(",")}]::uuid[]`;
  return `'${String(value).replaceAll("'", "''")}'`;
}

function runLocalSql(statement: string) {
  const statements = statement.split(/;\s*(?=insert\s+into)/i).map((part) => part.trim()).filter(Boolean);
  for (const currentStatement of statements) try {
    const cli = process.env.SUPABASE_CLI_PATH ?? "supabase.cmd";
    const file = join(tmpdir(), `property-owner-fixture-${randomUUID()}.sql`);
    writeFileSync(file, `${currentStatement};`, "utf8");
    try {
      execFileSync("cmd.exe", ["/d", "/s", "/c", `${cli} db query --local --file ${file}`], { stdio: "pipe", encoding: "utf8" });
    } finally {
      unlinkSync(file);
    }
  } catch (error) {
    const detail = error && typeof error === "object"
      ? JSON.stringify({
        message: String(error),
        status: (error as { status?: number }).status,
        stderr: String((error as { stderr?: string | Buffer }).stderr ?? ""),
        stdout: String((error as { stdout?: string | Buffer }).stdout ?? ""),
      })
      : String(error);
    throw new Error(`fixture SQL failed: ${detail}`);
  }
}

export async function seedPropertyOwnerFixtures(): Promise<OwnerFixture> {
  const admin = adminClient();
  const suffix = Date.now().toString(36);
  const owner = await createAuthUser(admin, `owner-${suffix}@local.test`, "Organization", "owner");
  const manager = await createAuthUser(admin, `manager-${suffix}@local.test`, "Manager", "manager");
  const activeOwner = await createAuthUser(admin, `active-owner-${suffix}@local.test`, "Active", "property_owner");
  const pausedOwner = await createAuthUser(admin, `paused-owner-${suffix}@local.test`, "Paused", "property_owner");

  const organizationA = randomUUID();
  const organizationB = randomUUID();
  runLocalSql(`insert into public.organizations (id,name,slug,owner_id) values
    (${sql(organizationA)},'Fixture Organization A',${sql(`fixture-a-${suffix}`)},${sql(owner.id)}),
    (${sql(organizationB)},'Fixture Organization B',${sql(`fixture-b-${suffix}`)},${sql(owner.id)});`);
  const apartmentA = randomUUID();
  const apartmentB = randomUUID();
  const client = randomUUID();
  const confirmedBooking = randomUUID();
  const pendingBooking = randomUUID();
  const ownerBlock = randomUUID();
  const adminBlock = randomUUID();
  runLocalSql(`insert into public.organization_members (organization_id,user_id,role,role_code,status,invited_by) values
    (${sql(organizationA)},${sql(owner.id)},'owner','owner','active',null),(${sql(organizationA)},${sql(manager.id)},'manager','manager','active',${sql(owner.id)}),
    (${sql(organizationB)},${sql(owner.id)},'owner','owner','active',null);
    insert into public.apartments (id,organization_id,title,name,city,address,price,daily_price,rental_types,max_guests,status,availability,publication_status,publish_status) values
    (${sql(apartmentA)},${sql(organizationA)},'Таур Fixture A','Таур Fixture A','Test City','Local A',100,100,'{"daily":true}'::jsonb,4,'Свободно','Свободен','published','published'),
    (${sql(apartmentB)},${sql(organizationB)},'Foreign Fixture B','Foreign Fixture B','Other City','Local B',200,200,'{"daily":true}'::jsonb,4,'Свободно','Свободен','published','published');
    insert into public.apartment_owner_access (organization_id,apartment_id,user_id,owner_name,owner_email,status) values
    (${sql(organizationA)},${sql(apartmentA)},${sql(activeOwner.id)},'Active Fixture',${sql(activeOwner.email)},'active'),(${sql(organizationA)},${sql(apartmentA)},${sql(pausedOwner.id)},'Paused Fixture',${sql(pausedOwner.email)},'paused');
    insert into public.clients (id,organization_id,name,email,phone) values (${sql(client)},${sql(organizationA)},'Private Fixture Guest','guest-private@local.test','+79990000000');
    insert into public.bookings (id,organization_id,apartment_id,client_id,guest_name,guest_email,guest_phone,check_in,check_out,check_in_date,check_out_date,total_amount,payment_status,status) values
    (${sql(confirmedBooking)},${sql(organizationA)},${sql(apartmentA)},${sql(client)},'Private Guest','private-booking@local.test','+79990000001','2030-02-10','2030-02-12','2030-02-10','2030-02-12',99999,'paid','confirmed'),
    (${sql(pendingBooking)},${sql(organizationA)},${sql(apartmentA)},${sql(client)},'Pending Guest','pending-booking@local.test','+79990000002','2030-03-10','2030-03-12','2030-03-10','2030-03-12',50000,'pending','pending');
    insert into public.availability_blocks (id,organization_id,apartment_id,start_date,end_date,block_type,reason,reason_code,private_note,owner_access_id,block_source,created_by,status) values
    (${sql(ownerBlock)},${sql(organizationA)},${sql(apartmentA)},'2030-04-10','2030-04-12','owner_block','owner_stay','owner_stay','Private owner fixture note',(select id from public.apartment_owner_access where user_id=${sql(activeOwner.id)} and apartment_id=${sql(apartmentA)}),'owner',${sql(activeOwner.id)},'active'),
    (${sql(adminBlock)},${sql(organizationA)},${sql(apartmentA)},'2030-05-10','2030-05-12','maintenance','maintenance','maintenance','Private staff fixture note',null,'staff',${sql(owner.id)},'active');`);

  return { organizationA, organizationB, apartmentA, apartmentB, organizationOwner: owner, manager, activeOwner, pausedOwner, confirmedBooking, pendingBooking, ownerBlock, adminBlock };
}

export async function signInClient(email: string) {
  assertLocalFixtureEnv();
  const client = createClient(LOCAL_SUPABASE_URL, LOCAL_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const result = await client.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  if (result.error || !result.data.session) throw new Error(`fixture sign in failed: ${result.error?.message ?? email}`);
  return result.data.session;
}

export async function cleanupPropertyOwnerFixtures(fixture: OwnerFixture) {
  const admin = adminClient();
  runLocalSql(`delete from public.organizations where id in (${sql(fixture.organizationA)},${sql(fixture.organizationB)});`);
  for (const user of [fixture.organizationOwner, fixture.manager, fixture.activeOwner, fixture.pausedOwner]) {
    const result = await admin.auth.admin.deleteUser(user.id);
    if (result.error && result.error.status !== 404) throw new Error(`fixture auth cleanup failed: ${result.error.message}`);
  }
}
