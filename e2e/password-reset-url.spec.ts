import { expect, test } from "@playwright/test";
import { buildPasswordResetUrl, resolvePublicSiteUrl } from "../lib/auth/site-url";

test.describe("password reset redirect", () => {
  test("never uses localhost for a configured local URL", () => {
    expect(resolvePublicSiteUrl("http://localhost:3000")).toBe("https://operohq.netlify.app");
    expect(buildPasswordResetUrl()).toMatch(/^https:\/\/operohq\.netlify\.app\/reset-password$/);
  });
});