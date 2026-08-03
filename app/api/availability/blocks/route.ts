import { NextResponse } from "next/server";
import { requireStaffApiAuth } from "@/lib/supabase/api-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const auth = await requireStaffApiAuth();
  if (!auth.ok) return auth.response;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase is not configured" }, { status: 500 });
  const params = new URL(request.url).searchParams;
  const apartmentId = params.get("apartmentId")?.trim();
  let query = supabase.from("availability_blocks").select("id,apartment_id,start_date,end_date,status,reason_code,private_note,created_by,created_by_role,created_at,updated_at").eq("organization_id", auth.context.organization.id).eq("status", "active").order("start_date", { ascending: true });
  if (apartmentId) query = query.eq("apartment_id", apartmentId);
  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 422 });
  return NextResponse.json({ ok: true, data: data ?? [] });
}
