import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePropertyOwnerApiAuth, requireStaffApiAuth } from "@/lib/supabase/api-auth";
import type { CanonicalAvailabilityKind } from "@/lib/bookings/canonical-availability";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type RouteContext = { params: Promise<{ id: string }> };

type Period = { id: string; apartmentId: string; startDate: string; endDate: string; kind: CanonicalAvailabilityKind; status: string };

function response(data: Period[]) {
  return NextResponse.json({ ok: true, data });
}

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!UUID.test(id)) return NextResponse.json({ ok: false, error: "Invalid apartment id" }, { status: 400 });
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase is not configured" }, { status: 500 });

  const staff = await requireStaffApiAuth();
  if (staff.ok) {
    const [bookings, blocks] = await Promise.all([
      supabase.from("bookings").select("id,apartment_id,check_in_date,check_out_date,status").eq("organization_id", staff.context.organization.id).eq("apartment_id", id).in("status", ["pending", "confirmed", "checked_in"]),
      supabase.rpc("list_staff_availability_blocks", { target_organization_id: staff.context.organization.id, target_apartment_id: id }),
    ]);
    if (bookings.error) return NextResponse.json({ ok: false, error: bookings.error.message }, { status: 422 });
    if (blocks.error) return NextResponse.json({ ok: false, error: blocks.error.message }, { status: 422 });
    return response([
      ...((bookings.data ?? []) as Array<{ id: string; apartment_id: string; check_in_date: string; check_out_date: string; status: string }>).map((booking) => ({ id: booking.id, apartmentId: booking.apartment_id, startDate: booking.check_in_date, endDate: booking.check_out_date, kind: "customer_booking" as const, status: booking.status })),
      ...((blocks.data ?? []) as Array<{ id: string; apartment_id: string; start_date: string; end_date: string; status: string; block_source: string }>).map((block) => ({ id: block.id, apartmentId: block.apartment_id, startDate: block.start_date, endDate: block.end_date, kind: block.block_source === "owner" ? "owner_block" as const : "staff_block" as const, status: block.status })),
    ]);
  }

  const owner = await requirePropertyOwnerApiAuth();
  if (owner.ok) {
    const { data, error } = await supabase.rpc("get_property_owner_occupied_periods", { target_apartment_id: id });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 422 });
    return response(((data ?? []) as Array<{ apartment_id: string; start_date: string; end_date: string; status: string }>).map((period, index) => ({
      id: `${period.status}-${period.start_date}-${index}`,
      apartmentId: period.apartment_id,
      startDate: period.start_date,
      endDate: period.end_date,
      kind: period.status === "blocked" ? "owner_block" : "customer_booking",
      status: period.status,
    })));
  }

  const { data, error } = await supabase.rpc("get_public_apartment_booking_periods", { target_apartment_id: id });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 422 });
  return response(((data ?? []) as Array<{ id: string; apartment_id: string; check_in: string; check_out: string; status: string }>).map((period) => ({
    id: period.id,
    apartmentId: period.apartment_id,
    startDate: period.check_in,
    endDate: period.check_out,
    kind: period.status === "blocked" ? "staff_block" : "customer_booking",
    status: period.status,
  })));
}
