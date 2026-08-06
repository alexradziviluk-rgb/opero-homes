import "server-only";

import { NextResponse } from "next/server";
import { requireStaffApiAuth } from "@/lib/supabase/api-auth";
import { getRoleCodeFromContext } from "@/lib/supabase/role-code";
import { isWebhookAdminRole } from "@/lib/telegram/webhook-admin";

const rateBuckets = new Map<string, { startedAt: number; count: number }>();

export async function requireWebhookAdminApiAuth(): Promise<Awaited<ReturnType<typeof requireStaffApiAuth>>> {
  const auth = await requireStaffApiAuth();
  if (!auth.ok) return auth;
  if (!isWebhookAdminRole(getRoleCodeFromContext(auth.context))) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "Insufficient permissions" }, { status: 403 }) };
  }
  return auth;
}

export function checkWebhookSetupRateLimit(key: string): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (bucket && now - bucket.startedAt < 60_000 && bucket.count >= 5) return false;
  if (!bucket || now - bucket.startedAt >= 60_000) rateBuckets.set(key, { startedAt: now, count: 1 });
  else bucket.count += 1;
  return true;
}

export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const requestOrigin = new URL(request.url).origin;
  const configuredOrigin = (process.env.NEXT_PUBLIC_APP_URL || "https://operohq.netlify.app").replace(/\/$/, "");
  return origin === requestOrigin || origin === configuredOrigin;
}
