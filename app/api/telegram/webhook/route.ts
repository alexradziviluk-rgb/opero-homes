import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { callbackAuditMetadata, hashTelegramUpdateId, isAllowedTelegramChat, parseTelegramCallbackData, transitionTelegramCallback } from "@/lib/telegram/callback";
import { hashTelegramLinkToken } from "@/lib/telegram/link";
import { sendTelegramMessage, sendTelegramText } from "@/lib/support/telegram";
import { notifyStaff } from "@/lib/support/notifications";
import { publishConversationEvent } from "@/lib/support/realtime";
import { isLiveConversationT2Enabled, isTelegramMessageRepliesEnabled } from "@/lib/support/feature-flags";
import type { SupportStatus } from "@/lib/support/types";

const rateBuckets = new Map<string, { startedAt: number; count: number }>();
type WebhookTicket = { id: string; status: SupportStatus; conversation_state?: string; assigned_to: string | null; organization_id: string | null; telegram_chat_id: string | null; public_number: string };

export async function POST(request: Request) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected || request.headers.get("x-telegram-bot-api-secret-token") !== expected) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (request.headers.get("content-type")?.toLowerCase().split(";")[0] !== "application/json") return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 415 });
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (contentLength > 32_768) return NextResponse.json({ ok: false, error: "Payload too large" }, { status: 413 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const now = Date.now();
  const bucket = rateBuckets.get(ip);
  if (bucket && now - bucket.startedAt < 60_000 && bucket.count >= 30) return NextResponse.json({ ok: false, error: "Rate limit exceeded" }, { status: 429 });
  if (!bucket || now - bucket.startedAt >= 60_000) rateBuckets.set(ip, { startedAt: now, count: 1 }); else bucket.count += 1;
  const raw = await request.text();
  if (raw.length > 32_768) return NextResponse.json({ ok: false, error: "Payload too large" }, { status: 413 });
  let payload: { update_id?: unknown; callback_query?: { data?: string; from?: { id?: number }; message?: { chat?: { id?: number }; message_id?: number } }; message?: { text?: string; from?: { id?: number }; chat?: { id?: number }; message_id?: number; reply_to_message?: { message_id?: number } } };
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }
  const updateId = typeof payload.update_id === "number" && Number.isSafeInteger(payload.update_id) ? payload.update_id : null;
  if (updateId === null) return NextResponse.json({ ok: true, result: "ignored" });
  const callback = payload?.callback_query;
  const parsedCallback = parseTelegramCallbackData(callback?.data);
  const supabase = createSupabaseServiceRoleClient(); if (!supabase) return NextResponse.json({ ok: false, error: "Service unavailable" }, { status: 503 });
  const incomingMessage = payload?.message;
  if (incomingMessage) {
    if (!isTelegramMessageRepliesEnabled()) return NextResponse.json({ ok: true, result: "noop" });
    const chatId = incomingMessage.chat?.id ? String(incomingMessage.chat.id) : "";
    const telegramUserId = incomingMessage.from?.id ? String(incomingMessage.from.id) : "";
    const text = typeof incomingMessage.text === "string" ? incomingMessage.text.trim() : "";
    const { error: replayError } = await supabase.from("support_telegram_updates").insert({ update_id: updateId });
    if (replayError?.code === "23505") return NextResponse.json({ ok: true, result: "noop", replay: true });
    if (replayError) return NextResponse.json({ ok: true, result: "rejected" });
    const start = text.match(/^\/start\s+([^\s]{10,200})$/i);
    if (start && telegramUserId && chatId) {
      const tokenHash = hashTelegramLinkToken(start[1]);
      const { data: tokenRows } = await supabase.rpc("support_accept_telegram_link_token", { target_token_hash: tokenHash, target_telegram_user_id: telegramUserId, target_telegram_chat_id: chatId });
      const token = Array.isArray(tokenRows) ? tokenRows[0] as { organization_id: string; user_id: string } | undefined : undefined;
      if (!token) return NextResponse.json({ ok: true, result: "rejected" });
      await sendTelegramText(chatId, "Telegram подключён к Opero Homes.");
      return NextResponse.json({ ok: true, result: "linked" });
    }
    if (!telegramUserId || !chatId || !text) return NextResponse.json({ ok: true, result: "ignored" });
    const { data: binding } = await supabase.from("support_telegram_bindings").select("organization_id,user_id,telegram_chat_id").eq("telegram_user_id", telegramUserId).eq("telegram_chat_id", chatId).is("revoked_at", null).maybeSingle();
    if (!binding) return NextResponse.json({ ok: true, result: "rejected" });
    const replyMessageId = incomingMessage.reply_to_message?.message_id ? String(incomingMessage.reply_to_message.message_id) : "";
    const { data: routedTickets, error: routingError } = await supabase.rpc("support_route_telegram_message", { target_organization_id: binding.organization_id, target_user_id: binding.user_id, target_chat_id: chatId, target_reply_message_id: replyMessageId || null });
    if (routingError) return NextResponse.json({ ok: true, result: "rejected" });
    const ticket = Array.isArray(routedTickets) && routedTickets.length === 1 ? routedTickets[0] as { ticket_id: string; public_number: string; assigned_to: string } : null;
    if (!ticket) return NextResponse.json({ ok: true, result: "noop" });
    const nowMessage = new Date().toISOString();
    const { error: messageError } = await supabase.from("support_messages").insert({ ticket_id: ticket.ticket_id, sender_type: "manager", sender_user_id: binding.user_id, message: text.slice(0, 2000), message_type: "telegram", source: "telegram", telegram_message_id: incomingMessage.message_id ? String(incomingMessage.message_id) : null, client_message_id: `telegram:${updateId}`, is_internal: false });
    if (messageError) return NextResponse.json({ ok: true, result: "rejected" });
    await supabase.from("support_tickets").update({ first_response_at: nowMessage }).eq("id", ticket.ticket_id).is("first_response_at", null);
    await supabase.from("support_audit_log").insert({ ticket_id: ticket.ticket_id, actor_type: "telegram", actor_user_id: binding.user_id, action: "message_added", safe_metadata: { source: "telegram", message_type: "telegram" } });
    if (binding.organization_id) {
      try {
        await notifyStaff({ supabase, organizationId: binding.organization_id, ticketId: ticket.ticket_id, publicNumber: ticket.public_number, eventType: "support_manager_replied", title: "Новое сообщение менеджера", message: `${ticket.public_number}: менеджер ответил в Telegram.`, actionUrl: `${(process.env.NEXT_PUBLIC_SITE_URL || "https://operohq.netlify.app").replace(/\/$/, "")}/admin/support/${encodeURIComponent(ticket.public_number)}`, idempotencyKey: `support:${ticket.ticket_id}:message:${updateId}`, priority: "normal", preferredUserId: binding.user_id });
      } catch (notificationError) {
        console.error("[support-notification]", notificationError instanceof Error ? notificationError.message : "Unable to persist manager reply notification");
      }
    }
    await publishConversationEvent({ kind: "message", conversation: ticket.public_number, senderType: "manager", message: text.slice(0, 2000), messageType: "telegram", source: "telegram", createdAt: nowMessage });
    return NextResponse.json({ ok: true, result: "applied" });
  }
  if (!parsedCallback) return NextResponse.json({ ok: true, result: "rejected" });
  const chatId = callback?.message?.chat?.id ? String(callback.message.chat.id) : "";
  const ticketSelect = isLiveConversationT2Enabled() ? "id,status,conversation_state,assigned_to,organization_id,telegram_chat_id,public_number" : "id,status,assigned_to,organization_id,telegram_chat_id,public_number";
  const { data: rawTicket, error: ticketError } = await supabase.from("support_tickets").select(ticketSelect).eq("telegram_action_token", parsedCallback.actionToken).maybeSingle();
  const ticket = rawTicket as WebhookTicket | null;
  if (ticketError || !ticket || !chatId) return NextResponse.json({ ok: true, result: "rejected" });
  const callbackUserId = callback?.from?.id ? String(callback.from.id) : "";
  const { data: linkedBinding } = isLiveConversationT2Enabled() && callbackUserId ? await supabase.from("support_telegram_bindings").select("organization_id,user_id,telegram_chat_id").eq("telegram_user_id", callbackUserId).eq("telegram_chat_id", chatId).eq("organization_id", ticket.organization_id).maybeSingle() : { data: null };
  if (!isAllowedTelegramChat(ticket.telegram_chat_id, chatId, process.env.TELEGRAM_MANAGER_CHAT_ID) && !linkedBinding) {
    console.info("[telegram-callback]", { public_number: ticket.public_number, action: parsedCallback.action, result: "rejected", status_before: ticket.status, bindingFound: Boolean(linkedBinding), t2Enabled: isLiveConversationT2Enabled(), timestamp: new Date().toISOString() });
    return NextResponse.json({ ok: true, result: "rejected" });
  }

  const updateIdHash = hashTelegramUpdateId(updateId);
  const { error: replayError } = await supabase.from("support_telegram_updates").insert({ update_id: updateId });
  if (replayError?.code === "23505") {
    await supabase.from("support_audit_log").insert({ ticket_id: ticket.id, actor_type: "telegram", action: "telegram_callback_replay", safe_metadata: callbackAuditMetadata({ action: parsedCallback.action, result: "replay", statusBefore: ticket.status, statusAfter: ticket.status, updateIdHash }) });
    console.info("[telegram-callback]", { public_number: ticket.public_number, action: parsedCallback.action, result: "replay", status_before: ticket.status, status_after: ticket.status, timestamp: new Date().toISOString() });
    return NextResponse.json({ ok: true, result: "noop", replay: true });
  }
  if (replayError) return NextResponse.json({ ok: true, result: "rejected" });

  const transition = transitionTelegramCallback(parsedCallback.action, ticket.status);
  let result: "applied" | "noop" | "rejected" = transition.result;
  if (isLiveConversationT2Enabled() && parsedCallback.action === "accept" && ticket.conversation_state === "waiting_manager") {
    if (!linkedBinding || linkedBinding.user_id === ticket.assigned_to) result = "rejected";
    else {
      const { data: accepted, error: acceptError } = await supabase.rpc("support_accept_conversation", { target_ticket_id: ticket.id, manager_user_id: linkedBinding.user_id });
      result = acceptError ? "rejected" : Array.isArray(accepted) && accepted.length > 0 ? "applied" : "noop";
      if (result === "applied") await supabase.from("support_audit_log").insert({ ticket_id: ticket.id, actor_type: "telegram", actor_user_id: linkedBinding.user_id, action: "conversation_accepted", safe_metadata: { update_id_hash: updateIdHash } });
      if (result === "applied") {
        const confirmation = await sendTelegramMessage(chatId, `Вы отвечаете на ${ticket.public_number}. Ответьте именно на это сообщение.`);
        if (confirmation.ok && confirmation.messageId) {
          await supabase.from("support_telegram_message_refs").upsert({ ticket_id: ticket.id, organization_id: ticket.organization_id, telegram_chat_id: chatId, telegram_message_id: confirmation.messageId }, { onConflict: "ticket_id,telegram_chat_id" });
        }
        if (ticket.organization_id) {
          try {
            await notifyStaff({ supabase, organizationId: ticket.organization_id, ticketId: ticket.id, publicNumber: ticket.public_number, eventType: "support_manager_replied", title: "Менеджер подключился к обращению", message: `${ticket.public_number}: менеджер подключился к диалогу.`, actionUrl: `${(process.env.NEXT_PUBLIC_SITE_URL || "https://operohq.netlify.app").replace(/\/$/, "")}/admin/support/${encodeURIComponent(ticket.public_number)}`, idempotencyKey: `support:${ticket.id}:accepted:${linkedBinding.user_id}`, priority: "normal", preferredUserId: linkedBinding.user_id });
          } catch (notificationError) {
            console.error("[support-notification]", notificationError instanceof Error ? notificationError.message : "Unable to persist manager notification");
          }
        }
      }
    }
  }
  const linkedUserId = linkedBinding?.user_id;
  if (isLiveConversationT2Enabled() && parsedCallback.action === "resolve" && ticket.conversation_state === "manager_active" && linkedUserId === ticket.assigned_to) {
    const { data: resolved, error: resolveError } = await supabase.rpc("support_transition_conversation", { target_ticket_id: ticket.id, expected_state: "manager_active", next_state: "resolved", actor_user_id: linkedUserId });
    result = resolveError ? "rejected" : Array.isArray(resolved) && resolved.length > 0 ? "applied" : "noop";
    if (result === "applied") await publishConversationEvent({ kind: "state", conversation: ticket.public_number, state: "resolved", createdAt: new Date().toISOString() });
  } else if (transition.result === "applied") {
    if (isLiveConversationT2Enabled() && parsedCallback.action === "accept" && ticket.conversation_state === "waiting_manager") {
      await publishConversationEvent({ kind: "state", conversation: ticket.public_number, state: result === "applied" ? "manager_active" : ticket.conversation_state, createdAt: new Date().toISOString() });
    } else {
    const messageId = callback?.message?.message_id ?? null;
    const { data: updatedTicket, error: updateError } = await supabase.from("support_tickets").update({ status: transition.statusAfter, telegram_message_id: messageId ? String(messageId) : null, resolved_at: transition.statusAfter === "resolved" ? new Date().toISOString() : null }).eq("id", ticket.id).eq("status", transition.statusBefore).select("status").maybeSingle();
    if (updateError) result = "rejected";
    else if (!updatedTicket) result = "noop";
    }
  }
  await supabase.from("support_audit_log").insert({ ticket_id: ticket.id, actor_type: "telegram", action: "telegram_callback", safe_metadata: callbackAuditMetadata({ action: parsedCallback.action, result, statusBefore: transition.statusBefore, statusAfter: result === "applied" ? transition.statusAfter : transition.statusBefore, updateIdHash }) });
  console.info("[telegram-callback]", { public_number: ticket.public_number, action: parsedCallback.action, result, status_before: transition.statusBefore, status_after: result === "applied" ? transition.statusAfter : transition.statusBefore, timestamp: new Date().toISOString() });
  return NextResponse.json({ ok: true, result });
}
