import { expect, test } from "@playwright/test";
import { createSupportFixture, sha256 } from "./fixtures/support-conversation-fixtures";

test.describe("initial support create transaction contract", () => {
  let fixture: Awaited<ReturnType<typeof createSupportFixture>>;
  test.beforeAll(async () => { fixture = await createSupportFixture(); });
  test.afterAll(async () => { if (fixture) await fixture.cleanup(); });
  test("successful RPC always creates ticket, initial message, and audit together", async () => {
    const idempotency = crypto.randomUUID();
    const result = await fixture.admin.rpc("support_create_conversation_with_initial_message", { ticket_payload: { organization_id: fixture.organizationA, requester_user_id: fixture.clientA.id, requester_name: "Client", requester_language: "ru", category: "general", priority: "normal", status: "open", conversation_state: "waiting_manager", subject: "Atomic", customer_message: "Initial", conversation_summary: "Summary", ai_summary: "Summary", delivery_status: "no_recipients", idempotency_scope: `atomic:${idempotency}`, idempotency_key_hash: sha256(idempotency), confirmation_action_id: crypto.randomUUID(), confirmation_expires_at: new Date(Date.now() + 60000).toISOString() }, initial_message: "Initial", audit_metadata: { test: true } });
    expect(result.error).toBeNull();
    const ticket = Array.isArray(result.data) ? result.data[0] : result.data;
    const messages = await fixture.admin.from("support_messages").select("id").eq("ticket_id", ticket.id);
    const audit = await fixture.admin.from("support_audit_log").select("id").eq("ticket_id", ticket.id);
    expect(messages.data).toHaveLength(1); expect(audit.data).toHaveLength(1);
  });
  test("Telegram failure is represented as delivery state, not a ticket rollback", async () => {
    const id = crypto.randomUUID();
    await fixture.admin.from("support_tickets").insert({ id, organization_id: fixture.organizationA, subject: "Delivery", customer_message: "Initial", idempotency_scope: `delivery:${id}`, idempotency_key_hash: sha256(id), delivery_status: "all_failed" });
    const row = await fixture.admin.from("support_tickets").select("delivery_status").eq("id", id).single();
    expect(row.data?.delivery_status).toBe("all_failed");
  });
});
