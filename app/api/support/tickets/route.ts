import { NextResponse } from "next/server";
import { getAIContext } from "@/lib/ai/context";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { createSupportTicket, buildHandoff } from "@/lib/support/service";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  const confirmed = body?.confirmed === true;
  const idempotencyKey = typeof body?.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";
  if (!message || message.length > 2000 || !confirmed || !idempotencyKey || idempotencyKey.length > 200) return NextResponse.json({ ok: false, error: "Подтвердите передачу обращения менеджеру." }, { status: 400 });
  const context = await getAIContext(typeof body?.route === "string" ? body.route : "/");
  const supabase = createSupabaseServiceRoleClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "Сервис обращений временно недоступен." }, { status: 503 });
  try {
    const handoff = buildHandoff(context, message);
    const result = await createSupportTicket({ supabase, context, message, route: context.route, handoff: { ...handoff, actionId: typeof body?.actionId === "string" ? body.actionId : handoff.actionId, expiresAt: typeof body?.expiresAt === "string" ? body.expiresAt : handoff.expiresAt }, idempotencyKey, contact: { email: typeof body?.email === "string" ? body.email : undefined, phone: typeof body?.phone === "string" ? body.phone : undefined, consent: body?.consent === true } });
    const contactMessage = context.role === "anonymous" ? " Ответ будет отправлен по указанному контакту." : "";
    return NextResponse.json({ ok: true, publicNumber: result.ticket.public_number, status: result.ticket.status, deliveryStatus: result.deliveryStatus, duplicate: result.duplicate, message: result.deliveryStatus === "sent" ? `Обращение ${result.ticket.public_number} передано менеджеру.${contactMessage}` : `Обращение ${result.ticket.public_number} создано. Уведомление сотруднику временно задерживается.${contactMessage}` }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Не удалось создать обращение." }, { status: 422 });
  }
}

export async function GET() {
  const context = await getAIContext("/account/support");
  if (!context.userId) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  const supabase = createSupabaseServiceRoleClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "Сервис обращений временно недоступен." }, { status: 503 });
  const { data, error } = await supabase.from("support_tickets").select("public_number,status,priority,subject,created_at,updated_at,support_messages(sender_type,message,created_at,is_internal)").eq("requester_user_id", context.userId).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ ok: false, error: "Не удалось загрузить обращения." }, { status: 422 });
  return NextResponse.json({ ok: true, data: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}
