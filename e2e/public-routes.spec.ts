import { expect, test } from "@playwright/test";

test.describe("public catalog routing", () => {
  test("home shows the public catalog without authentication", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "Все доступные объекты" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Поиск жилья" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Войти" })).toHaveAttribute("href", "/login");
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("business route shows the B2B page and pricing", async ({ page }) => {
    await page.goto("/business");

    await expect(page).toHaveURL(/\/business$/);
    await expect(page.getByRole("heading", { name: /Управляйте недвижимостью/ })).toBeVisible();
    await expect(page.getByText("Прозрачные тарифы")).toBeVisible();
    await expect(page.getByRole("link", { name: "Начать бесплатно" }).first()).toHaveAttribute("href", "/register");
  });

  test("legacy catalog routes permanently resolve to home", async ({ page }) => {
    for (const path of ["/guest/pro", "/guest/properties", "/stay"]) {
      const response = await page.request.get(path, { maxRedirects: 0 });
      expect(response.status()).toBe(308);
      expect(response.headers().location).toBe("/");
      await page.goto(path);
      await expect(page).toHaveURL(/\/$/);
      await expect(page.getByRole("heading", { name: "Все доступные объекты" })).toBeVisible();
    }
  });

  test("partner CTA leads from the catalog to business", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("link", { name: "Стать партнёром" }).first().click();
    await expect(page).toHaveURL(/\/business$/);
  });

  test("property detail is public and starts booking flow without login", async ({ page }) => {
    await page.goto("/");
    const propertyLink = page.locator('a[href^="/properties/"]').first();
    const propertyCount = await page.locator('a[href^="/properties/"]').count();
    test.skip(propertyCount === 0, "The local catalog has no published apartments.");
    const propertyHref = await propertyLink.getAttribute("href");
    expect(propertyHref).toBeTruthy();

    await page.goto(propertyHref!);

    await expect(page).toHaveURL(/\/properties\/[^/]+$/);
    await expect(page.getByRole("heading", { name: "Календарь доступности и бронирование" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Открыть календарь" })).toBeVisible();
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("legacy property detail redirects to the canonical public route", async ({ page }) => {
    const response = await page.request.get("/guest/properties/test-property", { maxRedirects: 0 });

    expect(response.status()).toBe(308);
    expect(response.headers().location).toBe("/properties/test-property");
  });
});
