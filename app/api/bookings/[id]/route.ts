import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStaffApiAuth } from "@/lib/supabase/api-auth";
import { normalizeRoleCode } from "@/lib/supabase/role-code";

const BOOKING_STATUSES = new Set(["pending", "confirmed", "rejected", "checked_in", "checked_out", "cancelled"]);
const MANAGER_ROLES = new Set(["owner", "manager"]);

function error(status: number, message: string, code?: string) {
  return NextResponse.json({ ok: false, error: message, code }, { status });
}

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

  const { data: guest } = booking.primary_guest_id
    ? await supabase
        .from("guests")
        .select("first_name,last_name,phone,email")
        .eq("id", booking.primary_guest_id)
        .maybeSingle()
    : { data: null };

  return NextResponse.json({
    ok: true,
    data: {
      id: booking.id,
      bookingNumber: booking.booking_number ?? `Бронь ${String(booking.id).slice(0, 8)}`,
      apartmentId: booking.apartment_id,
      apartmentTitle: apartment?.title ?? "Объект",
      clientId: booking.client_id ?? null,
      guestName: booking.guest_name ?? booking.customer_name ?? (`${guest?.first_name ?? ""} ${guest?.last_name ?? ""}`.trim() || "Гость"),
      guestPhone: ("guest_phone" in booking ? booking.guest_phone : null) ?? guest?.phone ?? null,
      guestEmail: ("guest_email" in booking ? booking.guest_email : null) ?? guest?.email ?? null,
      checkIn: booking.check_in ?? booking.check_in_date,
      checkOut: booking.check_out ?? booking.check_out_date,
      checkInTime: booking.check_in_time ?? "15:00",
      checkOutTime: booking.check_out_time ?? "11:00",
      guests: typeof booking.guests === "number" ? booking.guests : typeof booking.adults === "number" ? booking.adults : 1,
      rentalType: booking.rental_type ?? "daily",
      pricePerPeriod: booking.price_per_period ?? booking.nightly_rate ?? 0,
      accommodationAmount: booking.accommodation_amount ?? booking.accommodation_total ?? 0,
      cleaningFee: booking.cleaning_fee ?? 0,
      deposit: booking.deposit ?? booking.security_deposit ?? 0,
      discount: booking.discount ?? 0,
      totalAmount: booking.total_amount,
      paidAmount: booking.paid_amount ?? booking.amount_paid ?? 0,
      status: booking.status,
      paymentStatus: booking.payment_status,
      source: booking.source,
      notes: "notes" in booking ? booking.notes : booking.guest_comment ?? null,
      createdAt: booking.created_at,
      updatedAt: booking.updated_at,
    },
  });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return error(500, "Supabase is not configured");

  const auth = await requireStaffApiAuth();
  if (!auth.ok) return auth.response;
  if (!MANAGER_ROLES.has(normalizeRoleCode(auth.context.organizationMember.role_code))) {
    return error(403, "Insufficient permissions");
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return error(400, "Invalid request body");

  const { data: existing, error: loadError } = await loadBookingById(supabase, auth.context.organization.id, id);
  if (loadError) return error(422, loadError.message, loadError.code);
  if (!existing) return error(404, "Booking not found");

  const status = typeof body.status === "string" ? body.status.trim() : existing.status;
  if (!BOOKING_STATUSES.has(status)) return error(400, "Invalid booking status");

  const isStatusOnly = Object.keys(body).every((key) => key === "status" || key === "totalAmount");
  const updateRow: Record<string, string> = { status, updated_at: new Date().toISOString() };

  if (typeof body.totalAmount === "number" && Number.isFinite(body.totalAmount) && status === "pending") {
    updateRow.total_amount = String(Math.max(0, body.totalAmount));
  }

  if (!isStatusOnly) {
    const guestName = typeof body.guestName === "string" ? body.guestName.trim() : "";
    const guestPhone = typeof body.guestPhone === "string" ? body.guestPhone.trim() : "";
    const guestEmail = typeof body.guestEmail === "string" ? body.guestEmail.trim() : "";
    const checkIn = typeof body.checkIn === "string" ? body.checkIn : "";
    const checkOut = typeof body.checkOut === "string" ? body.checkOut : "";
    const checkInTime = typeof body.checkInTime === "string" ? body.checkInTime : "15:00";
    const checkOutTime = typeof body.checkOutTime === "string" ? body.checkOutTime : "11:00";
    const notes = typeof body.notes === "string" ? body.notes.trim() : "";
    const totalAmount = typeof body.totalAmount === "number" && Number.isFinite(body.totalAmount) ? Math.max(0, body.totalAmount) : null;

    if (!guestName || !checkIn || !checkOut || checkOut <= checkIn) return error(400, "Invalid booking details");
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(checkInTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(checkOutTime)) {
      return error(400, "Invalid check-in or check-out time");
    }

    const dateColumns = "check_in_date" in existing
      ? { checkIn: "check_in_date", checkOut: "check_out_date" }
      : { checkIn: "check_in", checkOut: "check_out" };
    const { data: conflict, error: conflictError } = await supabase
      .from("bookings")
      .select(`id,${dateColumns.checkIn},${dateColumns.checkOut}`)
      .eq("organization_id", auth.context.organization.id)
      .eq("apartment_id", existing.apartment_id)
      .neq("id", id)
      .neq("status", "cancelled")
      .lt(dateColumns.checkIn, checkOut)
      .gt(dateColumns.checkOut, checkIn)
      .limit(1)
      .maybeSingle();

    if (conflictError) return error(422, conflictError.message, conflictError.code);
    if (conflict) return error(409, "Booking dates overlap an existing booking", "booking_conflict");

    Object.assign(updateRow, {
      [dateColumns.checkIn]: checkIn,
      [dateColumns.checkOut]: checkOut,
      guest_name: guestName,
      guest_phone: guestPhone,
      guest_email: guestEmail,
      check_in_time: checkInTime,
      check_out_time: checkOutTime,
      notes,
    });
    if (totalAmount !== null && status === "pending") {
      updateRow.total_amount = String(totalAmount);
    }
  }

  const { data, error: updateError } = await supabase
    .from("bookings")
    .update(updateRow)
    .eq("organization_id", auth.context.organization.id)
    .eq("id", id)
    .select("id,status,updated_at")
    .maybeSingle();

  if (updateError) return error(422, updateError.message, updateError.code);
  if (!data) return error(404, "Booking not found");
  return NextResponse.json({ ok: true, data });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return error(500, "Supabase is not configured");

  const auth = await requireStaffApiAuth();
  if (!auth.ok) return auth.response;
  if (!MANAGER_ROLES.has(normalizeRoleCode(auth.context.organizationMember.role_code))) {
    return error(403, "Insufficient permissions");
  }

  const { id } = await context.params;
  const { data, error: deleteError } = await supabase
    .from("bookings")
    .delete()
    .eq("organization_id", auth.context.organization.id)
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (deleteError) return error(422, deleteError.message, deleteError.code);
  if (!data) return error(404, "Booking not found");
  return NextResponse.json({ ok: true });
}
