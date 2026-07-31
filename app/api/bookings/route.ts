import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStaffApiAuth } from "@/lib/supabase/api-auth";
import { normalizeRoleCode } from "@/lib/supabase/role-code";

type CreateBookingPayload = {
  id?: string;
  apartmentId?: string;
  guestName?: string;
  checkIn?: string;
  checkOut?: string;
  totalAmount?: number;
  status?: string;
  paymentStatus?: string;
  source?: string;
};

const BOOKING_STATUSES = new Set(["pending", "confirmed", "checked_in"]);
const PAYMENT_STATUSES = new Set(["unpaid", "partially_paid", "paid", "refunded"]);
const MANAGER_ROLES = new Set(["owner", "manager"]);

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
      checkIn: booking.check_in ?? booking.check_in_date,
      checkOut: booking.check_out ?? booking.check_out_date,
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
  const status = body?.status?.trim() ?? "pending";
  const paymentStatus = body?.paymentStatus?.trim() ?? "unpaid";
  const source = body?.source?.trim() ?? "direct";

  if (!id || !apartmentId || !guestName || !checkIn || !checkOut || checkOut <= checkIn) {
    return error(400, "Invalid booking payload");
  }
  if (!BOOKING_STATUSES.has(status) || !PAYMENT_STATUSES.has(paymentStatus)) {
    return error(400, "Invalid booking status");
  }

  const organizationId = auth.context.organization.id;
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
  const totalAmount = typeof body?.totalAmount === "number" && Number.isFinite(body.totalAmount) ? body.totalAmount : 0;
  const bookingRow: Record<string, string | number> = usesLegacyDates
    ? {
        id,
        organization_id: organizationId,
        apartment_id: apartmentId,
        check_in_date: checkIn,
        check_out_date: checkOut,
        total_amount: totalAmount,
        status,
        payment_status: paymentStatus,
        source,
        created_at: now,
        updated_at: now,
      }
    : {
        id,
        organization_id: organizationId,
        apartment_id: apartmentId,
        guest_name: guestName,
        check_in: checkIn,
        check_out: checkOut,
        total_amount: totalAmount,
        status,
        payment_status: paymentStatus,
        source,
        created_at: now,
        updated_at: now,
      };
  const { data, error: insertError } = await supabase
    .from("bookings")
    .insert(bookingRow)
    .select("*")
    .single();

  if (insertError) return error(422, insertError.message, insertError.code);
  return NextResponse.json({ ok: true, data }, { status: 201 });
}
