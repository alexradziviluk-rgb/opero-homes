import { sanitizeSupportSummary, sanitizeSupportText } from "./privacy";
import type { SupportPriority, SupportTicket } from "./types";

type TelegramButton = { text: string; url?: string; callback_data?: string };
type TelegramSendResult = { ok: boolean; chatId: string | null; messageId: string | null; error?: string };

function priorityLabel(priority: SupportPriority): string { return priority === "urgent" ? "Срочный" : priority === "high" ? "Высокий" : "Обычный"; }
function productionUrl(): string { return (process.env.NEXT_PUBLIC_SITE_URL || "https://operohq.netlify.app").replace(/\/$/, ""); }

export function buildTelegramTicketMessage(ticket: Pick<SupportTicket, "public_number" | "priority" | "requester_name" | "requester_language" | "subject" | "customer_message" | "ai_summary"> & { apartmentTitle?: string | null }): string {
  return [
    `🔔 Новое обращение ${sanitizeSupportText(ticket.public_number, 40)}`,
    `Приоритет: ${priorityLabel(ticket.priority)}`,
    `Клиент: ${sanitizeSupportText(ticket.requester_name || "Не указано", 100)}`,
    `Язык: ${sanitizeSupportText(ticket.requester_language, 30)}`,
    `Тема: ${sanitizeSupportText(ticket.subject, 140)}`,
    ticket.apartmentTitle ? `Объект: ${sanitizeSupportText(ticket.apartmentTitle, 120)}` : null,
    "",
    `Сообщение: «${sanitizeSupportText(ticket.customer_message)}»`,
    `AI summary: ${sanitizeSupportSummary(ticket.ai_summary)}`,
  ].filter(Boolean).join("\n");
}

export function buildTelegramKeyboard(publicNumber: string, actionToken = "unconfigured"): { inline_keyboard: TelegramButton[][] } {
  const safe = encodeURIComponent(publicNumber);
  return { inline_keyboard: [[{ text: "Принять", callback_data: `support:accept:${actionToken}` }, { text: "Отметить решённым", callback_data: `support:resolve:${actionToken}` }], [{ text: "Открыть в Opero", url: `${productionUrl()}/admin/support/${safe}` }]] };
}

export async function sendTelegramMessage(chatId: string, text: string, replyMarkup?: { inline_keyboard: TelegramButton[][] }): Promise<TelegramSendResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId || !text) return { ok: false, chatId: chatId || null, messageId: null, error: "Telegram is not configured" };
  const response = await fetch(`https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chatId, text: sanitizeSupportText(text, 4000), reply_markup: replyMarkup, disable_web_page_preview: true }) });
  const payload = await response.json().catch(() => null) as { ok?: boolean; result?: { message_id?: number }; description?: string } | null;
  if (!response.ok || !payload?.ok) return { ok: false, chatId, messageId: null, error: payload?.description || "Telegram request failed" };
  return { ok: true, chatId, messageId: payload.result?.message_id ? String(payload.result.message_id) : null };
}

export async function sendSupportTelegram(ticket: SupportTicket, apartmentTitle?: string | null, routedChatId?: string | null): Promise<TelegramSendResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = routedChatId || process.env.TELEGRAM_MANAGER_CHAT_ID;
  if (!token || !chatId) return { ok: false, chatId: null, messageId: null, error: "Telegram is not configured" };
  const response = await fetch(`https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chatId, text: buildTelegramTicketMessage({ ...ticket, apartmentTitle }), reply_markup: buildTelegramKeyboard(ticket.public_number, ticket.telegram_action_token), disable_web_page_preview: true }) });
  const payload = await response.json().catch(() => null) as { ok?: boolean; result?: { message_id?: number }; description?: string } | null;
  if (!response.ok || !payload?.ok) return { ok: false, chatId, messageId: null, error: payload?.description || "Telegram request failed" };
  return { ok: true, chatId, messageId: payload.result?.message_id ? String(payload.result.message_id) : null };
}

export async function sendTelegramText(chatId: string, text: string): Promise<boolean> {
  return (await sendTelegramMessage(chatId, text)).ok;
}
