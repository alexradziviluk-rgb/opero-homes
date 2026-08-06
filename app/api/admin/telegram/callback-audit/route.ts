import "server-only";

import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { checkWebhookSetupRateLimit, requireWebhookAdminApiAuth } from "@/lib/telegram/webhook-admin-auth";

type CallbackAuditRow = { action?: unknown; safe_metadata?: unknown; created_at?: unknown };

function safeText(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value.slice(0, 80) : null;
}

export async function GET(request: Request) {
  const auth = await requireWebhookAdminApiAuth();
  if (!auth.ok) return auth.response;
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!checkWebhookSetupRateLimit(`callback-audit:${auth.context.authUserId}:${ip}`)) return NextResponse.json({ ok: false, error: "Rate limit exceeded" }, { status: 429 });
  const publicNumber = new URL(request.url).searchParams.get("ticket")?.trim() || "";
  if (!/^OP-\d{4,}$/.test(publicNumber)) return NextResponse.json({ ok: false, error: "Invalid ticket" }, { status: 400 });
  const supabase = createSupabaseServiceRoleClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "Callback audit unavailable" }, { status: 503 });
  const { data: ticket, error: ticketError } = await supabase.from("support_tickets").select("id,public_number,status").eq("public_number", publicNumber).maybeSingle();
  if (ticketError || !ticket) return NextResponse.json({ ok: false, error: "Ticket not found" }, { status: 404 });
  const { data: callbackRows, error: callbackError } = await supabase.from("support_audit_log").select("action,safe_metadata,created_at").eq("ticket_id", ticket.id).like("action", "telegram_callback%").order("created_at", { ascending: true });
  const { count: auditEntriesCount, error: auditError } = await supabase.from("support_audit_log").select("id", { count: "exact", head: true }).eq("ticket_id", ticket.id);
  if (callbackError || auditError) return NextResponse.json({ ok: false, error: "Callback audit unavailable" }, { status: 503 });
  const rows = (callbackRows ?? []) as CallbackAuditRow[];
  const last = rows.at(-1);
  const metadata = last?.safe_metadata && typeof last.safe_metadata === "object" ? last.safe_metadata as Record<string, unknown> : {};
  const replayCount = rows.filter((row) => row.action === "telegram_callback_replay").length;
  return NextResponse.json({
    ok: true,
    data: {
      public_number: ticket.public_number,
      current_status: ticket.status,
      callback_events_count: rows.filter((row) => row.action === "telegram_callback").length,
      last_callback_action: safeText(metadata.action),
      last_callback_result: safeText(metadata.result),
      last_callback_at: safeText(last?.created_at),
      replay_count: replayCount,
      last_update_id_hash: safeText(metadata.update_id_hash),
      audit_entries_count: auditEntriesCount ?? 0,
    },
  }, { headers: { "Cache-Control": "no-store" } });
}