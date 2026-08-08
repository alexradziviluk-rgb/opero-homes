import { createClient } from "@supabase/supabase-js";
import { test, expect, type Page } from "@playwright/test";

const localOnly = Boolean(process.env.E2E_LOCAL && process.env.E2E_SUPABASE_URL && process.env.E2E_SUPABASE_SERVICE_ROLE_KEY);
const cleanupEmails = new Set<string>();

function adminClient() {
  const url = process.env.E2E_SUPABASE_URL;
  const serviceRoleKey = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("E2E_SUPABASE_URL and E2E_SUPABASE_SERVICE_ROLE_KEY are required.");
  return createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function findUser(email: string) {
  const admin = adminClient();
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  return data.users.find((user) => user.email === email) ?? null;
}

async function cleanupUser(email: string) {
  const admin = adminClient();
  const user = await findUser(email);
  if (!user) return;
  await admin.from("organizations").delete().eq("owner_id", user.id);
  await admin.auth.admin.deleteUser(user.id);
}

test.afterEach(async () => {
  if (!localOnly) return;
  for (const email of cleanupEmails) await cleanupUser(email);
  cleanupEmails.clear();
});

test("landing and pricing are public", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Все доступные объекты|All available properties/ })).toBeVisible();
  await page.goto("/pricing");
  await expect(page.getByRole("heading", { name: /Выберите темп роста/ })).toBeVisible();
});

test("catalog language toggle and partner CTA work", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await expect(page.getByRole("heading", { name: /All available properties/ })).toBeVisible();
  await page.getByRole("navigation", { name: "Публичная навигация" }).getByRole("link", { name: "Become a partner" }).click();
  await expect(page).toHaveURL(/\/business/);
});

test("mobile catalog has no horizontal scroll and keeps search accessible", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.getByRole("link", { name: "Поиск жилья" }).click();
  await expect(page.getByRole("heading", { name: "Не нашли подходящий вариант?" })).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "Город, район или адрес" })).toBeVisible();
});

async function registerOwner(page: Page, plan = "professional") {
  const email = `owner-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;
  cleanupEmails.add(email);
  await page.goto(`/register?plan=${plan}`);
  await page.getByLabel("Название компании").fill("Local Sales Test");
  await page.getByLabel("Ваше имя").fill("Local Owner");
  await page.getByLabel("Фамилия").fill("Test");
  await page.getByLabel("Рабочий email").fill(email);
  await page.getByLabel("Пароль").fill("LocalPassword123!");
  await page.getByRole("button", { name: "Начать бесплатно" }).click();
  await expect(page).toHaveURL(/\/onboarding/, { timeout: 15_000 });
  return email;
}

test.describe("local SaaS flow", () => {
  test.skip(!localOnly, "Registration tests require an isolated local Supabase environment.");

  test("owner registration creates organization and onboarding settings persist", async ({ page }) => {
    await registerOwner(page);
    await expect(page.getByText("Настройте рабочее пространство")).toBeVisible();
    await page.getByLabel("Страна").selectOption("DE");
    await page.getByLabel("Валюта").selectOption("EUR");
    await page.getByLabel("Часовой пояс").selectOption("Europe/Berlin");
    await page.getByLabel("Тариф").selectOption("professional");
    await page.getByRole("button", { name: "Сохранить и продолжить" }).click();
    await expect(page.getByText("Первый объект")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Страна")).toHaveValue("DE");
    await expect(page.getByLabel("Валюта")).toHaveValue("EUR");
    await expect(page.getByLabel("Часовой пояс")).toHaveValue("Europe/Berlin");
    await expect(page.getByLabel("Тариф")).toHaveValue("professional");
  });

  test("owner billing shows real usage and persists plan change", async ({ page }) => {
    await registerOwner(page);
    await page.goto("/settings/billing");
    await expect(page.getByRole("heading", { name: "Professional" })).toBeVisible();
    await expect(page.getByText(/Объекты: 0 \/ 30/)).toBeVisible();
    await expect(page.getByText(/Активные сотрудники: 0 \/ 15/)).toBeVisible();
    await page.getByText(/Business · €99/).click();
    await page.getByRole("button", { name: "Сохранить тариф" }).click();
    await expect(page.getByText("Тариф сохранён")).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Business" })).toBeVisible();
  });

  test("employee cannot access billing or change plan", async ({ page, browser }) => {
    const ownerEmail = await registerOwner(page);
    const admin = adminClient();
    const owner = await findUser(ownerEmail);
    if (!owner) throw new Error("Owner was not created.");
    const { data: organization, error: organizationError } = await admin.from("organizations").select("id").eq("owner_id", owner.id).single();
    if (organizationError || !organization) throw organizationError ?? new Error("Organization was not created.");
    const employeeEmail = `employee-${Date.now()}@example.test`;
    cleanupEmails.add(employeeEmail);
    const { data: employeeData, error: employeeError } = await admin.auth.admin.createUser({ email: employeeEmail, password: "EmployeePassword123!", email_confirm: true, user_metadata: { first_name: "Local", last_name: "Employee", role: "employee" } });
    if (employeeError || !employeeData.user) throw employeeError ?? new Error("Employee was not created.");
    await admin.from("organization_members").insert({ organization_id: organization.id, user_id: employeeData.user.id, role_code: "employee", role: "employee", status: "active" });
    const employeePage = await browser.newPage();
    await employeePage.goto("/staff/login");
    await employeePage.getByLabel("Email").fill(employeeEmail);
    await employeePage.getByLabel("Пароль").fill("EmployeePassword123!");
    await employeePage.getByRole("button", { name: "Войти" }).click();
    await employeePage.goto("/settings/billing");
    await expect(employeePage).toHaveURL(/\/admin|\/guest|\/login/);
    await employeePage.close();
  });

  test("anonymous user cannot access billing", async ({ page }) => {
    await page.goto("/settings/billing");
    await expect(page).toHaveURL(/\/login/);
  });
});
