import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStaffApiAuth } from "@/lib/supabase/api-auth";
import { createEmailProvider } from "@/lib/notifications/providers/email-provider";
import {
  buildInvitationNextPath,
  isEmployeeInviteRoleCode,
  mapInviteRoleCodeToUserRoleLabel,
  mapUserRoleToInviteRoleCode,
  normalizeInviteEmail,
  normalizeInvitePhone,
} from "@/lib/users/invitations";
import { normalizeRoleCode } from "@/lib/supabase/role-code";

type InviteUserRequest = {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  role?: string;
};

type InviteLookupResult = {
  existing_user_id: string | null;
  already_member: boolean;
};

function jsonError(status: number, errorCode: string, error: string) {
  return NextResponse.json({ ok: false, errorCode, error }, { status });
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function resolveSiteUrl(request: Request): string {
  return process.env.NEXT_PUBLIC_SITE_URL?.trim() || new URL(request.url).origin;
}

function isInviteRequest(value: unknown): value is InviteUserRequest {
  return Boolean(value) && typeof value === "object";
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return jsonError(500, "UNEXPECTED", "Supabase is not configured");
  }

  const auth = await requireStaffApiAuth();
  if (!auth.ok) {
    return auth.response;
  }

  const requesterRoleCode = normalizeRoleCode(auth.context.organizationMember.role_code);
  if (requesterRoleCode !== "owner" && requesterRoleCode !== "manager") {
    return jsonError(403, "INSUFFICIENT_PERMISSIONS", "Недостаточно прав для приглашения сотрудников.");
  }

  const body = (await request.json().catch(() => null)) as unknown;
  if (!isInviteRequest(body)) {
    return jsonError(400, "INVALID_INPUT", "Некорректное тело запроса.");
  }

  const firstName = String(body.firstName ?? "").trim();
  const lastName = String(body.lastName ?? "").trim();
  const email = normalizeInviteEmail(String(body.email ?? ""));
  const phone = normalizeInvitePhone(String(body.phone ?? ""));
  const roleCode = mapUserRoleToInviteRoleCode(String(body.role ?? ""));

  if (!firstName || !lastName) {
    return jsonError(400, "INVALID_INPUT", "Имя и фамилия обязательны.");
  }

  if (!email || !email.includes("@")) {
    return jsonError(400, "INVALID_INPUT", "Введите корректный email.");
  }

  if (!roleCode || !isEmployeeInviteRoleCode(roleCode)) {
    return jsonError(400, "INVALID_INPUT", "Указана недопустимая роль для приглашения.");
  }

  const organizationId = auth.context.organization.id;
  const nowIso = new Date().toISOString();

  const { error: revokeExpiredError } = await supabase
    .from("employee_invitations")
    .update({ revoked_at: nowIso, delivery_status: "revoked", updated_at: nowIso })
    .eq("organization_id", organizationId)
    .eq("email", email)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .lte("expires_at", nowIso);

  if (revokeExpiredError) {
    console.error("Failed to revoke expired employee invitations:", revokeExpiredError);
    return jsonError(500, "UNEXPECTED", revokeExpiredError.message);
  }

  const { data: inviteTargetData, error: inviteTargetError } = await supabase.rpc("find_employee_invite_target", {
    target_org_id: organizationId,
    target_email: email,
  });

  if (inviteTargetError) {
    console.error("Failed to lookup employee invite target:", inviteTargetError);
    if (inviteTargetError.message.includes("INVITER_NOT_ALLOWED")) {
      return jsonError(403, "INSUFFICIENT_PERMISSIONS", "Недостаточно прав для приглашения сотрудников.");
    }
    return jsonError(500, "UNEXPECTED", inviteTargetError.message);
  }

  const inviteTarget = Array.isArray(inviteTargetData) ? (inviteTargetData[0] as InviteLookupResult | undefined) : undefined;
  if (inviteTarget?.already_member) {
    return jsonError(409, "ALREADY_MEMBER", "Пользователь уже состоит в вашей организации.");
  }

  const { data: existingInvitation, error: existingInvitationError } = await supabase
    .from("employee_invitations")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("email", email)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .maybeSingle();

  if (existingInvitationError) {
    console.error("Failed to lookup active employee invitation:", existingInvitationError);
    return jsonError(500, "UNEXPECTED", existingInvitationError.message);
  }

  if (existingInvitation) {
    return jsonError(409, "ALREADY_INVITED", "Для этого email уже есть активное приглашение.");
  }

  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: insertedInvitation, error: insertError } = await supabase
    .from("employee_invitations")
    .insert({
      organization_id: organizationId,
      email,
      phone,
      first_name: firstName,
      last_name: lastName,
      role_code: roleCode,
      token_hash: tokenHash,
      invited_by: auth.context.authUserId,
      expires_at: expiresAt,
      delivery_channel: "email",
      delivery_status: "pending",
    })
    .select("id")
    .single();

  if (insertError || !insertedInvitation) {
    console.error("Failed to create employee invitation:", insertError);
    if (insertError?.code === "23505") {
      return jsonError(409, "ALREADY_INVITED", "Для этого email уже есть активное приглашение.");
    }
    return jsonError(500, "UNEXPECTED", insertError?.message ?? "Не удалось создать приглашение.");
  }

  const inviteUrl = new URL(buildInvitationNextPath(token), resolveSiteUrl(request)).toString();
  const organizationName = auth.context.organization.name;
  const roleLabel = mapInviteRoleCodeToUserRoleLabel(roleCode);
  const emailResult = await createEmailProvider().send({
    to: email,
    subject: `Приглашение в ${organizationName}`,
    text: [
      `Здравствуйте, ${firstName} ${lastName}.`,
      "",
      `${auth.context.profile.first_name ?? "Сотрудник"} приглашает вас в организацию ${organizationName} на роль ${roleLabel}.`,
      "",
      `Ссылка для принятия приглашения: ${inviteUrl}`,
      `Ссылка действует до: ${new Date(expiresAt).toLocaleString("ru-RU")}`,
      "",
      "Если у вас уже есть аккаунт, войдите в систему и откройте ссылку.",
      "Если аккаунта нет, создайте его по этой же ссылке.",
    ].join("\n"),
    html: `<p>Здравствуйте, ${firstName} ${lastName}.</p><p>${auth.context.profile.first_name ?? "Сотрудник"} приглашает вас в организацию <strong>${organizationName}</strong> на роль <strong>${roleLabel}</strong>.</p><p><a href="${inviteUrl}">Принять приглашение</a></p><p>Ссылка действует до: ${new Date(expiresAt).toLocaleString("ru-RU")}</p>`,
  });

  if (!emailResult.ok) {
    console.error("Failed to deliver employee invitation email:", emailResult.errorMessage);
    await supabase
      .from("employee_invitations")
      .update({
        revoked_at: new Date().toISOString(),
        delivery_status: "failed",
        delivery_error: emailResult.errorMessage ?? "Email delivery failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", insertedInvitation.id);

    return jsonError(
      422,
      emailResult.errorMessage === "Email provider is not configured" ? "EMAIL_PROVIDER_UNAVAILABLE" : "EMAIL_DELIVERY_FAILED",
      emailResult.errorMessage ?? "Email-провайдер отклонил отправку приглашения.",
    );
  }

  const { error: markSentError } = await supabase
    .from("employee_invitations")
    .update({
      delivery_status: "sent",
      delivery_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", insertedInvitation.id);

  if (markSentError) {
    console.error("Failed to mark employee invitation as sent:", markSentError);
  }

  return NextResponse.json({
    ok: true,
    data: {
      invitationId: insertedInvitation.id,
      email,
      roleCode,
      expiresAt,
      delivery: "email",
      smsStatus: phone ? "unavailable" : "not_requested",
      message: phone
        ? "Приглашение отправлено по email. SMS-приглашения сейчас недоступны."
        : "Приглашение отправлено по email.",
    },
  });
}
