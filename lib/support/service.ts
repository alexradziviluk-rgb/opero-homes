import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendSupportTelegram } from "./telegram";
import { sanitizeSupportSummary, sanitizeSupportText } from "./privacy";
import { isAnonymousContinuationEnabled, isLiveConversationT2Enabled } from "./feature-flags";
import { notifyStaff } from "./notifications";
import type { SupportCategory, SupportHandoff, SupportPriority, SupportTicket } from "./types";
import type { AIContext } from "@/lib/ai/types";

function languageLabel(language: string): string { return language === "en" ? "English" : language === "tr" ? "Türkçe" : "Русский"; }
function detectLanguage(message: string): string { return /\b(hello|refund|booking|manager|human)\b/i.test(message) ? "en" : /\b(merhaba|rezervasyon|iade|insan)\b/i.test(message) ? "tr" : "ru"; }
function classify(message: string): { category: SupportCategory; priority: SupportPriority; subject: string; critical: boolean } {
  const lower = message.toLocaleLowerCase("ru-RU");
  if (/авари|пожар|затоп|затап|нет воды|нет электр|gas leak|fire|flood|no water|no electricity|yangın|su yok|elektrik yok/i.test(lower)) return { category: "maintenance", priority: "urgent", subject: "Критическая проблема на объекте", critical: true };
  if (/возврат|refund|iade|оплат|payment|платеж|списал|снял|charge|деньг|money/i.test(lower)) return { category: /возврат|refund|iade/i.test(lower) ? "refund" : "payment", priority: "high", subject: "Финансовый вопрос", critical: false };
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
function hashAccessToken(value: string): string { return createHash("sha256").update(value).digest("hex"); }

export async function createSupportTicket(params: { supabase: SupabaseClient; context: AIContext; message: string; route: string; handoff: SupportHandoff; idempotencyKey: string; contact?: { email?: string; phone?: string; consent?: boolean }; apartmentId?: string | null; bookingId?: string | null }): Promise<{ ticket: SupportTicket; deliveryStatus: SupportTicket["delivery_status"]; duplicate: boolean; anonymousAccessToken?: string | null }> {
  const contact = params.contact ?? {};
  if (params.context.role === "anonymous" && !params.handoff.critical && (!contact.consent || (!contact.email && !contact.phone))) throw new Error("Для связи оставьте email или телефон и подтвердите согласие.");
  const classification = classify(params.message);
  const requesterContact = contact.email?.trim().toLowerCase() || contact.phone?.trim() || "anonymous";
  const scope = params.context.userId ? `user:${params.context.userId}` : `anonymous:${hashIdempotency(requesterContact)}`;
  const keyHash = hashIdempotency(params.idempotencyKey);
  const liveConversationEnabled = isLiveConversationT2Enabled();
  const anonymousContinuationEnabled = isAnonymousContinuationEnabled();
  const { data: existing, error: existingError } = await params.supabase.from("support_tickets").select("*").eq("idempotency_scope", scope).eq("idempotency_key_hash", keyHash).maybeSingle();
  if (existingError) throw new Error("Не удалось проверить обращение");
  if (existing) {
    if (new Date(existing.confirmation_expires_at).getTime() <= Date.now()) throw new Error("Срок подтверждения обращения истёк.");
    return { ticket: existing as SupportTicket, deliveryStatus: existing.delivery_status as SupportTicket["delivery_status"], duplicate: true };
  }
  if (params.handoff.expiresAt && new Date(params.handoff.expiresAt).getTime() <= Date.now()) throw new Error("Срок подтверждения обращения истёк.");
  const anonymousAccessToken = anonymousContinuationEnabled && params.context.role === "anonymous" ? randomBytes(32).toString("base64url") : null;
  const row = { organization_id: params.context.organizationId, apartment_id: params.apartmentId ?? null, booking_id: params.bookingId ?? null, requester_user_id: params.context.userId, requester_name: sanitizeSupportText(params.context.displayName || "Гость", 120), requester_email: contact.email?.trim().slice(0, 200) || params.context.email, requester_phone: contact.phone?.trim().slice(0, 50) || null, requester_language: languageLabel(detectLanguage(params.message)), category: classification.category, priority: classification.priority, status: "open", conversation_state: "waiting_manager", subject: sanitizeSupportText(classification.subject, 140), customer_message: sanitizeSupportText(params.message), conversation_summary: sanitizeSupportSummary(params.handoff.summary), ai_summary: sanitizeSupportSummary(params.handoff.summary), delivery_status: "pending", idempotency_scope: scope, idempotency_key_hash: keyHash, confirmation_action_id: params.handoff.actionId, confirmation_expires_at: params.handoff.expiresAt, anonymous_access_token_hash: anonymousAccessToken ? hashAccessToken(anonymousAccessToken) : null, anonymous_access_expires_at: anonymousAccessToken ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() : null };
  let data: Record<string, unknown> | null = null;
  let error: { code?: string } | null = null;
  if (liveConversationEnabled) {
    const result = await params.supabase.rpc("support_create_conversation_with_initial_message", { ticket_payload: row, initial_message: sanitizeSupportText(params.message), audit_metadata: { route: params.route, category: classification.category, priority: classification.priority } });
    data = result.data as Record<string, unknown> | null;
    error = result.error;
  } else {
    const legacyRow = { organization_id: params.context.organizationId, apartment_id: row.apartment_id, booking_id: row.booking_id, requester_user_id: params.context.userId, requester_name: row.requester_name, requester_email: row.requester_email, requester_phone: row.requester_phone, requester_language: row.requester_language, category: row.category, priority: row.priority, status: row.status, subject: row.subject, customer_message: row.customer_message, ai_summary: row.ai_summary, idempotency_scope: row.idempotency_scope, idempotency_key_hash: row.idempotency_key_hash, confirmation_action_id: row.confirmation_action_id, confirmation_expires_at: row.confirmation_expires_at, delivery_status: row.delivery_status };
    const inserted = await params.supabase.from("support_tickets").insert(legacyRow).select("*").single();
    data = inserted.data as Record<string, unknown> | null;
    error = inserted.error;
    if (!error && data) {
      const messageInsert = await params.supabase.from("support_messages").insert({ ticket_id: data.id, sender_type: "client", sender_user_id: params.context.userId, message: row.customer_message, is_internal: false });
      const auditInsert = await params.supabase.from("support_audit_log").insert({ ticket_id: data.id, actor_type: params.context.userId ? "client" : "anonymous", actor_user_id: params.context.userId, action: "created", safe_metadata: { route: params.route, category: row.category, priority: row.priority } });
      if (messageInsert.error || auditInsert.error) error = messageInsert.error ?? auditInsert.error;
    }
  }
  if (error?.code === "23505") {
    const { data: duplicate } = await params.supabase.from("support_tickets").select("*").eq("idempotency_scope", scope).eq("idempotency_key_hash", keyHash).maybeSingle();
    if (duplicate) return { ticket: duplicate as SupportTicket, deliveryStatus: duplicate.delivery_status as SupportTicket["delivery_status"], duplicate: true };
  }
  if (error || !data) throw new Error("Не удалось создать обращение");
  const ticket = data as SupportTicket;
  if (ticket.organization_id) {
    try {
      await notifyStaff({
        supabase: params.supabase,
        organizationId: ticket.organization_id,
        ticketId: ticket.id,
        publicNumber: ticket.public_number,
        eventType: "support_ticket_created",
        title: ticket.priority === "urgent" ? "🚨 URGENT · Новое обращение Opero" : "Новое обращение Opero",
        message: `${ticket.public_number}: ${ticket.subject}\nПриоритет: ${ticket.priority}\n${sanitizeSupportText(ticket.customer_message, 500)}`,
        actionUrl: `${(process.env.NEXT_PUBLIC_SITE_URL || "https://operohq.netlify.app").replace(/\/$/, "")}/admin/support/${encodeURIComponent(ticket.public_number)}`,
        idempotencyKey: `support:${ticket.id}:created`,
        priority: ticket.priority,
        apartmentId: ticket.apartment_id,
        bookingId: ticket.booking_id,
      });
    } catch (notificationError) {
      console.error("[support-notification]", notificationError instanceof Error ? notificationError.message : "Unable to persist support notification");
    }
  }
  const routedChatIds = await resolveTelegramChatIds(params.supabase, params.context.organizationId);
  const delivery = { ok: false, chatId: null as string | null, messageId: null as string | null, error: "Telegram is not configured" };
  const outcomes: Array<{ chatId: string; ok: boolean; messageId: string | null; error?: string }> = [];
  for (const chatId of routedChatIds) {
    const bindingReference = hashIdempotency(`${params.context.organizationId ?? "global"}:${chatId}`).slice(0, 32);
    const existing = liveConversationEnabled ? (await params.supabase.from("support_telegram_deliveries").select("status,telegram_message_id").eq("ticket_id", ticket.id).eq("binding_reference", bindingReference).maybeSingle()).data : null;
    if (existing?.status === "sent") { outcomes.push({ chatId, ok: true, messageId: existing.telegram_message_id }); continue; }
    if (liveConversationEnabled) await params.supabase.from("support_telegram_deliveries").upsert({ ticket_id: ticket.id, organization_id: ticket.organization_id, binding_reference: bindingReference, recipient_label: `linked-recipient-${bindingReference.slice(0, 8)}`, status: "retrying", attempt_count: 1, last_attempted_at: new Date().toISOString() }, { onConflict: "ticket_id,binding_reference" });
    const attempt = await sendSupportTelegram(ticket, null, chatId);
    outcomes.push({ chatId, ok: attempt.ok, messageId: attempt.messageId, error: attempt.error });
    if (liveConversationEnabled) await params.supabase.from("support_telegram_deliveries").update({ status: attempt.ok ? "sent" : "failed", sent_at: attempt.ok ? new Date().toISOString() : null, telegram_message_id: attempt.messageId, last_error_code: attempt.ok ? null : "telegram_send_failed", updated_at: new Date().toISOString() }).eq("ticket_id", ticket.id).eq("binding_reference", bindingReference);
    if (liveConversationEnabled && attempt.ok && attempt.messageId) await params.supabase.from("support_telegram_message_refs").upsert({ ticket_id: ticket.id, organization_id: ticket.organization_id, telegram_chat_id: chatId, telegram_message_id: attempt.messageId }, { onConflict: "ticket_id,telegram_chat_id" });
    if (attempt.ok && !delivery.ok) Object.assign(delivery, attempt);
  }
  const sentCount = outcomes.filter((item) => item.ok).length;
  const deliveryStatus = liveConversationEnabled ? routedChatIds.length === 0 ? "no_recipients" : sentCount === routedChatIds.length ? "sent" : sentCount > 0 ? "partially_sent" : "all_failed" : sentCount > 0 ? "sent" : "failed";
  await params.supabase.from("support_tickets").update({ delivery_status: deliveryStatus, delivery_attempt_count: (ticket.delivery_attempt_count ?? 0) + 1, last_attempted_at: new Date().toISOString(), sent_at: sentCount > 0 ? new Date().toISOString() : null, telegram_chat_id: delivery.chatId, telegram_message_id: delivery.messageId, last_delivery_error: sentCount === routedChatIds.length ? null : "telegram_delivery_partial" }).eq("id", ticket.id).eq("delivery_status", "pending");
  return { ticket: { ...ticket, delivery_status: deliveryStatus, telegram_chat_id: delivery.chatId, telegram_message_id: delivery.messageId }, deliveryStatus, duplicate: false, anonymousAccessToken };
}

async function resolveTelegramChatIds(supabase: SupabaseClient, organizationId: string | null): Promise<string[]> {
  if (!organizationId) return process.env.TELEGRAM_MANAGER_CHAT_ID ? [process.env.TELEGRAM_MANAGER_CHAT_ID] : [];
  const bindings = isLiveConversationT2Enabled() ? (await supabase.from("support_telegram_bindings").select("telegram_chat_id").eq("organization_id", organizationId).is("revoked_at", null)).data : [];
  const linkedChats = (bindings ?? []).map((row) => (row as { telegram_chat_id?: string | null }).telegram_chat_id?.trim()).filter((value): value is string => Boolean(value));
  const { data: settings } = await supabase.from("organization_notification_settings").select("telegram_manager_chat_id").eq("organization_id", organizationId).maybeSingle();
  if (typeof settings?.telegram_manager_chat_id === "string" && settings.telegram_manager_chat_id.trim()) linkedChats.push(settings.telegram_manager_chat_id.trim());
  const { data: managers } = await supabase.from("organization_members").select("telegram_chat_id").eq("organization_id", organizationId).eq("status", "active").in("role_code", ["owner", "manager"]).not("telegram_chat_id", "is", null).limit(1);
  const managerChatId = (managers?.[0] as { telegram_chat_id?: string | null } | undefined)?.telegram_chat_id;
  if (managerChatId?.trim()) linkedChats.push(managerChatId.trim());
  if (process.env.TELEGRAM_MANAGER_CHAT_ID) linkedChats.push(process.env.TELEGRAM_MANAGER_CHAT_ID);
  return [...new Set(linkedChats)];
}

export { classify };
