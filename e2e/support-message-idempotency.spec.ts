import { expect, test } from "@playwright/test";
import { createSupportFixture } from "./fixtures/support-conversation-fixtures";

test.describe("support message idempotency", () => {
  let fixture: Awaited<ReturnType<typeof createSupportFixture>>;
  test.beforeAll(async () => { fixture = await createSupportFixture(); });
  test.afterAll(async () => { if (fixture) await fixture.cleanup(); });

  test("same client_message_id cannot create two rows", async () => {
    const clientMessageId = `idempotent-${Date.now()}`;
    const first = await fixture.admin.from("support_messages").insert({ ticket_id: fixture.waitingTicket, client_message_id: clientMessageId, sender_type: "client", sender_user_id: fixture.clientA.id, message: "one", message_type: "text", content_type: "text", source: "web", is_internal: false });
    const second = await fixture.admin.from("support_messages").insert({ ticket_id: fixture.waitingTicket, client_message_id: clientMessageId, sender_type: "client", sender_user_id: fixture.clientA.id, message: "one", message_type: "text", content_type: "text", source: "web", is_internal: false });
    expect(first.error).toBeNull(); expect(second.error?.code).toBe("23505");
    const rows = await fixture.admin.from("support_messages").select("id").eq("ticket_id", fixture.waitingTicket).eq("client_message_id", clientMessageId);
    expect(rows.data).toHaveLength(1);
  });
});
