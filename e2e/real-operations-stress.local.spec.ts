import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { cleanupRoleAuditFixtures, insertOrThrow, seedRoleAuditFixtures, type RoleAuditFixture } from "./fixtures/role-audit-fixtures";

test.describe.configure({ mode: "serial", timeout: 180_000 });

let fixture: RoleAuditFixture;

async function signInManager(page: Page) {
  await page.goto("/staff/login", { waitUntil: "domcontentloaded" });
  const form = page.locator("form").first();
  await expect(form).toHaveAttribute("data-auth-ready", "true", { timeout: 15_000 });
  await form.locator('input[type="email"]').fill(fixture.accounts.manager.email);
  await form.locator('input[type="password"]').fill(fixture.accounts.manager.password);
  await form.getByRole("button", { name: "Войти" }).click();
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/, { timeout: 15_000 });
}

test.beforeAll(async () => {
  fixture = await seedRoleAuditFixtures();
});

test.afterAll(async () => {
  await cleanupRoleAuditFixtures(fixture);
});

test("simulates a high-volume operational day without duplicate or orphan records", async ({ page }) => {
  await signInManager(page);

  const apartmentIds = Array.from({ length: 20 }, () => randomUUID());
  const apartmentRows = apartmentIds.map((id, index) => ({
    id,
    organization_id: fixture.organizationId,
    name: `${fixture.prefix} Stress Apartment ${index + 1}`,
    title: `${fixture.prefix} Stress Apartment ${index + 1}`,
    city: "Alanya",
    address: `${fixture.prefix} Stress Address ${index + 1}`,
    price: 120,
    daily_price: 120,
    rental_types: { daily: true },
    max_guests: 4,
    status: "Свободно",
    availability: "Свободен",
    publication_status: "published",
    publish_status: "published",
    responsible_user_id: fixture.accounts.employee.id,
    backup_manager_user_id: fixture.accounts.manager.id,
  }));
  await insertOrThrow(fixture.admin, "apartments", apartmentRows);
  fixture.lifecycleApartmentIds.push(...apartmentIds);

  const checkInDates = Array.from({ length: 50 }, (_, index) => {
    const apartmentIndex = index % apartmentIds.length;
    const period = Math.floor(index / apartmentIds.length);
    const date = new Date(Date.UTC(2050, 0, 10 + period * 4));
    return { apartmentId: apartmentIds[apartmentIndex], checkIn: date.toISOString().slice(0, 10), checkOut: new Date(date.getTime() + 2 * 86_400_000).toISOString().slice(0, 10) };
  });
  const bookingIds: string[] = [];
  for (const [index, dates] of checkInDates.entries()) {
    const response = await page.request.post("/api/bookings", {
      data: {
        id: randomUUID(),
        apartmentId: dates.apartmentId,
        guestName: `${fixture.prefix} Stress Guest ${index + 1}`,
        guestPhone: "+79990006666",
        guestEmail: fixture.accounts.guest.email,
        checkIn: dates.checkIn,
        checkOut: dates.checkOut,
        guests: 2,
        rentalType: "daily",
        status: "confirmed",
        paymentStatus: "unpaid",
        source: "real-operations-stress-e2e",
      },
    });
    const payload = await response.json() as { ok?: boolean; data?: { id?: string } };
    expect(response.status(), JSON.stringify(payload)).toBe(201);
    expect(payload.data?.id).toMatch(/^[0-9a-f-]{36}$/i);
    bookingIds.push(payload.data?.id as string);
  }

  const duplicateResponse = await page.request.post("/api/bookings", {
    data: {
      id: randomUUID(),
      apartmentId: checkInDates[0].apartmentId,
      guestName: `${fixture.prefix} Duplicate Guest`,
      guestPhone: "+79990005555",
      guestEmail: fixture.accounts.guest.email,
      checkIn: checkInDates[0].checkIn,
      checkOut: checkInDates[0].checkOut,
      guests: 2,
      rentalType: "daily",
      status: "confirmed",
      paymentStatus: "unpaid",
      source: "real-operations-stress-e2e",
    },
  });
  expect(duplicateResponse.status(), await duplicateResponse.text()).toBe(409);

  const taskRequests = Array.from({ length: 35 }, (_, index) => ({
    title: `${fixture.prefix} Stress ${index < 20 ? "Cleaning" : "Maintenance"} ${index + 1}`,
    description: "Real operations stress task",
    taskType: index < 20 ? "cleaning" : "technical",
    apartmentId: apartmentIds[index % apartmentIds.length],
    bookingId: bookingIds[index % bookingIds.length],
    assignedUserId: index < 20 ? fixture.accounts.cleaner.id : fixture.accounts.maintenance.id,
    dueAt: new Date(Date.now() - 86_400_000).toISOString(),
    priority: index % 5 === 0 ? "high" : "normal",
    checklistItems: ["Verify work", "Update guest record"],
  }));
  const taskResponses = await Promise.all(taskRequests.map((task) => page.request.post("/api/operations/tasks", { data: task })));
  expect(taskResponses.every((response) => response.status() === 201)).toBe(true);

  const supportResponses = await Promise.all(Array.from({ length: 10 }, (_, index) => page.request.post("/api/support/tickets", {
    data: {
      message: `${fixture.prefix} Stress support issue ${index + 1}: кондиционер не работает`,
      confirmed: true,
      idempotencyKey: `${fixture.prefix}-stress-support-${index}`,
      route: "/account/support",
    },
  })));
  expect(supportResponses.every((response) => response.status() === 200)).toBe(true);

  const metricsResponse = await page.request.get("/api/dashboard/metrics");
  const metricsPayload = await metricsResponse.json() as { ok: boolean; data?: Record<string, unknown> };
  expect(metricsResponse.status(), JSON.stringify(metricsPayload)).toBe(200);
  expect(metricsPayload).toMatchObject({ ok: true, data: {
    propertiesTotal: 22,
    bookingsTotal: 52,
    overdueCleaningCount: 20,
    overdueMaintenanceCount: 15,
  } });

  await page.goto("/admin", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Свободные квартиры").locator("..")).toContainText("22");
  await page.goto("/tasks", { waitUntil: "domcontentloaded" });
  await expect(page.getByText(/Stress Cleaning|Stress Maintenance/).first()).toBeVisible();
  await page.goto("/cleaning", { waitUntil: "domcontentloaded" });
  await expect(page.getByText(/Stress Cleaning/).first()).toBeVisible();
  await page.goto("/maintenance", { waitUntil: "domcontentloaded" });
  await expect(page.getByText(/Stress Maintenance/).first()).toBeVisible();

  const finalBookings = await fixture.admin.from("bookings").select("id,apartment_id").eq("organization_id", fixture.organizationId);
  const finalTasks = await fixture.admin.from("operational_tasks").select("id,apartment_id,booking_id,task_type").eq("organization_id", fixture.organizationId);
  const finalTickets = await fixture.admin.from("support_tickets").select("id,organization_id,customer_message").eq("organization_id", fixture.organizationId).like("customer_message", `${fixture.prefix}%`);
  expect(finalBookings.error?.message ?? null).toBeNull();
  expect(finalTasks.error?.message ?? null).toBeNull();
  expect(finalTickets.error?.message ?? null).toBeNull();
  expect(finalBookings.data?.length).toBe(52);
  expect(finalTasks.data?.filter((task) => apartmentIds.includes(task.apartment_id ?? ""))).toHaveLength(35);
  expect(finalTickets.data).toHaveLength(10);
});
