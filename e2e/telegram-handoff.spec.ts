import { expect, test } from "@playwright/test";
import { buildTelegramKeyboard, buildTelegramTicketMessage } from "../lib/support/telegram";

test.describe("Opero Telegram handoff T1", () => {
  test("offers handoff and creates one ticket only after confirmation", async ({ page }) => {
    let ticketCreates = 0;
    await page.route("**/api/ai/chat", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, message: "Я не могу решить этот вопрос автоматически. Передать его менеджеру?", role: "anonymous", tools: [], results: [], suggestions: [], handoff: { offered: true, requiresConfirmation: true, critical: false, category: "booking", priority: "high", subject: "Вопрос по бронированию", summary: "Автоматическое изменение не выполнялось.", actionId: "action-1042", expiresAt: "2099-01-01T00:00:00.000Z" } }) });
    });
    await page.route("**/api/support/tickets", async (route) => {
      ticketCreates += 1;
      expect(route.request().postDataJSON()).toMatchObject({ confirmed: true, consent: true, idempotencyKey: "action-1042" });
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, publicNumber: "OP-1042", message: "Обращение OP-1042 передано менеджеру.", deliveryStatus: "failed" }) });
    });

    await page.goto("/");
    await page.getByRole("button", { name: "Открыть Opero AI" }).click();
    await page.getByRole("textbox", { name: "Сообщение Opero AI" }).fill("Хочу изменить даты бронирования");
    await page.getByRole("button", { name: "Отправить" }).click();
    await expect(page.getByRole("button", { name: "Передать менеджеру" })).toBeVisible();
    expect(ticketCreates).toBe(0);
    await page.getByRole("textbox", { name: "Email для связи" }).fill("guest@example.com");
    await page.getByRole("checkbox", { name: "Согласен на связь по этому вопросу" }).check();
    await page.getByRole("button", { name: "Передать менеджеру" }).click();
    await expect(page.getByText("Обращение OP-1042 передано менеджеру.", { exact: true })).toBeVisible();
    expect(ticketCreates).toBe(1);
  });

  test("sanitizes Telegram text and keeps the Opero link production-only", () => {
    const message = buildTelegramTicketMessage({ public_number: "OP-1042", priority: "high", requester_name: "Александр", requester_language: "Русский", subject: "Изменение дат", customer_message: "Token: secret and 827ee563-b71e-43cb-9f61-bfa9d63da189", ai_summary: "Изменение бронирования не выполнялось." });
    expect(message).not.toMatch(/827ee563-b71e-43cb-9f61-bfa9d63da189|secret/i);
    const keyboard = buildTelegramKeyboard("OP-1042");
    const openButton = keyboard.inline_keyboard.flat().find((button) => button.text === "Открыть в Opero");
    expect(openButton?.url).toMatch(/^https:\/\/operohq\.netlify\.app\/admin\/support\/OP-1042$/);
    expect(openButton?.url).not.toMatch(/localhost|127\.0\.0\.1/i);
  });

  test("rejects Telegram webhook without the secret", async ({ page }) => {
    const response = await page.request.post("/api/telegram/webhook", { data: { callback_query: { data: "support:accept:OP-1042", message: { chat: { id: 1 } } } } });
    expect(response.status()).toBe(401);
  });
});
