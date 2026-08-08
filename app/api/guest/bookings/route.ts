import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createGuestBooking,
  listGuestBookings,
  type GuestBookingInput,
} from "@/lib/bookings/guest-booking-service";
import { getServerCurrentUserContext } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

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

  return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
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

  const currentUser = await getServerCurrentUserContext();
  if (!currentUser.currentUserContext) {
    return NextResponse.json(
      { ok: false, errorCode: "session_expired", errorMessage: "Войдите в аккаунт, чтобы отправить запрос на бронирование." },
      { status: 401 },
    );
  }

  const authenticatedProfile = currentUser.currentUserContext?.profile;
  const authenticatedName = authenticatedProfile
    ? `${authenticatedProfile.first_name ?? ""} ${authenticatedProfile.last_name ?? ""}`.trim()
    : "";

  const input: GuestBookingInput = {
    apartmentId: String(body.apartmentId ?? "").trim(),
    checkIn: String(body.checkIn ?? "").trim(),
    checkOut: String(body.checkOut ?? "").trim(),
    guests: parseGuests(body.guests),
    rentalType: body.rentalType === "weekly" || body.rentalType === "monthly" ? body.rentalType : "daily",
    guestName: authenticatedProfile ? authenticatedName || currentUser.currentUserContext?.authEmail || "Гость" : String(body.guestName ?? "").trim(),
    guestEmail: authenticatedProfile ? (authenticatedProfile.email ?? currentUser.currentUserContext?.authEmail ?? "").trim() : String(body.guestEmail ?? "").trim(),
    guestPhone: authenticatedProfile ? (authenticatedProfile.phone ?? "").trim() : String(body.guestPhone ?? "").trim(),
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
