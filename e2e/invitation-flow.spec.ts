import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test.describe("employee invitation flow", () => {
  test("canonical accept-invite route opens and offers password setup", async ({ page }) => {
    await page.route("**/api/invitations**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: {
            invitationId: "invitation-id",
            organizationId: "organization-id",
            organizationName: "Opero Homes",
            email: "employee@example.com",
            phone: null,
            firstName: "Test",
            lastName: "Employee",
            roleCode: "employee",
            expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
            acceptedAt: null,
            revokedAt: null,
          },
        }),
      });
    });

    await page.goto("/auth/accept-invite?invite=playwright-token");

    await expect(page).toHaveURL(/\/auth\/accept-invite\?invite=playwright-token$/);
    await expect(page.getByRole("heading", { name: "Приглашение сотрудника" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Открыть страницу регистрации" })).toHaveAttribute(
      "href",
      "/auth/accept-invite?invite=playwright-token&mode=signup",
    );
    await expect(page.getByRole("link", { name: "Открыть страницу входа" })).toHaveAttribute(
      "href",
      "/auth/accept-invite?invite=playwright-token&mode=login",
    );
    await expect(page.locator("body")).not.toContainText("localhost");
  });

  test("production invitation implementation does not contain localhost fallback", async () => {
    const routeSource = readFileSync(resolve(process.cwd(), "app/api/users/invite/route.ts"), "utf8");
    const urlSource = readFileSync(resolve(process.cwd(), "lib/auth/invitation-url.ts"), "utf8");

    expect(routeSource).toContain("buildEmployeeInvitationUrl");
    expect(routeSource).not.toContain("localhost:3000");
    expect(routeSource).not.toContain("localhost:3201");
    expect(urlSource).toContain("https://operohq.netlify.app");
    expect(urlSource).not.toContain("localhost:3000");
    expect(urlSource).not.toContain("localhost:3201");
  });
});
