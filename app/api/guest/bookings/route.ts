import { NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import {
  createGuestBooking,
  listGuestBookings,
  type GuestBookingInput,
} from "@/lib/bookings/guest-booking-service";
import { createBookingNotifications } from "@/lib/notifications/service";
import { processNotificationQueue } from "@/lib/notifications/queue";
import { getServerCurrentUserContext } from "@/lib/supabase/server";

function parseGuests(value: unknown): number {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

export async function GET() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, errorCode: "configuration_missing", errorMessage: "Supabase is not configured." }, { status: 500 });
  }

  const result = await listGuestBookings(supabase);
  if (!result.ok) {
    const status = result.errorCode === "session_expired" || result.errorCode === "profile_missing" ? 401 : result.errorCode === "permission_denied" ? 403 : 422;
    return NextResponse.json(result, { status });
  }

  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, errorCode: "configuration_missing", errorMessage: "Supabase is not configured." }, { status: 500 });
  }

  const body = (await request.json().catch(() => null)) as Partial<GuestBookingInput> | null;
  if (!body) {
    return NextResponse.json({ ok: false, errorCode: "invalid_dates", errorMessage: "Invalid request body." }, { status: 400 });
  }

  const input: GuestBookingInput = {
    apartmentId: String(body.apartmentId ?? "").trim(),
    checkIn: String(body.checkIn ?? "").trim(),
    checkOut: String(body.checkOut ?? "").trim(),
    guests: parseGuests(body.guests),
    rentalType: body.rentalType === "weekly" || body.rentalType === "monthly" ? body.rentalType : "daily",
    guestName: String(body.guestName ?? "").trim(),
    guestEmail: String(body.guestEmail ?? "").trim(),
    guestPhone: String(body.guestPhone ?? "").trim(),
    guestComment: String(body.guestComment ?? "").trim(),
  };

  const result = await createGuestBooking(supabase, input);
  if (!result.ok) {
    const status =
      result.errorCode === "permission_denied"
        ? 403
        : result.errorCode === "booking_conflict"
        ? 409
        : 422;

    return NextResponse.json(result, { status });
  }

  const currentUser = await getServerCurrentUserContext();
  if (currentUser.currentUserContext) {
    try {
      const notificationSupabase = createSupabaseServiceRoleClient() ?? supabase;
      await createBookingNotifications({
        supabase: notificationSupabase,
        organizationId: result.data.organizationId,
        actorUserId: currentUser.currentUserContext.authUserId,
        request: {
          eventType: "booking_created",
          idempotencyKey: `public-booking-request:${result.data.id}`,
          bookingId: result.data.id,
          apartmentId: result.data.apartmentId,
          payload: {
            bookingId: result.data.id,
            apartmentId: result.data.apartmentId,
            apartmentTitle: result.data.apartmentTitle,
            clientId: result.data.clientId || undefined,
            clientUserId: currentUser.currentUserContext.authUserId,
            guestName: result.data.guestName,
            guestPhone: result.data.guestPhone,
            guestEmail: result.data.guestEmail,
            checkIn: result.data.checkIn,
            checkOut: result.data.checkOut,
            guests: result.data.quote.guests,
            totalAmount: result.data.totalAmount,
            currency: result.data.quote.currency,
            bookingStatus: result.data.status,
            paymentStatus: result.data.paymentStatus ?? "unpaid",
            notes: input.guestComment,
            actionUrl: `/bookings/${result.data.id}`,
          },
        },
      });

      await processNotificationQueue({
        supabase: notificationSupabase,
        organizationId: result.data.organizationId,
        limit: 10,
      });
    } catch (error) {
      console.error("Failed to queue public booking email notifications:", error);
    }
  }

  return NextResponse.json(result, { status: 201 });
}
