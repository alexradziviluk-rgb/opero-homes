import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStaffApiAuth } from "@/lib/supabase/api-auth";
import { normalizeRoleCode } from "@/lib/supabase/role-code";
import { hasPastBookingDate } from "@/lib/bookings/date-validation";

type CreateBookingPayload = {
  id?: string;
  apartmentId?: string;
  guestName?: string;
  guestPhone?: string;
  guestEmail?: string;
  checkIn?: string;
  checkOut?: string;
  checkInTime?: string;
  checkOutTime?: string;
  guests?: number;
  rentalType?: string;
  discount?: number;
  paidAmount?: number;
  complimentary?: boolean;
  notes?: string;
  guestComment?: string;
  status?: string;
  paymentStatus?: string;
  source?: string;
};

const BOOKING_STATUSES = new Set(["pending", "confirmed", "checked_in"]);
const PAYMENT_STATUSES = new Set(["unpaid", "partially_paid", "paid", "refunded"]);
const MANAGER_ROLES = new Set(["owner", "manager"]);
const RENTAL_TYPES = new Set(["daily", "weekly", "monthly"]);

function error(status: number, message: string, code?: string) {
  return NextResponse.json({ ok: false, error: message, code }, { status });
}

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
  const guestIds = Array.from(new Set((bookings ?? []).map((booking) => booking.primary_guest_id).filter(Boolean)));
  const apartmentTitleById = new Map<string, string>();
  const guestById = new Map<string, { name: string; phone: string | null; email: string | null }>();

  if (apartmentIds.length > 0) {
    const { data: apartments } = await supabase
      .from("apartments")
      .select("id,title:name")
      .in("id", apartmentIds as string[]);

    (apartments ?? []).forEach((apartment) => {
      apartmentTitleById.set(apartment.id as string, (apartment.title as string | null) ?? "Объект");
    });
  }

  if (guestIds.length > 0) {
    const { data: guests } = await supabase
      .from("guests")
      .select("id,first_name,last_name,phone,email")
      .in("id", guestIds as string[]);

    (guests ?? []).forEach((guest) => {
      guestById.set(guest.id as string, {
        name: `${guest.first_name ?? ""} ${guest.last_name ?? ""}`.trim() || "Гость",
        phone: guest.phone ?? null,
        email: guest.email ?? null,
      });
    });
  }

  return NextResponse.json({
    ok: true,
    data: (bookings ?? []).map((booking) => {
      const guest = booking.primary_guest_id ? guestById.get(booking.primary_guest_id) : undefined;
      return {
      id: booking.id,
      bookingNumber: booking.booking_number ?? `Бронь ${String(booking.id).slice(0, 8)}`,
      apartmentId: booking.apartment_id,
      apartmentTitle: booking.apartment_id ? apartmentTitleById.get(booking.apartment_id) ?? "Объект" : "Объект",
      clientId: booking.client_id ?? null,
      guestName: booking.guest_name ?? booking.customer_name ?? guest?.name ?? "Гость",
      guestPhone: ("guest_phone" in booking ? booking.guest_phone : null) ?? guest?.phone ?? null,
      guestEmail: ("guest_email" in booking ? booking.guest_email : null) ?? guest?.email ?? null,
      checkIn: booking.check_in ?? booking.check_in_date,
      checkOut: booking.check_out ?? booking.check_out_date,
      checkInTime: booking.check_in_time ?? null,
      checkOutTime: booking.check_out_time ?? null,
      guests: typeof booking.guests === "number" ? booking.guests : typeof booking.adults === "number" ? booking.adults : 1,
      rentalType: booking.rental_type ?? null,
      pricePerPeriod: booking.price_per_period ?? booking.nightly_rate ?? null,
      accommodationAmount: booking.accommodation_amount ?? booking.accommodation_total ?? null,
      cleaningFee: booking.cleaning_fee ?? null,
      deposit: booking.deposit ?? booking.security_deposit ?? null,
      discount: booking.discount ?? null,
      totalAmount: booking.total_amount,
      paidAmount: booking.paid_amount ?? booking.amount_paid ?? null,
      status: booking.status,
      requestStatus: booking.request_status,
      paymentStatus: booking.payment_status,
      source: booking.source,
      notes: "notes" in booking ? booking.notes : booking.guest_comment ?? null,
      createdAt: booking.created_at,
      updatedAt: booking.updated_at,
      };
    }),
  });
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return error(500, "Supabase is not configured");

  const auth = await requireStaffApiAuth();
  if (!auth.ok) return auth.response;
  if (!MANAGER_ROLES.has(normalizeRoleCode(auth.context.organizationMember.role_code))) {
    return error(403, "Insufficient permissions");
  }

  const body = (await request.json().catch(() => null)) as CreateBookingPayload | null;
  const id = body?.id?.trim() ?? "";
  const apartmentId = body?.apartmentId?.trim() ?? "";
  const guestName = body?.guestName?.trim() ?? "";
  const checkIn = body?.checkIn?.trim() ?? "";
  const checkOut = body?.checkOut?.trim() ?? "";
  const checkInTime = body?.checkInTime?.trim() || "15:00";
  const checkOutTime = body?.checkOutTime?.trim() || "11:00";
  const rentalType = body?.rentalType?.trim() ?? "";
  const status = body?.status?.trim() ?? "pending";
  const paymentStatus = body?.paymentStatus?.trim() ?? "unpaid";
  const source = body?.source?.trim() ?? "direct";

  if (!id || !apartmentId || !guestName || !checkIn || !checkOut || checkOut <= checkIn) {
    return error(400, "Invalid booking payload");
  }
  if (hasPastBookingDate(checkIn, checkOut)) {
    return error(400, "Нельзя создать бронирование на прошедшие даты", "past_booking_date");
  }
  if (!BOOKING_STATUSES.has(status) || !PAYMENT_STATUSES.has(paymentStatus)) {
    return error(400, "Invalid booking status");
  }
  if (!RENTAL_TYPES.has(rentalType)) {
    return error(400, "Invalid rental type", "invalid_rental_type");
  }

  const organizationId = auth.context.organization.id;
  const { data: apartment, error: apartmentError } = await supabase
    .from("apartments")
    .select("id,rental_types,daily_price,weekly_price,monthly_price,cleaning_fee,deposit")
    .eq("organization_id", organizationId)
    .eq("id", apartmentId)
    .maybeSingle();

  if (apartmentError) return error(422, apartmentError.message, apartmentError.code);
  if (!apartment) return error(404, "Apartment not found", "apartment_not_found");

  const rentalTypes = (apartment.rental_types ?? {}) as Record<string, boolean>;
  if (!rentalTypes[rentalType]) {
    return error(400, "Rental type is not enabled for this apartment", "rental_type_not_allowed");
  }

  const configuredPrices: Record<string, number | null> = {
    daily: apartment.daily_price,
    weekly: apartment.weekly_price,
    monthly: apartment.monthly_price,
  };
  const complimentary = body?.complimentary === true;
  const configuredPrice = Number(configuredPrices[rentalType] ?? 0);
  if ((!Number.isFinite(configuredPrice) || configuredPrice <= 0) && !complimentary) {
    return error(400, "A positive configured price or complimentary confirmation is required", "price_required");
  }

  const pricePerPeriod = complimentary ? 0 : configuredPrice;
  const nights = Math.max(0, Math.ceil((Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) / 86_400_000));
  const periodsCount = rentalType === "daily" ? nights : rentalType === "weekly" ? Math.ceil(nights / 7) : Math.ceil(nights / 30);
  const accommodationAmount = pricePerPeriod * periodsCount;
  const cleaningFee = Math.max(0, Number(apartment.cleaning_fee ?? 0));
  const deposit = Math.max(0, Number(apartment.deposit ?? 0));
  const discount = Math.max(0, Number(body?.discount ?? 0));
  const paidAmount = Math.max(0, Number(body?.paidAmount ?? 0));
  const totalAmount = Math.max(0, accommodationAmount + cleaningFee + deposit - discount);
  const derivedPaymentStatus = paidAmount <= 0 ? "unpaid" : paidAmount < totalAmount ? "partially_paid" : "paid";
  const modernConflict = await supabase
    .from("bookings")
    .select("id,check_in,check_out")
    .eq("organization_id", organizationId)
    .eq("apartment_id", apartmentId)
    .neq("status", "cancelled")
    .lt("check_in", checkOut)
    .gt("check_out", checkIn)
    .limit(1)
    .maybeSingle();

  const usesLegacyDates = modernConflict.error?.code === "42703";
  const legacyConflict = usesLegacyDates
    ? await supabase
        .from("bookings")
        .select("id,check_in_date,check_out_date")
        .eq("organization_id", organizationId)
        .eq("apartment_id", apartmentId)
        .neq("status", "cancelled")
        .lt("check_in_date", checkOut)
        .gt("check_out_date", checkIn)
        .limit(1)
        .maybeSingle()
    : null;
  const conflict = usesLegacyDates ? legacyConflict?.data : modernConflict.data;
  const conflictError = usesLegacyDates ? legacyConflict?.error : modernConflict.error;

  if (conflictError) return error(422, conflictError.message, conflictError.code);
  if (conflict) {
    const conflictCheckIn = "check_in" in conflict ? conflict.check_in : conflict.check_in_date;
    const conflictCheckOut = "check_out" in conflict ? conflict.check_out : conflict.check_out_date;
    return NextResponse.json({
      ok: false,
      error: "Booking dates overlap an existing booking",
      code: "booking_conflict",
      conflict: { id: conflict.id, checkIn: conflictCheckIn, checkOut: conflictCheckOut },
    }, { status: 409 });
  }

  const now = new Date().toISOString();
  const guestComment = body?.guestComment?.trim() ?? body?.notes?.trim() ?? "";
  const requestStatus = status === "pending" ? "pending" : "confirmed";
  const commercialTerms = {
    guest_name: guestName,
    guest_phone: body?.guestPhone?.trim() ?? "",
    guest_email: body?.guestEmail?.trim() ?? "",
    check_in_time: checkInTime,
    check_out_time: checkOutTime,
    rental_type: rentalType,
    price_per_period: pricePerPeriod,
    accommodation_total: accommodationAmount,
    cleaning_fee: cleaningFee,
    deposit,
    discount,
    paid_amount: paidAmount,
    complimentary,
    guest_comment: guestComment,
    guests_count: Math.max(1, Number(body?.guests ?? 1)),
    request_status: requestStatus,
  };
  const bookingRow: Record<string, unknown> = usesLegacyDates
    ? {
        id,
        booking_number: `MAN-${id.slice(0, 8).toUpperCase()}`,
        organization_id: organizationId,
        apartment_id: apartmentId,
        check_in_date: checkIn,
        check_out_date: checkOut,
        adults: Math.max(1, Number(body?.guests ?? 1)),
        children: 0,
        infants: 0,
        pets: 0,
        nightly_rate: pricePerPeriod,
        security_deposit: deposit,
        taxes_total: 0,
        discount_total: discount,
        total_amount: totalAmount,
        amount_paid: paidAmount,
        currency: "EUR",
        metadata: {},
        status,
        payment_status: derivedPaymentStatus,
        source,
        created_at: now,
        updated_at: now,
        ...commercialTerms,
      }
    : {
        id,
        organization_id: organizationId,
        apartment_id: apartmentId,
        check_in: checkIn,
        check_out: checkOut,
        guests: Math.max(1, Number(body?.guests ?? 1)),
        total_amount: totalAmount,
        status,
        payment_status: derivedPaymentStatus,
        source,
        created_at: now,
        updated_at: now,
        ...commercialTerms,
      };
  const { data, error: insertError } = await supabase
    .from("bookings")
    .insert(bookingRow)
    .select("*")
    .single();

  if (insertError) return error(422, insertError.message, insertError.code);
  return NextResponse.json({ ok: true, data }, { status: 201 });
}
