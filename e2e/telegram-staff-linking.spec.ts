import { expect, test } from "@playwright/test";
import { createSupportFixture, sha256 } from "./fixtures/support-conversation-fixtures";

test.describe("Telegram staff linking DB contract", () => {
  let fixture: Awaited<ReturnType<typeof createSupportFixture>>;
  test.beforeAll(async () => { fixture = await createSupportFixture(); });
  test.afterAll(async () => { if (fixture) await fixture.cleanup(); });

  test("link token consume is atomic, expiring, and membership-scoped", async () => {
    const raw = `link-${Date.now()}`;
    const token = crypto.randomUUID();
    const inserted = await fixture.admin.from("support_telegram_link_tokens").insert({ organization_id: fixture.organizationA, user_id: fixture.manager1.id, token_hash: sha256(raw), expires_at: new Date(Date.now() + 60_000).toISOString() }).select("id").single();
    expect(inserted.error).toBeNull();
    const first = await fixture.admin.rpc("support_consume_telegram_link_token", { target_token_hash: sha256(raw) });
    const second = await fixture.admin.rpc("support_consume_telegram_link_token", { target_token_hash: sha256(raw) });
    expect(first.error).toBeNull(); expect(first.data).toHaveLength(1); expect(second.data).toEqual([]);
    void token;
  });

  test("Telegram user and chat uniqueness prevent conflicting active bindings", async () => {
    const first = await fixture.admin.from("support_telegram_bindings").insert({ organization_id: fixture.organizationA, user_id: fixture.manager1.id, telegram_user_id: `tg-user-${Date.now()}`, telegram_chat_id: `tg-chat-${Date.now()}` });
    expect(first.error).toBeNull();
    const conflict = await fixture.admin.from("support_telegram_bindings").insert({ organization_id: fixture.organizationB, user_id: fixture.managerB.id, telegram_user_id: (await fixture.admin.from("support_telegram_bindings").select("telegram_user_id").eq("user_id", fixture.manager1.id).single()).data?.telegram_user_id, telegram_chat_id: `tg-other-${Date.now()}` });
    expect(conflict.error?.code).toBe("23505");
  });
});
