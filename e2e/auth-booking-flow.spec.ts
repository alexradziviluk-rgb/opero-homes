import { expect, test, type Page } from "@playwright/test";
import { cleanupRoleAuditFixtures, seedRoleAuditFixtures, type RoleAuditFixture } from "./fixtures/role-audit-fixtures";

let fixture: RoleAuditFixture;

test.use({ storageState: { cookies: [], origins: [] } });

const bookingPath = () => `/guest/book/new?apartmentId=${fixture.apartmentPublishedId}&checkIn=2030-01-10&checkOut=2030-01-12&guests=2`;

async function signInFromBookingRedirect(page: Page) {
  console.info("[auth-booking]", { event: "login-start", fixture: fixture.prefix, at: new Date().toISOString() });
  await page.goto(bookingPath());
  await expect(page).toHaveURL(/\/guest\/login\?next=/);
  const next = new URL(page.url()).searchParams.get("next");
  expect(next).toBe(bookingPath());

  const emailInput = page.locator('form').first().locator('input[type="email"]');
  const passwordInput = page.locator('form').first().locator('input[type="password"]');
  const submit = page.getByRole("button", { name: "Войти" });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) {
      await page.reload({ waitUntil: "domcontentloaded", timeout: 15_000 });
    }
    await emailInput.fill(fixture.accounts.guest.email);
    await passwordInput.fill(fixture.accounts.guest.password);
    try {
      await expect(emailInput).toHaveValue(fixture.accounts.guest.email, { timeout: 2_000 });
      await expect(passwordInput).toHaveValue(fixture.accounts.guest.password, { timeout: 2_000 });
    } catch (error) {
      if (attempt === 2) throw error;
      continue;
    }
    await expect(submit).toBeEnabled({ timeout: 15_000 });
    await submit.click();
    if (!page.url().includes("/login")) break;
    await expect(page.locator("p.text-rose-300")).toHaveCount(0, { timeout: 2_000 }).catch(() => undefined);
    break;
  }
  await expect(page).toHaveURL(new RegExp(`/guest/book/new\\?apartmentId=${fixture.apartmentPublishedId}`));
  await expect(page.locator("text=Загрузка профиля...")).toHaveCount(0, { timeout: 15_000 });
  console.info("[auth-booking]", { event: "login-success", fixture: fixture.prefix, url: page.url(), at: new Date().toISOString() });
}

test.beforeAll(async () => {
  fixture = await seedRoleAuditFixtures();
  console.info("[auth-booking]", { event: "fixture-ready", fixture: fixture.prefix, at: new Date().toISOString() });
});

test.afterAll(async () => {
  console.info("[auth-booking]", { event: "cleanup-start", fixture: fixture?.prefix ?? "", at: new Date().toISOString() });
  await cleanupRoleAuditFixtures(fixture);
  console.info("[auth-booking]", { event: "cleanup-finish", fixture: fixture?.prefix ?? "", at: new Date().toISOString() });
});

test.afterEach(async ({ page }, testInfo) => {
  console.info("[auth-booking]", { event: "test-end", test: testInfo.title, status: testInfo.status, url: page.url(), at: new Date().toISOString() });
});

test("anonymous booking request is rejected by the API", async ({ request }) => {
  const response = await request.post("/api/guest/bookings", {
    data: {
      apartmentId: "61901461-0d6d-4e61-98c6-b26738d10c37",
      checkIn: "2026-08-05",
      checkOut: "2026-08-07",
      guests: 2,
      guestName: "Анонимный клиент",
      guestEmail: "anonymous@example.com",
      guestPhone: "+90 555 000 0000",
    },
  });

  expect(response.status()).toBe(401);
  await expect(response.json()).resolves.toMatchObject({
    ok: false,
    errorCode: "session_expired",
  });
});

test("unauthenticated booking preserves apartment and dates through login redirect", async ({ page }) => {
  await page.goto(bookingPath());
  await expect(page).toHaveURL(/\/guest\/login\?next=/);
  expect(new URL(page.url()).searchParams.get("next")).toBe(bookingPath());
});

test("guest login returns to booking and autofills the existing profile", async ({ page }) => {
  await signInFromBookingRedirect(page);
  await page.route("**/api/guest/profile", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, data: { firstName: "E2E", lastName: "Guest", email: fixture.accounts.guest.email, phone: "+79990001111" } }),
  }));
  await page.reload();
  await expect(page.getByLabel("Ваше имя")).toHaveValue("E2E Guest");
  await expect(page.getByLabel("Телефон")).toHaveValue("9990001111");
  await expect(page.getByLabel("Email")).toHaveValue(fixture.accounts.guest.email);
});

test("expired guest session returns from booking to login", async ({ page }) => {
  await signInFromBookingRedirect(page);
  await page.route("**/api/guest/profile", (route) => route.fulfill({
    status: 401,
    contentType: "application/json",
    body: JSON.stringify({ ok: false, error: "Authentication required" }),
  }));

  const profileResponse = page.waitForResponse((response) => response.url().includes("/api/guest/profile") && response.status() === 401);
  const loginRequest = page.waitForRequest((request) => request.url().includes("/guest/login?next="));
  await page.goto(bookingPath(), { waitUntil: "commit" }).catch((error: unknown) => {
    if (!(error instanceof Error) || !/ERR_ABORTED|aborted/i.test(error.message)) throw error;
  });
  await profileResponse;
  const loginUrl = new URL((await loginRequest).url());

  expect(loginUrl.pathname).toBe("/guest/login");
  expect(loginUrl.searchParams.get("next")).toBe(bookingPath());
});

test("profile load failure blocks booking submission with a visible error", async ({ page }) => {
  await signInFromBookingRedirect(page);
  await page.route("**/api/guest/profile", (route) => route.fulfill({
    status: 500,
    contentType: "application/json",
    body: JSON.stringify({ ok: false, error: "Temporary failure" }),
  }));
  await page.route("**/api/guest/bookings/quote", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, data: { apartmentTitle: "Published Apartment", nights: 2, guests: 2, currency: "EUR", pricePeriod: "night", pricePerPeriod: 100, accommodationAmount: 200, cleaningFee: 0, deposit: 0, discount: 0, totalAmount: 200, rentalType: "daily", maxGuests: 4, minimumStay: 1 } }),
  }));

  await page.goto(bookingPath());

  await expect(page.getByText("Не удалось загрузить профиль. Обновите страницу и попробуйте снова.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Отправить запрос на бронирование" })).toBeDisabled();
});

test("booking submission uses the authenticated profile and ignores repeated submit", async ({ page }) => {
  await signInFromBookingRedirect(page);
  await page.route("**/api/guest/profile", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, data: { firstName: "E2E", lastName: "Guest", email: fixture.accounts.guest.email, phone: "+79990001111" } }),
  }));
  await page.route("**/api/guest/bookings/quote", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, data: { apartmentTitle: "Published Apartment", nights: 2, guests: 2, currency: "EUR", pricePeriod: "night", pricePerPeriod: 100, accommodationAmount: 200, cleaningFee: 0, deposit: 0, discount: 0, totalAmount: 200, rentalType: "daily", maxGuests: 4, minimumStay: 1 } }),
  }));
  let submissions = 0;
  let accountLoads = 0;
  let submitted: Record<string, unknown> | null = null;
  await page.route("**/api/guest/bookings", async (route) => {
    if (route.request().method() === "GET") {
      accountLoads += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: [{ id: "12345678-90ab-cdef-1234-567890abcdef", apartmentTitle: "Published Apartment", checkIn: "2030-01-10", checkOut: "2030-01-12", totalAmount: 200, status: "pending", paymentStatus: "unpaid", source: "public_website", createdAt: "2030-01-01T00:00:00.000Z" }] }),
      });
      return;
    }

    submissions += 1;
    submitted = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ ok: true, data: { id: "12345678-90ab-cdef-1234-567890abcdef", quote: { currency: "EUR" } } }) });
  });

  await page.goto(bookingPath(), { waitUntil: "domcontentloaded" });
  const submit = page.getByRole("button", { name: "Отправить запрос на бронирование" });
  await expect(submit).toBeEnabled();
  await submit.dblclick();
  await expect.poll(() => submissions).toBe(1);
  expect(submitted).toMatchObject({ apartmentId: fixture.apartmentPublishedId, guestName: "E2E Guest", guestEmail: fixture.accounts.guest.email, guestPhone: "+79990001111" });
  await page.goto("/guest/bookings", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/guest\/bookings$/);
  await expect(page.getByRole("heading", { name: "Мои бронирования" })).toBeVisible();
  await expect(page.getByText("Номер заявки: Бронь 12345678")).toBeVisible();
  const accountLoadsBeforeRefresh = accountLoads;
  await page.reload();
  await expect(page.getByText("Номер заявки: Бронь 12345678")).toBeVisible();
  expect(accountLoads).toBeGreaterThan(accountLoadsBeforeRefresh);
  expect(submissions).toBe(1);
});

test("an already authenticated guest can revisit login and return without re-entering profile data", async ({ page }) => {
  await signInFromBookingRedirect(page);
  await page.route("**/api/guest/profile", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, data: { firstName: "E2E", lastName: "Guest", email: fixture.accounts.guest.email, phone: "+79990001111" } }),
  }));
  await page.reload();
  await page.goto(`/guest/login?next=${encodeURIComponent(bookingPath())}`);
  await expect(page).toHaveURL(new RegExp(`/guest/book/new\\?apartmentId=${fixture.apartmentPublishedId}`));
  await expect(page.getByLabel("Ваше имя")).toHaveValue("E2E Guest");
  await expect(page.getByLabel("Телефон")).toHaveValue("9990001111");
});