import "server-only";

import { NextResponse } from "next/server";
import { POST as setupWebhook } from "@/app/api/admin/telegram/webhook/setup/route";
import { requireWebhookAdminApiAuth, isSameOrigin } from "@/lib/telegram/webhook-admin-auth";

export async function POST(request: Request) {
  const auth = await requireWebhookAdminApiAuth();
  if (!auth.ok) return auth.response;
  if (!isSameOrigin(request)) return NextResponse.json({ ok: false, error: "Invalid request origin" }, { status: 403 });
  const secret = process.env.TELEGRAM_WEBHOOK_SETUP_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: "Telegram webhook setup unavailable" }, { status: 503 });

  const headers = new Headers({
    "content-type": "application/json",
    origin: new URL(request.url).origin,
    "x-telegram-webhook-setup-secret": secret,
  });
  const cookie = request.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);

  return setupWebhook(new Request(new URL("/api/admin/telegram/webhook/setup", request.url), { method: "POST", headers, body: "{}" }));
}