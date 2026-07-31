import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStaffApiAuth } from "@/lib/supabase/api-auth";
import { normalizeRoleCode } from "@/lib/supabase/role-code";

const BOOKING_STATUSES = new Set(["pending", "confirmed", "checked_in", "checked_out", "cancelled"]);
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

  return NextResponse.json({
    ok: true,
    data: {
      id: booking.id,
      apartmentId: booking.apartment_id,
      apartmentTitle: apartment?.title ?? "Объект",
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

  const body = (await request.json().catch(() => null)) as { status?: string } | null;
  const status = body?.status?.trim() ?? "";
  if (!BOOKING_STATUSES.has(status)) return error(400, "Invalid booking status");

  const { id } = await context.params;
  const { data, error: updateError } = await supabase
    .from("bookings")
    .update({ status, updated_at: new Date().toISOString() })
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
