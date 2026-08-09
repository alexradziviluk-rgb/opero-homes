import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceKey = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

export type SupportFixture = {
  admin: SupabaseClient;
  organizationA: string;
  organizationB: string;
  clientA: { id: string; email: string; password: string };
  clientB: { id: string; email: string; password: string };
  manager1: { id: string; email: string; password: string };
  manager2: { id: string; email: string; password: string };
  employee: { id: string; email: string; password: string };
  managerB: { id: string; email: string; password: string };
  activeTicket: string;
  waitingTicket: string;
  resolvedTicket: string;
  closedTicket: string;
  legacyTicket: string;
  otherOrgTicket: string;
  cleanup: () => Promise<void>;
};

export function assertSupportLocalEnv() {
  if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url) || !serviceKey || !anonKey) throw new Error("Support DB suites require local Supabase keys. Start local Supabase and run with E2E_SUPABASE=true.");
}

export function clientForTest() { assertSupportLocalEnv(); return createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } }); }

async function user(admin: SupabaseClient, prefix: string, role: string) {
  const email = `${prefix.toLowerCase()}-${role}@support.local`;
  const password = `${randomBytes(18).toString("base64url")}A1!`;
  const result = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { first_name: role, last_name: "Support Test", role } });
  if (result.error || !result.data.user) throw new Error(result.error?.message || `Could not create ${role}`);
  return { id: result.data.user.id, email, password };
}

async function insert(admin: SupabaseClient, table: string, row: unknown) {
  const { error } = await admin.from(table).insert(row as never);
  if (error) throw new Error(`${table}: ${error.message}`);
}

export async function createSupportFixture(): Promise<SupportFixture> {
  assertSupportLocalEnv();
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const prefix = `E2E-SUPPORT-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const clientA = await user(admin, prefix, "client-a");
  const clientB = await user(admin, prefix, "client-b");
  const manager1 = await user(admin, prefix, "manager-1");
  const manager2 = await user(admin, prefix, "manager-2");
  const employee = await user(admin, prefix, "employee");
  const managerB = await user(admin, `${prefix}-b`, "manager-b");
  const organizationA = randomUUID();
  const organizationB = randomUUID();
  await insert(admin, "organizations", [{ id: organizationA, name: `${prefix} A`, slug: `${prefix.toLowerCase()}-a`, owner_id: manager1.id }, { id: organizationB, name: `${prefix} B`, slug: `${prefix.toLowerCase()}-b`, owner_id: managerB.id }]);
  await insert(admin, "organization_members", [
    { organization_id: organizationA, user_id: manager1.id, role: "manager", role_code: "manager", status: "active" },
    { organization_id: organizationA, user_id: manager2.id, role: "manager", role_code: "manager", status: "active" },
    { organization_id: organizationA, user_id: employee.id, role: "employee", role_code: "employee", status: "active" },
    { organization_id: organizationB, user_id: managerB.id, role: "manager", role_code: "manager", status: "active" },
  ]);
  const ticket = async (requester: string, organizationId: string, state: string, assigned: string | null) => {
    const id = randomUUID();
    await insert(admin, "support_tickets", { id, organization_id: organizationId, requester_user_id: requester, requester_name: "Support Test", category: "general", priority: "normal", status: state === "resolved" ? "resolved" : state === "closed" ? "closed" : "open", conversation_state: state, subject: `${prefix} ticket`, customer_message: "Initial message", idempotency_scope: `fixture:${id}`, idempotency_key_hash: randomUUID(), assigned_to: assigned });
    await insert(admin, "support_messages", [{ ticket_id: id, sender_type: "client", sender_user_id: requester, message: "Public message", message_type: "text", content_type: "text", source: "web", is_internal: false }, { ticket_id: id, sender_type: "internal_note", sender_user_id: assigned, message: "Private note", message_type: "internal_note", content_type: "text", source: "system", is_internal: true }]);
    return id;
  };
  const activeTicket = await ticket(clientA.id, organizationA, "manager_active", manager1.id);
  const waitingTicket = await ticket(clientA.id, organizationA, "waiting_manager", null);
  const resolvedTicket = await ticket(clientA.id, organizationA, "resolved", manager1.id);
  const closedTicket = await ticket(clientA.id, organizationA, "closed", manager1.id);
  const otherOrgTicket = await ticket(clientB.id, organizationB, "manager_active", managerB.id);
  const legacyTicket = randomUUID();
  const legacyActionToken = `${randomUUID().replace(/-/g, "")}${randomUUID().replace(/-/g, "").slice(0, 4)}`;
  const legacyChatId = `legacy-chat-${organizationA}`;
  await insert(admin, "support_tickets", { id: legacyTicket, organization_id: organizationA, requester_user_id: clientA.id, requester_name: "Support Test", category: "general", priority: "normal", status: "in_progress", conversation_state: "bot_active", subject: `${prefix} legacy ticket`, customer_message: "Legacy initial message", idempotency_scope: `fixture:${legacyTicket}`, idempotency_key_hash: randomUUID(), confirmation_action_id: randomUUID(), confirmation_expires_at: new Date(Date.now() + 60_000).toISOString(), telegram_action_token: legacyActionToken, telegram_chat_id: legacyChatId, assigned_to: null });
  await insert(admin, "support_messages", { ticket_id: legacyTicket, sender_type: "client", sender_user_id: clientA.id, message: "Legacy public message", message_type: "text", content_type: "text", source: "web", is_internal: false });
  await insert(admin, "support_telegram_message_refs", { ticket_id: legacyTicket, organization_id: organizationA, telegram_chat_id: legacyChatId, telegram_message_id: "legacy-anchor" });
  const cleanup = async () => {
    await admin.from("support_tickets").delete().in("id", [activeTicket, waitingTicket, resolvedTicket, closedTicket, otherOrgTicket, legacyTicket]);
    await admin.from("organization_members").delete().in("user_id", [clientA.id, clientB.id, manager1.id, manager2.id, employee.id, managerB.id]);
    await admin.from("organizations").delete().in("id", [organizationA, organizationB]);
    for (const account of [clientA, clientB, manager1, manager2, employee, managerB]) await admin.auth.admin.deleteUser(account.id);
  };
  return { admin, organizationA, organizationB, clientA, clientB, manager1, manager2, employee, managerB, activeTicket, waitingTicket, resolvedTicket, closedTicket, otherOrgTicket, legacyTicket, cleanup };
}

export function sha256(value: string) { return createHash("sha256").update(value).digest("hex"); }
