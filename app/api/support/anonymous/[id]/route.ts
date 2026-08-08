import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { publishConversationEvent } from "@/lib/support/realtime";
import { canClientSend, type ConversationState } from "@/lib/support/conversation";
import { checkAnonymousRateLimit, rateLimitResponse } from "@/lib/support/anonymous-security";
import { isAnonymousContinuationEnabled } from "@/lib/support/feature-flags";

const MAX_MESSAGE_LENGTH = 2000;
const tokenHash = (value: string) => createHash("sha256").update(value).digest("hex");

type Params = { params: Promise<{ id: string }> };

type Ticket = { id: string; public_number: string; conversation_state: ConversationState; conversation_summary: string; assigned_to: string | null; created_at: string; updated_at: string; resolved_at: string | null; closed_at: string | null };

async function load(request: Request, publicNumber: string) {
  if (!isAnonymousContinuationEnabled()) return { response: NextResponse.json({ ok: false, error: "Conversation feature unavailable" }, { status: 404 }) };
  const supabase = createSupabaseServiceRoleClient();
  if (!supabase) return { response: NextResponse.json({ ok: false, error: "Сервис диалогов временно недоступен." }, { status: 503 }) };
  const url = new URL(request.url);
  const provided = url.searchParams.get("access") || request.headers.get("x-support-access-token") || request.headers.get("cookie")?.match(/support_access=([^;]+)/)?.[1] || "";
  if (!provided || provided.length > 200) return { response: NextResponse.json({ ok: false, error: "Доступ к диалогу не подтверждён." }, { status: 401 }) };
  const accessLimit = await checkAnonymousRateLimit({ supabase, request, endpoint: "access", publicNumber, accessToken: provided });
  if (!accessLimit.allowed) return { response: rateLimitResponse(accessLimit.retryAfter, accessLimit.failedClosed) };
  const { data: ticket, error } = await supabase.from("support_tickets").select("id,public_number,conversation_state,conversation_summary,assigned_to,created_at,updated_at,resolved_at,closed_at").eq("public_number", publicNumber).is("requester_user_id", null).eq("anonymous_access_token_hash", tokenHash(provided)).is("anonymous_access_revoked_at", null).gt("anonymous_access_expires_at", new Date().toISOString()).maybeSingle();
  if (error || !ticket) return { response: NextResponse.json({ ok: false, error: "Ссылка доступа больше недействительна." }, { status: 404 }) };
  return { supabase, ticket: ticket as Ticket, provided };
}

function response(body: Record<string, unknown>, accessToken: string) {
  const result = NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  result.cookies.set("support_access", accessToken, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 7 * 24 * 60 * 60 });
  return result;
}

export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const loaded = await load(request, id);
  if (loaded.response) return loaded.response;
  const historyLimit = await checkAnonymousRateLimit({ supabase: loaded.supabase, request, endpoint: "history", publicNumber: id, accessToken: loaded.provided });
  if (!historyLimit.allowed) return rateLimitResponse(historyLimit.retryAfter, historyLimit.failedClosed);
  const { data, error } = await loaded.supabase.from("support_messages").select("sender_type,message,message_type,source,client_message_id,created_at").eq("ticket_id", loaded.ticket.id).eq("is_internal", false).order("created_at", { ascending: true }).order("id", { ascending: true });
  if (error) return NextResponse.json({ ok: false, error: "Не удалось загрузить историю." }, { status: 422 });
  return response({ ok: true, conversation: loaded.ticket.public_number, state: loaded.ticket.conversation_state, summary: loaded.ticket.conversation_summary, readOnly: loaded.ticket.conversation_state === "closed", messages: (data ?? []).map((row) => ({ senderType: row.sender_type, message: row.message, messageType: row.message_type, source: row.source, clientMessageId: row.client_message_id, createdAt: row.created_at })) }, loaded.provided);
}

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const loaded = await load(request, id);
  if (loaded.response) return loaded.response;
  const messageLimit = await checkAnonymousRateLimit({ supabase: loaded.supabase, request, endpoint: "message", publicNumber: id, accessToken: loaded.provided });
  if (!messageLimit.allowed) return rateLimitResponse(messageLimit.retryAfter, messageLimit.failedClosed);
  const body = await request.json().catch(() => null) as { message?: unknown; clientMessageId?: unknown } | null;
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  const clientMessageId = typeof body?.clientMessageId === "string" ? body.clientMessageId.trim().slice(0, 120) : "";
  if (!message || message.length > MAX_MESSAGE_LENGTH || !clientMessageId) return NextResponse.json({ ok: false, error: "Сообщение и clientMessageId обязательны." }, { status: 400 });
  if (!canClientSend(loaded.ticket.conversation_state)) return response({ ok: true, result: "noop", state: loaded.ticket.conversation_state, readOnly: true }, loaded.provided);
  const { data: inserted, error } = await loaded.supabase.from("support_messages").insert({ ticket_id: loaded.ticket.id, client_message_id: clientMessageId, sender_type: "client", message, message_type: "text", content_type: "text", source: "web", is_internal: false }).select("created_at").maybeSingle();
  if (error?.code === "23505") return response({ ok: true, result: "duplicate", clientMessageId }, loaded.provided);
  if (error) return NextResponse.json({ ok: false, error: "Не удалось отправить сообщение." }, { status: 422 });
  const createdAt = inserted?.created_at ?? new Date().toISOString();
  await loaded.supabase.from("support_tickets").update({ last_seen_at: createdAt }).eq("id", loaded.ticket.id);
  await loaded.supabase.from("support_audit_log").insert({ ticket_id: loaded.ticket.id, actor_type: "anonymous", action: "message_added", safe_metadata: { source: "web", message_type: "text" } });
  await publishConversationEvent({ kind: "message", conversation: loaded.ticket.public_number, senderType: "client", message, messageType: "text", source: "web", clientMessageId, createdAt });
  return response({ ok: true, result: "applied", createdAt, clientMessageId }, loaded.provided);
}
