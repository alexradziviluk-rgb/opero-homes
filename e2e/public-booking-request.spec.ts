import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";

const localSupabaseUrl = "http://127.0.0.1:54321";
const localServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const fixturePrefix = `E2E-PUBLIC-BOOKING-${Date.now()}`;
let apartmentId = "";
let organizationId = "";
let ownerUserId = "";

async function localSupabaseRequest(path: string, init?: RequestInit) {
  return fetch(`${localSupabaseUrl}${path}`, {
    ...init,
    headers: {
      apikey: localServiceRoleKey,
      Authorization: `Bearer ${localServiceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...init?.headers,
    },
  });
}

function runLocalSql(sql: string): string {
  return execFileSync("docker", [
    "exec", "supabase_db_opero-homes", "psql", "-U", "postgres", "-d", "postgres", "-qAt", "-c", sql,
  ], { encoding: "utf8" }).trim();
}

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

test.beforeAll(async () => {
  const userResponse = await localSupabaseRequest("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({
      email: `${fixturePrefix.toLowerCase()}@example.test`,
      password: "E2E-PUBLIC-BOOKING-password-1!",
      email_confirm: true,
      user_metadata: { e2e_fixture: fixturePrefix, first_name: "E2E", last_name: "Public Booking" },
    }),
  });
  if (!userResponse.ok) {
    throw new Error(`Local fixture user creation failed: ${await userResponse.text()}`);
  }
  const userPayload = await userResponse.json() as { id: string };
  ownerUserId = userPayload.id;

  organizationId = runLocalSql(`
    insert into public.organizations (name, slug, owner_id)
    values (${sqlLiteral(fixturePrefix)}, ${sqlLiteral(fixturePrefix.toLowerCase())}, ${sqlLiteral(ownerUserId)})
    returning id;
  `);

  apartmentId = runLocalSql(`
    insert into public.apartments (
      organization_id, title, name, city, district, rooms, bedrooms, bathrooms, minimum_nights,
      publication_status, publish_status, status, availability, max_guests, rental_types,
      daily_price, cleaning_fee, deposit
    ) values (
      ${sqlLiteral(organizationId)}, ${sqlLiteral(fixturePrefix)}, ${sqlLiteral(fixturePrefix)}, 'Alanya', 'Mahmutlar', 2, 1, 1, 1,
      'published', 'Опубликован', 'Свободно', 'Свободен', 4,
      '{"daily": true, "weekly": false, "monthly": false}'::jsonb, 100, 50, 200
    ) returning id;
  `);
});

test.afterAll(async () => {
  if (organizationId) {
    runLocalSql(`delete from public.organizations where id = ${sqlLiteral(organizationId)} and name = ${sqlLiteral(fixturePrefix)};`);
  }
  if (ownerUserId) {
    await localSupabaseRequest(`/auth/v1/admin/users/${ownerUserId}`, { method: "DELETE" });
  }
});

async function mockAnonymousAuth(page: Page) {
  await page.route("**/auth/v1/user**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({}),
  }));
}

async function mockQuote(page: Page, conflict = false) {
  await page.route("**/api/guest/bookings/quote", (route) => route.fulfill({
    status: conflict ? 409 : 200,
    contentType: "application/json",
    body: JSON.stringify(conflict ? {
      ok: false,
      errorCode: "booking_conflict",
      errorMessage: "Выбранные даты уже заняты.",
    } : {
      ok: true,
      data: {
        apartmentTitle: "Public Test Apartment",
        nights: 2,
        guests: 2,
        currency: "EUR",
        pricePeriod: "night",
        rentalType: "daily",
        pricePerPeriod: 100,
        accommodationAmount: 200,
        cleaningFee: 50,
        deposit: 200,
        discount: 0,
        totalAmount: 450,
        maxGuests: 4,
        minimumStay: 1,
      },
    }),
  }));
}

test.describe("public booking request", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("anonymous guest can open the request form without payment UI", async ({ page }) => {
    await mockAnonymousAuth(page);
    await page.goto(`/guest/book/new?apartmentId=${apartmentId}`);

    await expect(page.getByRole("heading", { name: "Бронирование" })).toBeVisible();
    await expect(page.getByLabel("Ваше имя")).toBeVisible();
    await expect(page.getByLabel("Телефон")).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Комментарий")).toBeVisible();
    await expect(page.getByText(/оплат|карта|checkout|stripe/i)).toHaveCount(0);
  });

  test("submits contact data as a pending unpaid public request", async ({ page }) => {
    await mockAnonymousAuth(page);
    await mockQuote(page);
    let submitted: Record<string, unknown> | null = null;
    await page.route("**/api/guest/bookings", async (route) => {
      submitted = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: { id: "public-request-1", quote: { currency: "EUR" } } }),
      });
    });

    await page.goto(`/guest/book/new?apartmentId=${apartmentId}&checkIn=2030-01-10&checkOut=2030-01-12`);
    await page.getByLabel("Ваше имя").fill("Анна Тестова");
    await page.getByLabel("Телефон").fill("+90 555 000 0000");
    await page.getByLabel("Email").fill("anna@example.com");
    await page.getByLabel("Комментарий").fill("Поздний заезд");
    await page.getByRole("button", { name: "Отправить запрос на бронирование" }).click();

    await expect.poll(() => submitted).toMatchObject({
      apartmentId,
      checkIn: "2030-01-10",
      checkOut: "2030-01-12",
      guests: 1,
      rentalType: "daily",
      guestName: "Анна Тестова",
      guestEmail: "anna@example.com",
      guestPhone: "+90 555 000 0000",
      guestComment: "Поздний заезд",
    });
    expect(submitted).not.toHaveProperty("paymentMethod");
    expect(submitted).not.toHaveProperty("cardNumber");
    await expect(page.getByText(/Запрос отправлен/)).toBeVisible();
  });

  test("shows occupied dates as unavailable", async ({ page }) => {
    await mockAnonymousAuth(page);
    await mockQuote(page, true);
    await page.goto(`/guest/book/new?apartmentId=${apartmentId}&checkIn=2030-01-10&checkOut=2030-01-12`);
    await expect(page.getByText("Выбранные даты уже заняты.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Отправить запрос на бронирование" })).toBeDisabled();
  });

  test("does not offer a disabled rental type", async ({ page }) => {
    await mockAnonymousAuth(page);
    await page.goto(`/guest/book/new?apartmentId=${apartmentId}`);
    const rentalType = page.getByLabel("Тип аренды");
    await expect(rentalType.locator("option")).toHaveText(["Посуточно"]);
    await expect(rentalType).not.toHaveValue("monthly");
  });
});
