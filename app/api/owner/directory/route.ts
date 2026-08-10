import { NextResponse } from "next/server";
import { requireStaffApiAuth } from "@/lib/supabase/api-auth";
import { normalizeRoleCode } from "@/lib/supabase/role-code";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function errorResponse(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function GET(request: Request) {
  const auth = await requireStaffApiAuth();
  if (!auth.ok) return auth.response;
  if (!["owner", "manager"].includes(normalizeRoleCode(auth.context.organizationMember.role_code))) return errorResponse(403, "Недостаточно прав.");
  const supabase = await createSupabaseServerClient();
  if (!supabase) return errorResponse(500, "Supabase is not configured");
  const query = new URL(request.url).searchParams.get("q") ?? "";
  const { data, error } = await supabase.rpc("search_property_owners", { target_organization_id: auth.context.organization.id, target_query: query });
  if (error) return errorResponse(422, error.message);
  return NextResponse.json({ ok: true, data: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireStaffApiAuth();
  if (!auth.ok) return auth.response;
  if (!["owner", "manager"].includes(normalizeRoleCode(auth.context.organizationMember.role_code))) return errorResponse(403, "Недостаточно прав.");
  const supabase = await createSupabaseServerClient();
  if (!supabase) return errorResponse(500, "Supabase is not configured");
  const body = await request.json().catch(() => null) as { apartmentId?: string; userId?: string } | null;
  if (!body?.apartmentId || !body.userId) return errorResponse(400, "Укажите квартиру и собственника.");
  const { data, error } = await supabase.rpc("assign_existing_property_owner", { target_organization_id: auth.context.organization.id, target_apartment_id: body.apartmentId, target_user_id: body.userId });
  if (error) return errorResponse(error.message.includes("PROPERTY_OWNER_NOT_FOUND") ? 404 : 422, error.message);
  return NextResponse.json({ ok: true, data: { assigned: Boolean(data) } }, { status: 201 });
}
