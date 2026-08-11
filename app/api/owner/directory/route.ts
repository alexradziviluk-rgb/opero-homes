import { NextResponse } from "next/server";
import { createEmailProvider } from "@/lib/notifications/providers/email-provider";
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

  const [{ data: apartment }, { data: profile }] = await Promise.all([
    supabase.from("apartments").select("title").eq("id", body.apartmentId).eq("organization_id", auth.context.organization.id).single(),
    supabase.from("profiles").select("first_name,last_name,email").eq("id", body.userId).single(),
  ]);

  let notificationSent = false;
  if (profile?.email && apartment?.title) {
    const ownerName = [profile.first_name, profile.last_name].filter(Boolean).join(" ") || "собственник";
    const subject = `Вас привязали как собственника к объекту «${apartment.title}»`;
    const text = [`Здравствуйте, ${ownerName}.`, "", `Вы привязаны как собственник к объекту «${apartment.title}».`, `Организация: ${auth.context.organization.name}.`].join("\n");
    const emailResult = await createEmailProvider().send({ to: profile.email, subject, text, html: `<p>Здравствуйте, ${ownerName}.</p><p>Вы привязаны как собственник к объекту <strong>${apartment.title}</strong>.</p><p>Организация: ${auth.context.organization.name}.</p>` });
    notificationSent = emailResult.ok;
  }

  return NextResponse.json({ ok: true, data: { assigned: Boolean(data), notificationSent } }, { status: 201 });
}
