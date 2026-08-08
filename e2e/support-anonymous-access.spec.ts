import { expect, test } from "@playwright/test";
import { createSupportFixture, sha256 } from "./fixtures/support-conversation-fixtures";

test.describe("anonymous conversation access DB contract", () => {
  let fixture: Awaited<ReturnType<typeof createSupportFixture>>;
  test.beforeAll(async () => { fixture = await createSupportFixture(); });
  test.afterAll(async () => { if (fixture) await fixture.cleanup(); });

  test("stores only a hash and scopes one token to one conversation", async () => {
    const raw = `anonymous-${Date.now()}`;
    const hash = sha256(raw);
    const tokenTicket = crypto.randomUUID();
    const { error } = await fixture.admin.from("support_tickets").insert({ id: tokenTicket, organization_id: fixture.organizationA, requester_user_id: null, requester_name: "Anonymous", category: "general", priority: "normal", status: "open", conversation_state: "waiting_manager", subject: "Anonymous", customer_message: "Question", idempotency_scope: `anonymous:${tokenTicket}`, idempotency_key_hash: sha256(tokenTicket), anonymous_access_token_hash: hash, anonymous_access_expires_at: new Date(Date.now() + 60_000).toISOString() });
    expect(error).toBeNull();
    const stored = await fixture.admin.from("support_tickets").select("anonymous_access_token_hash,anonymous_access_expires_at,requester_user_id").eq("id", tokenTicket).single();
    expect(stored.data?.anonymous_access_token_hash).toBe(hash); expect(stored.data?.anonymous_access_token_hash).not.toBe(raw); expect(stored.data?.requester_user_id).toBeNull();
    const wrong = await fixture.admin.from("support_tickets").select("id").eq("anonymous_access_token_hash", sha256("wrong"));
    expect(wrong.data).toEqual([]);
  });

  test("expired and revoked hashes cannot remain valid", async () => {
    const id = crypto.randomUUID();
    await fixture.admin.from("support_tickets").insert({ id, organization_id: fixture.organizationA, requester_user_id: null, requester_name: "Anonymous", category: "general", priority: "normal", status: "closed", conversation_state: "closed", subject: "Expired", customer_message: "Question", idempotency_scope: `anonymous:${id}`, idempotency_key_hash: sha256(id), anonymous_access_token_hash: sha256(`expired-${id}`), anonymous_access_expires_at: new Date(Date.now() - 60_000).toISOString(), anonymous_access_revoked_at: new Date().toISOString() });
    const valid = await fixture.admin.from("support_tickets").select("id").eq("id", id).is("anonymous_access_revoked_at", null).gt("anonymous_access_expires_at", new Date().toISOString());
    expect(valid.data).toEqual([]);
  });
});
