import { expect, test } from "@playwright/test";
import { cleanupRoleAuditFixtures, seedRoleAuditFixtures, type RoleAuditFixture } from "./fixtures/role-audit-fixtures";

const forbiddenKeys = /"(?:organizationId|organization_id|apartmentId|apartment_id|userId|user_id|guestId|guest_id)"\s*:/i;
let fixture: RoleAuditFixture;

test.describe("Opero AI public privacy boundary", () => {
  test.beforeAll(async () => {
    fixture = await seedRoleAuditFixtures();
  });

  test.afterAll(async () => {
    if (fixture) await cleanupRoleAuditFixtures(fixture);
  });

  test("anonymous property search has no internal identifiers", async ({ page }) => {
    const response = await page.request.post("/api/ai/chat", { data: { message: "Найти жильё", route: "/" } });
    expect(response.status()).toBe(200);
    const payload = await response.json();
    expect(payload.role).toBe("anonymous");
    expect(JSON.stringify(payload)).not.toMatch(forbiddenKeys);
  });

  test("anonymous availability and quote have no internal identifiers", async ({ page }) => {
    const message = `Проверь свободные даты 2030-01-10 2030-01-12 для квартиры ${fixture.apartmentPublishedId} на 2 гостя`;
    const response = await page.request.post("/api/ai/chat", { data: { message, route: "/" } });
    expect(response.status()).toBe(200);
    const payload = await response.json();
    expect(payload.tools).toEqual(["getPublicAvailability", "calculatePublicQuote"]);
    expect(JSON.stringify(payload)).not.toMatch(forbiddenKeys);
    expect(JSON.stringify(payload)).toContain("available");
    expect(JSON.stringify(payload)).toContain("totalAmount");
  });

  test("public cards use safe routes and never render UUID text", async ({ page }) => {
    await page.route("**/api/ai/chat", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          message: "Нашёл объектов: 1.",
          role: "anonymous",
          tools: ["searchPublishedProperties"],
          results: [{ tool: "searchPublishedProperties", data: { properties: [{ publicRoute: "/properties/public-property", title: "Public Home", city: "Alanya", district: "Center" }] } }],
          suggestions: [],
        }),
      });
    });

    await page.goto("/");
    await page.getByRole("button", { name: "Открыть Opero AI" }).click();
    await page.getByRole("textbox", { name: "Сообщение Opero AI" }).fill("Найти жильё");
    await page.getByRole("button", { name: "Отправить" }).click();
    await expect(page.getByRole("link", { name: "Public Home", exact: true })).toHaveAttribute("href", "/properties/public-property");
    await expect(page.locator("main")).not.toContainText("organizationId");
    await expect(page.locator("main")).not.toContainText("organization_id");
  });
});
