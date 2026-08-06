import { NextResponse } from "next/server";
import { getAIContext } from "@/lib/ai/context";
import { answerWithTools } from "@/lib/ai/assistant";

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
  return NextResponse.json(response, { headers: { "Cache-Control": "no-store" } });
}