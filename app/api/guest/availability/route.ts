import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AvailabilityBooking } from "@/lib/bookings/availability";

type AvailabilityRow = {
  id: string;
  apartment_id: string;
  check_in: string;
  check_out: string;
  status: AvailabilityBooking["status"];
};

export async function GET(request: Request) {
  const apartmentId = new URL(request.url).searchParams.get("apartmentId")?.trim() ?? "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(apartmentId)) {
    return NextResponse.json({ ok: false, error: "Invalid apartment id." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const { data, error } = await supabase.rpc("get_public_apartment_booking_periods", {
    target_apartment_id: apartmentId,
  });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 422 });
  }

  const periods: AvailabilityBooking[] = ((data ?? []) as AvailabilityRow[]).map((row) => ({
    id: row.id,
    apartmentId: row.apartment_id,
    checkIn: row.check_in,
    checkOut: row.check_out,
    status: row.status,
  }));

  return NextResponse.json({ ok: true, data: periods });
}