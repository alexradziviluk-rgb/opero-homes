import { execFileSync } from "node:child_process";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { cleanupRoleAuditFixtures, readBookingForAudit, seedRoleAuditFixtures, storagePath, type AuditRole, type RoleAuditFixture, assertRoleAuditLocalEnv, uploadApartmentPhotoAnonymouslyForAudit, uploadApartmentPhotoForAudit } from "./fixtures/role-audit-fixtures";

test.describe.configure({ mode: "serial", timeout: 120_000 });
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
  const unexpectedConsoleErrors = consoleErrors.filter((error) => !error.includes("403 (Forbidden)"));
  const unexpectedFailedResponses = failedResponses.filter((response) => !response.includes("403 http://localhost:3201/api/owner/properties"));
  expect(unexpectedConsoleErrors, `console errors: ${failedResponses.join(" | ")}`).toEqual([]);
  expect(unexpectedFailedResponses, `failed responses: ${failedResponses.join(" | ")}`).toEqual([]);
  expect(failedRequests.filter((request) => !request.includes("?_rsc=") && !request.includes("&_rsc=")), `failed requests: ${failedResponses.join(" | ")}`).toEqual([]);
});

test("internal photo storage allows staff matrix and denies external access", async () => {
  const allowedRoles: AuditRole[] = ["admin", "manager", "employee"];
  for (const role of allowedRoles) {
    const uploads = await Promise.all(
      Array.from({ length: 10 }, (_, index) => uploadApartmentPhotoForAudit(
        fixture.accounts[role],
        fixture.organizationId,
        fixture.apartmentDraftId,
        `${role}-${index}.png`,
      )),
    );
    expect(uploads.filter((upload) => upload.error), role).toEqual([]);
  }

  for (const role of ["propertyOwner", "guest"] as const) {
    const result = await uploadApartmentPhotoForAudit(fixture.accounts[role], fixture.organizationId, fixture.apartmentDraftId, `${role}-denied.png`);
    expect(result.error, role).toMatch(/row-level security|not authorized|permission/i);
  }

  const anonymousResult = await uploadApartmentPhotoAnonymouslyForAudit(fixture.organizationId, fixture.apartmentDraftId, "anonymous-denied.png");
  expect(anonymousResult.error, "anonymous").toMatch(/row-level security|not authorized|permission/i);
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
    await expect(page.getByTestId("global-header").getByRole("link", { name: "Календарь" })).toBeVisible();
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
    const unexpectedConsoleErrors = consoleErrors.filter((error) => !error.includes("403 (Forbidden)"));
    const unexpectedFailedResponses = failedResponses.filter((response) => !response.includes("403 http://localhost:3201/api/owner/properties"));
    expect(unexpectedConsoleErrors, `${role} console errors: ${failedResponses.join(" | ")}`).toEqual([]);
    expect(unexpectedFailedResponses, `${role} failed responses`).toEqual([]);
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
    const bookingsResponse = await page.request.get("/api/bookings");
    expect(bookingsResponse.status(), `${role} booking list API`).toBe(403);
    const bookingMutation = await page.request.patch(`/api/bookings/${fixture.confirmedBookingId}`, { data: { status: "checked_in" } });
    expect(bookingMutation.status(), `${role} booking mutation API`).toBe(403);
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
  const bookingMutation = await page.request.patch(`/api/bookings/${fixture.confirmedBookingId}`, { data: { status: "checked_in" } });
  expect(bookingMutation.status()).toBe(403);
});

test("external property owner and guest cannot access apartment management UI", async ({ browser }) => {
  for (const role of ["propertyOwner", "guest"] as const) {
    const { page } = await openRole(browser, role);
    await gotoRolePage(page, "/apartments/new");
    await expect(page).not.toHaveURL(/\/apartments\/new/, { timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Создать объект" })).toHaveCount(0);
    await gotoRolePage(page, `/apartments/${fixture.apartmentPublishedId}/edit`);
    await expect(page).not.toHaveURL(/\/apartments\/[^/]+\/edit/, { timeout: 15_000 });
    await expect(page.getByText("Фотографии объекта")).toHaveCount(0);
    const bookingMutation = await page.request.patch(`/api/bookings/${fixture.confirmedBookingId}`, { data: { status: "checked_in" } });
    expect(bookingMutation.status(), `${role} booking mutation API`).toBe(403);
  }
});

test("authenticated booking reaches guest account and staff without duplicate or cross-user exposure", async ({ browser }) => {
  const marker = "E2E-REVENUE-BOOKING";
  const guest = await openRole(browser, "guest");
  await gotoRolePage(guest.page, `/guest/book/new?apartmentId=${fixture.apartmentPublishedId}&checkIn=2030-01-10&checkOut=2030-01-12&guests=2`);
  await expect(guest.page.getByRole("button", { name: "Отправить запрос на бронирование" })).toBeEnabled({ timeout: 20_000 });
  await guest.page.getByLabel("Ваше имя").fill(`${fixture.prefix} Revenue Guest`);
  await guest.page.getByLabel("Код страны вручную").fill("+7");
  await guest.page.getByLabel("Телефон").fill("9990001111");
  await guest.page.getByLabel("Email").fill(fixture.accounts.guest.email);
  await guest.page.getByLabel("Комментарий").fill(marker);

  const createResponsePromise = guest.page.waitForResponse(
    (response) => response.url().endsWith("/api/guest/bookings") && response.request().method() === "POST",
    { timeout: 15_000 },
  );
  const createRequestPromise = guest.page.waitForRequest((request) => request.url().endsWith("/api/guest/bookings") && request.method() === "POST", { timeout: 15_000 });
  await guest.page.getByRole("button", { name: "Отправить запрос на бронирование" }).click();
  const createRequest = await createRequestPromise;
  const createResponse = await createResponsePromise;
  const createPayload = (await createResponse.json()) as { ok: boolean; data?: { id?: string } };
  const createBody = createRequest.postDataJSON() as Record<string, unknown>;
  expect(createBody).toMatchObject({ guestEmail: fixture.accounts.guest.email, guestComment: marker });
  expect(createBody.guestPhone).toMatch(/\d{5,}/);
  expect(createResponse.status(), JSON.stringify(createPayload)).toBe(201);
  expect(createPayload.ok).toBe(true);
  const bookingId = createPayload.data?.id;
  expect(bookingId).toMatch(/^[0-9a-f-]{36}$/i);

  const booking = await readBookingForAudit(bookingId as string);
  expect(booking).toMatchObject({
    id: bookingId,
    organization_id: fixture.organizationId,
    apartment_id: fixture.apartmentPublishedId,
    primary_guest_id: fixture.accounts.guest.id,
    guest_email: fixture.accounts.guest.email,
    guest_phone: "+79990001111",
    guest_comment: marker,
    check_in: "2030-01-10",
    check_out: "2030-01-12",
    guests_count: 2,
    status: "pending",
    request_status: "pending",
  });

  const successText = (await guest.page.getByText(/Номер заявки: Бронь [A-F0-9]{8}/).first().textContent()) ?? "";
  const guestReference = successText.match(/Номер заявки: Бронь [A-F0-9]{8}/)?.[0] ?? "";
  expect(guestReference).toMatch(/^Номер заявки: Бронь [A-F0-9]{8}$/);
  await guest.page.getByRole("link", { name: "Открыть мои бронирования" }).click();
  await expect(guest.page).toHaveURL(/\/guest\/bookings$/);
  const guestBookingsResponse = await guest.page.request.get("/api/guest/bookings");
  const guestBookingsPayload = (await guestBookingsResponse.json()) as { ok?: boolean; data?: Array<{ id: string }>; errorMessage?: string };
  expect(guestBookingsResponse.status(), JSON.stringify(guestBookingsPayload)).toBe(200);
  expect(guestBookingsPayload.data?.filter((item) => item.id === bookingId), JSON.stringify(guestBookingsPayload)).toHaveLength(1);
  await expect(guest.page.getByText(guestReference)).toBeVisible();
  await guest.page.reload();
  await expect(guest.page.getByText(guestReference)).toBeVisible();

  const manager = await openRole(browser, "manager");
  const staffResponse = await manager.page.request.get("/api/bookings");
  expect(staffResponse.status()).toBe(200);
  const staffPayload = (await staffResponse.json()) as { ok: boolean; data?: Array<Record<string, unknown>> };
  const staffBooking = staffPayload.data?.find((item) => item.id === bookingId);
  expect(staffBooking).toMatchObject({
    id: bookingId,
    bookingNumber: expect.stringMatching(/^Бронь [A-F0-9]{8}$/),
    apartmentId: fixture.apartmentPublishedId,
    apartmentTitle: `${fixture.prefix} Published Apartment`,
    guestEmail: fixture.accounts.guest.email,
    guestPhone: "+79990001111",
    checkIn: "2030-01-10",
    checkOut: "2030-01-12",
    guests: 2,
    status: "pending",
    requestStatus: "pending",
  });
  await gotoRolePage(manager.page, "/bookings?status=pending");
  await expect(manager.page).toHaveURL(/\/bookings\?status=pending$/);

  const propertyOwner = await openRole(browser, "propertyOwner");
  const foreignGuestBookings = await propertyOwner.page.request.get("/api/guest/bookings");
  expect(foreignGuestBookings.status()).toBe(200);
  const foreignPayload = (await foreignGuestBookings.json()) as { data?: Array<{ id: string }> };
  expect(foreignPayload.data?.some((item) => item.id === bookingId)).toBe(false);
});

test("property owner is isolated to owned property and cannot read private booking data", async ({ browser }) => {
  const { page, consoleErrors } = await openRole(browser, "propertyOwner");
  await expect.poll(async () => (await page.request.get("/api/owner/properties")).status()).toBe(200);
  await gotoRolePage(page, "/account/properties");
    await expect(page.getByText(/Published Apartment/).first()).toBeVisible();
  await expect(page.getByText(/Draft Apartment/)).toHaveCount(0);
  const properties = await page.request.get("/api/owner/properties");
  expect(properties.status()).toBe(200);
  const serialized = JSON.stringify(await properties.json());
  expect(serialized).not.toContain("total_amount");
  expect(serialized).not.toContain("guest_email");
  const foreignBlocks = await page.request.get(`/api/owner/properties/${fixture.apartmentDraftId}/blocks`);
    expect(foreignBlocks.status()).toBe(403);
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
