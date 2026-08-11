import { timingSafeEqual } from "node:crypto";

export const TELEGRAM_WEBHOOK_URL = "https://operohq.netlify.app/api/telegram/webhook";
export const TELEGRAM_ALLOWED_UPDATES = ["callback_query", "message"] as const;

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

type TelegramDiagnostics = {
  bot: { reachable: boolean; username: string | null; name: string | null; id_masked: string | null };
  chat: { reachable: boolean; type: string | null; title: string | null; forum: boolean | null; configured_match: boolean; id_masked: string | null; error: string | null };
  membership: { status: string | null; can_read: boolean | null; can_send: boolean | null; error: string | null };
  technical_message: { attempted: boolean; sent: boolean; message_id_masked: string | null; error: string | null };
};

export type SafeWebhookStatus = {
  bot_connected: boolean;
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

function telegramApiUrl(token: string, method: "getMe" | "getWebhookInfo" | "setWebhook" | "getChat" | "getChatMember" | "sendMessage"): string {
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
    bot_connected: false,
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

async function telegramRequest(token: string, method: "getMe" | "getWebhookInfo" | "setWebhook" | "getChat" | "getChatMember" | "sendMessage", body?: object, fetcher: Fetcher = fetch): Promise<TelegramApiPayload | null> {
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

function maskReference(value: unknown): string | null {
  const text = typeof value === "string" || typeof value === "number" ? String(value) : "";
  return text ? `...${text.slice(-4)}` : null;
}

function safeError(payload: TelegramApiPayload | null): string | null {
  return typeof payload?.description === "string" ? payload.description.slice(0, 240) : null;
}

export async function getTelegramGroupDiagnostics(sendTechnicalMessage = false, fetcher: Fetcher = fetch): Promise<{ ok: true; diagnostics: TelegramDiagnostics } | { ok: false; error: "not_configured" | "telegram_unavailable" }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const configuredChatId = process.env.TELEGRAM_MANAGER_CHAT_ID;
  if (!token || !configuredChatId) return { ok: false, error: "not_configured" };

  const botPayload = await telegramRequest(token, "getMe", undefined, fetcher);
  if (!botPayload?.ok || !botPayload.result || typeof botPayload.result !== "object") return { ok: false, error: "telegram_unavailable" };
  const bot = botPayload.result as { id?: unknown; first_name?: unknown; last_name?: unknown; username?: unknown };
  const botId = typeof bot.id === "number" ? bot.id : null;
  const chatPayload = await telegramRequest(token, "getChat", { chat_id: configuredChatId }, fetcher);
  const chat = chatPayload?.result && typeof chatPayload.result === "object" ? chatPayload.result as { id?: unknown; type?: unknown; title?: unknown; is_forum?: unknown } : null;
  const chatReachable = Boolean(chatPayload?.ok && chat);
  const membershipPayload = botId && chatReachable ? await telegramRequest(token, "getChatMember", { chat_id: configuredChatId, user_id: botId }, fetcher) : null;
  const member = membershipPayload?.result && typeof membershipPayload.result === "object" ? membershipPayload.result as { status?: unknown; can_read_messages?: unknown; can_send_messages?: unknown; can_post_messages?: unknown } : null;
  const status = typeof member?.status === "string" ? member.status : null;
  const canSend = status === "member" || status === "creator" || status === "administrator" || (status === "restricted" && member?.can_send_messages === true);
  const technical = { attempted: sendTechnicalMessage, sent: false, message_id_masked: null as string | null, error: null as string | null };
  if (sendTechnicalMessage && chatReachable) {
    const sentPayload = await telegramRequest(token, "sendMessage", { chat_id: configuredChatId, text: "Opero Telegram diagnostics", disable_web_page_preview: true }, fetcher);
    const sentResult = sentPayload?.result && typeof sentPayload.result === "object" ? sentPayload.result as { message_id?: unknown } : null;
    technical.sent = Boolean(sentPayload?.ok && sentResult?.message_id);
    technical.message_id_masked = maskReference(sentResult?.message_id);
    technical.error = technical.sent ? null : safeError(sentPayload);
  }
  return {
    ok: true,
    diagnostics: {
      bot: { reachable: true, username: typeof bot.username === "string" ? bot.username.slice(0, 64) : null, name: typeof bot.first_name === "string" ? `${bot.first_name}${typeof bot.last_name === "string" ? ` ${bot.last_name}` : ""}`.slice(0, 120) : null, id_masked: maskReference(bot.id) },
      chat: { reachable: chatReachable, type: typeof chat?.type === "string" ? chat.type : null, title: typeof chat?.title === "string" ? chat.title.slice(0, 160) : null, forum: typeof chat?.is_forum === "boolean" ? chat.is_forum : null, configured_match: chatReachable && String(chat?.id) === configuredChatId, id_masked: maskReference(chat?.id), error: chatReachable ? null : safeError(chatPayload) },
      membership: { status, can_read: Boolean(member), can_send: member ? canSend : null, error: member ? null : safeError(membershipPayload) },
      technical_message: technical,
    },
  };
}

export async function getSafeTelegramWebhookStatus(fetcher: Fetcher = fetch): Promise<{ ok: true; status: SafeWebhookStatus } | { ok: false; error: "not_configured" | "telegram_unavailable" }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, error: "not_configured" };
  const bot = await telegramRequest(token, "getMe", undefined, fetcher);
  const payload = await telegramRequest(token, "getWebhookInfo", undefined, fetcher);
  if (!payload?.ok) return { ok: false, error: "telegram_unavailable" };
  return { ok: true, status: { ...sanitizeWebhookInfo(payload as TelegramWebhookInfoPayload), bot_connected: Boolean(bot?.ok) } };
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
