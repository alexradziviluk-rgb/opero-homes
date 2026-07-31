import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStaffApiAuth } from "@/lib/supabase/api-auth";

async function loadBookingById(
  supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>,
  organizationId: string,
  id: string,
) {
  return supabase
    .from("bookings")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", id)
    .maybeSingle();
}

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

  const { data: booking, error } = await loadBookingById(supabase, organizationId, id);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message, code: error.code }, { status: 422 });
  }

  if (!booking) {
    return NextResponse.json({ ok: false, error: "Booking not found" }, { status: 404 });
  }

  const { data: apartment } = await supabase
    .from("apartments")
    .select("id,title:name")
    .eq("id", booking.apartment_id)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    data: {
      id: booking.id,
      apartmentId: booking.apartment_id,
      apartmentTitle: apartment?.title ?? "Объект",
      clientId: booking.client_id ?? null,
      guestName: booking.guest_name ?? booking.customer_name ?? "Гость",
      guestPhone: "guest_phone" in booking ? booking.guest_phone : null,
      guestEmail: "guest_email" in booking ? booking.guest_email : null,
      checkIn: booking.check_in,
      checkOut: booking.check_out,
      guests: "guests" in booking && typeof booking.guests === "number" ? booking.guests : 1,
      totalAmount: booking.total_amount,
      status: booking.status,
      paymentStatus: booking.payment_status,
      source: booking.source,
      notes: "notes" in booking ? booking.notes : null,
      createdAt: booking.created_at,
      updatedAt: booking.updated_at,
    },
  });
}
