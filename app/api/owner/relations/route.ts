import { NextResponse } from "next/server";
import { requireStaffApiAuth } from "@/lib/supabase/api-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type OwnerAccessRow = { user_id: string | null; owner_public_number: string | null; status: string; created_at: string; owner_name: string | null; owner_email: string | null; owner_phone: string | null };

export async function GET(request: Request) {
  const auth = await requireStaffApiAuth();
  if (!auth.ok) return auth.response;
  const apartmentId = new URL(request.url).searchParams.get("apartmentId") ?? "";
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase is not configured" }, { status: 500 });
  const { data, error } = await supabase.rpc("list_property_owner_access_for_manager", { target_apartment_id: apartmentId });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 422 });
  return NextResponse.json({ ok: true, data: ((data ?? []) as OwnerAccessRow[]).map((row) => { const [firstName = "", ...lastNameParts] = String(row.owner_name ?? "").split(/\s+/); return { userId: row.user_id, ownerPublicNumber: row.owner_public_number ?? null, status: row.status, createdAt: row.created_at, firstName, lastName: lastNameParts.join(" "), email: row.owner_email ?? "", phone: row.owner_phone ?? null }; }) });
}
