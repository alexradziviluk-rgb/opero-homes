import { expect, test } from "@playwright/test";
import { createSupportFixture, sha256 } from "./fixtures/support-conversation-fixtures";

test.describe("anonymous revoke contract", () => {
  let fixture: Awaited<ReturnType<typeof createSupportFixture>>;
  test.beforeAll(async () => { fixture = await createSupportFixture(); });
  test.afterAll(async () => { if (fixture) await fixture.cleanup(); });
  test("valid access is revoked atomically and repeated revoke is a noop", async () => {
    const id = crypto.randomUUID();
    await fixture.admin.from("support_tickets").insert({ id, organization_id: fixture.organizationA, requester_user_id: null, subject: "Revoke", customer_message: "Question", idempotency_scope: `revoke:${id}`, idempotency_key_hash: sha256(id), anonymous_access_token_hash: sha256(`token-${id}`), anonymous_access_expires_at: new Date(Date.now() + 60000).toISOString() });
    const first = await fixture.admin.rpc("support_revoke_anonymous_access", { target_ticket_id: id, actor_user_id: fixture.manager1.id, revoke_reason: "manual" });
    const second = await fixture.admin.rpc("support_revoke_anonymous_access", { target_ticket_id: id, actor_user_id: fixture.manager1.id, revoke_reason: "manual" });
    const row = await fixture.admin.from("support_tickets").select("anonymous_access_revoked_at,anonymous_access_revoked_by,anonymous_access_revoke_reason").eq("id", id).single();
    expect(first.error).toBeNull(); expect(first.data).toHaveLength(1); expect(second.error).toBeNull(); expect(second.data).toEqual([]); expect(row.data?.anonymous_access_revoked_by).toBe(fixture.manager1.id); expect(row.data?.anonymous_access_revoke_reason).toBe("manual");
  });
  test("wrong organization and client identities cannot revoke", async () => {
    const id = crypto.randomUUID();
    await fixture.admin.from("support_tickets").insert({ id, organization_id: fixture.organizationA, requester_user_id: null, subject: "Revoke", customer_message: "Question", idempotency_scope: `revoke:${id}`, idempotency_key_hash: sha256(id), anonymous_access_token_hash: sha256(`token-${id}`), anonymous_access_expires_at: new Date(Date.now() + 60000).toISOString() });
    const wrong = await fixture.admin.rpc("support_revoke_anonymous_access", { target_ticket_id: id, actor_user_id: fixture.managerB.id, revoke_reason: "wrong" });
    const client = await fixture.admin.rpc("support_revoke_anonymous_access", { target_ticket_id: id, actor_user_id: fixture.clientA.id, revoke_reason: "wrong" });
    expect(wrong.data).toEqual([]); expect(client.data).toEqual([]);
  });
});
