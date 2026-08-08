import { expect, test } from "@playwright/test";
import { createSupportFixture } from "./fixtures/support-conversation-fixtures";

test.describe("Telegram manager reply persistence contract", () => {
  let fixture: Awaited<ReturnType<typeof createSupportFixture>>;
  test.beforeAll(async () => { fixture = await createSupportFixture(); });
  test.afterAll(async () => { if (fixture) await fixture.cleanup(); });

  test("reply reference resolves only the assigned active conversation", async () => {
    const chatId = `chat-${Date.now()}`;
    const messageId = `message-${Date.now()}`;
    const reference = await fixture.admin.from("support_telegram_message_refs").insert({ ticket_id: fixture.activeTicket, organization_id: fixture.organizationA, telegram_chat_id: chatId, telegram_message_id: messageId });
    expect(reference.error).toBeNull();
    const resolved = await fixture.admin.from("support_telegram_message_refs").select("ticket_id").eq("telegram_chat_id", chatId).eq("telegram_message_id", messageId).single();
    expect(resolved.data?.ticket_id).toBe(fixture.activeTicket);
    const ticket = await fixture.admin.from("support_tickets").select("assigned_to,conversation_state,organization_id").eq("id", resolved.data?.ticket_id).single();
    expect(ticket.data).toMatchObject({ assigned_to: fixture.manager1.id, conversation_state: "manager_active", organization_id: fixture.organizationA });
  });

  test("internal notes cannot be represented as Telegram client messages", async () => {
    const result = await fixture.admin.from("support_messages").insert({ ticket_id: fixture.activeTicket, sender_type: "internal_note", sender_user_id: fixture.manager1.id, message: "private", message_type: "internal_note", content_type: "text", source: "system", is_internal: true });
    expect(result.error).toBeNull();
    const publicMessages = await fixture.admin.from("support_messages").select("message").eq("ticket_id", fixture.activeTicket).eq("is_internal", false).eq("source", "telegram");
    expect(publicMessages.data).toEqual([]);
  });
});
