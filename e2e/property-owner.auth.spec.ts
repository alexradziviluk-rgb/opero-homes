import { expect, test, type Page } from "@playwright/test";
import { cleanupPropertyOwnerFixtures, seedPropertyOwnerFixtures, TEST_PASSWORD, type OwnerFixture, assertLocalFixtureEnv } from "./fixtures/property-owner-fixtures";

test.describe.configure({ mode: "serial" });
let fixture: OwnerFixture;

async function login(page: Page, email: string) {
  await page.goto("/guest");
  const logout = page.getByRole("button", { name: "Выйти" });
  if (await logout.isVisible().catch(() => false)) {
    await logout.click();
  }
  await page.goto("/staff/login");
  const passwordForm = page.locator("form").first();
  await passwordForm.getByLabel("Email").fill(email);
  await passwordForm.getByLabel("Пароль").fill(TEST_PASSWORD);
  await passwordForm.getByRole("button", { name: "Войти" }).click();
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/, { timeout: 15_000 });
}

test.beforeAll(async () => {
  assertLocalFixtureEnv();
  fixture = await seedPropertyOwnerFixtures();
});

test.afterAll(async () => {
  if (fixture) await cleanupPropertyOwnerFixtures(fixture);
});

test("organization owner can open apartment owner management and duplicate invite is rejected", async ({ page }) => {
  await login(page, fixture.organizationOwner.email);
  await page.goto(`/apartments/${fixture.apartmentA}/owners`);
  expect(page.url()).toContain(`/apartments/${fixture.apartmentA}/owners`);
  await expect(page.getByRole("heading", { name: "Собственники", exact: true })).toBeVisible();

  const payload = { firstName: "Invited", lastName: "Fixture", email: `invite-${fixture.organizationA}@local.test`, phone: "", apartmentIds: [fixture.apartmentA] };
  const first = await page.request.post("/api/owner/invitations", { data: payload });
  const firstBody = await first.text();
  expect([201, 422], firstBody).toContain(first.status());
  const duplicate = await page.request.post("/api/owner/invitations", { data: payload });
  const duplicateBody = await duplicate.text();
  expect(duplicate.status(), duplicateBody).toBe(409);
});

test("invitation canonicalizes email and reinvite rotates the token", async ({ page }) => {
  await login(page, fixture.organizationOwner.email);
  const email = `  Rotate-${fixture.organizationA}@LOCAL.TEST `;
  const first = await page.request.post("/api/owner/invitations", { data: { firstName: "Rotate", lastName: "Fixture", email, phone: "", apartmentIds: [fixture.apartmentA] } });
  expect([201, 422], await first.text()).toContain(first.status());
  const firstBody = await first.json();
  if (first.status() === 201) {
    expect(firstBody.data.email).toBe(email.trim().toLowerCase());
    expect(firstBody.data.rawToken).toBeUndefined();
    expect(firstBody.data.inviteUrl).toBeUndefined();
  } else {
    expect(firstBody.code).toBe("EMAIL_DELIVERY_FAILED");
  }

  const invitationsResponse = await page.request.get("/api/owner/invitations");
  const invitationsBody = await invitationsResponse.json();
  const invitation = invitationsBody.data.find((row: { email: string }) => row.email === email.trim().toLowerCase());
  expect(invitation).toBeTruthy();

  const reinvite = await page.request.patch(`/api/owner/invitations/${invitation.invitationId}`, { data: { action: "resend" } });
  expect([200, 422], await reinvite.text()).toContain(reinvite.status());
  const reinviteBody = await reinvite.json();
  if (reinvite.status() === 200) {
    expect(reinviteBody.data.rawToken).toBeUndefined();
    expect(reinviteBody.data.inviteUrl).toBeUndefined();
  } else {
    expect(reinviteBody.code).toBe("EMAIL_DELIVERY_FAILED");
  }
  const duplicate = await page.request.post("/api/owner/invitations", { data: { firstName: "Rotate", lastName: "Fixture", email, phone: "", apartmentIds: [fixture.apartmentA] } });
  expect(duplicate.status()).toBe(409);
});

test("active property owner sees only related apartment and no private or financial fields", async ({ page }) => {
  await login(page, fixture.activeOwner.email);
  await expect(page).toHaveURL(/\/guest(?:\?|$)/);
  const response = await page.request.get("/api/owner/properties");
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.ok).toBe(true);
  expect(body.data.map((property: { id: string }) => property.id)).toEqual([fixture.apartmentA]);
  const serialized = JSON.stringify(body);
  for (const forbidden of ["price", "daily_price", "total_amount", "guest_name", "guest_email", "guest_phone", "payment_status"]) expect(serialized).not.toContain(forbidden);
  for (const path of ["/admin", "/bookings", "/users", "/settings", "/settings/billing"]) {
    const restricted = await page.request.get(path, { maxRedirects: 0 });
    expect(restricted.status(), path).toBeGreaterThanOrEqual(300);
    expect(restricted.status(), path).toBeLessThan(400);
  }
});

test("dual-role client can book a foreign apartment without owner access", async ({ page }) => {
  await login(page, fixture.activeOwner.email);
  await expect(page).toHaveURL(/\/guest(?:\?|$)/);

  await page.goto("/account/properties");
  await expect(page.getByRole("heading", { name: "Моя недвижимость", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Таур Fixture A", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Foreign Fixture B", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Найти жильё для поездки" })).toBeVisible();

  const dates = { apartmentId: fixture.apartmentB, checkIn: "2030-09-10", checkOut: "2030-09-12", guests: 1, rentalType: "daily" };
  const quote = await page.request.post("/api/guest/bookings/quote", { data: dates });
  expect(quote.status(), await quote.text()).toBe(200);
  expect((await quote.json()).data.apartmentId).toBe(fixture.apartmentB);

  const booking = await page.request.post("/api/guest/bookings", { data: { ...dates, guestName: "Spoofed Name", guestEmail: "spoofed@example.test", guestPhone: "+79990001111", guestComment: "Foreign apartment booking" } });
  expect(booking.status(), await booking.text()).toBe(201);
  const bookingBody = await booking.json();
  expect(bookingBody.data.apartmentId).toBe(fixture.apartmentB);
  expect(bookingBody.data.clientId).toBe(fixture.activeOwner.id);
  expect(bookingBody.data.guestEmail).toBe(fixture.activeOwner.email);

  const foreignOwnerAccess = await page.request.get(`/api/owner/properties/${fixture.apartmentB}/blocks`);
  expect(foreignOwnerAccess.status()).toBeGreaterThanOrEqual(400);
  await page.goto("/account/properties");
  await expect(page.getByRole("heading", { name: "Таур Fixture A", exact: true })).toBeVisible();
});

test("active owner can create, edit and cancel only own block", async ({ page }) => {
  await login(page, fixture.activeOwner.email);
  const create = await page.request.post(`/api/owner/properties/${fixture.apartmentA}/blocks`, { data: { startDate: "2030-06-10", endDate: "2030-06-12", reasonCode: "owner_stay", privateNote: "Do not expose" } });
  expect(create.status()).toBe(201);
  const created = await create.json();
  expect(created.data).toMatchObject({ apartmentId: fixture.apartmentA, startDate: "2030-06-10", endDate: "2030-06-12", reasonCode: "owner_stay", status: "active" });
  expect(JSON.stringify(created)).not.toContain("Do not expose");
  expect(JSON.stringify(created)).not.toContain("privateNote");

  const blockId = created.data.id as string;
  const edit = await page.request.patch(`/api/owner/properties/${fixture.apartmentA}/blocks`, { data: { blockId, startDate: "2030-06-11", endDate: "2030-06-13", reasonCode: "family_or_guests" } });
  expect(edit.status()).toBe(200);
  expect((await edit.json()).data.startDate).toBe("2030-06-11");

  const foreign = await page.request.post(`/api/owner/properties/${fixture.apartmentB}/blocks`, { data: { startDate: "2030-07-10", endDate: "2030-07-12", reasonCode: "owner_stay" } });
  expect(foreign.status()).toBeGreaterThanOrEqual(400);
  const cancel = await page.request.delete(`/api/owner/properties/${fixture.apartmentA}/blocks?blockId=${blockId}`);
  expect(cancel.status()).toBe(200);
  const doubleCancel = await page.request.delete(`/api/owner/properties/${fixture.apartmentA}/blocks?blockId=${blockId}`);
  expect(doubleCancel.status()).toBe(404);
});

test("confirmed booking conflict, paused owner denial, and RLS tampering are rejected", async ({ page, browser }) => {
  await login(page, fixture.activeOwner.email);
  const bookingConflict = await page.request.post(`/api/owner/properties/${fixture.apartmentA}/blocks`, { data: { startDate: "2030-02-10", endDate: "2030-02-11", reasonCode: "owner_stay" } });
  expect(bookingConflict.status()).toBe(409);
  const idTampering = await page.request.post(`/api/owner/properties/${fixture.apartmentB}/blocks`, { data: { startDate: "2030-08-10", endDate: "2030-08-12", reasonCode: "owner_stay" } });
  expect(idTampering.status()).toBeGreaterThanOrEqual(400);

  const pausedContext = await browser.newContext();
  const pausedPage = await pausedContext.newPage();
  await login(pausedPage, fixture.pausedOwner.email);
  expect(pausedPage.url()).not.toContain("/owner");
  const pausedApi = await pausedPage.request.get("/api/owner/properties");
  expect(pausedApi.status()).toBeGreaterThanOrEqual(401);
  await pausedContext.close();
});

test("mobile owner calendar has no server errors", async ({ browser }) => {
  const context = await browser.newContext({ ...test.info().project.use, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error" && !message.text().includes("favicon")) errors.push(message.text()); });
  await login(page, fixture.activeOwner.email);
  await page.goto("/account/properties");
  expect(page.url()).toContain("/account/properties");
  expect(errors.filter((message) => message.toLowerCase().includes("hydration"))).toEqual([]);
  await context.close();
});
