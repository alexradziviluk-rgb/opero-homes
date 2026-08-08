import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export type AnonymousRateLimitEndpoint = "create" | "history" | "message" | "access" | "exchange";

type RateLimitConfig = { limit: number; windowSeconds: number };

const LIMITS: Record<AnonymousRateLimitEndpoint, RateLimitConfig> = {
  create: { limit: 5, windowSeconds: 60 },
  history: { limit: 60, windowSeconds: 60 },
  message: { limit: 10, windowSeconds: 60 },
  access: { limit: 20, windowSeconds: 60 },
  exchange: { limit: 5, windowSeconds: 60 },
};

function limiterSecret() {
  return process.env.SUPPORT_RATE_LIMIT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "local-support-rate-limit";
}

export function hashAnonymousScope(value: string): string {
  return createHash("sha256").update(`${limiterSecret()}:${value}`).digest("hex");
}

export function getRequestIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
}

export function anonymousRateLimitScopes(request: Request, publicNumber?: string, accessToken?: string): string[] {
  const scopes = [`ip:${hashAnonymousScope(getRequestIp(request))}`];
  if (publicNumber) scopes.push(`conversation:${hashAnonymousScope(publicNumber.trim().toUpperCase())}`);
  if (accessToken) scopes.push(`token:${hashAnonymousScope(accessToken)}`);
  return scopes;
}

export async function checkAnonymousRateLimit(params: {
  supabase: SupabaseClient;
  request: Request;
  endpoint: AnonymousRateLimitEndpoint;
  publicNumber?: string;
  accessToken?: string;
}): Promise<{ allowed: true } | { allowed: false; retryAfter: number; failedClosed?: boolean }> {
  const config = LIMITS[params.endpoint];
  const { data, error } = await params.supabase.rpc("support_check_anonymous_rate_limit", {
    scope_keys: anonymousRateLimitScopes(params.request, params.publicNumber, params.accessToken),
    target_endpoint: params.endpoint,
    limit_count: config.limit,
    window_seconds: config.windowSeconds,
  });
  if (error || !Array.isArray(data) || !data[0]) return { allowed: false, retryAfter: 30, failedClosed: true };
  const result = data[0] as { allowed?: boolean; retry_after_seconds?: number };
  if (result.allowed !== true) return { allowed: false, retryAfter: Math.max(1, Number(result.retry_after_seconds) || config.windowSeconds) };
  return { allowed: true };
}

export function rateLimitResponse(retryAfter: number, failedClosed = false): Response {
  return new Response(JSON.stringify({ ok: false, error: failedClosed ? "Сервис доступа временно недоступен." : "Слишком много запросов. Повторите позже." }), {
    status: failedClosed ? 503 : 429,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "Retry-After": String(Math.max(1, retryAfter)) },
  });
}
