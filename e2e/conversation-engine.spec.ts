import { expect, test } from "@playwright/test";
import { canClientSend, canManagerSend, canReturnToAi, transitionConversation } from "../lib/support/conversation";
import { createTelegramLinkToken, hashTelegramLinkToken } from "../lib/telegram/link";

test.describe("Phase T2 conversation engine contracts", () => {
  test("allows only the ordered state machine transitions", () => {
    expect(transitionConversation("bot_active", "waiting_manager")).toMatchObject({ result: "applied", stateAfter: "waiting_manager" });
    expect(transitionConversation("waiting_manager", "manager_active")).toMatchObject({ result: "applied", stateAfter: "manager_active" });
    expect(transitionConversation("manager_active", "resolved")).toMatchObject({ result: "applied", stateAfter: "resolved" });
    expect(transitionConversation("resolved", "closed")).toMatchObject({ result: "applied", stateAfter: "closed" });
    expect(transitionConversation("waiting_manager", "closed")).toMatchObject({ result: "noop", stateAfter: "waiting_manager" });
    expect(transitionConversation("closed", "bot_active")).toMatchObject({ result: "noop", stateAfter: "closed" });
  });

  test("enforces message permissions by state", () => {
    expect(canClientSend("waiting_manager")).toBe(true);
    expect(canClientSend("manager_active")).toBe(true);
    expect(canClientSend("closed")).toBe(false);
    expect(canManagerSend("manager_active")).toBe(true);
    expect(canManagerSend("waiting_manager")).toBe(false);
    expect(canReturnToAi("closed")).toBe(true);
  });

  test("creates a one-way expiring Telegram link token", () => {
    const link = createTelegramLinkToken();
    expect(link.token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(hashTelegramLinkToken(link.token)).toBe(link.tokenHash);
    expect(link.tokenHash).not.toContain(link.token);
    expect(new Date(link.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });
});
