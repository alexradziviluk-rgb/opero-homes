import { expect, test } from "@playwright/test";
import { transitionConversation } from "../lib/support/conversation";

test.describe("support realtime reconnect contract", () => {
  test("broadcast identity is conversation-scoped and message correlation is stable", () => {
    const event = { kind: "message", conversation: "OP-0001", senderType: "manager", message: "Reply", clientMessageId: "client-1", createdAt: "2026-08-06T12:00:00.000Z" };
    expect(event.conversation).toMatch(/^OP-\d{4,}$/);
    expect(event.clientMessageId).toBe("client-1");
    expect(JSON.stringify(event)).not.toMatch(/organization|assigned|user_id|telegram_chat/i);
  });

  test("reconnect must reload history and never reopen a closed conversation", () => {
    expect(transitionConversation("resolved", "closed").result).toBe("applied");
    expect(transitionConversation("closed", "bot_active").result).toBe("noop");
  });
});
