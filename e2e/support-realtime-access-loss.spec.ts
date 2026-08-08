import { expect, test } from "@playwright/test";
import { createSupportFixture, sha256 } from "./fixtures/support-conversation-fixtures";

test.describe("realtime access loss contract", () => {
  let fixture: Awaited<ReturnType<typeof createSupportFixture>>;
  test.beforeAll(async () => { fixture = await createSupportFixture(); });
  test.afterAll(async () => { if (fixture) await fixture.cleanup(); });
  test("closed conversations can no longer retain anonymous access", async () => {
    const id = crypto.randomUUID();
    await fixture.admin.from("support_tickets").insert({ id, organization_id: fixture.organizationA, requester_user_id: null, conversation_state: "closed", status: "closed", subject: "Closed", customer_message: "Question", idempotency_scope: `closed:${id}`, idempotency_key_hash: sha256(id), anonymous_access_token_hash: sha256(`token-${id}`), anonymous_access_expires_at: new Date(Date.now() + 60000).toISOString() });
    await fixture.admin.rpc("support_revoke_closed_anonymous_access");
    const row = await fixture.admin.from("support_tickets").select("anonymous_access_revoked_at").eq("id", id).single();
    expect(row.data?.anonymous_access_revoked_at).toBeTruthy();
  });
  test("state loss is represented without reopening a closed conversation", async () => {
    const result = await fixture.admin.rpc("support_transition_conversation", { target_ticket_id: fixture.closedTicket, expected_state: "closed", next_state: "manager_active", actor_user_id: fixture.manager1.id });
    expect(result.error).toBeNull(); expect(result.data).toEqual([]);
  });
});
