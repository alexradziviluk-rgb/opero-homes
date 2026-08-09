import { expect, test } from "@playwright/test";
import { buildTelegramKeyboard } from "../lib/support/telegram";
import { callbackAuditMetadata, hashTelegramUpdateId, isAllowedTelegramChat, parseTelegramCallbackData, transitionTelegramCallback } from "../lib/telegram/callback";

test.describe("Telegram callback contract", () => {
  test("builds accept, resolve, and navigation buttons with the exact contract", () => {
    const keyboard = buildTelegramKeyboard("OP-1042", "a".repeat(36));
    expect(keyboard.inline_keyboard[0]).toEqual([
      { text: "Принять", callback_data: `support:accept:${"a".repeat(36)}` },
      { text: "Отметить решённым", callback_data: `support:resolve:${"a".repeat(36)}` },
    ]);
    expect(keyboard.inline_keyboard[1][0]).toMatchObject({ text: "Открыть в Opero" });
    expect(keyboard.inline_keyboard[1][0].callback_data).toBeUndefined();
  });

  test("applies the transition matrix and idempotent no-ops", () => {
    expect(transitionTelegramCallback("accept", "open")).toMatchObject({ result: "applied", statusAfter: "in_progress" });
    expect(transitionTelegramCallback("accept", "assigned")).toMatchObject({ result: "applied", statusAfter: "in_progress" });
    expect(transitionTelegramCallback("accept", "in_progress")).toMatchObject({ result: "noop", statusAfter: "in_progress" });
    expect(transitionTelegramCallback("resolve", "in_progress")).toMatchObject({ result: "applied", statusAfter: "resolved" });
    expect(transitionTelegramCallback("resolve", "resolved")).toMatchObject({ result: "noop", statusAfter: "resolved" });
    expect(transitionTelegramCallback("resolve", "closed")).toMatchObject({ result: "noop", statusAfter: "closed" });
  });

  test("rejects malformed callbacks and hashes update IDs without exposing them", () => {
    expect(parseTelegramCallbackData("support:accept:not-a-token")).toBeNull();
    expect(parseTelegramCallbackData(`support:unknown:${"a".repeat(36)}`)).toBeNull();
    const hash = hashTelegramUpdateId(123456);
    expect(hash).toMatch(/^[a-f0-9]{16}$/);
    expect(hash).not.toContain("123456");
    const metadata = callbackAuditMetadata({ action: "accept", result: "applied", statusBefore: "open", statusAfter: "in_progress", updateIdHash: hash });
    expect(JSON.stringify(metadata)).not.toMatch(/token|secret|chat|user|uuid|123456/i);
  });

  test("rejects a callback from the wrong chat and allows the ticket or manager chat", () => {
    expect(isAllowedTelegramChat("ticket-chat", "wrong-chat", "manager-chat")).toBe(false);
    expect(isAllowedTelegramChat("ticket-chat", "ticket-chat", "manager-chat")).toBe(true);
    expect(isAllowedTelegramChat(null, "manager-chat", "manager-chat")).toBe(true);
  });

  test("keeps the global anonymous ticket callback contract on the current token", () => {
    const keyboard = buildTelegramKeyboard("OP-0008", "b".repeat(36));
    expect(keyboard.inline_keyboard[0][0]).toEqual({ text: "Принять", callback_data: `support:accept:${"b".repeat(36)}` });
  });

  test("unauthenticated callback audit is denied without a server error", async ({ request }) => {
    const response = await request.get("/api/admin/telegram/callback-audit?ticket=OP-0004");
    expect(response.status()).toBe(401);
    expect(await response.text()).not.toMatch(/uuid|secret|token|organization/i);
  });
});