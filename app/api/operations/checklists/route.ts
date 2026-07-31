import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStaffApiAuth } from "@/lib/supabase/api-auth";
import { normalizeRoleCode } from "@/lib/supabase/role-code";

const ALLOWED_ROLES = new Set(["owner", "manager"]);
const BOOLEAN_FIELDS = new Set([
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
  return NextResponse.json({ ok: true, data });
}
