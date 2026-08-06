import "server-only";

import { NextResponse } from "next/server";
import { requireWebhookAdminApiAuth, checkWebhookSetupRateLimit, isSameOrigin } from "@/lib/telegram/webhook-admin-auth";
import { configureTelegramWebhook, hasSetupSecret } from "@/lib/telegram/webhook-admin";

const MAX_BODY_LENGTH = 1_024;

export async function POST(request: Request) {
  const auth = await requireWebhookAdminApiAuth();
  if (!auth.ok) return auth.response;
  if (!isSameOrigin(request)) return NextResponse.json({ ok: false, error: "Invalid request origin" }, { status: 403 });
  if (!hasSetupSecret(request)) return NextResponse.json({ ok: false, error: "Invalid setup secret" }, { status: 403 });
  if (request.headers.get("content-type")?.toLowerCase().split(";")[0] !== "application/json") return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 415 });
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (contentLength > MAX_BODY_LENGTH) return NextResponse.json({ ok: false, error: "Payload too large" }, { status: 413 });
  if (!checkWebhookSetupRateLimit(`${auth.context.authUserId}:${request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"}`)) return NextResponse.json({ ok: false, error: "Rate limit exceeded" }, { status: 429 });
  const raw = await request.text();
  if (raw.length > MAX_BODY_LENGTH) return NextResponse.json({ ok: false, error: "Payload too large" }, { status: 413 });
  try {
    const body = JSON.parse(raw) as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }
  const result = await configureTelegramWebhook();
  if (!result.ok) return NextResponse.json({ ok: false, error: "Telegram webhook setup unavailable" }, { status: result.error === "not_configured" ? 503 : 502 });
  return NextResponse.json({ ok: true, configured: result.status.configured, changed: result.changed, status: result.status });
}
