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
  const { data, error } = await supabase.rpc("list_staff_availability_blocks", { target_organization_id: auth.context.organization.id, target_apartment_id: apartmentId || null });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 422 });
  return NextResponse.json({ ok: true, data: data ?? [] });
}
