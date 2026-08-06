import { expect, test, type Page } from "@playwright/test";
import { cleanupRoleAuditFixtures, seedRoleAuditFixtures, type RoleAuditFixture } from "./fixtures/role-audit-fixtures";

let fixture: RoleAuditFixture;

const bookingPath = () => `/guest/book/new?apartmentId=${fixture.apartmentPublishedId}&checkIn=2030-01-10&checkOut=2030-01-12&guests=2`;

async function signInFromBookingRedirect(page: Page) {
  await page.goto(bookingPath());
  await expect(page).toHaveURL(/\/guest\/login\?next=/);
  const next = new URL(page.url()).searchParams.get("next");
  expect(next).toBe(bookingPath());

  await page.getByLabel("Email").first().fill(fixture.accounts.guest.email);
  await page.getByLabel("Пароль").fill(fixture.accounts.guest.password);
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page).toHaveURL(new RegExp(`/guest/book/new\\?apartmentId=${fixture.apartmentPublishedId}`));
}

test.beforeAll(async () => {
  fixture = await seedRoleAuditFixtures();
});

test.afterAll(async () => {
  await cleanupRoleAuditFixtures(fixture);
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
  let submitted: Record<string, unknown> | null = null;
  await page.route("**/api/guest/bookings", async (route) => {
    submissions += 1;
    submitted = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ ok: true, data: { id: "booking-1", quote: { currency: "EUR" } } }) });
  });

  await page.reload();
  const submit = page.getByRole("button", { name: "Отправить запрос на бронирование" });
  await expect(submit).toBeEnabled();
  await submit.dblclick();
  await expect.poll(() => submissions).toBe(1);
  expect(submitted).toMatchObject({ apartmentId: fixture.apartmentPublishedId, guestName: "E2E Guest", guestEmail: fixture.accounts.guest.email, guestPhone: "+79990001111" });
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