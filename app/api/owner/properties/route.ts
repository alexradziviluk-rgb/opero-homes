import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePropertyOwnerApiAuth } from "@/lib/supabase/api-auth";

type PropertyRow = { id: string; name: string | null; title: string | null; city: string | null; district: string | null; address: string | null; publication_status: string | null; cover_photo_url: string | null };
type PeriodRow = { start_date: string; end_date: string; status: string };

export async function GET() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase is not configured" }, { status: 500 });

  const auth = await requirePropertyOwnerApiAuth();
  if (!auth.ok) return auth.response;

  const [{ data, error }, { data: profile }] = await Promise.all([
    supabase.rpc("get_property_owner_properties"),
    supabase.from("profiles").select("owner_public_number").eq("id", auth.context.authUserId).maybeSingle(),
  ]);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 422 });

  const properties = await Promise.all(((data ?? []) as PropertyRow[]).map(async (property) => {
    const periods = await supabase.rpc("get_property_owner_occupied_periods", { target_apartment_id: property.id });
    return {
      id: property.id,
      name: property.name || property.title || "Квартира",
      city: property.city,
      district: property.district,
      address: property.address,
      coverPhotoUrl: property.cover_photo_url,
      upcomingOccupied: (periods.data ?? [])
        .filter((period: PeriodRow) => period.start_date >= new Date().toISOString().slice(0, 10))
        .slice(0, 3)
        .map((period: PeriodRow) => ({ startDate: period.start_date, endDate: period.end_date, status: period.status })),
    };
  }));

  return NextResponse.json({ ok: true, ownerPublicNumber: profile?.owner_public_number ?? null, data: properties });
}
