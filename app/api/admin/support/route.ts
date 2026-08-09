import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStaffApiAuth } from "@/lib/supabase/api-auth";
import { getRoleCodeFromContext, isManagerRoleCode } from "@/lib/supabase/role-code";
import { publishConversationEvent } from "@/lib/support/realtime";
import { effectiveConversationState } from "@/lib/support/legacy-conversation";

export async function GET(request: Request) {
  const auth = await requireStaffApiAuth(); if (!auth.ok) return auth.response;
  const supabase = await createSupabaseServerClient(); if (!supabase) return NextResponse.json({ ok: false, error: "Supabase is not configured" }, { status: 503 });
  const url = new URL(request.url); const status = url.searchParams.get("status");
  let query = supabase.from("support_tickets").select("public_number,requester_name,requester_language,category,priority,status,conversation_state,conversation_summary,assigned_to,manager_joined_at,first_response_at,resolved_at,closed_at,subject,customer_message,ai_summary,delivery_status,created_at,updated_at").order("created_at", { ascending: false }).limit(100);
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 422 });
  return NextResponse.json({ ok: true, data: (data ?? []).map((ticket) => ({ ...ticket, conversation_state: effectiveConversationState(ticket) ?? ticket.conversation_state })) });
}

export async function PATCH(request: Request) {
  const auth = await requireStaffApiAuth(); if (!auth.ok) return auth.response;
  const supabase = await createSupabaseServerClient(); if (!supabase) return NextResponse.json({ ok: false, error: "Supabase is not configured" }, { status: 503 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const publicNumber = typeof body?.publicNumber === "string" ? body.publicNumber.trim() : ""; const status = typeof body?.status === "string" ? body.status : ""; const message = typeof body?.message === "string" ? body.message.trim().slice(0, 2000) : "";
  const action = typeof body?.action === "string" ? body.action : "";
  const clientMessageId = typeof body?.clientMessageId === "string" ? body.clientMessageId.trim().slice(0, 120) : "";
  const allowed = ["assigned", "in_progress", "waiting_for_client", "resolved", "closed", "cancelled"];
  if (!/^OP-\d{4,}$/.test(publicNumber) || (!allowed.includes(status) && !message && !["accept", "transfer", "internal_note", "revoke_anonymous"].includes(action))) return NextResponse.json({ ok: false, error: "Invalid support update" }, { status: 400 });
    const { data: ticket, error: ticketError } = await supabase.from("support_tickets").select("id,organization_id,conversation_state,assigned_to,public_number").eq("public_number", publicNumber).maybeSingle();
    if (ticketError || !ticket) return NextResponse.json({ ok: false, error: "Обращение не найдено" }, { status: 404 });
    const id = ticket.id;
  const role = getRoleCodeFromContext(auth.context);
  const serviceSupabase = (await import("@/lib/supabase/server")).createSupabaseServiceRoleClient();
  if (action === "accept") {
    if (!isManagerRoleCode(role)) return NextResponse.json({ ok: false, error: "Manager access required" }, { status: 403 });
    if (!serviceSupabase) return NextResponse.json({ ok: false, error: "Supabase is not configured" }, { status: 503 });
    const { data, error } = await serviceSupabase.rpc("support_accept_conversation", { target_ticket_id: id, manager_user_id: auth.context.authUserId });
    if (error) return NextResponse.json({ ok: false, error: "Не удалось принять диалог." }, { status: 422 });
    const applied = Array.isArray(data) && data.length > 0;
    if (applied) {
      await serviceSupabase.from("support_audit_log").insert({ ticket_id: id, actor_type: role, actor_user_id: auth.context.authUserId, action: "conversation_accepted", safe_metadata: {} });
      await publishConversationEvent({ kind: "state", conversation: publicNumber, state: "manager_active", createdAt: new Date().toISOString() });
    }
    return NextResponse.json({ ok: true, result: applied ? "applied" : "noop", conversationState: applied ? "manager_active" : ticket.conversation_state });
  }
  if (action === "transfer") {
    const targetUserId = typeof body?.targetUserId === "string" ? body.targetUserId : "";
    if (!isManagerRoleCode(role) || !targetUserId || !serviceSupabase) return NextResponse.json({ ok: false, error: "Insufficient permissions" }, { status: 403 });
    const { data: target } = await serviceSupabase.from("organization_members").select("user_id").eq("organization_id", auth.context.organization.id).eq("user_id", targetUserId).eq("status", "active").in("role_code", ["owner", "manager"]).maybeSingle();
    if (!target) return NextResponse.json({ ok: false, error: "Менеджер не найден" }, { status: 404 });
    const { data, error } = await serviceSupabase.rpc("support_transfer_conversation", { target_ticket_id: id, from_user_id: auth.context.authUserId, to_user_id: targetUserId });
    if (error) return NextResponse.json({ ok: false, error: "Не удалось передать диалог." }, { status: 422 });
    const applied = Array.isArray(data) && data.length > 0;
    if (applied) await serviceSupabase.from("support_audit_log").insert({ ticket_id: id, actor_type: role, actor_user_id: auth.context.authUserId, action: "conversation_transferred", safe_metadata: { target_staff: "redacted" } });
    return NextResponse.json({ ok: true, result: applied ? "applied" : "noop" });
  }
  if (action === "revoke_anonymous") {
    if (!isManagerRoleCode(role) || !serviceSupabase) return NextResponse.json({ ok: false, error: "Insufficient permissions" }, { status: 403 });
    const { data, error } = await serviceSupabase.rpc("support_revoke_anonymous_access", { target_ticket_id: id, actor_user_id: auth.context.authUserId, revoke_reason: typeof body?.reason === "string" ? body.reason : "manual" });
    if (error) return NextResponse.json({ ok: false, error: "Не удалось отозвать ссылку доступа." }, { status: 422 });
    const applied = Array.isArray(data) && data.length > 0;
    return NextResponse.json({ ok: true, result: applied ? "applied" : "noop", message: "Ссылка доступа отозвана." });
  }
  if ((status === "resolved" || status === "closed") && serviceSupabase) {
    if (!isManagerRoleCode(role)) return NextResponse.json({ ok: false, error: "Manager access required" }, { status: 403 });
    const expectedState = status === "resolved" ? "manager_active" : "resolved";
    const { data, error } = await serviceSupabase.rpc("support_transition_conversation", { target_ticket_id: id, expected_state: expectedState, next_state: status, actor_user_id: auth.context.authUserId });
    if (error) return NextResponse.json({ ok: false, error: "Не удалось изменить состояние диалога." }, { status: 422 });
    const applied = Array.isArray(data) && data.length > 0;
    if (applied) {
      await serviceSupabase.from("support_audit_log").insert({ ticket_id: id, actor_type: role, actor_user_id: auth.context.authUserId, action: `conversation_${status}`, safe_metadata: {} });
      if (ticket.organization_id) {
        try {
          await (await import("@/lib/support/notifications")).notifyStaff({ supabase: serviceSupabase, organizationId: ticket.organization_id, ticketId: id, publicNumber: ticket.public_number, eventType: "support_conversation_closed", title: "Обращение закрыто", message: `${ticket.public_number}: обращение закрыто менеджером.`, actionUrl: `${(process.env.NEXT_PUBLIC_SITE_URL || "https://operohq.netlify.app").replace(/\/$/, "")}/admin/support/${encodeURIComponent(ticket.public_number)}`, idempotencyKey: `support:${id}:closed`, priority: "normal", preferredUserId: ticket.assigned_to });
        } catch (notificationError) {
          console.error("[support-notification]", notificationError instanceof Error ? notificationError.message : "Unable to persist support close notification");
        }
      }
      await publishConversationEvent({ kind: "state", conversation: publicNumber, state: status, createdAt: new Date().toISOString() });
    }
    return NextResponse.json({ ok: true, result: applied ? "applied" : "noop", conversationState: applied ? status : ticket.conversation_state });
  }
  if (!isManagerRoleCode(role) && status !== "in_progress" && !message) return NextResponse.json({ ok: false, error: "Insufficient permissions" }, { status: 403 });
  if (message) {
    if (action === "internal_note" && !isManagerRoleCode(role)) return NextResponse.json({ ok: false, error: "Insufficient permissions" }, { status: 403 });
    if (ticket.conversation_state === "manager_active" && ticket.assigned_to !== auth.context.authUserId && !isManagerRoleCode(role)) return NextResponse.json({ ok: false, error: "Диалог назначен другому сотруднику" }, { status: 403 });
    const isInternal = action === "internal_note";
    const { error: messageError } = await supabase.from("support_messages").insert({ ticket_id: id, client_message_id: clientMessageId || null, sender_type: isManagerRoleCode(role) ? "manager" : "employee", sender_user_id: auth.context.authUserId, message, message_type: isInternal ? "internal_note" : "text", content_type: "text", source: "web", is_internal: isInternal });
    if (messageError?.code === "23505") {
      const { data: existing } = await supabase.from("support_messages").select("created_at,is_internal").eq("ticket_id", id).eq("client_message_id", clientMessageId).maybeSingle();
      return NextResponse.json({ ok: true, result: "duplicate", createdAt: existing?.created_at ?? null, internal: Boolean(existing?.is_internal), clientMessageId });
    }
    if (messageError) return NextResponse.json({ ok: false, error: "Не удалось сохранить сообщение." }, { status: 422 });
    await supabase.from("support_audit_log").insert({ ticket_id: id, actor_type: role, actor_user_id: auth.context.authUserId, action: isInternal ? "internal_note_added" : "message_added", safe_metadata: { source: "web", message_type: isInternal ? "internal_note" : "text" } });
    await supabase.from("support_tickets").update({ first_response_at: ticket.conversation_state === "manager_active" ? new Date().toISOString() : undefined }).eq("id", id).is("first_response_at", null);
    if (!isInternal) await publishConversationEvent({ kind: "message", conversation: publicNumber, senderType: isManagerRoleCode(role) ? "manager" : "employee", message, messageType: "text", source: "web", clientMessageId: clientMessageId || undefined, createdAt: new Date().toISOString() });
  }
  if (!status) return NextResponse.json({ ok: true });
  const { data, error } = await supabase.from("support_tickets").update({ status, assigned_to: status === "assigned" || status === "in_progress" ? auth.context.authUserId : undefined, resolved_at: status === "resolved" ? new Date().toISOString() : undefined, closed_at: status === "closed" ? new Date().toISOString() : undefined }).eq("id", id).select("public_number,status,updated_at").single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 422 });
  await supabase.from("support_audit_log").insert({ ticket_id: id, actor_type: role, actor_user_id: auth.context.authUserId, action: `status_${status}`, safe_metadata: {} });
  return NextResponse.json({ ok: true, data });
}
