import { NextResponse } from "next/server";
import { requireStaffApiAuth } from "@/lib/supabase/api-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const auth = await requireStaffApiAuth();
  if (!auth.ok) return auth.response;
  const apartmentId = new URL(request.url).searchParams.get("apartmentId") ?? "";
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase is not configured" }, { status: 500 });
  const { data, error } = await supabase.from("apartment_owner_access").select("user_id,status,created_at,owner_name,owner_email,owner_phone").eq("organization_id", auth.context.organization.id).eq("apartment_id", apartmentId).in("status", ["invited", "active", "paused", "revoked"]).order("created_at", { ascending: true });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 422 });
  return NextResponse.json({ ok: true, data: (data ?? []).map((row) => { const [firstName = "", ...lastNameParts] = String(row.owner_name ?? "").split(/\s+/); return { userId: row.user_id, status: row.status, createdAt: row.created_at, firstName, lastName: lastNameParts.join(" "), email: row.owner_email ?? "", phone: row.owner_phone ?? null }; }) });
}
