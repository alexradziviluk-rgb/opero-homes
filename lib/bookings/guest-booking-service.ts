import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getApartmentPriceInfo, isApartmentPublic } from "@/lib/apartments/public-catalog";
import { getServerCurrentUserContext } from "@/lib/supabase/server";
import type { Apartment } from "@/types/apartment";

export type GuestBookingInput = {
  apartmentId: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  rentalType: "daily" | "weekly" | "monthly";
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  guestComment: string;
};

type ServerApartment = Apartment & {
  organization_id: string | null;
};

export type GuestBookingQuote = {
  apartmentId: string;
  apartmentTitle: string;
  organizationId: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  guests: number;
  currency: string;
  pricePeriod: "night" | "week" | "month";
  pricePerPeriod: number;
  rentalType: "daily" | "weekly" | "monthly";
  accommodationAmount: number;
  cleaningFee: number;
  deposit: number;
  discount: number;
  totalAmount: number;
  maxGuests: number;
  minimumStay: number | null;
};

export type GuestBookingRecord = {
  id: string;
  organizationId: string;
  apartmentId: string;
  apartmentTitle: string;
  clientId: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  checkIn: string;
  checkOut: string;
  totalAmount: number;
  status: string;
  paymentStatus: string | null;
  source: string | null;
  createdAt: string;
  updatedAt: string;
};

type ApartmentRow = {
  id: string;
  organization_id: string | null;
  title: string | null;
  rooms: number | null;
  max_guests?: number | null;
  daily_price?: number | null;
  weekly_price?: number | null;
  monthly_price?: number | null;
  cleaning_fee?: number | null;
  deposit?: number | null;
  minimum_nights?: number | null;
  minimum_weeks?: number | null;
  minimum_months?: number | null;
  price?: string | null;
  publication_status?: string | null;
  publish_status?: string | null;
  status?: string | null;
  availability?: string | null;
};

type BookingRow = {
  id: string;
  organization_id: string;
  apartment_id: string;
  primary_guest_id: string | null;
  check_in_date: string;
  check_out_date: string;
  total_amount: number | null;
  status: string | null;
  payment_status: string | null;
  source: string | null;
  created_at: string;
  updated_at: string;
};

type BookingPeriodRow = {
  id: string;
  apartment_id: string;
  check_in: string;
  check_out: string;
  status: string | null;
};

type GuestRow = {
  id: string;
  organization_id: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type GuestBookingServiceErrorCode =
  | "unauthenticated"
  | "profile_missing"
  | "apartment_not_found"
  | "apartment_unpublished"
  | "apartment_unavailable"
  | "invalid_dates"
  | "past_check_in"
  | "invalid_guest_count"
  | "capacity_exceeded"
  | "minimum_stay_not_met"
  | "pricing_not_configured"
  | "rental_type_not_allowed"
  | "booking_conflict"
  | "insert_failed"
  | "permission_denied"
  | "session_expired"
  | "duplicate_submission"
  | "configuration_missing"
  | "unexpected";

export type GuestBookingServiceResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      errorCode: GuestBookingServiceErrorCode;
      errorMessage: string;
      conflict?: { checkIn: string; checkOut: string };
      supabaseErrorCode?: string;
    };

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function startOfDay(value: string): Date {
  return new Date(`${value}T00:00:00`);
}

function isValidDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(startOfDay(value).getTime());
}

function nightsBetween(checkIn: string, checkOut: string): number {
  const start = startOfDay(checkIn);
  const end = startOfDay(checkOut);
  const diff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
}

function toApartment(row: ApartmentRow): ServerApartment {
  const publicationStatus = row.publication_status ?? row.publish_status ?? "draft";
  const status = row.status ?? "Черновик";
  const availability = row.availability ?? "На обслуживании";

  return {
    id: row.id,
    organization_id: row.organization_id,
    title: row.title ?? "",
    type: "",
    googleLink: "",
    city: "",
    district: "",
    address: "",
    shortDesc: "",
    rooms: row.rooms ?? 0,
    bedrooms: 0,
    bathrooms: 0,
    floor: null,
    area: null,
    maxGuests: row.max_guests ?? 0,
    price: row.price ?? "",
    deposit: row.deposit ?? null,
    cleaningFee: row.cleaning_fee ?? null,
    rentalTypes: {
      daily: Boolean(row.daily_price),
      weekly: Boolean(row.weekly_price),
      monthly: Boolean(row.monthly_price),
    },
    dailyPrice: row.daily_price ?? null,
    weeklyPrice: row.weekly_price ?? null,
    monthlyPrice: row.monthly_price ?? null,
    minimumNights: row.minimum_nights ?? null,
    minimumWeeks: row.minimum_weeks ?? null,
    minimumMonths: row.minimum_months ?? null,
    ownerName: "",
    ownerPhone: "",
    ownerEmail: "",
    status: status as Apartment["status"],
    availability: availability as Apartment["availability"],
    publishStatus: publicationStatus === "published" ? "Опубликован" : publicationStatus === "archived" ? "На обслуживании" : "Черновик",
    publicationStatus: publicationStatus as Apartment["publicationStatus"],
    bookings: 0,
  };
}

function isBookableApartment(apartment: Apartment): boolean {
  return isApartmentPublic(apartment) && normalize(apartment.availability) !== "на обслуживании" && normalize(apartment.status) !== "черновик";
}

function parsePriceAmount(apartment: Apartment, rentalType: GuestBookingInput["rentalType"]): { amount: number; currency: string; period: "night" | "week" | "month" } | null {
  const configuredAmount = rentalType === "daily" ? apartment.dailyPrice : rentalType === "weekly" ? apartment.weeklyPrice : apartment.monthlyPrice;
  const configuredPeriod = rentalType === "daily" ? "night" : rentalType === "weekly" ? "week" : "month";
  if (apartment.rentalTypes[rentalType] && Number.isFinite(configuredAmount) && (configuredAmount ?? 0) > 0) {
    return { amount: configuredAmount as number, currency: "EUR", period: configuredPeriod };
  }

  const info = getApartmentPriceInfo(apartment);
  if (!info || !Number.isFinite(info.amount) || info.amount <= 0) {
    return null;
  }

  return {
    amount: info.amount,
    currency: info.currency,
    period: info.period,
  };
}

async function fetchApartment(supabase: SupabaseClient, apartmentId: string): Promise<GuestBookingServiceResult<ServerApartment>> {
  const select = [
    "id",
    "organization_id",
    "title:name",
    "rooms",
    "max_guests",
    "daily_price",
    "weekly_price",
    "monthly_price",
    "cleaning_fee",
    "deposit",
    "minimum_nights",
    "minimum_weeks",
    "minimum_months",
    "price",
    "publication_status",
    "publish_status",
    "status",
    "availability",
  ].join(",");

  const { data, error } = await supabase.from("apartments").select(select).eq("id", apartmentId).maybeSingle();

  if (error) {
    if (error.code === "42703") {
      return {
        ok: false,
        errorCode: "configuration_missing",
        errorMessage: "Apartment schema is missing fields required for guest booking.",
        supabaseErrorCode: error.code,
      };
    }

    return {
      ok: false,
      errorCode: "unexpected",
      errorMessage: error.message,
      supabaseErrorCode: error.code,
    };
  }

  if (!data) {
    return {
      ok: false,
      errorCode: "apartment_not_found",
      errorMessage: "Apartment not found.",
    };
  }

  const apartment = toApartment(data as unknown as ApartmentRow);
  return { ok: true, data: apartment };
}

async function ensureGuestRecord(params: {
  supabase: SupabaseClient;
  organizationId: string;
  authUserId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}): Promise<GuestBookingServiceResult<GuestRow>> {
  const { supabase, organizationId, authUserId, firstName, lastName, email, phone } = params;

  const { data: existingById, error: existingByIdError } = await supabase
    .from("guests")
    .select("id,organization_id,first_name,last_name,email,phone,created_at,updated_at")
    .eq("id", authUserId)
    .maybeSingle();

  if (existingByIdError) {
    return {
      ok: false,
      errorCode: existingByIdError.code === "42501" ? "permission_denied" : "unexpected",
      errorMessage: existingByIdError.message,
      supabaseErrorCode: existingByIdError.code,
    };
  }

  if (existingById) {
    const nextGuest: GuestRow = {
      ...existingById,
      organization_id: organizationId,
      first_name: firstName,
      last_name: lastName,
      email,
      phone,
    };

    const { error: updateError } = await supabase
      .from("guests")
      .update({ organization_id: organizationId, first_name: firstName, last_name: lastName, email, phone, updated_at: new Date().toISOString() })
      .eq("id", authUserId);

    if (updateError) {
      return {
        ok: false,
        errorCode: updateError.code === "42501" ? "permission_denied" : "unexpected",
        errorMessage: updateError.message,
        supabaseErrorCode: updateError.code,
      };
    }

    return { ok: true, data: nextGuest };
  }

  const { data: insertedGuest, error: insertError } = await supabase
    .from("guests")
    .insert({
      id: authUserId,
      organization_id: organizationId,
      first_name: firstName,
      last_name: lastName,
      email,
      phone,
    })
    .select("id,organization_id,first_name,last_name,email,phone,created_at,updated_at")
    .single();

  if (insertError || !insertedGuest) {
    return {
      ok: false,
      errorCode: insertError?.code === "42501" ? "permission_denied" : "unexpected",
      errorMessage: insertError?.message ?? "Failed to create guest record.",
      supabaseErrorCode: insertError?.code,
    };
  }

  return { ok: true, data: insertedGuest as GuestRow };
}

async function loadBookingsForApartment(supabase: SupabaseClient, apartmentId: string) {
  const { data, error } = await supabase
    .rpc("get_public_apartment_booking_periods", { target_apartment_id: apartmentId });

  if (error) {
    const errorCode: GuestBookingServiceErrorCode = error.code === "42501" ? "permission_denied" : "unexpected";
    return {
      ok: false as const,
      errorCode,
      errorMessage: error.message,
      supabaseErrorCode: error.code,
    };
  }

  return { ok: true as const, data: ((data ?? []) as BookingPeriodRow[]).filter((booking) => booking.apartment_id === apartmentId) };
}

function isInactiveBookingStatus(status: string | null | undefined): boolean {
  const normalized = normalize(status);
  return normalized === "cancelled" || normalized === "rejected" || normalized === "declined" || normalized === "expired";
}

function bookingOverlaps(requested: GuestBookingInput, existing: BookingPeriodRow): boolean {
  return startOfDay(existing.check_in) < startOfDay(requested.checkOut) && startOfDay(existing.check_out) > startOfDay(requested.checkIn);
}

function formatGuestName(profile: { first_name: string | null; last_name: string | null; email: string | null }): string {
  const fullName = `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim();
  if (fullName) {
    return fullName;
  }

  return profile.email ?? "Гость";
}

export async function buildGuestBookingQuote(supabase: SupabaseClient, input: GuestBookingInput): Promise<GuestBookingServiceResult<GuestBookingQuote>> {
  if (!isValidDate(input.checkIn) || !isValidDate(input.checkOut)) {
    return { ok: false, errorCode: "invalid_dates", errorMessage: "Invalid check-in or check-out date." };
  }

  if (startOfDay(input.checkOut) <= startOfDay(input.checkIn)) {
    return { ok: false, errorCode: "invalid_dates", errorMessage: "Check-out must be after check-in." };
  }

  if (!Number.isInteger(input.guests) || input.guests < 1) {
    return { ok: false, errorCode: "invalid_guest_count", errorMessage: "Guest count must be positive." };
  }

  const apartmentResult = await fetchApartment(supabase, input.apartmentId);
  if (!apartmentResult.ok) {
    return apartmentResult;
  }

  const apartment = apartmentResult.data;
  if (!apartment.organization_id) {
    return { ok: false, errorCode: "configuration_missing", errorMessage: "Apartment organization is missing." };
  }

  if (!isBookableApartment(apartment)) {
    if (!isApartmentPublic(apartment)) {
      return { ok: false, errorCode: "apartment_unpublished", errorMessage: "Apartment is not published." };
    }

    return { ok: false, errorCode: "apartment_unavailable", errorMessage: "Apartment is temporarily unavailable." };
  }

  const priceInfo = parsePriceAmount(apartment, input.rentalType);
  if (!priceInfo) {
    return { ok: false, errorCode: "pricing_not_configured", errorMessage: "Apartment pricing is not configured." };
  }

  const nights = nightsBetween(input.checkIn, input.checkOut);
  if (nights <= 0) {
    return { ok: false, errorCode: "invalid_dates", errorMessage: "Check-out must be after check-in." };
  }

  if (input.checkIn < new Date().toISOString().slice(0, 10)) {
    return { ok: false, errorCode: "past_check_in", errorMessage: "Check-in cannot be in the past." };
  }

  if (apartment.maxGuests > 0 && input.guests > apartment.maxGuests) {
    return { ok: false, errorCode: "capacity_exceeded", errorMessage: "Guest count exceeds apartment capacity." };
  }

  if (priceInfo.period === "night" && apartment.minimumNights && nights < apartment.minimumNights) {
    return { ok: false, errorCode: "minimum_stay_not_met", errorMessage: "Minimum stay is not met." };
  }

  if (priceInfo.period === "week" && apartment.minimumWeeks && Math.ceil(nights / 7) < apartment.minimumWeeks) {
    return { ok: false, errorCode: "minimum_stay_not_met", errorMessage: "Minimum stay is not met." };
  }

  if (priceInfo.period === "month" && apartment.minimumMonths && Math.ceil(nights / 30) < apartment.minimumMonths) {
    return { ok: false, errorCode: "minimum_stay_not_met", errorMessage: "Minimum stay is not met." };
  }

  const periodsCount =
    priceInfo.period === "night" ? nights : priceInfo.period === "week" ? Math.ceil(nights / 7) : Math.ceil(nights / 30);

  const accommodationAmount = priceInfo.amount * periodsCount;
  const cleaningFee = apartment.cleaningFee ?? 0;
  const deposit = apartment.deposit ?? 0;
  const totalAmount = Math.max(0, accommodationAmount + cleaningFee + deposit);

  if (!Number.isFinite(totalAmount) || totalAmount < 0) {
    return { ok: false, errorCode: "pricing_not_configured", errorMessage: "Apartment pricing is not configured." };
  }

  const currentBookingsResult = await loadBookingsForApartment(supabase, apartment.id);
  if (!currentBookingsResult.ok) {
    return currentBookingsResult;
  }

  const conflict = currentBookingsResult.data.find((booking) => {
    if (isInactiveBookingStatus(booking.status)) {
      return false;
    }

    return bookingOverlaps(input, booking);
  });

  if (conflict) {
    return {
      ok: false,
      errorCode: "booking_conflict",
      errorMessage: "The requested dates overlap with an existing booking.",
      conflict: {
        checkIn: conflict.check_in,
        checkOut: conflict.check_out,
      },
    };
  }

  return {
    ok: true,
    data: {
      apartmentId: apartment.id,
      apartmentTitle: apartment.title,
      organizationId: apartment.organization_id,
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      nights,
      guests: input.guests,
      currency: priceInfo.currency,
      pricePeriod: priceInfo.period,
      pricePerPeriod: priceInfo.amount,
      rentalType: input.rentalType,
      accommodationAmount,
      cleaningFee,
      deposit,
      discount: 0,
      totalAmount,
      maxGuests: apartment.maxGuests,
      minimumStay:
        priceInfo.period === "night"
          ? apartment.minimumNights
          : priceInfo.period === "week"
          ? apartment.minimumWeeks
          : apartment.minimumMonths,
    },
  };
}

export async function createGuestBooking(
  supabase: SupabaseClient,
  input: GuestBookingInput,
): Promise<GuestBookingServiceResult<GuestBookingRecord & { quote: GuestBookingQuote }>> {
  const quoteResult = await buildGuestBookingQuote(supabase, input);
  if (!quoteResult.ok) {
    return quoteResult;
  }

  const quote = quoteResult.data;
  const { data, error } = await supabase.rpc("create_public_booking_request", {
    requested_apartment_id: quote.apartmentId,
    requested_check_in: quote.checkIn,
    requested_check_out: quote.checkOut,
    requested_guests_count: quote.guests,
    requested_rental_type: quote.rentalType,
    requested_guest_name: input.guestName.trim(),
    requested_guest_email: input.guestEmail.trim().toLowerCase(),
    requested_guest_phone: input.guestPhone.trim(),
    requested_guest_comment: input.guestComment.trim(),
  }).maybeSingle();

  if (error || !data) {
    return {
      ok: false,
      errorCode: error?.message?.includes("booking_conflict") ? "booking_conflict" : error?.message?.includes("rental_type_not_allowed") ? "rental_type_not_allowed" : "insert_failed",
      errorMessage: error?.message ?? "Failed to create booking.",
      supabaseErrorCode: error?.code,
    };
  }

  const booking = data as { booking_id: string; organization_id: string; total_amount: number };

  return {
    ok: true,
    data: {
      quote,
      id: booking.booking_id,
      organizationId: booking.organization_id,
      apartmentId: quote.apartmentId,
      apartmentTitle: quote.apartmentTitle,
      clientId: "",
      guestName: input.guestName.trim(),
      guestEmail: input.guestEmail.trim().toLowerCase(),
      guestPhone: input.guestPhone.trim(),
      checkIn: quote.checkIn,
      checkOut: quote.checkOut,
      totalAmount: booking.total_amount ?? quote.totalAmount,
      status: "pending",
      paymentStatus: "unpaid",
      source: "public_website",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  };
}

export async function listGuestBookings(
  supabase: SupabaseClient,
): Promise<GuestBookingServiceResult<GuestBookingRecord[]>> {
  const currentUserResult = await getServerCurrentUserContext();
  if (!currentUserResult.currentUserContext) {
    return {
      ok: false,
      errorCode: currentUserResult.errorCode === "profile_missing" ? "profile_missing" : "session_expired",
      errorMessage: "Authenticated guest profile is not available.",
      supabaseErrorCode: currentUserResult.errorCode,
    };
  }

  const guestEmail = (currentUserResult.currentUserContext.profile.email ?? currentUserResult.currentUserContext.authEmail).trim().toLowerCase();
  const { data, error } = await supabase
    .from("bookings")
    .select("id,organization_id,apartment_id,primary_guest_id,check_in_date,check_out_date,total_amount,status,payment_status,source,created_at,updated_at")
    .eq("guest_email", guestEmail)
    .order("created_at", { ascending: false });

  if (error) {
    return {
      ok: false,
      errorCode: error.code === "42501" ? "permission_denied" : "unexpected",
      errorMessage: error.message,
      supabaseErrorCode: error.code,
    };
  }

  let bookings = (data ?? []) as BookingRow[];
  if (bookings.length === 0) {
    const { data: guestRecord, error: guestRecordError } = await supabase
      .from("guests")
      .select("id")
      .eq("email", guestEmail)
      .maybeSingle();

    if (guestRecordError) {
      return {
        ok: false,
        errorCode: guestRecordError.code === "42501" ? "permission_denied" : "unexpected",
        errorMessage: guestRecordError.message,
        supabaseErrorCode: guestRecordError.code,
      };
    }

    if (!guestRecord) {
      return { ok: true, data: [] };
    }

    const { data: linkedBookings, error: linkedBookingsError } = await supabase
      .from("bookings")
      .select("id,organization_id,apartment_id,primary_guest_id,check_in_date,check_out_date,total_amount,status,payment_status,source,created_at,updated_at")
      .eq("primary_guest_id", guestRecord.id)
      .order("created_at", { ascending: false });

    if (linkedBookingsError) {
      return {
        ok: false,
        errorCode: linkedBookingsError.code === "42501" ? "permission_denied" : "unexpected",
        errorMessage: linkedBookingsError.message,
        supabaseErrorCode: linkedBookingsError.code,
      };
    }

    bookings = (linkedBookings ?? []) as BookingRow[];
  }
  const context = currentUserResult.currentUserContext;
  const apartmentIds = Array.from(new Set(bookings.map((booking) => booking.apartment_id).filter((value): value is string => Boolean(value))));

  const apartmentTitleById = new Map<string, string>();
  if (apartmentIds.length > 0) {
    const { data: apartmentsData } = await supabase
      .from("apartments")
      .select("id,title:name")
      .in("id", apartmentIds);

    (apartmentsData ?? []).forEach((row) => {
      apartmentTitleById.set((row as { id: string; title?: string | null }).id, (row as { title?: string | null }).title ?? "Объект");
    });
  }

  return {
    ok: true,
    data: bookings.map((booking) => ({
      id: booking.id,
      organizationId: booking.organization_id,
      apartmentId: booking.apartment_id,
      apartmentTitle: apartmentTitleById.get(booking.apartment_id) ?? "Объект",
      clientId: booking.primary_guest_id ?? guestEmail,
      guestName: formatGuestName(context.profile),
      guestEmail: context?.profile.email ?? currentUserResult.currentUserContext?.authEmail ?? "",
      guestPhone: context?.profile.phone ?? "",
      checkIn: booking.check_in_date,
      checkOut: booking.check_out_date,
      totalAmount: booking.total_amount ?? 0,
      status: booking.status ?? "pending",
      paymentStatus: booking.payment_status,
      source: booking.source,
      createdAt: booking.created_at,
      updatedAt: booking.updated_at,
    })),
  };
}
