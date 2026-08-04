import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { cleanupRoleAuditFixtures, seedRoleAuditFixtures, storagePath, type AuditRole, type RoleAuditFixture, assertRoleAuditLocalEnv } from "./fixtures/role-audit-fixtures";

test.describe.configure({ mode: "serial" });
let fixture: RoleAuditFixture;
const contexts: BrowserContext[] = [];

async function openRole(browser: Browser, role: AuditRole) {
  const account = fixture.accounts[role];
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  contexts.push(context);
  const page = await context.newPage();
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  const failedResponses: string[] = [];
  page.on("console", (message) => { if (message.type() === "error" && !message.text().includes("favicon")) consoleErrors.push(message.text()); });
  page.on("requestfailed", (request) => failedRequests.push(`${request.method()} ${request.url()}`));
  page.on("response", (response) => {
    if (response.status() >= 400) {
      failedResponses.push(`${response.status()} ${response.url()}`);
    }
  });
  await page.goto("/staff/login");
  const form = page.locator("form").first();
  await form.getByLabel("Email").fill(account.email);
  await form.getByLabel("Пароль").fill(account.password);
  await form.getByRole("button", { name: "Войти" }).click();
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/, { timeout: 15_000 });
  await context.storageState({ path: storagePath(fixture.prefix, role) });
  return { context, page, consoleErrors, failedRequests, failedResponses };
}

async function expectDenied(page: Page, path: string) {
  const response = await page.request.get(path, { maxRedirects: 0 });
  expect(response.status(), path).toBeGreaterThanOrEqual(300);
  expect(response.status(), path).toBeLessThan(400);
}

test.beforeAll(async () => {
  assertRoleAuditLocalEnv();
  fixture = await seedRoleAuditFixtures();
});

test.afterAll(async () => {
  for (const context of contexts) await context.close();
  if (fixture) await cleanupRoleAuditFixtures(fixture);
});

test("admin has full role surface and clean console/network", async ({ browser }) => {
  const { page, consoleErrors, failedRequests, failedResponses } = await openRole(browser, "admin");
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin/);
  await expect(page.getByText(/E2E Admin|Администратор|Владелец/).first()).toBeVisible();
  for (const path of ["/apartments", "/bookings", "/employees", "/users", "/tasks", "/notifications", "/settings/notifications"]) {
    await page.goto(path);
    expect(page.url(), path).toContain(path);
  }
  expect(consoleErrors, `console errors: ${failedResponses.join(" | ")}`).toEqual([]);
  expect(failedRequests, `failed requests: ${failedResponses.join(" | ")}`).toEqual([]);
});

test("manager and employee have staff access but no owner UI or owner API", async ({ browser }) => {
  for (const role of ["manager", "employee"] as const) {
    const { page, consoleErrors } = await openRole(browser, role);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin/);
    const ownerProperties = await page.request.get("/api/owner/properties");
    expect(ownerProperties.status(), role).toBe(403);
    await page.goto(`/owner/properties/${fixture.apartmentPublishedId}/calendar`);
    expect(page.url(), role).not.toContain("/owner/properties/");
    await expect(page.getByRole("button", { name: "Заблокировать даты" })).toHaveCount(0);
    expect(consoleErrors, `${role} console errors`).toEqual([]);
  }
});

test("cleaner and maintenance are limited to assigned operations", async ({ browser }) => {
  for (const [role, taskId, allowedPath] of [["cleaner", "cleaningTaskId", "/cleaning"], ["maintenance", "maintenanceTaskId", "/maintenance"]] as const) {
    const { page } = await openRole(browser, role);
    await page.goto(allowedPath);
    expect(page.url(), role).toContain(allowedPath);
    const taskResponse = await page.request.get(`/api/operations/tasks/${fixture[taskId]}`);
    expect([200, 404], `${role} assigned task API`).toContain(taskResponse.status());
    const usersResponse = await page.request.get("/api/users");
    expect(usersResponse.status(), `${role} users API`).toBeGreaterThanOrEqual(400);
    await expectDenied(page, "/settings/billing");
  }
});

test("guest sees public booking surface but cannot access staff or owner data", async ({ browser }) => {
  const { page } = await openRole(browser, "guest");
  await page.goto("/guest");
  expect(page.url()).toContain("/guest");
  await expectDenied(page, "/admin");
  await expectDenied(page, "/account/properties");
  const ownerProperties = await page.request.get("/api/owner/properties");
  expect(ownerProperties.status()).toBe(403);
});

test("property owner is isolated to owned property and cannot read private booking data", async ({ browser }) => {
  const { page, consoleErrors } = await openRole(browser, "propertyOwner");
  await expect.poll(async () => (await page.request.get("/api/owner/properties")).status()).toBe(200);
  await page.goto("/account/properties");
  const ownerPropertiesResponse = await page.request.get("/api/owner/properties");
  const ownerPropertiesBody = await ownerPropertiesResponse.text();
  await expect(page.getByText(/Published Apartment/).first(), `url=${page.url()} api=${ownerPropertiesResponse.status()} body=${ownerPropertiesBody.slice(0, 300)}`).toBeVisible();
  await expect(page.getByText(/Draft Apartment/)).toHaveCount(0);
  const properties = await page.request.get("/api/owner/properties");
  expect(properties.status()).toBe(200);
  const serialized = JSON.stringify(await properties.json());
  expect(serialized).not.toContain("total_amount");
  expect(serialized).not.toContain("guest_email");
  const foreignBlocks = await page.request.get(`/api/owner/properties/${fixture.apartmentDraftId}/blocks`);
  expect(foreignBlocks.status()).toBeGreaterThanOrEqual(400);
  const calendarResponse = await page.request.get(`/owner/properties/${fixture.apartmentPublishedId}/calendar`, { maxRedirects: 0 });
  expect(calendarResponse.status(), await calendarResponse.text()).toBe(200);
  await page.goto(`/owner/properties/${fixture.apartmentPublishedId}/calendar`);
  await expect(page.getByRole("button", { name: "Заблокировать даты" })).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test("mobile role audit has no hydration errors and API auth is enforced", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  contexts.push(context);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error" && /hydration|runtime/i.test(message.text())) errors.push(message.text()); });
  await page.goto("/guest");
  const unauthenticated = await page.request.get("/api/owner/properties");
  expect(unauthenticated.status()).toBe(401);
  expect(errors).toEqual([]);
});
