import "server-only";

import { NextResponse } from "next/server";
import { requireWebhookAdminApiAuth } from "@/lib/telegram/webhook-admin-auth";
import { getSafeTelegramWebhookStatus } from "@/lib/telegram/webhook-admin";

export async function GET() {
  const auth = await requireWebhookAdminApiAuth();
  if (!auth.ok) return auth.response;
  const result = await getSafeTelegramWebhookStatus();
  if (!result.ok) return NextResponse.json({ ok: false, error: "Telegram webhook status unavailable" }, { status: result.error === "not_configured" ? 503 : 502 });
  return NextResponse.json({ ok: true, data: result.status });
}
