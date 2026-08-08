import { execFileSync } from "node:child_process";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { cleanupRoleAuditFixtures, seedRoleAuditFixtures, storagePath, type AuditRole, type RoleAuditFixture, assertRoleAuditLocalEnv } from "./fixtures/role-audit-fixtures";

test.describe.configure({ mode: "serial", timeout: 60_000 });
let fixture: RoleAuditFixture;
const contexts: BrowserContext[] = [];
let browserDisconnectLogged = false;

async function localhostHealth() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch("http://localhost:3201/", { signal: controller.signal, redirect: "manual" });
    return { status: response.status, ok: response.status === 200 };
  } catch (error) {
    return { status: 0, ok: false, detail: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timeout);
  }
}

function processSnapshot() {
  try {
    const output = execFileSync("powershell.exe", ["-NoProfile", "-Command", "Get-NetTCPConnection -LocalPort 3201 -ErrorAction SilentlyContinue | Where-Object {$_.State -eq 'Listen'} | Select-Object -ExpandProperty OwningProcess"], { encoding: "utf8", timeout: 2_000 });
    return output.trim() || "none";
  } catch (error) {
    return `unavailable: ${error instanceof Error ? error.message : String(error)}`;
  }
}

async function navigationDiagnostics(browser: Browser, page: Page, target: string, detail: string) {
  const health = await localhostHealth();
  console.error("[role-audit-network]", {
    event: "navigation-diagnostics",
    test: test.info().title,
    at: new Date().toISOString(),
    target,
    detail: detail.slice(0, 300),
    browserConnected: browser.isConnected(),
    contextCount: contexts.length,
    pageCount: contexts.reduce((count, context) => count + context.pages().length, 0),
    documentReadyState: await page.evaluate(() => document.readyState).catch(() => "unavailable"),
    localhostHealth: health,
    nextPortOwner: processSnapshot(),
    url: page.url(),
  });
}

async function healthGate() {
  const health = await localhostHealth();
  expect(health.ok, `D health gate failed: ${JSON.stringify(health)}`).toBe(true);
}

async function initialNavigation(browser: Browser, context: BrowserContext, page: Page, target: string) {
  try {
    await page.goto(target, { waitUntil: "domcontentloaded", timeout: 15_000 });
    return { context, page };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    await navigationDiagnostics(browser, page, target, detail);
    const recoverable = /ERR_NETWORK_IO_SUSPENDED/i.test(detail);
    const health = await localhostHealth();
    if (!recoverable || !health.ok || !browser.isConnected()) throw error;

    await context.close();
    const replacement = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: "block" });
    contexts.push(replacement);
    const replacementPage = await replacement.newPage();
    await healthGate();
    replacementPage.on("requestfailed", (request) => console.warn("[role-audit-network]", { event: "request-failed", test: test.info().title, at: new Date().toISOString(), reason: request.failure()?.errorText, url: request.url() }));
    await replacementPage.goto(target, { waitUntil: "domcontentloaded", timeout: 15_000 });
    return { context: replacement, page: replacementPage };
  }
}

async function gotoRolePage(page: Page, path: string) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.goto(path, { waitUntil: "domcontentloaded", timeout: 15_000 });
      return;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      const transient = /ERR_NETWORK_CHANGED|ERR_CONNECTION_RESET|ERR_CONNECTION_REFUSED|Target page, context or browser has been closed/i.test(detail);
      console.warn("[role-audit]", { event: "navigation-failure", path, attempt: attempt + 1, transient, url: page.url(), detail: detail.slice(0, 240), at: new Date().toISOString() });
      if (!transient || attempt === 2) throw error;
      await expect.poll(async () => (await page.request.get("/login", { failOnStatusCode: false })).status(), { timeout: 5_000 }).toBeLessThan(500);
    }
  }
}

async function openRole(browser: Browser, role: AuditRole) {
  const account = fixture.accounts[role];
  const expectedLandingPath = role === "guest" || role === "propertyOwner" ? /\/guest(?:\/|\?|$)/ : /\/admin(?:\/|\?|$)/;
  console.info("[role-audit]", { event: "auth-start", role, fixture: fixture.prefix, at: new Date().toISOString() });
  if (!browserDisconnectLogged) {
    browserDisconnectLogged = true;
    const testTitle = test.info().title;
    browser.on("disconnected", () => console.error("[role-audit-network]", { event: "browser-disconnected", test: testTitle, at: new Date().toISOString() }));
  }
  await healthGate();
  let context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: "block" });
  contexts.push(context);
  let page = await context.newPage();
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
  ({ context, page } = await initialNavigation(browser, context, page, "/staff/login"));
  const form = page.locator("form").first();
  const emailInput = form.locator('input[type="email"]');
  const passwordInput = form.locator('input[type="password"]');
  const submit = form.getByRole("button", { name: "Войти" });
  await page.route("**/api/auth/heartbeat", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) }));
  console.info("[role-audit]", { event: "form-mounted", role, at: new Date().toISOString() });
  await expect(form).toBeVisible({ timeout: 15_000 });
  try {
    await expect(form).toHaveAttribute("data-auth-ready", "true", { timeout: 15_000 });
  } catch (error) {
    console.error("[role-audit]", {
      event: "auth-ready-timeout",
      role,
      authStatus: await form.getAttribute("data-auth-status"),
      formCount: await page.locator("form").count(),
      emailValueLength: (await emailInput.inputValue()).length,
      passwordValueLength: (await passwordInput.inputValue()).length,
      at: new Date().toISOString(),
    });
    throw error;
  }
  console.info("[role-audit]", { event: "auth-ready", role, at: new Date().toISOString() });
  await expect(emailInput).toBeVisible({ timeout: 5_000 });
  await expect(passwordInput).toBeVisible({ timeout: 5_000 });
  await expect(emailInput).toBeEnabled({ timeout: 5_000 });
  await expect(passwordInput).toBeEnabled({ timeout: 5_000 });
  await emailInput.fill(account.email);
  await passwordInput.fill(account.password);
  const emailValue = await emailInput.inputValue();
  const passwordValue = await passwordInput.inputValue();
  console.info("[role-audit]", { event: "fields-stable", role, emailStable: emailValue === account.email, passwordStable: passwordValue === account.password, at: new Date().toISOString() });
  expect(emailValue).toBe(account.email);
  expect(passwordValue).toBe(account.password);
  await expect(submit).toBeEnabled({ timeout: 5_000 });
  console.info("[role-audit]", { event: "submit-enabled", role, at: new Date().toISOString() });
  console.info("[role-audit]", { event: "signIn-started", role, at: new Date().toISOString() });
  await submit.click();
  console.info("[role-audit]", { event: "submit-click", role, at: new Date().toISOString() });
  if (page.url().includes("/login")) {
    console.error("[role-audit]", {
      event: "auth-failure",
      role,
      fixture: fixture.prefix,
      url: page.url(),
      errors: await page.locator("p.text-rose-300").allTextContents(),
      responses: failedResponses.filter((entry) => entry.includes("/auth/") || entry.includes("/api/")),
      at: new Date().toISOString(),
    });
  }
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/, { timeout: 15_000 });
  await expect(page).toHaveURL(expectedLandingPath, { timeout: 15_000 });
  await expect(page.locator("text=Загрузка профиля...")).toHaveCount(0, { timeout: 15_000 });
  console.info("[role-audit]", { event: "auth-success", role, fixture: fixture.prefix, url: page.url(), at: new Date().toISOString() });
  await context.storageState({ path: storagePath(fixture.prefix, role) });
  return { context, page, consoleErrors, failedRequests, failedResponses };
}

async function expectDenied(page: Page, path: string) {
  const response = await page.request.get(path, { maxRedirects: 0 });
  expect(response.status(), path).toBeGreaterThanOrEqual(300);
  expect(response.status(), path).toBeLessThan(400);
}

test.beforeEach(async ({}, testInfo) => {
  console.info("[role-audit]", { event: "test-start", test: testInfo.title, at: new Date().toISOString() });
});

test.afterEach(async ({}, testInfo) => {
  console.info("[role-audit]", {
    event: "test-end",
    test: testInfo.title,
    status: testInfo.status,
    url: contexts.at(-1)?.pages().at(-1)?.url() ?? "",
    at: new Date().toISOString(),
  });
  const pendingContexts = contexts.splice(0, contexts.length);
  await Promise.all(pendingContexts.map(async (context, index) => {
    try {
      await Promise.race([
        context.close(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("context close timeout after 5000ms")), 5_000)),
      ]);
    } catch (error) {
      console.error("[role-audit-cleanup]", { event: "error", step: `afterEach:context:${index}`, at: new Date().toISOString(), detail: error instanceof Error ? error.message : String(error) });
    }
  }));
});

test.beforeAll(async () => {
  assertRoleAuditLocalEnv();
  fixture = await seedRoleAuditFixtures();
});

test.afterAll(async () => {
  for (const [index, context] of contexts.entries()) {
    try {
      await Promise.race([
        context.close(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("context close timeout after 15000ms")), 15_000)),
      ]);
    } catch (error) {
      console.error("[role-audit-cleanup]", { event: "error", step: `context:${index}`, at: new Date().toISOString(), detail: error instanceof Error ? error.message : String(error) });
    }
  }
  await cleanupRoleAuditFixtures(fixture);
});

test("admin has full role surface and clean console/network", async ({ browser }) => {
  const { page, consoleErrors, failedRequests, failedResponses } = await openRole(browser, "admin");
  await gotoRolePage(page, "/admin");
  await expect(page).toHaveURL(/\/admin/);
  await expect(page.getByText(/E2E Admin|Администратор|Владелец/).first()).toBeVisible();
  for (const path of ["/apartments", "/bookings", "/employees", "/users", "/tasks", "/notifications", "/settings/notifications"]) {
    await gotoRolePage(page, path);
    expect(page.url(), path).toContain(path);
  }
  expect(consoleErrors, `console errors: ${failedResponses.join(" | ")}`).toEqual([]);
  expect(failedRequests, `failed requests: ${failedResponses.join(" | ")}`).toEqual([]);
});

test("manager and employee have staff access but no owner UI or owner API", async ({ browser }) => {
  for (const role of ["manager", "employee"] as const) {
    const { page, consoleErrors, failedResponses } = await openRole(browser, role);
    await gotoRolePage(page, "/admin");
    await expect(page).toHaveURL(/\/admin/);
    await gotoRolePage(page, "/bookings");
    await expect(page.getByText(/Confirmed Guest/)).toBeVisible();
    await gotoRolePage(page, "/calendar");
    await expect(page.getByRole("heading", { name: "Календарь" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Календарь" })).toBeVisible();
    await gotoRolePage(page, "/apartments");
    await expect(page.getByRole("link", { name: /Новый объект/ })).toBeVisible();
    const bookingsResponse = await page.request.get("/api/bookings");
    expect(bookingsResponse.status(), `${role} bookings API`).toBe(200);
    expect(JSON.stringify(await bookingsResponse.json())).toContain("Confirmed Guest");
    const ownerProperties = await page.request.get("/api/owner/properties");
    expect(ownerProperties.status(), role).toBe(403);
    await page.goto(`/owner/properties/${fixture.apartmentPublishedId}/calendar`);
    expect(page.url(), role).not.toContain("/owner/properties/");
    await expect(page.getByRole("button", { name: "Заблокировать даты" })).toHaveCount(0);
    expect(consoleErrors, `${role} console errors: ${failedResponses.join(" | ")}`).toEqual([]);
  }
});

test("cleaner and maintenance are limited to assigned operations", async ({ browser }) => {
  for (const [role, taskId, allowedPath] of [["cleaner", "cleaningTaskId", "/cleaning"], ["maintenance", "maintenanceTaskId", "/maintenance"]] as const) {
    const { page } = await openRole(browser, role);
    await gotoRolePage(page, allowedPath);
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
  await gotoRolePage(page, "/guest");
  expect(page.url()).toContain("/guest");
  await expectDenied(page, "/admin");
  await expectDenied(page, "/account/properties");
  const ownerProperties = await page.request.get("/api/owner/properties");
  expect(ownerProperties.status()).toBe(403);
});

test("property owner is isolated to owned property and cannot read private booking data", async ({ browser }) => {
  const { page, consoleErrors } = await openRole(browser, "propertyOwner");
  await expect.poll(async () => (await page.request.get("/api/owner/properties")).status()).toBe(200);
  await gotoRolePage(page, "/account/properties");
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
  await gotoRolePage(page, `/owner/properties/${fixture.apartmentPublishedId}/calendar`);
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
