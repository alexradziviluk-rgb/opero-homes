import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { callbackAuditMetadata, hashTelegramUpdateId, isAllowedTelegramChat, parseTelegramCallbackData, transitionTelegramCallback } from "@/lib/telegram/callback";

const rateBuckets = new Map<string, { startedAt: number; count: number }>();

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
  let payload: { update_id?: unknown; callback_query?: { data?: string; message?: { chat?: { id?: number }; message_id?: number } } };
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }
  const updateId = typeof payload.update_id === "number" && Number.isSafeInteger(payload.update_id) ? payload.update_id : null;
  if (updateId === null) return NextResponse.json({ ok: true, result: "ignored" });
  const callback = payload?.callback_query;
  const parsedCallback = parseTelegramCallbackData(callback?.data);
  if (!parsedCallback) return NextResponse.json({ ok: true, result: "rejected" });
  const chatId = callback?.message?.chat?.id ? String(callback.message.chat.id) : "";
  const supabase = createSupabaseServiceRoleClient(); if (!supabase) return NextResponse.json({ ok: false, error: "Service unavailable" }, { status: 503 });
  const { data: ticket, error: ticketError } = await supabase.from("support_tickets").select("id,status,telegram_chat_id,public_number").eq("telegram_action_token", parsedCallback.actionToken).maybeSingle();
  if (ticketError || !ticket || !chatId) return NextResponse.json({ ok: true, result: "rejected" });
  if (!isAllowedTelegramChat(ticket.telegram_chat_id, chatId, process.env.TELEGRAM_MANAGER_CHAT_ID)) {
    console.info("[telegram-callback]", { public_number: ticket.public_number, action: parsedCallback.action, result: "rejected", status_before: ticket.status, status_after: ticket.status, timestamp: new Date().toISOString() });
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
  if (transition.result === "applied") {
    const messageId = callback?.message?.message_id ?? null;
    const { data: updatedTicket, error: updateError } = await supabase.from("support_tickets").update({ status: transition.statusAfter, telegram_message_id: messageId ? String(messageId) : null, resolved_at: transition.statusAfter === "resolved" ? new Date().toISOString() : null }).eq("id", ticket.id).eq("status", transition.statusBefore).select("status").maybeSingle();
    if (updateError) result = "rejected";
    else if (!updatedTicket) result = "noop";
  }
  await supabase.from("support_audit_log").insert({ ticket_id: ticket.id, actor_type: "telegram", action: "telegram_callback", safe_metadata: callbackAuditMetadata({ action: parsedCallback.action, result, statusBefore: transition.statusBefore, statusAfter: result === "applied" ? transition.statusAfter : transition.statusBefore, updateIdHash }) });
  console.info("[telegram-callback]", { public_number: ticket.public_number, action: parsedCallback.action, result, status_before: transition.statusBefore, status_after: result === "applied" ? transition.statusAfter : transition.statusBefore, timestamp: new Date().toISOString() });
  return NextResponse.json({ ok: true, result });
}
