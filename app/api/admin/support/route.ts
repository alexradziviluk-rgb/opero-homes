import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStaffApiAuth } from "@/lib/supabase/api-auth";
import { getRoleCodeFromContext, isManagerRoleCode } from "@/lib/supabase/role-code";

export async function GET(request: Request) {
  const auth = await requireStaffApiAuth(); if (!auth.ok) return auth.response;
  const supabase = await createSupabaseServerClient(); if (!supabase) return NextResponse.json({ ok: false, error: "Supabase is not configured" }, { status: 503 });
  const url = new URL(request.url); const status = url.searchParams.get("status");
  let query = supabase.from("support_tickets").select("public_number,requester_name,requester_language,category,priority,status,subject,customer_message,ai_summary,delivery_status,created_at,updated_at").order("created_at", { ascending: false }).limit(100);
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 422 });
  return NextResponse.json({ ok: true, data });
}

export async function PATCH(request: Request) {
  const auth = await requireStaffApiAuth(); if (!auth.ok) return auth.response;
  const supabase = await createSupabaseServerClient(); if (!supabase) return NextResponse.json({ ok: false, error: "Supabase is not configured" }, { status: 503 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const publicNumber = typeof body?.publicNumber === "string" ? body.publicNumber.trim() : ""; const status = typeof body?.status === "string" ? body.status : ""; const message = typeof body?.message === "string" ? body.message.trim().slice(0, 2000) : "";
  const allowed = ["assigned", "in_progress", "waiting_for_client", "resolved", "closed", "cancelled"];
  if (!/^OP-\d{4,}$/.test(publicNumber) || (!allowed.includes(status) && !message)) return NextResponse.json({ ok: false, error: "Invalid support update" }, { status: 400 });
    const { data: ticket, error: ticketError } = await supabase.from("support_tickets").select("id").eq("public_number", publicNumber).maybeSingle();
    if (ticketError || !ticket) return NextResponse.json({ ok: false, error: "Обращение не найдено" }, { status: 404 });
    const id = ticket.id;
  const role = getRoleCodeFromContext(auth.context);
  if (!isManagerRoleCode(role) && status !== "in_progress" && !message) return NextResponse.json({ ok: false, error: "Insufficient permissions" }, { status: 403 });
  if (message) {
    const { error: messageError } = await supabase.from("support_messages").insert({ ticket_id: id, sender_type: isManagerRoleCode(role) ? "manager" : "employee", sender_user_id: auth.context.authUserId, message, is_internal: false });
    if (messageError) return NextResponse.json({ ok: false, error: messageError.message }, { status: 422 });
    await supabase.from("support_audit_log").insert({ ticket_id: id, actor_type: role, actor_user_id: auth.context.authUserId, action: "message_added", safe_metadata: {} });
  }
  if (!status) return NextResponse.json({ ok: true });
  const { data, error } = await supabase.from("support_tickets").update({ status, assigned_to: status === "assigned" || status === "in_progress" ? auth.context.authUserId : undefined, resolved_at: status === "resolved" ? new Date().toISOString() : undefined, closed_at: status === "closed" ? new Date().toISOString() : undefined }).eq("id", id).select("public_number,status,updated_at").single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 422 });
  await supabase.from("support_audit_log").insert({ ticket_id: id, actor_type: role, actor_user_id: auth.context.authUserId, action: `status_${status}`, safe_metadata: {} });
  return NextResponse.json({ ok: true, data });
}
