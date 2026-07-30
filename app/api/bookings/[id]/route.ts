import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStaffApiAuth } from "@/lib/supabase/api-auth";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Supabase is not configured" }, { status: 500 });
  }

  const auth = await requireStaffApiAuth();
  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await context.params;
  const organizationId = auth.context.organization.id;

  const { data: booking, error } = await supabase
    .from("bookings")
    .select("id,organization_id,apartment_id,client_id,guest_name,guest_phone,guest_email,check_in,check_out,guests,total_amount,status,payment_status,source,notes,created_at,updated_at")
    .eq("organization_id", organizationId)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message, code: error.code }, { status: 422 });
  }

  if (!booking) {
    return NextResponse.json({ ok: false, error: "Booking not found" }, { status: 404 });
  }

  const { data: apartment } = await supabase
    .from("apartments")
    .select("id,title")
    .eq("id", booking.apartment_id)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    data: {
      id: booking.id,
      apartmentId: booking.apartment_id,
      apartmentTitle: apartment?.title ?? "Объект",
      clientId: booking.client_id,
      guestName: booking.guest_name,
      guestPhone: booking.guest_phone,
      guestEmail: booking.guest_email,
      checkIn: booking.check_in,
      checkOut: booking.check_out,
      guests: booking.guests,
      totalAmount: booking.total_amount,
      status: booking.status,
      paymentStatus: booking.payment_status,
      source: booking.source,
      notes: booking.notes,
      createdAt: booking.created_at,
      updatedAt: booking.updated_at,
    },
  });
}
