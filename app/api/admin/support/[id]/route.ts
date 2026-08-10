import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { requireStaffApiAuth } from "@/lib/supabase/api-auth";
import { effectiveConversationState } from "@/lib/support/legacy-conversation";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaffApiAuth(); if (!auth.ok) return auth.response;
  const supabase = createSupabaseServiceRoleClient(); if (!supabase) return NextResponse.json({ ok: false, error: "Supabase is not configured" }, { status: 503 });
  const { id } = await params;
  const { data, error } = await supabase.from("support_tickets").select("public_number,requester_user_id,anonymous_access_revoked_at,requester_name,requester_email,requester_phone,status,conversation_state,conversation_summary,assigned_to,manager_joined_at,first_response_at,resolved_at,closed_at,priority,subject,customer_message,ai_summary,delivery_status,apartment_id,booking_id,created_at,updated_at,support_messages(sender_type,message,message_type,source,is_internal,created_at)").eq("public_number", id).or(`organization_id.eq.${auth.context.organization.id},organization_id.is.null`).maybeSingle();
  if (error || !data) return NextResponse.json({ ok: false, error: "Обращение не найдено" }, { status: 404 });
  const { data: ai } = await supabase.from("ai_operation_audit").select("intent,action,action_result,ticket_reference,task_reference,fallback_used,created_at").eq("ticket_reference", id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return NextResponse.json({ ok: true, data: { ...data, conversation_state: effectiveConversationState(data) ?? data.conversation_state, ai: ai ?? null } });
}
