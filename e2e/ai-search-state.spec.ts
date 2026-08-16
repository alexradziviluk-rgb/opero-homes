import { expect, test } from "@playwright/test";

test.describe("Opero AI housing search state machine", () => {
  test("collects missing dates and guests before searching", async ({ page }) => {
    let requestCount = 0;
    await page.route("**/api/ai/chat", async (route) => {
      requestCount += 1;
      const payload = route.request().postDataJSON() as { message?: string; history?: Array<{ role: string; text: string }> };
      expect(payload.history).toBeDefined();
      const body = requestCount === 1
        ? { message: "Конечно. На какие даты планируете поездку?", results: [], tools: [], suggestions: [], role: "anonymous" }
        : requestCount === 2
          ? { message: "Сколько будет гостей?", results: [], tools: [], suggestions: [], role: "anonymous" }
          : { message: "Нашёл вариант", results: [{ tool: "searchPublishedProperties", data: { properties: [{ id: "safe-id", publicRoute: "/properties/safe-id", title: "Sea Home", city: "Alanya", maxGuests: 4, dailyPrice: 120, coverPhotoUrl: "/photo.jpg" }] } }], tools: ["searchPublishedProperties"], suggestions: [], role: "anonymous" };
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, ...body }) });
    });

    await page.goto("/");
    await page.getByRole("button", { name: "Открыть Opero AI" }).click();
    await page.getByRole("button", { name: "Найти жильё" }).click();
    await expect(page.getByRole("region", { name: "Opero AI панель" })).toContainText("На какие даты планируете поездку?");
    await expect(page.locator("main")).not.toContainText("Данных не найдено.");
    await page.getByRole("textbox", { name: "Сообщение Opero AI" }).fill("20 по 25 августа");
    await page.getByRole("button", { name: "Отправить" }).click();
    await expect(page.getByRole("region", { name: "Opero AI панель" })).toContainText("Сколько будет гостей?");
    await page.getByRole("textbox", { name: "Сообщение Opero AI" }).fill("Нас четверо");
    await page.getByRole("button", { name: "Отправить" }).click();
    await expect(page.getByText("Sea Home", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Подробнее", exact: true })).toHaveAttribute("href", "/properties/safe-id");
    await expect(page.getByRole("link", { name: "Забронировать", exact: true })).toHaveAttribute("href", "/properties/safe-id?openBooking=1");
  });

  test("renders one zero-result response without technical fallback or automatic handoff", async ({ page }) => {
    await page.route("**/api/ai/chat", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, message: "На выбранные даты свободных вариантов не нашёл. Можно изменить даты, показать ближайшие варианты, изменить количество гостей или подключить менеджера.", role: "anonymous", tools: ["searchPublishedProperties"], results: [{ tool: "searchPublishedProperties", data: { properties: [] } }], suggestions: [] }) });
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Открыть Opero AI" }).click();
    await page.getByRole("textbox", { name: "Сообщение Opero AI" }).fill("Найти жильё");
    await page.getByRole("button", { name: "Отправить" }).click();
    await expect(page.getByText("На выбранные даты свободных вариантов не нашёл.", { exact: false })).toBeVisible();
    await expect(page.locator("main")).not.toContainText("Данных не найдено.");
    await expect(page.getByRole("button", { name: "Передать менеджеру", exact: true })).toHaveCount(0);
  });
});