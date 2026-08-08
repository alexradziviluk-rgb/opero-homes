import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStaffApiAuth } from "@/lib/supabase/api-auth";
import { isStaffRoleCode, normalizeRoleCode } from "@/lib/supabase/role-code";
import { createBookingNotifications } from "@/lib/notifications/service";
import { processNotificationQueue } from "@/lib/notifications/queue";
import { hasPastBookingDate } from "@/lib/bookings/date-validation";
import { formatBookingReference } from "@/lib/bookings/booking-reference";

const BOOKING_STATUSES = new Set(["pending", "confirmed", "checked_in", "checked_out", "cancelled"]);
const BOOKING_REQUEST_STATUSES = new Set(["pending", "confirmed", "rejected", "cancelled"]);

function error(status: number, message: string, code?: string) {
  return NextResponse.json({ ok: false, error: message, code }, { status });
}

async function notifyBookingChange(params: {
  supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;
  actorUserId: string;
  organizationId: string;
  booking: Record<string, unknown>;
  eventType: "booking_confirmed" | "booking_cancelled" | "booking_changed";
  idempotencyKey: string;
}) {
  const { supabase, actorUserId, organizationId, booking, eventType, idempotencyKey } = params;
  const apartmentId = String(booking.apartment_id ?? "");
  const { data: apartment } = await supabase.from("apartments").select("title:name").eq("id", apartmentId).maybeSingle();
  const checkIn = String(booking.check_in_date ?? booking.check_in ?? "");
  const checkOut = String(booking.check_out_date ?? booking.check_out ?? "");
  const guestEmail = String(booking.guest_email ?? "").trim().toLowerCase();

  if (!apartmentId || !checkIn || !checkOut || !guestEmail) return;

  try {
    await createBookingNotifications({
      supabase,
      organizationId,
      actorUserId,
      request: {
        eventType,
        idempotencyKey,
        bookingId: String(booking.id),
        apartmentId,
        payload: {
          bookingId: String(booking.id),
          apartmentId,
          apartmentTitle: String(apartment?.title ?? "Объект"),
          guestName: String(booking.guest_name ?? booking.customer_name ?? "Гость"),
          guestPhone: String(booking.guest_phone ?? ""),
          guestEmail,
          checkIn,
          checkOut,
          guests: Number(booking.guests_count ?? booking.adults ?? booking.guests ?? 1),
          totalAmount: Number(booking.total_amount ?? 0),
          currency: String(booking.currency ?? "EUR"),
          bookingStatus: String(booking.status ?? "pending"),
          paymentStatus: String(booking.payment_status ?? "unpaid"),
          notes: String(booking.guest_comment ?? booking.notes ?? ""),
          actionUrl: `/bookings/${booking.id}`,
        },
      },
    });
    await processNotificationQueue({ supabase, organizationId, limit: 10 });
  } catch (notificationError) {
    console.error("Failed to send booking lifecycle notifications:", notificationError);
  }
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
      bookingNumber: booking.booking_number ?? formatBookingReference(String(booking.id)),
      apartmentId: booking.apartment_id,
      apartmentTitle: apartment?.title ?? "Объект",
      clientId: booking.client_id ?? null,
      guestName: booking.guest_name ?? booking.customer_name ?? (`${guest?.first_name ?? ""} ${guest?.last_name ?? ""}`.trim() || "Гость"),
      guestPhone: ("guest_phone" in booking ? booking.guest_phone : null) ?? guest?.phone ?? null,
      guestEmail: ("guest_email" in booking ? booking.guest_email : null) ?? guest?.email ?? null,
      checkIn: booking.check_in_date,
      checkOut: booking.check_out_date,
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
  if (!isStaffRoleCode(normalizeRoleCode(auth.context.organizationMember.role_code))) {
    return error(403, "Insufficient permissions");
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return error(400, "Invalid request body");

  const { data: existing, error: loadError } = await loadBookingById(supabase, auth.context.organization.id, id);
  if (loadError) return error(422, loadError.message, loadError.code);
  if (!existing) return error(404, "Booking not found");

  const requestedStatus = typeof body.status === "string" ? body.status.trim() : existing.status;
  const requestedRequestStatus = typeof body.requestStatus === "string" ? body.requestStatus.trim() : existing.request_status;
  const isReject = requestedStatus === "rejected" || requestedRequestStatus === "rejected";
  const requestStatus = isReject ? "rejected" : requestedRequestStatus;
  const status = isReject ? "cancelled" : requestedStatus;
  if (!BOOKING_STATUSES.has(status)) return error(400, "Invalid booking status");
  if (!BOOKING_REQUEST_STATUSES.has(requestStatus)) return error(400, "Invalid booking request status");

  if (isReject && existing.status === "cancelled" && existing.request_status === "rejected") {
    return NextResponse.json({
      ok: true,
      data: { id: existing.id, status: existing.status, request_status: existing.request_status, updated_at: existing.updated_at },
    });
  }

  const isStatusOnly = Object.keys(body).every((key) => key === "status" || key === "requestStatus" || key === "totalAmount");
  const updateRow: Record<string, string> = { status, request_status: requestStatus, updated_at: new Date().toISOString() };

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
    const existingCheckIn = String(existing.check_in_date ?? "");
    const existingCheckOut = String(existing.check_out_date ?? "");
    if (hasPastBookingDate(checkIn, checkOut) && (checkIn !== existingCheckIn || checkOut !== existingCheckOut)) {
      return error(400, "Нельзя сохранить бронирование на прошедшие даты", "past_booking_date");
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(checkInTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(checkOutTime)) {
      return error(400, "Invalid check-in or check-out time");
    }

    const { data: conflict, error: conflictError } = await supabase
      .from("bookings")
      .select("id,check_in_date,check_out_date")
      .eq("organization_id", auth.context.organization.id)
      .eq("apartment_id", existing.apartment_id)
      .neq("id", id)
      .neq("status", "cancelled")
      .not("status", "in", "(rejected,declined,expired)")
      .not("request_status", "in", "(cancelled,rejected)")
      .lt("check_in_date", checkOut)
      .gt("check_out_date", checkIn)
      .limit(1)
      .maybeSingle();

    if (conflictError) return error(422, conflictError.message, conflictError.code);
    if (conflict) return error(409, "Booking dates overlap an existing booking", "booking_conflict");

    Object.assign(updateRow, {
      check_in_date: checkIn,
      check_out_date: checkOut,
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
    .select("id,status,request_status,updated_at")
    .maybeSingle();

  if (updateError) {
    if (updateError.message.includes("booking_conflict_availability_block")) return error(409, "Booking dates overlap an existing block", "booking_conflict");
    if (updateError.message.includes("booking_conflict")) return error(409, "Booking dates overlap an existing booking", "booking_conflict");
    return error(422, updateError.message, updateError.code);
  }
  if (!data) return error(404, "Booking not found");

  const eventType = isReject
    ? "booking_cancelled"
    : requestStatus === "confirmed" || status === "confirmed"
    ? "booking_confirmed"
    : "booking_changed";
  await notifyBookingChange({
    supabase,
    actorUserId: auth.context.authUserId,
    organizationId: auth.context.organization.id,
    booking: { ...existing, ...updateRow, id },
    eventType,
    idempotencyKey: `booking-lifecycle:${id}:${eventType}:${data.updated_at}`,
  });

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
  if (!isStaffRoleCode(normalizeRoleCode(auth.context.organizationMember.role_code))) {
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
