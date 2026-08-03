import { NextResponse } from "next/server";
import { buildPropertyOwnerInvitationUrl } from "@/lib/auth/invitation-url";
import { createEmailProvider } from "@/lib/notifications/providers/email-provider";
import { requireStaffApiAuth } from "@/lib/supabase/api-auth";
import { normalizeRoleCode } from "@/lib/supabase/role-code";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Context = { params: Promise<{ id: string }> };
function errorResponse(status: number, error: string, code = "INVALID_INPUT") { return NextResponse.json({ ok: false, error, code }, { status }); }
function manager(role: string) { const value = normalizeRoleCode(role); return value === "owner" || value === "manager"; }

export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  if (!UUID.test(id)) return errorResponse(400, "Некорректный ID приглашения.");
  const auth = await requireStaffApiAuth();
  if (!auth.ok) return auth.response;
  if (!manager(auth.context.organizationMember.role_code)) return errorResponse(403, "Недостаточно прав.", "FORBIDDEN");
  const supabase = await createSupabaseServerClient();
  if (!supabase) return errorResponse(500, "Supabase is not configured", "CONFIGURATION_MISSING");
  const body = await request.json().catch(() => null) as { action?: string; apartmentId?: string; userId?: string } | null;
  const action = body?.action;
  if (action === "pause" || action === "restore" || action === "remove") {
    const apartmentId = body?.apartmentId ?? "";
    const userId = body?.userId ?? "";
    if (!UUID.test(apartmentId) || !UUID.test(userId)) return errorResponse(400, "Нужны apartmentId и userId.");
    const status = action === "pause" ? "paused" : action === "restore" ? "active" : "revoked";
    const { data, error } = await supabase.rpc("set_property_owner_access", { target_organization_id: auth.context.organization.id, target_apartment_id: apartmentId, target_user_id: userId, target_status: status });
    if (error) return errorResponse(422, error.message, "OWNER_ACCESS_UPDATE_FAILED");
    if (!data) return errorResponse(404, "Связь собственника с квартирой не найдена.", "OWNER_RELATION_NOT_FOUND");
    return NextResponse.json({ ok: true, data: { status } });
  }
  if (action !== "resend") return errorResponse(400, "Неизвестное действие.");
  const { data: invitationData, error: lookupError } = await supabase.rpc("get_property_owner_invitation_for_manager", { target_invitation_id: id });
  if (lookupError) return errorResponse(422, lookupError.message, "INVITATION_LOOKUP_FAILED");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const invitation = Array.isArray(invitationData) ? invitationData[0] : null;
  if (!invitation || invitation.organization_id !== auth.context.organization.id) return errorResponse(404, "Приглашение не найдено.", "INVITATION_NOT_FOUND");
  const { data: reinviteData, error: resendError } = await supabase.rpc("reinvite_property_owner", { target_invitation_id: id, target_expires_at: expiresAt });
  if (resendError) {
    const code = resendError.message.includes("OWNER_ALREADY_ACTIVE") ? "OWNER_ALREADY_ACTIVE" : resendError.message.includes("INVITATION_NOT_FOUND") ? "INVITATION_NOT_FOUND" : "INVITATION_RESEND_FAILED";
    return errorResponse(code === "OWNER_ALREADY_ACTIVE" ? 409 : 422, code === "OWNER_ALREADY_ACTIVE" ? "Активному собственнику повторное приглашение не требуется." : resendError.message, code);
  }
  const reinvite = Array.isArray(reinviteData) ? reinviteData[0] : reinviteData;
  const token = String(reinvite?.raw_token ?? "");
  if (!token) return errorResponse(422, "Invitation token was not generated.", "INVITATION_TOKEN_MISSING");
  const inviteUrl = buildPropertyOwnerInvitationUrl(token);
  const emailResult = await createEmailProvider().send({ to: invitation.email, subject: `Повторное приглашение собственника в ${auth.context.organization.name}`, text: [`Здравствуйте, ${invitation.first_name}.`, "", `Ссылка для принятия приглашения: ${inviteUrl}`, `Ссылка действует до: ${new Date(expiresAt).toLocaleString("ru-RU")}`].join("\n"), html: `<p>Здравствуйте, ${invitation.first_name}.</p><p><a href="${inviteUrl}">Принять приглашение</a></p><p>Ссылка действует до: ${new Date(expiresAt).toLocaleString("ru-RU")}</p>` });
  if (!emailResult.ok) {
    await supabase.rpc("set_property_owner_invitation_delivery", { target_invitation_id: id, target_status: "failed", target_error: emailResult.errorMessage ?? "Email delivery failed" });
    return errorResponse(422, emailResult.errorMessage ?? "Не удалось отправить приглашение.", "EMAIL_DELIVERY_FAILED");
  }
  await supabase.rpc("set_property_owner_invitation_delivery", { target_invitation_id: id, target_status: "sent", target_error: null });
  return NextResponse.json({ ok: true, data: { invitationId: id, expiresAt: reinvite.expires_at } });
}
