import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { cleanupRoleAuditFixtures, readApartmentForAuditById, readApartmentForAuditByTitle, readBookingForAudit, seedRoleAuditFixtures, type RoleAuditFixture } from "./fixtures/role-audit-fixtures";

test.describe.configure({ mode: "serial", timeout: 120_000 });

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

test("creates and reloads one linked internal lifecycle apartment", async ({ page }) => {
  await signInManager(page);
  await page.goto("/apartments/new", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Новый объект" })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("form > section h2").evaluateAll((headings) => headings.map((heading) => heading.textContent?.trim()))).resolves.toEqual([
    "Основная информация",
    "Адрес",
    "Характеристики",
    "Цена",
    "Фотографии",
    "Удобства",
    "Правила проживания",
    "Ответственные за уведомления",
    "Владелец (необязательно)",
    "Статус",
  ]);

  const title = `${fixture.prefix} Lifecycle Apartment`;
  const googleMapsUrl = "https://www.google.com/maps/place/Yekta+Homes/@36.4972455,32.0843866,496m/data=!3m2!1e3!4b1!4m6!3m5!1s0x14dc987b2e4361eb:0x7db5e430eea3587b!8m2!3d36.4972412!4d32.0869615!16s%2Fg%2F1pv0dvhwr!18m1!1e1?entry=ttu";
  await page.getByLabel("Ссылка Google Maps").fill(googleMapsUrl);
  await page.getByRole("button", { name: "Получить адрес" }).click();
  await expect(page.getByLabel("Название объекта")).toHaveValue("Yekta Homes", { timeout: 15_000 });
  await expect(page.getByLabel("Страна")).toHaveValue("Турция");
  await expect(page.getByLabel("Район")).toHaveValue("Mahmutlar");
  await expect(page.getByLabel("Полный адрес")).toHaveValue("Barbaros Caddesi 14");
  await expect(page.getByLabel("Широта")).toHaveValue("36.4972412");
  await expect(page.getByLabel("Долгота")).toHaveValue("32.0869615");
  await page.getByLabel("Название объекта").fill(title);
  await page.getByLabel("Тип объекта").selectOption({ label: "Квартира" });
  await page.getByLabel("Город").selectOption({ label: "Аланья" });
  await page.getByLabel("Район").fill("Lifecycle District");
  await page.getByLabel("Полный адрес").fill("Lifecycle Address 1");
  await page.getByLabel("Количество комнат").fill("2");
  await page.getByLabel("Количество спален").fill("1");
  await page.getByLabel("Количество санузлов").fill("1");
  await page.getByLabel("Макс. гостей").fill("4");
  await page.getByLabel("Посуточно").check();
  await page.getByLabel("Цена за ночь, €").fill("145");
  await page.getByLabel("Минимальное количество ночей").fill("1");

  const imageInput = page.locator('input[type="file"]');
  await expect(imageInput).toBeEnabled();
  const tinyPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  await imageInput.setInputFiles(Array.from({ length: 10 }, (_, index) => ({
    name: `lifecycle-new-${index}.png`,
    mimeType: "image/png",
    buffer: tinyPng,
  })));
  await expect(page.getByText("Фотографии объекта (10)")).toBeVisible({ timeout: 20_000 });
  await page.getByLabel("Wi-Fi").check();
  await page.getByLabel("Курение").selectOption("not_allowed");
  await page.getByLabel("Прочие правила").fill("No parties");
  await page.getByRole("button", { name: "Сохранить черновик" }).click();
  await expect(page.getByText("Черновик сохранён").first()).toBeVisible();

  await expect.poll(() => readApartmentForAuditByTitle(title), { timeout: 15_000 }).toMatchObject({
    organization_id: fixture.organizationId,
    title,
    publication_status: "draft",
    daily_price: 145,
  });

  const created = await readApartmentForAuditByTitle(title);
  expect(created?.id).toBeTruthy();
  const apartmentId = created?.id as string;
  fixture.lifecycleApartmentIds.push(apartmentId);

  await page.goto("/apartments", { waitUntil: "domcontentloaded" });
  await page.goto(`/apartments/${apartmentId}/edit`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Редактирование объекта" })).toBeVisible();
  await expect(page.getByLabel("Страна")).toHaveValue("Турция");
  await expect(page.getByLabel("Wi-Fi")).toBeChecked();
  await expect(page.getByLabel("Прочие правила")).toHaveValue("No parties");
  await expect(page.getByText("Фотографии объекта (10)")).toBeVisible();
  await page.getByLabel("Название объекта").fill(`${title} Updated`);
  await page.getByLabel("Цена за ночь, €").fill("175");
  await page.getByLabel("Публикация на сайте").selectOption("published");
  await page.getByLabel("Внутренний статус объекта").selectOption("Опубликован");

  await page.getByRole("button", { name: "Сохранить изменения" }).click();

  await expect.poll(() => readApartmentForAuditById(apartmentId), { timeout: 15_000 }).toMatchObject({
    organization_id: fixture.organizationId,
    title: `${title} Updated`,
    publication_status: "published",
    daily_price: 175,
  });

  const bookingId = randomUUID();
  const checkIn = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  const checkOut = new Date(Date.now() + 32 * 86_400_000).toISOString().slice(0, 10);
  const bookingResponse = await page.request.post("/api/bookings", {
    data: {
      id: bookingId,
      apartmentId,
      guestName: `${title} Guest`,
      guestPhone: "+79990009999",
      guestEmail: fixture.accounts.guest.email,
      checkIn,
      checkOut,
      guests: 2,
      rentalType: "daily",
      status: "pending",
      paymentStatus: "unpaid",
      source: "internal-lifecycle-e2e",
    },
  });
  const bookingPayload = await bookingResponse.json() as { ok: boolean; data?: { id: string; status: string } };
  expect(bookingResponse.status(), JSON.stringify(bookingPayload)).toBe(201);
  expect(bookingPayload).toMatchObject({ ok: true, data: { id: bookingId, status: "pending" } });

  const confirmResponse = await page.request.patch(`/api/bookings/${bookingId}`, { data: { status: "confirmed" } });
  expect(confirmResponse.status()).toBe(200);
  expect(await confirmResponse.json()).toMatchObject({ ok: true, data: { id: bookingId, status: "confirmed" } });

  const availabilityResponse = await page.request.get(`/api/availability/blocks?apartmentId=${apartmentId}`);
  expect(availabilityResponse.status()).toBe(200);
  expect(await availabilityResponse.json()).toMatchObject({ ok: true, data: expect.any(Array) });
  await page.goto("/calendar", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Календарь" })).toBeVisible();
  await expect(page.locator("p").filter({ hasText: `${title} Updated` }).first()).toBeVisible({ timeout: 15_000 });

  await page.goto(`/properties/${apartmentId}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText(`${title} Updated`, { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByAltText(`${title} Updated`).first()).toBeVisible({ timeout: 15_000 });

  const lifecycleTaskIds: string[] = [];
  for (const task of [
    { title: `${title} Cleaning`, taskType: "cleaning", assignedUserId: fixture.accounts.cleaner.id },
    { title: `${title} Maintenance`, taskType: "technical", assignedUserId: fixture.accounts.maintenance.id },
  ]) {
    const taskResponse = await page.request.post("/api/operations/tasks", {
      data: { ...task, apartmentId, bookingId, dueAt: new Date().toISOString(), priority: "normal", checklistItems: ["Complete operational work"] },
    });
    const taskPayload = await taskResponse.json();
    expect(taskResponse.status(), JSON.stringify(taskPayload)).toBe(201);
    expect(taskPayload).toMatchObject({ ok: true, data: { apartment_id: apartmentId, booking_id: bookingId, task_type: task.taskType, status: "assigned" } });
    lifecycleTaskIds.push(taskPayload.data.id);
  }

  for (const taskId of lifecycleTaskIds) {
    const taskResponse = await page.request.patch("/api/operations/tasks", { data: { id: taskId, status: "completed" } });
    expect(taskResponse.status(), await taskResponse.text()).toBe(200);
    expect(await taskResponse.json()).toMatchObject({ ok: true, data: { id: taskId, status: "completed" } });
  }

  for (const field of ["apartment_ready", "check_in_completed", "cleaning_assigned", "maintenance_completed", "check_out_completed"]) {
    const checklistResponse = await page.request.put("/api/operations/checklists", { data: { bookingId, field, value: true } });
    expect(checklistResponse.status()).toBe(200);
    expect(await checklistResponse.json()).toMatchObject({ ok: true });
  }

  const bookingReadResponse = await page.request.get(`/api/bookings/${bookingId}`);
  expect(bookingReadResponse.status()).toBe(200);
  expect(await bookingReadResponse.json()).toMatchObject({ ok: true, data: { id: bookingId, apartmentId, status: "checked_out" } });

  const supportResponse = await page.request.post("/api/support/tickets", {
    data: { message: `Maintenance support for ${title}`, confirmed: true, idempotencyKey: `lifecycle-${bookingId}`, route: "/account/support" },
  });
  expect(supportResponse.status()).toBe(200);
  expect(await supportResponse.json()).toMatchObject({ ok: true, status: "open" });

  const metricsResponse = await page.request.get("/api/dashboard/metrics");
  expect(metricsResponse.status()).toBe(200);
  expect(await metricsResponse.json()).toMatchObject({ ok: true, data: { propertiesTotal: expect.any(Number), bookingsTotal: expect.any(Number) } });
});

test("check-in and check-out checklist transitions persist booking state", async ({ page }) => {
  await signInManager(page);
  const apartmentId = fixture.apartmentPublishedId;
  const bookingId = randomUUID();
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const guestName = `${fixture.prefix} Check-in Guest`;
  const createResponse = await page.request.post("/api/bookings", {
    data: {
      id: bookingId,
      apartmentId,
      guestName,
      guestPhone: "+79990008888",
      guestEmail: fixture.accounts.guest.email,
      checkIn: today,
      checkOut: tomorrow,
      guests: 1,
      rentalType: "daily",
      status: "confirmed",
      requestStatus: "confirmed",
      paymentStatus: "unpaid",
      source: "internal-checkin-e2e",
    },
  });
  expect(createResponse.status(), await createResponse.text()).toBe(201);

  await page.goto("/check-in-out", { waitUntil: "domcontentloaded" });
  const bookingCard = page.locator("section").filter({ hasText: "Сегодняшние заезды" }).locator("article").filter({ hasText: guestName }).first();
  await expect(bookingCard).toBeVisible({ timeout: 15_000 });
  const checkInCheckbox = bookingCard.locator("label").filter({ hasText: "Check-in завершён" }).locator("input");
  const checklistResponsePromise = page.waitForResponse((response) => response.url().includes("/api/operations/checklists") && response.request().method() === "PUT");
  await checkInCheckbox.click();
  const checklistResponse = await checklistResponsePromise;
  expect(checklistResponse.status(), await checklistResponse.text()).toBe(200);
  await expect.poll(async () => (await readBookingForAudit(bookingId))?.status).toBe("checked_in");

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(bookingCard.locator("label").filter({ hasText: "Check-in завершён" }).locator("input")).toBeChecked();

  const checkOutResponse = await page.request.put("/api/operations/checklists", {
    data: { bookingId, field: "check_out_completed", value: true },
  });
  expect(checkOutResponse.status(), await checkOutResponse.text()).toBe(200);
  await expect.poll(async () => (await readBookingForAudit(bookingId))?.status).toBe("checked_out");

  const repeatedCheckOut = await page.request.put("/api/operations/checklists", {
    data: { bookingId, field: "check_out_completed", value: true },
  });
  expect(repeatedCheckOut.status(), await repeatedCheckOut.text()).toBe(200);

  const invalidBookingId = randomUUID();
  const invalidCreateResponse = await page.request.post("/api/bookings", {
    data: {
      id: invalidBookingId,
      apartmentId,
      guestName: `${fixture.prefix} Premature Checkout Guest`,
      guestPhone: "+79990007777",
      guestEmail: fixture.accounts.guest.email,
      checkIn: new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10),
      checkOut: new Date(Date.now() + 4 * 86_400_000).toISOString().slice(0, 10),
      guests: 1,
      rentalType: "daily",
      status: "confirmed",
      paymentStatus: "unpaid",
      source: "internal-checkin-transition-e2e",
    },
  });
  expect(invalidCreateResponse.status(), await invalidCreateResponse.text()).toBe(201);
  const invalidCheckOut = await page.request.put("/api/operations/checklists", {
    data: { bookingId: invalidBookingId, field: "check_out_completed", value: true },
  });
  expect(invalidCheckOut.status(), await invalidCheckOut.text()).toBe(409);
  const checklistAfterInvalidTransition = await page.request.get(`/api/operations/checklists?bookingId=${invalidBookingId}`);
  expect(checklistAfterInvalidTransition.status()).toBe(200);
  expect(await checklistAfterInvalidTransition.json()).toMatchObject({ ok: true, data: [] });
});