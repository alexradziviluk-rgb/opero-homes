import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStaffApiAuth } from "@/lib/supabase/api-auth";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaffApiAuth(); if (!auth.ok) return auth.response;
  const supabase = await createSupabaseServerClient(); if (!supabase) return NextResponse.json({ ok: false, error: "Supabase is not configured" }, { status: 503 });
  const { id } = await params;
  const { data, error } = await supabase.from("support_tickets").select("public_number,requester_name,requester_email,requester_phone,status,priority,subject,customer_message,ai_summary,delivery_status,created_at,updated_at,support_messages(sender_type,message,is_internal,created_at)").eq("public_number", id).maybeSingle();
  if (error || !data) return NextResponse.json({ ok: false, error: "Обращение не найдено" }, { status: 404 });
  return NextResponse.json({ ok: true, data });
}
