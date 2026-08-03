import { NextResponse } from "next/server";
import { createEmailProvider } from "@/lib/notifications/providers/email-provider";
import { buildPropertyOwnerInvitationUrl } from "@/lib/auth/invitation-url";
import { requireStaffApiAuth } from "@/lib/supabase/api-auth";
import { normalizeRoleCode } from "@/lib/supabase/role-code";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type InvitationRow = { invitation_id: string; email: string; phone: string | null; first_name: string; last_name: string | null; apartment_ids: string[]; delivery_status: string; expires_at: string; accepted_at: string | null; created_at: string };
function jsonError(status: number, error: string, code = "INVALID_INPUT") { return NextResponse.json({ ok: false, error, code }, { status }); }
function isManager(role: string) { const normalized = normalizeRoleCode(role); return normalized === "owner" || normalized === "manager"; }

export async function GET() {
  const auth = await requireStaffApiAuth();
  if (!auth.ok) return auth.response;
  if (!isManager(auth.context.organizationMember.role_code)) return jsonError(403, "Недостаточно прав.", "FORBIDDEN");
  const supabase = await createSupabaseServerClient();
  if (!supabase) return jsonError(500, "Supabase is not configured", "CONFIGURATION_MISSING");
  const { data, error } = await supabase.rpc("list_property_owner_invitations", { target_organization_id: auth.context.organization.id });
  if (error) return jsonError(422, error.message, "INVITATION_LIST_FAILED");
  return NextResponse.json({ ok: true, data: (data ?? []).map((row: InvitationRow) => ({ invitationId: row.invitation_id, email: row.email, phone: row.phone, firstName: row.first_name, lastName: row.last_name, apartmentIds: row.apartment_ids, deliveryStatus: row.delivery_status, expiresAt: row.expires_at, acceptedAt: row.accepted_at, createdAt: row.created_at })) });
}

export async function POST(request: Request) {
  const auth = await requireStaffApiAuth();
  if (!auth.ok) return auth.response;
  if (!isManager(auth.context.organizationMember.role_code)) return jsonError(403, "Недостаточно прав.", "FORBIDDEN");
  const supabase = await createSupabaseServerClient();
  if (!supabase) return jsonError(500, "Supabase is not configured", "CONFIGURATION_MISSING");
  const body = await request.json().catch(() => null) as { firstName?: string; lastName?: string; email?: string; phone?: string; apartmentIds?: string[] } | null;
  const firstName = String(body?.firstName ?? "").trim();
  const lastName = String(body?.lastName ?? "").trim();
  const email = String(body?.email ?? "").trim().toLowerCase();
  const phone = String(body?.phone ?? "").trim();
  const apartmentIds = Array.isArray(body?.apartmentIds) ? [...new Set(body.apartmentIds.filter((id): id is string => typeof id === "string" && UUID.test(id)))] : [];
  if (!firstName || !email.includes("@") || apartmentIds.length === 0 || apartmentIds.length !== (body?.apartmentIds?.length ?? 0)) return jsonError(400, "Укажите имя, корректный email и хотя бы одну квартиру.");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase.rpc("create_property_owner_invitation", { target_organization_id: auth.context.organization.id, target_email: email, target_first_name: firstName, target_last_name: lastName || null, target_phone: phone || null, target_apartment_ids: apartmentIds, target_expires_at: expiresAt });
  if (error) {
    const code = error.message.includes("INVITATION_ALREADY_EXISTS") ? "ALREADY_INVITED" : error.message.includes("APARTMENT_NOT_FOUND") ? "APARTMENT_NOT_FOUND" : "INVITATION_CREATE_FAILED";
    return jsonError(code === "ALREADY_INVITED" ? 409 : 422, code === "ALREADY_INVITED" ? "Для этого email уже есть активное приглашение." : error.message, code);
  }
  const invitation = Array.isArray(data) ? data[0] : data;
  const token = String(invitation?.raw_token ?? "");
  if (!invitation?.invitation_id || !token) return jsonError(422, "Invitation token was not generated.", "INVITATION_TOKEN_MISSING");
  const inviteUrl = buildPropertyOwnerInvitationUrl(token);
  const emailResult = await createEmailProvider().send({ to: email, subject: `Приглашение собственника в ${auth.context.organization.name}`, text: [`Здравствуйте, ${firstName}.`, "", `Вас приглашают управлять доступностью квартир в ${auth.context.organization.name}.`, "", `Примите приглашение: ${inviteUrl}`, `Ссылка действует до: ${new Date(expiresAt).toLocaleString("ru-RU")}`].join("\n"), html: `<p>Здравствуйте, ${firstName}.</p><p>Вас приглашают управлять доступностью квартир в <strong>${auth.context.organization.name}</strong>.</p><p><a href="${inviteUrl}">Принять приглашение</a></p><p>Ссылка действует до: ${new Date(expiresAt).toLocaleString("ru-RU")}</p>` });
  if (!emailResult.ok) {
    await supabase.rpc("set_property_owner_invitation_delivery", { target_invitation_id: invitation.invitation_id, target_status: "failed", target_error: emailResult.errorMessage ?? "Email delivery failed" });
    return jsonError(422, emailResult.errorMessage ?? "Не удалось отправить приглашение.", "EMAIL_DELIVERY_FAILED");
  }
  await supabase.rpc("set_property_owner_invitation_delivery", { target_invitation_id: invitation.invitation_id, target_status: "sent", target_error: null });
  return NextResponse.json({ ok: true, data: { invitationId: invitation.invitation_id, email: invitation.normalized_email, apartmentIds, expiresAt: invitation.expires_at } }, { status: 201 });
}
