import "server-only";

import { NextResponse } from "next/server";
import { requireWebhookAdminApiAuth, isSameOrigin } from "@/lib/telegram/webhook-admin-auth";
import { getTelegramGroupDiagnostics } from "@/lib/telegram/webhook-admin";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { effectiveConversationState } from "@/lib/support/legacy-conversation";

async function getUpdateTrackingSnapshot() {
  const supabase = createSupabaseServiceRoleClient();
  if (!supabase) return { available: false, latest: [] as Array<{ update_id_masked: string; received_at: string | null }> };
  const { data, error } = await supabase.from("support_telegram_updates").select("update_id,received_at").order("received_at", { ascending: false }).limit(10);
  if (error) return { available: false, latest: [] as Array<{ update_id_masked: string; received_at: string | null }> };
  return {
    available: true,
    latest: (data ?? []).map((row) => ({ update_id_masked: `...${String(row.update_id).slice(-4)}`, received_at: typeof row.received_at === "string" ? row.received_at : null })),
  };
}

function maskUpdateReference(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? `...${value.slice(-4)}` : null;
}

async function getOp0008CallbackSnapshot() {
  const supabase = createSupabaseServiceRoleClient();
  if (!supabase) return { available: false };
  const { data: ticket, error: ticketError } = await supabase.from("support_tickets").select("id,public_number,status,conversation_state,telegram_action_token,confirmation_expires_at,telegram_chat_id,telegram_message_id,delivery_status").eq("public_number", "OP-0008").maybeSingle();
  if (ticketError || !ticket) return { available: true, ticket_found: false };

  const [{ data: deliveries }, { data: messageRefs }, { data: audits }] = await Promise.all([
    supabase.from("support_telegram_deliveries").select("status,telegram_message_id").eq("ticket_id", ticket.id),
    supabase.from("support_telegram_message_refs").select("telegram_message_id").eq("ticket_id", ticket.id),
    supabase.from("support_audit_log").select("action,safe_metadata,created_at").eq("ticket_id", ticket.id).in("action", ["telegram_callback", "telegram_callback_replay"]).order("created_at", { ascending: false }),
  ]);

  const token = typeof ticket.telegram_action_token === "string" ? ticket.telegram_action_token : "";
  const tokenFormatValid = /^[a-f0-9]{36}$/i.test(token);
  const tokenNotExpired = typeof ticket.confirmation_expires_at === "string" && new Date(ticket.confirmation_expires_at).getTime() > Date.now();
  const sentMessageIds = (deliveries ?? []).filter((row) => row.status === "sent").map((row) => row.telegram_message_id).filter((value): value is string => typeof value === "string" && value.length > 0);
  const referenceIds = (messageRefs ?? []).map((row) => row.telegram_message_id).filter((value): value is string => typeof value === "string" && value.length > 0);
  const messageReferenceExists = Boolean(ticket.telegram_message_id) && referenceIds.includes(ticket.telegram_message_id) && (sentMessageIds.length === 0 || sentMessageIds.includes(ticket.telegram_message_id));
  const effectiveState = effectiveConversationState(ticket) ?? ticket.conversation_state;
  const callbackRows = (audits ?? []).map((row) => {
    const metadata = row.safe_metadata && typeof row.safe_metadata === "object" ? row.safe_metadata as Record<string, unknown> : {};
    const action = metadata.action === "accept" || metadata.action === "resolve" ? metadata.action : "unknown";
    const result = metadata.result === "applied" || metadata.result === "noop" || metadata.result === "replay" || metadata.result === "rejected" ? metadata.result : "error";
    return { timestamp: row.created_at, update_reference: maskUpdateReference(metadata.update_id_hash), action, result, ticket: ticket.public_number, effective_state: effectiveState };
  });
  const callbackActionValid = callbackRows.every((row) => row.action === "accept" || row.action === "resolve");

  return {
    available: true,
    ticket_found: true,
    ticket: ticket.public_number,
    current_effective_state: effectiveState,
    callback_updates_count: callbackRows.length,
    last_callback_timestamp: callbackRows[0]?.timestamp ?? null,
    last_callback: callbackRows[0] ?? null,
    callbacks: callbackRows,
    accept_token_valid: tokenFormatValid && tokenNotExpired,
    message_reference_exists: messageReferenceExists,
    callback_action_valid: callbackActionValid,
    notification: { delivery_status: ticket.delivery_status, telegram_message_reference_exists: Boolean(ticket.telegram_message_id), sent_message_reference_matches: messageReferenceExists },
  };
}

export async function GET() {
  const auth = await requireWebhookAdminApiAuth();
  if (!auth.ok) return auth.response;
  const result = await getTelegramGroupDiagnostics(false);
  if (!result.ok) return NextResponse.json({ ok: false, error: "Telegram diagnostics unavailable" }, { status: result.error === "not_configured" ? 503 : 502 });
  return NextResponse.json({ ...result, update_tracking: await getUpdateTrackingSnapshot(), op_0008: await getOp0008CallbackSnapshot() });
}

export async function POST(request: Request) {
  const auth = await requireWebhookAdminApiAuth();
  if (!auth.ok) return auth.response;
  if (!isSameOrigin(request)) return NextResponse.json({ ok: false, error: "Invalid request origin" }, { status: 403 });
  const result = await getTelegramGroupDiagnostics(true);
  if (!result.ok) return NextResponse.json({ ok: false, error: "Telegram diagnostics unavailable" }, { status: result.error === "not_configured" ? 503 : 502 });
  return NextResponse.json(result);
}