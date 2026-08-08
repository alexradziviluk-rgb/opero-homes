import { NextResponse } from "next/server";
import { getAIContext } from "@/lib/ai/context";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { createSupportTicket, buildHandoff } from "@/lib/support/service";
import { checkAnonymousRateLimit, rateLimitResponse } from "@/lib/support/anonymous-security";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  const confirmed = body?.confirmed === true;
  const idempotencyKey = typeof body?.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";
  if (!message || message.length > 2000 || !confirmed || !idempotencyKey || idempotencyKey.length > 200) return NextResponse.json({ ok: false, error: "Подтвердите передачу обращения менеджеру." }, { status: 400 });
  const context = await getAIContext(typeof body?.route === "string" ? body.route : "/");
  const supabase = createSupabaseServiceRoleClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "Сервис обращений временно недоступен." }, { status: 503 });
  if (context.role === "anonymous") {
    const limit = await checkAnonymousRateLimit({ supabase, request, endpoint: "create", accessToken: idempotencyKey });
    if (!limit.allowed) return rateLimitResponse(limit.retryAfter, limit.failedClosed);
  }
  try {
    const handoff = buildHandoff(context, message);
    const result = await createSupportTicket({ supabase, context, message, route: context.route, handoff: { ...handoff, actionId: typeof body?.actionId === "string" ? body.actionId : handoff.actionId, expiresAt: typeof body?.expiresAt === "string" ? body.expiresAt : handoff.expiresAt }, idempotencyKey, contact: { email: typeof body?.email === "string" ? body.email : undefined, phone: typeof body?.phone === "string" ? body.phone : undefined, consent: body?.consent === true } });
    const contactMessage = context.role === "anonymous" ? " Ответ будет отправлен по указанному контакту." : "";
    const trackingUrl = result.anonymousAccessToken ? `${(process.env.NEXT_PUBLIC_SITE_URL || "https://operohq.netlify.app").replace(/\/$/, "")}/support/conversation/${encodeURIComponent(result.ticket.public_number)}?access=${encodeURIComponent(result.anonymousAccessToken)}` : null;
    return NextResponse.json({ ok: true, publicNumber: result.ticket.public_number, status: result.ticket.status, conversationState: result.ticket.conversation_state ?? "waiting_manager", deliveryStatus: result.deliveryStatus, duplicate: result.duplicate, trackingUrl, message: result.deliveryStatus === "sent" ? `Обращение ${result.ticket.public_number} передано менеджеру.${contactMessage}` : `Обращение ${result.ticket.public_number} создано. Уведомление сотруднику временно задерживается.${contactMessage}` }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "Не удалось создать обращение." }, { status: 422 });
  }
}

export async function GET() {
  const context = await getAIContext("/account/support");
  if (!context.userId) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  const supabase = createSupabaseServiceRoleClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "Сервис обращений временно недоступен." }, { status: 503 });
  const { data, error } = await supabase.from("support_tickets").select("public_number,status,conversation_state,conversation_summary,priority,subject,created_at,updated_at,support_messages(sender_type,message,message_type,source,created_at)").eq("requester_user_id", context.userId).eq("support_messages.is_internal", false).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ ok: false, error: "Не удалось загрузить обращения." }, { status: 422 });
  return NextResponse.json({ ok: true, data: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}
