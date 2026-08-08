import { expect, test } from "@playwright/test";
import { createSupportFixture } from "./fixtures/support-conversation-fixtures";

test.describe("staff optimistic message contract", () => {
  let fixture: Awaited<ReturnType<typeof createSupportFixture>>;
  test.beforeAll(async () => { fixture = await createSupportFixture(); });
  test.afterAll(async () => { if (fixture) await fixture.cleanup(); });
  test("duplicate staff reply is one row and internal note stays private", async () => {
    const clientMessageId = crypto.randomUUID();
    const row = { ticket_id: fixture.activeTicket, sender_type: "manager", sender_user_id: fixture.manager1.id, message: "Manager reply", message_type: "text", content_type: "text", source: "web", is_internal: false, client_message_id: clientMessageId };
    expect((await fixture.admin.from("support_messages").insert(row)).error).toBeNull();
    expect((await fixture.admin.from("support_messages").insert(row)).error?.code).toBe("23505");
    await fixture.admin.from("support_messages").insert({ ...row, client_message_id: crypto.randomUUID(), sender_type: "internal_note", message_type: "internal_note", is_internal: true, message: "Private" });
    const messages = await fixture.admin.from("support_messages").select("message,is_internal").eq("ticket_id", fixture.activeTicket).eq("client_message_id", clientMessageId);
    expect(messages.data).toHaveLength(1); expect(messages.data?.[0]?.is_internal).toBe(false);
  });
});
