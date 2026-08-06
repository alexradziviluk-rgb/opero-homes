import { timingSafeEqual } from "node:crypto";

export const TELEGRAM_WEBHOOK_URL = "https://operohq.netlify.app/api/telegram/webhook";
export const TELEGRAM_ALLOWED_UPDATES = ["callback_query"] as const;

type TelegramWebhookInfoPayload = {
  ok?: boolean;
  result?: {
    url?: unknown;
    pending_update_count?: unknown;
    last_error_date?: unknown;
    last_error_message?: unknown;
    max_connections?: unknown;
    allowed_updates?: unknown;
  };
};

type TelegramApiPayload = { ok?: boolean; description?: unknown; result?: unknown };

export type SafeWebhookStatus = {
  configured: boolean;
  url: string;
  pending_update_count: number;
  last_error_date: number | null;
  last_error_message: string | null;
  max_connections: number | null;
  allowed_updates: string[];
};

export type TelegramWebhookOperation =
  | { ok: true; status: SafeWebhookStatus; changed: boolean }
  | { ok: false; error: "not_configured" | "telegram_unavailable" };

export function isWebhookAdminRole(roleCode: string | null | undefined): boolean {
  const normalized = (roleCode ?? "").trim().toLowerCase();
  return normalized === "owner" || normalized === "admin";
}

export function hasSetupSecret(request: Request): boolean {
  const expected = process.env.TELEGRAM_WEBHOOK_SETUP_SECRET;
  const provided = request.headers.get("x-telegram-webhook-setup-secret");
  if (!expected || !provided) return false;
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  return expectedBuffer.length === providedBuffer.length && timingSafeEqual(expectedBuffer, providedBuffer);
}

function telegramApiUrl(token: string, method: "getWebhookInfo" | "setWebhook"): string {
  return `https://api.telegram.org/bot${encodeURIComponent(token)}/${method}`;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringValue(value: unknown, maxLength: number): string | null {
  return typeof value === "string" && value.length > 0 ? value.slice(0, maxLength) : null;
}

export function sanitizeWebhookInfo(payload: TelegramWebhookInfoPayload): SafeWebhookStatus {
  const result = payload.result ?? {};
  const url = stringValue(result.url, 500) ?? "";
  const allowedUpdates = Array.isArray(result.allowed_updates)
    ? result.allowed_updates.filter((value): value is string => typeof value === "string").slice(0, 20)
    : [];
  return {
    configured: url.length > 0,
    url,
    pending_update_count: finiteNumber(result.pending_update_count) ?? 0,
    last_error_date: finiteNumber(result.last_error_date),
    last_error_message: stringValue(result.last_error_message, 500),
    max_connections: finiteNumber(result.max_connections),
    allowed_updates: allowedUpdates,
  };
}

export function isWebhookCompatible(status: SafeWebhookStatus): boolean {
  return status.url === TELEGRAM_WEBHOOK_URL && status.allowed_updates.length === TELEGRAM_ALLOWED_UPDATES.length && TELEGRAM_ALLOWED_UPDATES.every((update) => status.allowed_updates.includes(update));
}

export function buildSetWebhookPayload(secret: string) {
  return { url: TELEGRAM_WEBHOOK_URL, secret_token: secret, allowed_updates: [...TELEGRAM_ALLOWED_UPDATES] };
}

type Fetcher = typeof fetch;

async function telegramRequest(token: string, method: "getWebhookInfo" | "setWebhook", body?: object, fetcher: Fetcher = fetch): Promise<TelegramApiPayload | null> {
  try {
    const response = await fetcher(telegramApiUrl(token, method), {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    return await response.json().catch(() => null) as TelegramApiPayload | null;
  } catch {
    return null;
  }
}

export async function getSafeTelegramWebhookStatus(fetcher: Fetcher = fetch): Promise<{ ok: true; status: SafeWebhookStatus } | { ok: false; error: "not_configured" | "telegram_unavailable" }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, error: "not_configured" };
  const payload = await telegramRequest(token, "getWebhookInfo", undefined, fetcher);
  if (!payload?.ok) return { ok: false, error: "telegram_unavailable" };
  return { ok: true, status: sanitizeWebhookInfo(payload as TelegramWebhookInfoPayload) };
}

export async function configureTelegramWebhook(fetcher: Fetcher = fetch): Promise<TelegramWebhookOperation> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!token || !secret) return { ok: false, error: "not_configured" };
  const current = await getSafeTelegramWebhookStatus(fetcher);
  if (!current.ok) return current;
  if (isWebhookCompatible(current.status)) return { ok: true, status: current.status, changed: false };
  const payload = await telegramRequest(token, "setWebhook", buildSetWebhookPayload(secret), fetcher);
  if (!payload?.ok) return { ok: false, error: "telegram_unavailable" };
  const updated = await getSafeTelegramWebhookStatus(fetcher);
  if (!updated.ok) return updated;
  return { ok: true, status: updated.status, changed: true };
}
