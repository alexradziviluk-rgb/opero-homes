import { NextResponse } from "next/server";
import { getAIContext } from "@/lib/ai/context";
import { canClientSend, type ConversationState } from "@/lib/support/conversation";
import { publishConversationEvent } from "@/lib/support/realtime";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { isLiveConversationT2Enabled } from "@/lib/support/feature-flags";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  if (!isLiveConversationT2Enabled()) return NextResponse.json({ ok: false, error: "Conversation feature unavailable" }, { status: 404 });
  const { id } = await params;
  const context = await getAIContext("/account/support");
  if (!context.userId) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  const supabase = createSupabaseServiceRoleClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "Сервис диалогов временно недоступен." }, { status: 503 });
  const { data: ticket } = await supabase.from("support_tickets").select("id,conversation_state").eq("public_number", id).eq("requester_user_id", context.userId).maybeSingle();
  if (!ticket) return NextResponse.json({ ok: false, error: "Диалог не найден" }, { status: 404 });
  const body = await request.json().catch(() => null) as { typing?: unknown } | null;
  if (body?.typing !== true) return NextResponse.json({ ok: false, error: "Only typing payloads are accepted" }, { status: 400 });
  const state = ticket.conversation_state as ConversationState;
  if (!canClientSend(state)) return NextResponse.json({ ok: true, result: "noop", state });
  const now = new Date().toISOString();
  await supabase.from("support_tickets").update({ last_typing_at: now, last_seen_at: now }).eq("id", ticket.id);
  await publishConversationEvent({ kind: "typing", conversation: id, senderType: "client", createdAt: now });
  return NextResponse.json({ ok: true, result: "applied" });
}

export async function GET() {
  return NextResponse.json({ ok: false, error: "Method not allowed" }, { status: 405 });
}
