import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStaffApiAuth } from "@/lib/supabase/api-auth";
import { normalizeRoleCode } from "@/lib/supabase/role-code";
import { createBookingNotifications } from "@/lib/notifications/service";

const ALLOWED_ROLES = new Set(["owner", "manager"]);
const BOOLEAN_FIELDS = new Set([
  "apartment_ready",
  "guest_arrived",
  "guest_registered",
  "documents_verified",
  "key_handed_over",
  "balance_received",
  "deposit_received",
  "check_in_completed",
  "cleaning_assigned",
  "cleaning_completed",
  "maintenance_completed",
  "key_returned",
  "apartment_inspected",
  "damages_found",
  "deposit_refunded",
  "check_out_completed",
]);

function error(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function stringValue(row: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    if (typeof row[key] === "string") return row[key];
  }
  return "";
}

function numberValue(row: Record<string, unknown>, ...keys: string[]): number {
  for (const key of keys) {
    const value = Number(row[key]);
    if (Number.isFinite(value)) return value;
  }
  return 0;
}

async function notifyApartmentReady(params: {
  supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;
  organizationId: string;
  actorUserId: string;
  bookingId: string;
}) {
  const { supabase, organizationId, actorUserId, bookingId } = params;
  const { data: rawBooking, error: bookingError } = await supabase
    .from("bookings")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", bookingId)
    .single();

  if (bookingError || !rawBooking) throw new Error(bookingError?.message ?? "Booking not found");
  const booking = rawBooking as Record<string, unknown>;
  const apartmentId = stringValue(booking, "apartment_id");
  const guestUserId = stringValue(booking, "primary_guest_id", "client_user_id");
  const clientId = stringValue(booking, "client_id");
  let guestEmail = stringValue(booking, "guest_email");
  let guestPhone = stringValue(booking, "guest_phone");
  let guestName = stringValue(booking, "guest_name", "customer_name") || "Гость";

  if (guestUserId) {
    const { data: profile } = await supabase.from("profiles").select("*").eq("id", guestUserId).maybeSingle();
    const profileRow = (profile ?? {}) as Record<string, unknown>;
    guestEmail ||= stringValue(profileRow, "email");
    guestPhone ||= stringValue(profileRow, "phone");
    const profileName = [stringValue(profileRow, "first_name"), stringValue(profileRow, "last_name")].filter(Boolean).join(" ");
    guestName = profileName || stringValue(profileRow, "full_name", "name") || guestName;
  } else if (clientId) {
    const { data: client } = await supabase.from("clients").select("*").eq("id", clientId).maybeSingle();
    const clientRow = (client ?? {}) as Record<string, unknown>;
    guestEmail ||= stringValue(clientRow, "email");
    guestPhone ||= stringValue(clientRow, "phone");
    guestName = stringValue(clientRow, "name", "full_name") || guestName;
  }

  let apartmentTitle = "Апартаменты";
  if (apartmentId) {
    const { data: apartment } = await supabase.from("apartments").select("*").eq("id", apartmentId).maybeSingle();
    apartmentTitle = stringValue((apartment ?? {}) as Record<string, unknown>, "name", "title") || apartmentTitle;
  }

  await createBookingNotifications({
    supabase,
    organizationId,
    actorUserId,
    request: {
      eventType: "booking_ready_for_checkin",
      idempotencyKey: `booking-ready-for-checkin:${bookingId}`,
      bookingId,
      apartmentId,
      payload: {
        bookingId,
        apartmentId,
        apartmentTitle,
        clientId: clientId || undefined,
        clientUserId: guestUserId || undefined,
        guestName,
        guestPhone,
        guestEmail,
        checkIn: stringValue(booking, "check_in", "check_in_date"),
        checkOut: stringValue(booking, "check_out", "check_out_date"),
        guests: numberValue(booking, "guests", "adults"),
        totalAmount: numberValue(booking, "total_amount", "amount_paid"),
        currency: stringValue(booking, "currency") || "EUR",
        bookingStatus: stringValue(booking, "status"),
        paymentStatus: stringValue(booking, "payment_status"),
        notes: stringValue(booking, "notes"),
        actionUrl: `/bookings/${bookingId}`,
      },
    },
  });
}

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return error(500, "Supabase is not configured");

  const auth = await requireStaffApiAuth();
  if (!auth.ok) return auth.response;
  if (!ALLOWED_ROLES.has(normalizeRoleCode(auth.context.organizationMember.role_code))) return error(403, "Insufficient permissions");

  const bookingId = new URL(request.url).searchParams.get("bookingId")?.trim();
  let query = supabase
    .from("booking_operation_checklists")
    .select("*")
    .eq("organization_id", auth.context.organization.id);
  if (bookingId) query = query.eq("booking_id", bookingId);

  const { data, error: queryError } = await query;
  if (queryError) return error(422, queryError.message);
  return NextResponse.json({ ok: true, data: data ?? [] });
}

export async function PUT(request: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return error(500, "Supabase is not configured");

  const auth = await requireStaffApiAuth();
  if (!auth.ok) return auth.response;
  if (!ALLOWED_ROLES.has(normalizeRoleCode(auth.context.organizationMember.role_code))) return error(403, "Insufficient permissions");

  const body = (await request.json().catch(() => null)) as { bookingId?: string; field?: string; value?: boolean } | null;
  const bookingId = body?.bookingId?.trim() ?? "";
  const field = body?.field?.trim() ?? "";
  if (!bookingId || !BOOLEAN_FIELDS.has(field) || typeof body?.value !== "boolean") return error(400, "Invalid checklist payload");

  const { data, error: upsertError } = await supabase
    .from("booking_operation_checklists")
    .upsert({
      organization_id: auth.context.organization.id,
      booking_id: bookingId,
      [field]: body.value,
      updated_by: auth.context.authUserId,
    }, { onConflict: "booking_id" })
    .select("*")
    .single();

  if (upsertError) return error(422, upsertError.message);

  if (field === "apartment_ready" && body.value) {
    try {
      await notifyApartmentReady({
        supabase,
        organizationId: auth.context.organization.id,
        actorUserId: auth.context.authUserId,
        bookingId,
      });
    } catch (notificationError) {
      const message = notificationError instanceof Error ? notificationError.message : "Guest notification failed";
      return NextResponse.json({ ok: true, data, warning: message });
    }
  }

  return NextResponse.json({ ok: true, data });
}
