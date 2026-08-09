import { expect, test } from "@playwright/test";
import { buildSetWebhookPayload, configureTelegramWebhook, isWebhookCompatible, sanitizeWebhookInfo, TELEGRAM_ALLOWED_UPDATES, TELEGRAM_WEBHOOK_URL } from "../lib/telegram/webhook-admin";
import { hasSetupSecret, isWebhookAdminRole } from "../lib/telegram/webhook-admin";

test.describe("Telegram webhook admin controls", () => {
  test("authorization matrix allows only owner and admin", () => {
    expect(isWebhookAdminRole("owner")).toBe(true);
    expect(isWebhookAdminRole("admin")).toBe(true);
    expect(isWebhookAdminRole("manager")).toBe(false);
    expect(isWebhookAdminRole("employee")).toBe(false);
    expect(isWebhookAdminRole("property_owner")).toBe(false);
    expect(isWebhookAdminRole(null)).toBe(false);
  });

  test("safe status strips token, secret, certificate, and unknown fields", () => {
    const status = sanitizeWebhookInfo({ ok: true, result: { url: TELEGRAM_WEBHOOK_URL, pending_update_count: 2, last_error_date: 10, last_error_message: "temporary error", max_connections: 40, allowed_updates: ["callback_query", "message"], token: "bot-token", secret_token: "webhook-secret", certificate: "certificate" } as never });
    const serialized = JSON.stringify(status);
    expect(status).toMatchObject({ configured: true, pending_update_count: 2, allowed_updates: ["callback_query", "message"] });
    expect(serialized).not.toContain("bot-token");
    expect(serialized).not.toContain("webhook-secret");
    expect(serialized).not.toContain("certificate");
  });

  test("setup calls setWebhook once and repeats idempotently", async () => {
    const previousToken = process.env.TELEGRAM_BOT_TOKEN;
    const previousSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    process.env.TELEGRAM_BOT_TOKEN = "mock-bot-token";
    process.env.TELEGRAM_WEBHOOK_SECRET = "mock-webhook-secret";
    let configured = false;
    const calls: Array<{ method: string; body?: string }> = [];
    const mockFetch: typeof fetch = async (_input, init) => {
      calls.push({ method: init?.method || "GET", body: typeof init?.body === "string" ? init.body : undefined });
      if (init?.method === "POST") configured = true;
      return new Response(JSON.stringify({ ok: true, result: { url: configured ? TELEGRAM_WEBHOOK_URL : "", pending_update_count: 0, allowed_updates: [...TELEGRAM_ALLOWED_UPDATES] } }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    try {
      const first = await configureTelegramWebhook(mockFetch);
      const second = await configureTelegramWebhook(mockFetch);
      expect(first).toMatchObject({ ok: true, changed: true });
      expect(second).toMatchObject({ ok: true, changed: false });
      expect(calls.filter((call) => call.method === "POST")).toHaveLength(1);
      expect(JSON.parse(calls.find((call) => call.method === "POST")?.body || "{}")).toEqual(buildSetWebhookPayload("mock-webhook-secret"));
    } finally {
      if (previousToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN; else process.env.TELEGRAM_BOT_TOKEN = previousToken;
      if (previousSecret === undefined) delete process.env.TELEGRAM_WEBHOOK_SECRET; else process.env.TELEGRAM_WEBHOOK_SECRET = previousSecret;
    }
  });

  test("Telegram API failure maps to a safe result without HTTP 500 behavior", async () => {
    const previousToken = process.env.TELEGRAM_BOT_TOKEN;
    const previousSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    process.env.TELEGRAM_BOT_TOKEN = "mock-bot-token";
    process.env.TELEGRAM_WEBHOOK_SECRET = "mock-webhook-secret";
    const mockFetch: typeof fetch = async () => new Response(JSON.stringify({ ok: false, description: "raw Telegram error with mock-bot-token" }), { status: 500 });
    try {
      await expect(configureTelegramWebhook(mockFetch)).resolves.toEqual({ ok: false, error: "telegram_unavailable" });
    } finally {
      if (previousToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN; else process.env.TELEGRAM_BOT_TOKEN = previousToken;
      if (previousSecret === undefined) delete process.env.TELEGRAM_WEBHOOK_SECRET; else process.env.TELEGRAM_WEBHOOK_SECRET = previousSecret;
    }
  });

  test("uses the controlled rollout webhook update set and rejects localhost", () => {
    expect(TELEGRAM_WEBHOOK_URL).toBe("https://operohq.netlify.app/api/telegram/webhook");
    expect(TELEGRAM_WEBHOOK_URL).not.toMatch(/localhost|127\.0\.0\.1/i);
    expect(isWebhookCompatible(sanitizeWebhookInfo({ ok: true, result: { url: TELEGRAM_WEBHOOK_URL, allowed_updates: ["callback_query", "message"] } }))).toBe(true);
    expect(buildSetWebhookPayload("mock-webhook-secret").allowed_updates).toEqual(["callback_query", "message"]);
  });

  test("requires the separate setup secret without exposing it", () => {
    const previousSecret = process.env.TELEGRAM_WEBHOOK_SETUP_SECRET;
    process.env.TELEGRAM_WEBHOOK_SETUP_SECRET = "mock-setup-secret";
    try {
      expect(hasSetupSecret(new Request("http://localhost/api/admin/telegram/webhook/setup", { headers: { "x-telegram-webhook-setup-secret": "wrong-secret" } }))).toBe(false);
      expect(hasSetupSecret(new Request("http://localhost/api/admin/telegram/webhook/setup", { headers: { "x-telegram-webhook-setup-secret": "mock-setup-secret" } }))).toBe(true);
    } finally {
      if (previousSecret === undefined) delete process.env.TELEGRAM_WEBHOOK_SETUP_SECRET; else process.env.TELEGRAM_WEBHOOK_SETUP_SECRET = previousSecret;
    }
  });

  test("anonymous setup is denied and setup route is POST-only", async ({ request }) => {
    const anonymous = await request.post("/api/admin/telegram/webhook/setup", { data: {} });
    expect(anonymous.status()).toBe(401);
    const get = await request.get("/api/admin/telegram/webhook/setup");
    expect(get.status()).toBe(405);
  });

  test("anonymous activation is denied", async ({ request }) => {
    const response = await request.post("/api/admin/telegram/webhook/activate");
    expect(response.status()).toBe(401);
    const body = await response.text();
    expect(body).not.toMatch(/TELEGRAM_BOT_TOKEN|TELEGRAM_WEBHOOK_SECRET|setup_secret/i);
  });

  test("anonymous status is denied without exposing secrets", async ({ request }) => {
    const response = await request.get("/api/admin/telegram/webhook/status");
    expect(response.status()).toBe(401);
    const body = await response.text();
    expect(body).not.toMatch(/TELEGRAM_BOT_TOKEN|TELEGRAM_WEBHOOK_SECRET|secret_token|certificate/i);
  });
});
