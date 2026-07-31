import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStaffApiAuth } from "@/lib/supabase/api-auth";

async function loadBookingsForOrganization(supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>, organizationId: string) {
  return supabase
    .from("bookings")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });
}

export async function GET() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Supabase is not configured" }, { status: 500 });
  }

  const auth = await requireStaffApiAuth();
  if (!auth.ok) {
    return auth.response;
  }

  const organizationId = auth.context.organization.id;

  const { data: bookings, error } = await loadBookingsForOrganization(supabase, organizationId);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message, code: error.code }, { status: 422 });
  }

  const apartmentIds = Array.from(new Set((bookings ?? []).map((booking) => booking.apartment_id).filter(Boolean)));
  const apartmentTitleById = new Map<string, string>();

  if (apartmentIds.length > 0) {
    const { data: apartments } = await supabase
      .from("apartments")
      .select("id,title:name")
      .in("id", apartmentIds as string[]);

    (apartments ?? []).forEach((apartment) => {
      apartmentTitleById.set(apartment.id as string, (apartment.title as string | null) ?? "Объект");
    });
  }

  return NextResponse.json({
    ok: true,
    data: (bookings ?? []).map((booking) => ({
      id: booking.id,
      apartmentId: booking.apartment_id,
      apartmentTitle: booking.apartment_id ? apartmentTitleById.get(booking.apartment_id) ?? "Объект" : "Объект",
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
    })),
  });
}
