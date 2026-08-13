import { expect, test } from "@playwright/test";
import { cleanupPropertyOwnerFixtures, seedPropertyOwnerFixtures, type OwnerFixture } from "./fixtures/property-owner-fixtures";

let fixture: OwnerFixture;

test.beforeAll(async () => {
  fixture = await seedPropertyOwnerFixtures();
});

test.afterAll(async () => {
  await cleanupPropertyOwnerFixtures(fixture);
});

test.describe("public catalog routing", () => {
  test("home shows the public catalog without authentication", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "Все доступные объекты" })).toBeVisible();
    await expect(page.getByTestId("global-header").getByRole("link", { name: "Войти" })).toHaveAttribute("href", "/login");
    await expect(page.getByTestId("global-header").getByRole("link", { name: "Регистрация" })).toBeVisible();
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("anonymous home does not expose profile or owner contact data", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Все доступные объекты" })).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.localStorage.getItem("apartments"))).not.toBeNull();

    const result = await page.evaluate(() => {
      const cached = JSON.parse(window.localStorage.getItem("apartments") ?? "[]") as Array<Record<string, unknown>>;
      return {
        contactValues: cached.flatMap((apartment) => [apartment.ownerName, apartment.ownerPhone, apartment.ownerEmail].filter(Boolean)),
        assignmentValues: cached.flatMap((apartment) => [apartment.responsibleUserId, apartment.backupManagerUserId].filter(Boolean)),
        body: document.body.innerText,
      };
    });

    expect(result.contactValues).toEqual([]);
    expect(result.assignmentValues).toEqual([]);
    expect(result.body).not.toMatch(/alexandrov|oleksandrrad010@gmail\.com|\+48\s*453201956/i);
    expect(result.body).not.toMatch(/internal|do not book|dogfood|test only/i);
  });

  test("business route shows the B2B page and pricing", async ({ page }) => {
    await page.goto("/business");

    await expect(page).toHaveURL(/\/business$/);
    await expect(page.getByRole("heading", { name: /Управляйте недвижимостью/ })).toBeVisible();
    await expect(page.getByText("Прозрачные тарифы")).toBeVisible();
    await expect(page.getByRole("link", { name: "Начать бесплатно" }).first()).toHaveAttribute("href", "/register");
  });

  test("legacy public routes resolve to home", async ({ page }) => {
    for (const path of ["/guest/pro", "/stay"]) {
      const response = await page.request.get(path, { maxRedirects: 0 });
      expect(response.status()).toBe(308);
      expect(response.headers().location).toBe("/");
      await page.goto(path);
      await expect(page).toHaveURL(/\/$/);
      await expect(page.getByRole("heading", { name: "Все доступные объекты" })).toBeVisible();
    }
  });

  test("authenticated catalog route requires the guest account", async ({ page }) => {
    const response = await page.request.get("/guest/properties", { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    expect(response.headers().location).toContain("/guest/login?next=%2Fguest%2Fproperties");
  });

  test("partner CTA leads from the catalog to business", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("link", { name: "Стать партнёром" }).first().click();
    await expect(page).toHaveURL(/\/business$/);
  });

  test("property detail is public and starts booking flow without login", async ({ page }) => {
    await page.goto("/");
    const propertyLink = page.locator('a[href^="/properties/"]').first();
    await expect(propertyLink).toHaveCount(1, { timeout: 15_000 });
    const propertyHref = await propertyLink.getAttribute("href");
    expect(propertyHref).toBeTruthy();

    await page.goto(propertyHref!);

    await expect(page).toHaveURL(/\/properties\/[^/]+$/);
    await expect(page.getByRole("heading", { name: "Календарь доступности и бронирование" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Открыть календарь" })).toBeVisible();
    await expect(page.getByText("Выберите даты для расчёта стоимости")).toBeVisible();
    await expect(page.getByText("Итоговая стоимость: 260 €")).toHaveCount(0);
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("legacy property detail redirects to the canonical public route", async ({ page }) => {
    const response = await page.request.get("/guest/properties/test-property", { maxRedirects: 0 });

    expect(response.status()).toBe(308);
    expect(response.headers().location).toBe("/properties/test-property");
  });
});
