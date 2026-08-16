import { expect, test, type Page } from "@playwright/test";
import { cleanupPropertyOwnerFixtures, seedPropertyOwnerFixtures, TEST_PASSWORD, type OwnerFixture } from "./fixtures/property-owner-fixtures";

const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;
let fixture: OwnerFixture;

test.beforeAll(async () => {
  fixture = await seedPropertyOwnerFixtures();
});

test.afterAll(async () => {
  await cleanupPropertyOwnerFixtures(fixture);
});

async function ensureStaffSession(page: Page) {
  await page.goto("/staff/login");
  if (!page.url().includes("/login")) return;

  const email = fixture.organizationOwner.email;
  const password = TEST_PASSWORD;

  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/admin$/);
}

test.beforeEach(async ({ page }) => {
  await ensureStaffSession(page);
});

test("confirmed booking is visible in the administrative calendar", async ({ page }) => {
  await page.goto("/calendar");
  await expect(page.getByRole("heading", { name: "Календарь" })).toBeVisible();
  const fixtureCalendar = page.locator("article").filter({ hasText: "Таур Fixture A — ID 1001" });
  await expect(fixtureCalendar).toBeVisible();
  await expect(fixtureCalendar.locator('section[aria-label="Календарь доступности"] button[aria-label*=" — "]').first()).toBeVisible();
});

test("confirmed booking is visible in apartment details", async ({ page }) => {
  await page.goto(`/apartments/${fixture.apartmentA}`);
  const upcoming = page.getByText("Ближайшие бронирования").locator("..");
  await expect(upcoming).not.toContainText("Нет будущих бронирований");
  await expect(upcoming).toContainText(/10\.02\.2030|2\/10\/2030/);
});

test("staff operational pages do not expose UUIDs", async ({ page }) => {
  for (const path of ["/bookings", "/tasks", "/cleaning", "/check-in-out", "/notifications"]) {
    await page.goto(path);
    await expect(page.locator("main")).not.toContainText(UUID_PATTERN);
  }
});

test("selected apartment only offers enabled rental modes and canonical price", async ({ page }) => {
  await page.goto("/bookings/new");
  await page.locator("select").nth(1).selectOption(fixture.apartmentA);
  await expect(page.locator("select").nth(1).locator(`option[value="${fixture.apartmentA}"]`)).toHaveText(/Таур Fixture A — ID 1001/);
  await expect(page.getByText("Выбран объект: Таур Fixture A — ID 1001")).toBeVisible();
  const rentalType = page.getByLabel("Тип аренды");
  await expect(rentalType.locator("option")).toHaveText(["Посуточно"]);
  await expect(rentalType).toHaveValue("daily");
  await expect(page.getByLabel("Цена за период")).toHaveValue("100");
});

test("duplicate property names remain distinct and searchable by ID", async ({ page }) => {
  await page.goto("/bookings/new");
  const propertySelect = page.locator("select").nth(1);
  await expect(propertySelect.locator("option").filter({ hasText: "Best Home — ID 1042" })).toHaveCount(1);
  await expect(propertySelect.locator("option").filter({ hasText: "Best Home — ID 1077" })).toHaveCount(1);

  await page.goto("/calendar");
  await page.getByPlaceholder("Название, ID или город").fill("1042");
  await expect(page.locator("article").filter({ hasText: "Best Home — ID 1042" })).toBeVisible();
  await expect(page.locator("article").filter({ hasText: "Best Home — ID 1077" })).toHaveCount(0);
});

test("zero price requires explicit complimentary confirmation", async ({ page }) => {
  await page.goto("/bookings/new");
  await page.locator("select").nth(1).selectOption(fixture.apartmentA);
  await page.getByLabel("Цена за период").fill("0");
  await expect(page.getByText("Подтверждаю бесплатное размещение")).toBeVisible();
});

test("check-in and check-out times are sent and displayed after reload", async ({ page }) => {
  let savedPayload: Record<string, unknown> | null = null;
  await page.route("**/api/bookings", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    savedPayload = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ ok: true, data: { id: "e2e-time-booking" } }) });
  });
  await page.route("**/api/notifications/events", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) }));

  await page.goto("/bookings/new");
  await page.locator("select").nth(1).selectOption(fixture.apartmentA);
  await page.getByLabel("Имя гостя").fill("E2E Time Guest");
  await page.getByRole("textbox", { name: "Заезд", exact: true }).fill("2027-01-10");
  await page.getByRole("textbox", { name: "Выезд", exact: true }).fill("2027-02-10");
  await page.getByRole("textbox", { name: "Время заезда" }).fill("16:30");
  await page.getByRole("textbox", { name: "Время выезда" }).fill("10:15");
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  const savedValue = (key: string) => savedPayload?.[key];
  await expect.poll(() => savedValue("checkInTime")).toBe("16:30");
  expect(savedValue("checkOutTime")).toBe("10:15");

  await page.route("**/api/bookings/e2e-time-booking", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      ok: true,
      data: {
        id: "e2e-time-booking",
        apartmentId: fixture.apartmentA,
        apartmentTitle: "Таур Fixture A",
        guestName: "E2E Time Guest",
        guestPhone: "",
        guestEmail: "",
        checkIn: "2027-01-10",
        checkOut: "2027-02-10",
        checkInTime: "16:30",
        checkOutTime: "10:15",
        guests: 1,
        rentalType: "monthly",
        pricePerPeriod: 1100,
        accommodationAmount: 1100,
        cleaningFee: 120,
        deposit: 400,
        discount: 0,
        totalAmount: 1620,
        paidAmount: 0,
        status: "confirmed",
        paymentStatus: "unpaid",
        source: "direct",
        notes: "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    }),
  }));
  await page.goto("/bookings/e2e-time-booking");
  await page.reload();
  await expect(page.locator("main")).toContainText("16:30");
  await expect(page.locator("main")).toContainText("10:15");
});

test("task is created through apartment selection", async ({ page }) => {
  let taskPayload: Record<string, unknown> | null = null;
  await page.route("**/api/operations/tasks", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    taskPayload = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: {
        id: "e2e-task", title: "E2E Task", description: "", task_type: "other", priority: "normal", status: "assigned",
        apartment_id: fixture.apartmentA, booking_id: null, assigned_user_id: taskPayload.assignedUserId, due_at: taskPayload.dueAt,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      } }),
    });
  });
  await page.goto("/tasks");
  await page.getByRole("button", { name: "+ Создать задачу" }).click();
  await page.getByPlaceholder("Название задачи").fill("E2E Task");
  await expect(page.getByLabel("Объект").locator(`option[value="${fixture.apartmentA}"]`)).toHaveCount(1);
  await page.getByLabel("Объект").selectOption(fixture.apartmentA);
  await expect(page.getByLabel("Объект")).toHaveValue(fixture.apartmentA);
  await expect(page.locator("form select").nth(2).locator("option").nth(1)).toBeAttached();
  await expect(page.getByLabel("Ответственный").locator("option").nth(1)).toBeAttached();
  await page.getByLabel("Ответственный").selectOption({ index: 1 });
  await expect(page.getByLabel("Ответственный")).not.toHaveValue("");
  await page.getByLabel("Дата выполнения").fill("2027-01-10");
  await page.getByLabel("Время выполнения").selectOption("12:00");
  await page.locator("form button[type=submit]").click();
  await expect.poll(() => taskPayload?.apartmentId).toBe(fixture.apartmentA);
  await expect(page.getByText("Таур Fixture A").last()).toBeVisible();
});

test("mobile sidebar opens and closes after navigation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin");
  await expect(page.getByRole("link", { name: "Объекты" })).toBeHidden();
  await page.getByRole("button", { name: "Открыть меню" }).click();
  await expect(page.getByRole("link", { name: "Объекты" })).toBeVisible();
  await page.getByRole("link", { name: "Объекты" }).click();
  await expect(page).toHaveURL(/\/apartments$/);
  await expect(page.getByRole("link", { name: "Бронирования" })).toBeHidden();
});

test("employee appears in daily operations and access management contexts", async ({ page }) => {
  await page.goto("/employees");
  await expect(page.getByRole("heading", { name: "Organization Fixture", exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Ежедневная работа команды/)).toBeVisible({ timeout: 15_000 });
  await page.goto("/users");
  await expect(page.locator("tbody").getByText("Organization Fixture", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Приглашения, роли, статусы active\/paused/)).toBeVisible({ timeout: 15_000 });
});

test("active employee invitation can be revoked for retry", async ({ page }) => {
  const invitationId = "f2888fb9-755d-40a2-915b-687bdf00b424";
  let revokedInvitationId: string | null = null;

  await page.route("**/api/users/invitations", async (route) => {
    if (route.request().method() === "DELETE") {
      const payload = route.request().postDataJSON() as { invitationId?: string };
      revokedInvitationId = payload.invitationId ?? null;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: [{
          invitationId,
          email: "retry@example.com",
          phone: "+905000000000",
          firstName: "Retry",
          lastName: "User",
          roleCode: "manager",
          deliveryStatus: "sent",
          expiresAt: "2026-08-08T12:00:00.000Z",
          createdAt: "2026-08-01T12:00:00.000Z",
        }],
      }),
    });
  });

  page.once("dialog", (dialog) => dialog.accept());
  await page.goto("/users");
  const invitationRow = page.getByRole("row", { name: /Retry User retry@example\.com/ });
  await expect(invitationRow).toBeVisible();
  await invitationRow.getByRole("button", { name: "Отозвать" }).click();
  await expect.poll(() => revokedInvitationId).toBe(invitationId);
  await expect(invitationRow).toBeHidden();
});

test("employee can be promoted while retaining additional operational roles", async ({ page }) => {
  const userId = "c99cfd0a-805e-4c32-8e42-6635c4598b84";
  let updatePayload: Record<string, unknown> | null = null;

  await page.route("**/api/users", async (route) => {
    if (route.request().method() === "PATCH") {
      updatePayload = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: [{
          userId,
          organizationId: "f19a031a-9bec-4e3e-a1ee-8c9000251136",
          firstName: "Career",
          lastName: "User",
          email: "career@example.com",
          phone: "+905000000001",
          roleCode: "employee",
          additionalRoleCodes: ["cleaner"],
          status: "active",
          joinedAt: "2026-08-01T12:00:00.000Z",
          createdAt: "2026-08-01T12:00:00.000Z",
          updatedAt: "2026-08-01T12:00:00.000Z",
          additionalPermissions: [],
          deniedPermissions: [],
        }],
      }),
    });
  });

  await page.goto(`/users/${userId}/edit`);
  await expect(page.getByRole("checkbox", { name: "Уборщик" })).toBeChecked();
  await page.getByRole("checkbox", { name: "Специалист по обслуживанию" }).check();
  await page.getByLabel("Основная роль").selectOption("manager");
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();

  const savedValue = (key: string) => updatePayload?.[key];
  await expect.poll(() => savedValue("roleCode")).toBe("manager");
  expect(savedValue("additionalRoleCodes")).toEqual(["cleaner", "maintenance"]);
});
