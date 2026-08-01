import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createGuestBooking,
  listGuestBookings,
  type GuestBookingInput,
} from "@/lib/bookings/guest-booking-service";

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

  return NextResponse.json(result, { status: 201 });
}
