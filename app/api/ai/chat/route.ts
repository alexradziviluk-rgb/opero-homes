import { NextResponse } from "next/server";
import { getAIContext } from "@/lib/ai/context";
import { answerWithTools } from "@/lib/ai/assistant";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { createSupportTicket } from "@/lib/support/service";

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
  const body = (await request.json().catch(() => null)) as { message?: unknown; route?: unknown } | null;
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message || message.length > MAX_MESSAGE_LENGTH) return NextResponse.json({ ok: false, error: "Сообщение должно содержать от 1 до 2000 символов." }, { status: 400 });

  const context = await getAIContext(typeof body?.route === "string" ? body.route : "/");
  const rateKey = context.userId ? `user:${context.userId}` : `ip:${ip}`;
  if (!allowedByRateLimit(rateKey)) return NextResponse.json({ ok: false, error: "Слишком много запросов. Повторите позже." }, { status: 429 });
  const response = await answerWithTools(context, message);
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