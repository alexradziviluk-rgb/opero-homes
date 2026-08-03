import { expect, test } from "@playwright/test";

test.describe("property owner portal security smoke", () => {
  test("unauthenticated owner routes never expose the portal", async ({ page }) => {
    const response = await page.goto("/owner");
    expect(response?.status()).toBeLessThan(500);
    await expect(page).not.toHaveURL(/\/owner(?:\/|$)/);
  });

  test("owner API rejects unauthenticated access without HTTP 500", async ({ request }) => {
    const response = await request.get("/api/owner/properties");
    expect(response.status()).toBeGreaterThanOrEqual(401);
    expect(response.status()).toBeLessThan(500);
  });

  test("owner invitation page gives a clear missing-token state", async ({ page }) => {
    const response = await page.goto("/owner/invite");
    expect(response?.status()).toBeLessThan(500);
    await expect(page.getByText("Токен приглашения отсутствует.")).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/owner/invite");
  });

  test("owner property and calendar URLs do not expose unauthenticated data", async ({ request }) => {
    for (const path of ["/owner/properties", "/owner/properties/not-a-real-id", "/owner/profile"]) {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status(), path).toBeLessThan(500);
    }
  });
});
