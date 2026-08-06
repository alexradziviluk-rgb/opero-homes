import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendSupportTelegram } from "./telegram";
import { sanitizeSupportSummary, sanitizeSupportText } from "./privacy";
import type { SupportCategory, SupportHandoff, SupportPriority, SupportTicket } from "./types";
import type { AIContext } from "@/lib/ai/types";

function languageLabel(language: string): string { return language === "en" ? "English" : language === "tr" ? "Türkçe" : "Русский"; }
function detectLanguage(message: string): string { return /\b(hello|refund|booking|manager|human)\b/i.test(message) ? "en" : /\b(merhaba|rezervasyon|iade|insan)\b/i.test(message) ? "tr" : "ru"; }
function classify(message: string): { category: SupportCategory; priority: SupportPriority; subject: string; critical: boolean } {
  const lower = message.toLocaleLowerCase("ru-RU");
  if (/авари|пожар|затоп|нет воды|нет электр|gas leak|fire|flood|no water|no electricity|yangın|su yok|elektrik yok/i.test(lower)) return { category: "maintenance", priority: "urgent", subject: "Критическая проблема на объекте", critical: true };
  if (/возврат|refund|iade|оплат|payment|платеж|деньг|money/i.test(lower)) return { category: /возврат|refund|iade/i.test(lower) ? "refund" : "payment", priority: "high", subject: "Финансовый вопрос", critical: false };
  if (/брон|booking|rezervasyon|дат|cancel|отмен|измен|change/i.test(lower)) return { category: "booking", priority: "high", subject: "Вопрос по бронированию", critical: false };
  if (/уборк|clean|temiz/i.test(lower)) return { category: "cleaning", priority: "normal", subject: "Вопрос по уборке", critical: false };
  if (/полом|ремонт|maintenance|слом|broken/i.test(lower)) return { category: "maintenance", priority: "high", subject: "Вопрос по обслуживанию объекта", critical: false };
  if (/жалоб|complaint|şikayet|недовол/i.test(lower)) return { category: "complaint", priority: "high", subject: "Жалоба клиента", critical: false };
  if (/юрид|legal|hukuk/i.test(lower)) return { category: "legal", priority: "high", subject: "Юридический вопрос", critical: false };
  return { category: "general", priority: "normal", subject: "Вопрос клиента", critical: false };
}

export function buildHandoff(context: AIContext, message: string, toolError = false, noResult = false): SupportHandoff {
  const classified = classify(message);
  const direct = /менеджер|человек|сотрудник|оператор|manager|human|agent|çalışan|insan/i.test(message);
  const uncertain = toolError || noResult || direct || classified.category !== "general";
  return { offered: uncertain, requiresConfirmation: !classified.critical, critical: classified.critical, category: classified.category, priority: classified.priority, subject: classified.subject, summary: sanitizeSupportSummary(`${classified.subject}. Автоматическое действие не выполнялось.`), actionId: randomUUID(), expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString() };
}

function hashIdempotency(value: string): string { return createHash("sha256").update(value).digest("hex"); }

export async function createSupportTicket(params: { supabase: SupabaseClient; context: AIContext; message: string; route: string; handoff: SupportHandoff; idempotencyKey: string; contact?: { email?: string; phone?: string; consent?: boolean } }): Promise<{ ticket: SupportTicket; deliveryStatus: SupportTicket["delivery_status"]; duplicate: boolean }> {
  const contact = params.contact ?? {};
  if (params.context.role === "anonymous" && !params.handoff.critical && (!contact.consent || (!contact.email && !contact.phone))) throw new Error("Для связи оставьте email или телефон и подтвердите согласие.");
  const classification = classify(params.message);
  const requesterContact = contact.email?.trim().toLowerCase() || contact.phone?.trim() || "anonymous";
  const scope = params.context.userId ? `user:${params.context.userId}` : `anonymous:${hashIdempotency(requesterContact)}`;
  const keyHash = hashIdempotency(params.idempotencyKey);
  const { data: existing, error: existingError } = await params.supabase.from("support_tickets").select("*").eq("idempotency_scope", scope).eq("idempotency_key_hash", keyHash).maybeSingle();
  if (existingError) throw new Error("Не удалось проверить обращение");
  if (existing) {
    if (new Date(existing.confirmation_expires_at).getTime() <= Date.now()) throw new Error("Срок подтверждения обращения истёк.");
    return { ticket: existing as SupportTicket, deliveryStatus: existing.delivery_status as SupportTicket["delivery_status"], duplicate: true };
  }
  if (params.handoff.expiresAt && new Date(params.handoff.expiresAt).getTime() <= Date.now()) throw new Error("Срок подтверждения обращения истёк.");
  const row = { organization_id: params.context.organizationId, requester_user_id: params.context.userId, requester_name: sanitizeSupportText(params.context.displayName || "Гость", 120), requester_email: contact.email?.trim().slice(0, 200) || params.context.email, requester_phone: contact.phone?.trim().slice(0, 50) || null, requester_language: languageLabel(detectLanguage(params.message)), category: classification.category, priority: classification.priority, status: "open", subject: sanitizeSupportText(classification.subject, 140), customer_message: sanitizeSupportText(params.message), ai_summary: sanitizeSupportSummary(params.handoff.summary), delivery_status: "pending", idempotency_scope: scope, idempotency_key_hash: keyHash, confirmation_action_id: params.handoff.actionId, confirmation_expires_at: params.handoff.expiresAt };
  const { data, error } = await params.supabase.from("support_tickets").insert(row).select("*").single();
  if (error?.code === "23505") {
    const { data: duplicate } = await params.supabase.from("support_tickets").select("*").eq("idempotency_scope", scope).eq("idempotency_key_hash", keyHash).maybeSingle();
    if (duplicate) return { ticket: duplicate as SupportTicket, deliveryStatus: duplicate.delivery_status as SupportTicket["delivery_status"], duplicate: true };
  }
  if (error || !data) throw new Error("Не удалось создать обращение");
  const ticket = data as SupportTicket;
  await params.supabase.from("support_messages").insert({ ticket_id: ticket.id, sender_type: "client", sender_user_id: params.context.userId, message: sanitizeSupportText(params.message), is_internal: false });
  await params.supabase.from("support_audit_log").insert({ ticket_id: ticket.id, actor_type: params.context.userId ? "client" : "anonymous", actor_user_id: params.context.userId, action: "created", safe_metadata: { route: params.route, category: ticket.category, priority: ticket.priority } });
  const routedChatId = await resolveTelegramChatId(params.supabase, params.context.organizationId);
  const delivery = ticket.delivery_status === "sent" ? { ok: true, chatId: ticket.telegram_chat_id, messageId: ticket.telegram_message_id } : await sendSupportTelegram(ticket, null, routedChatId);
  const deliveryStatus = delivery.ok ? "sent" : "failed";
  await params.supabase.from("support_tickets").update({ delivery_status: deliveryStatus, delivery_attempt_count: (ticket.delivery_attempt_count ?? 0) + 1, last_attempted_at: new Date().toISOString(), sent_at: delivery.ok ? new Date().toISOString() : null, telegram_chat_id: delivery.chatId, telegram_message_id: delivery.messageId, last_delivery_error: delivery.error ?? null }).eq("id", ticket.id).eq("delivery_status", "pending");
  return { ticket: { ...ticket, delivery_status: deliveryStatus, telegram_chat_id: delivery.chatId, telegram_message_id: delivery.messageId }, deliveryStatus, duplicate: false };
}

async function resolveTelegramChatId(supabase: SupabaseClient, organizationId: string | null): Promise<string | null> {
  if (!organizationId) return process.env.TELEGRAM_MANAGER_CHAT_ID || null;
  const { data: settings } = await supabase.from("organization_notification_settings").select("telegram_manager_chat_id").eq("organization_id", organizationId).maybeSingle();
  if (typeof settings?.telegram_manager_chat_id === "string" && settings.telegram_manager_chat_id.trim()) return settings.telegram_manager_chat_id.trim();
  const { data: managers } = await supabase.from("organization_members").select("telegram_chat_id").eq("organization_id", organizationId).eq("status", "active").in("role_code", ["owner", "manager"]).not("telegram_chat_id", "is", null).limit(1);
  const managerChatId = (managers?.[0] as { telegram_chat_id?: string | null } | undefined)?.telegram_chat_id;
  return managerChatId?.trim() || process.env.TELEGRAM_MANAGER_CHAT_ID || null;
}

export { classify };
