import { NextResponse } from "next/server";
import { getAIContext } from "@/lib/ai/context";
import { answerWithTools } from "@/lib/ai/assistant";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { createSupportTicket } from "@/lib/support/service";
import { classifyAiIntent } from "@/lib/ai/intent";
import { executeAiOperationalAction } from "@/lib/ai/operations";

const MAX_MESSAGE_LENGTH = 2000;
const rateBuckets = new Map<string, { startedAt: number; count: number }>();

function allowedByRateLimit(key: string): boolean {
  const now = Date.now();
  if (rateBuckets.size > 10_000) {
    for (const [bucketKey, bucket] of rateBuckets) {
      if (now - bucket.startedAt > 60_000) rateBuckets.delete(bucketKey);
    }
  }
  const current = rateBuckets.get(key);
  if (!current || now - current.startedAt > 60_000) {
    rateBuckets.set(key, { startedAt: now, count: 1 });
    return true;
  }
  if (current.count >= 20) return false;
  current.count += 1;
  return true;
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const body = (await request.json().catch(() => null)) as { message?: unknown; route?: unknown; conversationId?: unknown } | null;
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message || message.length > MAX_MESSAGE_LENGTH) return NextResponse.json({ ok: false, error: "Сообщение должно содержать от 1 до 2000 символов." }, { status: 400 });

  const context = await getAIContext(typeof body?.route === "string" ? body.route : "/");
  const conversationId = typeof body?.conversationId === "string" ? body.conversationId.trim() : "";
  if (conversationId && context.userId) {
    const supabase = createSupabaseServiceRoleClient();
    const { data: conversation } = supabase ? await supabase.from("support_tickets").select("conversation_state").eq("public_number", conversationId).eq("requester_user_id", context.userId).maybeSingle() : { data: null };
    if (conversation?.conversation_state === "waiting_manager") return NextResponse.json({ ok: true, message: "Менеджер скоро подключится.", role: context.role, tools: [], results: [], suggestions: [], conversationState: "waiting_manager" }, { headers: { "Cache-Control": "no-store" } });
    if (conversation?.conversation_state === "manager_active") return NextResponse.json({ ok: true, message: "Чат с менеджером уже активен.", role: context.role, tools: [], results: [], suggestions: [], conversationState: "manager_active" }, { headers: { "Cache-Control": "no-store" } });
    if (conversation?.conversation_state === "resolved" || conversation?.conversation_state === "closed") return NextResponse.json({ ok: true, message: "Диалог закрыт. Вы можете вернуться к Opero AI.", role: context.role, tools: [], results: [], suggestions: [], conversationState: conversation.conversation_state }, { headers: { "Cache-Control": "no-store" } });
  }
  const rateKey = context.userId ? `user:${context.userId}` : `ip:${ip}`;
  if (!allowedByRateLimit(rateKey)) return NextResponse.json({ ok: false, error: "Слишком много запросов. Повторите позже." }, { status: 429 });
  const classification = classifyAiIntent(message);
  const response = await answerWithTools(context, message);
  response.intent = classification.intent;
  response.action = classification.action;
  if (classification.action === "CREATE_MAINTENANCE_TASK" || classification.action === "CREATE_CLEANING_TASK" || classification.action === "URGENT_HANDOFF") {
    const supabase = createSupabaseServiceRoleClient();
    if (supabase) {
      const operationalAction = await executeAiOperationalAction({ supabase, context, conversationId, message, classification });
      response.operationalAction = operationalAction;
      if (operationalAction.ok) {
        response.message = operationalAction.duplicate
          ? `Проблема уже зарегистрирована: задача ${operationalAction.taskReference ?? "существует"}. Новое действие не создавалось.`
          : `Проблема зарегистрирована. Задача ${operationalAction.taskReference ?? "создана"}, обращение ${operationalAction.ticketReference ?? "передано менеджеру"}. Я буду опираться на этот статус и не буду обещать невыполненное действие.`;
        response.handoff = undefined;
      } else if (operationalAction.ticketReference) {
        response.message = `Не удалось автоматически зарегистрировать операционную задачу. Я передал вопрос менеджеру: ${operationalAction.ticketReference}.`;
        response.handoff = undefined;
      } else if (response.handoff && context.userId) {
        try {
          const ticket = await createSupportTicket({ supabase, context, message, route: context.route, handoff: response.handoff, idempotencyKey: response.handoff.actionId });
          response.message = `Не удалось автоматически зарегистрировать операционную задачу. Я передал вопрос менеджеру: ${ticket.ticket.public_number}.`;
          response.handoff = { ...response.handoff, offered: false, requiresConfirmation: false, critical: false };
        } catch {
          response.message = "Не удалось автоматически зарегистрировать проблему и передать её менеджеру. Пожалуйста, свяжитесь с Opero Homes напрямую.";
        }
      }
    }
  }
  if (response.handoff?.critical) {
    const supabase = createSupabaseServiceRoleClient();
    if (supabase) {
      try {
        const ticket = await createSupportTicket({ supabase, context, message, route: context.route, handoff: response.handoff, idempotencyKey: response.handoff.actionId });
        response.message = `Внимание: создано срочное обращение ${ticket.ticket.public_number}. Если безопасно, оставайтесь на связи с сотрудником Opero Homes.`;
        response.handoff = { ...response.handoff, offered: false, requiresConfirmation: false };
      } catch {
        response.message = "Внимание: зафиксирована критическая проблема. Сервис обращений временно недоступен; свяжитесь с сотрудником Opero Homes напрямую.";
      }
    }
  }
  return NextResponse.json(response, { headers: { "Cache-Control": "no-store" } });
}