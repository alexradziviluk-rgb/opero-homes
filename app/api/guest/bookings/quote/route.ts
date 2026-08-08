import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildGuestBookingQuote, type GuestBookingInput } from "@/lib/bookings/guest-booking-service";

function parseGuests(value: unknown): number {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
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
    guestName: "",
    guestEmail: "",
    guestPhone: "",
    guestComment: "",
  };

  const result = await buildGuestBookingQuote(supabase, input);
  if (!result.ok) {
    const status = result.errorCode === "apartment_not_found" ? 404 : result.errorCode === "booking_conflict" || result.errorCode === "apartment_unavailable" ? 409 : 422;
    return NextResponse.json(result, { status });
  }

  return NextResponse.json(result);
}
