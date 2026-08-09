import { NextResponse } from "next/server";
import { getAIContext } from "@/lib/ai/context";
import { canClientSend } from "@/lib/support/conversation";
import { publishConversationEvent } from "@/lib/support/realtime";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { isLiveConversationT2Enabled } from "@/lib/support/feature-flags";
import { effectiveConversationState } from "@/lib/support/legacy-conversation";

const MAX_MESSAGE_LENGTH = 2000;

type Params = { params: Promise<{ id: string }> };

async function loadOwnedTicket(publicNumber: string) {
  const context = await getAIContext("/account/support");
  if (!context.userId) return { context, ticket: null, response: NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 }) };
  const supabase = createSupabaseServiceRoleClient();
  if (!supabase) return { context, ticket: null, response: NextResponse.json({ ok: false, error: "Сервис диалогов временно недоступен." }, { status: 503 }) };
  const { data: ticket, error } = await supabase.from("support_tickets").select("id,public_number,status,conversation_state,conversation_summary,assigned_to,subject,created_at,updated_at,manager_joined_at,first_response_at,resolved_at,closed_at").eq("public_number", publicNumber).eq("requester_user_id", context.userId).maybeSingle();
  if (error || !ticket) return { context, ticket: null, response: NextResponse.json({ ok: false, error: "Диалог не найден" }, { status: 404 }) };
  return { context, ticket: { ...ticket, conversation_state: effectiveConversationState(ticket) ?? ticket.conversation_state }, supabase };
}

function publicMessage(row: Record<string, unknown>) {
  return { senderType: row.sender_type, message: row.message, messageType: row.message_type ?? "text", source: row.source ?? "web", clientMessageId: row.client_message_id ?? null, createdAt: row.created_at };
}

export async function GET(_request: Request, { params }: Params) {
  if (!isLiveConversationT2Enabled()) return NextResponse.json({ ok: false, error: "Conversation feature unavailable" }, { status: 404 });
  const { id } = await params;
  const loaded = await loadOwnedTicket(id);
  if (loaded.response) return loaded.response;
  const { data, error } = await loaded.supabase.from("support_messages").select("sender_type,message,message_type,source,client_message_id,created_at,is_internal").eq("ticket_id", loaded.ticket.id).eq("is_internal", false).order("created_at", { ascending: true }).order("id", { ascending: true });
  if (error) return NextResponse.json({ ok: false, error: "Не удалось загрузить историю." }, { status: 422 });
  return NextResponse.json({ ok: true, conversation: id, state: loaded.ticket.conversation_state, summary: loaded.ticket.conversation_summary, assigned: Boolean(loaded.ticket.assigned_to), timestamps: { createdAt: loaded.ticket.created_at, updatedAt: loaded.ticket.updated_at, managerJoinedAt: loaded.ticket.manager_joined_at, firstResponseAt: loaded.ticket.first_response_at, resolvedAt: loaded.ticket.resolved_at, closedAt: loaded.ticket.closed_at }, messages: (data ?? []).map((row) => publicMessage(row as Record<string, unknown>)) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, { params }: Params) {
  if (!isLiveConversationT2Enabled()) return NextResponse.json({ ok: false, error: "Conversation feature unavailable" }, { status: 404 });
  const { id } = await params;
  const loaded = await loadOwnedTicket(id);
  if (loaded.response) return loaded.response;
  const body = await request.json().catch(() => null) as { message?: unknown; typing?: unknown; clientMessageId?: unknown } | null;
  if (body?.typing === true) {
    if (!canClientSend(loaded.ticket.conversation_state)) return NextResponse.json({ ok: true, result: "noop", state: loaded.ticket.conversation_state });
    const now = new Date().toISOString();
    await loaded.supabase.from("support_tickets").update({ last_typing_at: now, last_seen_at: now }).eq("id", loaded.ticket.id);
    await publishConversationEvent({ kind: "typing", conversation: id, senderType: "client", createdAt: now });
    return NextResponse.json({ ok: true, result: "applied" });
  }
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  const clientMessageId = typeof body?.clientMessageId === "string" ? body.clientMessageId.trim().slice(0, 120) : "";
  if (!message || message.length > MAX_MESSAGE_LENGTH) return NextResponse.json({ ok: false, error: "Сообщение должно содержать от 1 до 2000 символов." }, { status: 400 });
  if (!clientMessageId) return NextResponse.json({ ok: false, error: "clientMessageId is required" }, { status: 400 });
  if (!canClientSend(loaded.ticket.conversation_state)) return NextResponse.json({ ok: true, result: "noop", state: loaded.ticket.conversation_state, message: "Диалог сейчас не принимает сообщения." });
  const now = new Date().toISOString();
  const { error } = await loaded.supabase.from("support_messages").insert({ ticket_id: loaded.ticket.id, client_message_id: clientMessageId, sender_type: "client", sender_user_id: loaded.context.userId, message, message_type: "text", content_type: "text", source: "web", is_internal: false });
  if (error?.code === "23505") {
    const { data: existing } = await loaded.supabase.from("support_messages").select("created_at").eq("ticket_id", loaded.ticket.id).eq("client_message_id", clientMessageId).maybeSingle();
    return NextResponse.json({ ok: true, result: "duplicate", state: loaded.ticket.conversation_state, clientMessageId, createdAt: existing?.created_at ?? null });
  }
  if (error) return NextResponse.json({ ok: false, error: "Не удалось отправить сообщение." }, { status: 422 });
  await loaded.supabase.from("support_tickets").update({ last_seen_at: now }).eq("id", loaded.ticket.id);
  await loaded.supabase.from("support_audit_log").insert({ ticket_id: loaded.ticket.id, actor_type: "client", actor_user_id: loaded.context.userId, action: "message_added", safe_metadata: { source: "web", message_type: "text" } });
  await publishConversationEvent({ kind: "message", conversation: id, senderType: "client", message, messageType: "text", source: "web", clientMessageId, createdAt: now });
  return NextResponse.json({ ok: true, result: "applied", createdAt: now, clientMessageId });
}