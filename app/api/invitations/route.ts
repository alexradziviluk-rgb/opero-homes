import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { EmployeeInvitationLookup, EmployeeInvitationApiErrorCode } from "@/types/invitation";

type InviteLookupRow = {
  invitation_id: string;
  organization_id: string;
  organization_name: string;
  email: string;
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
  role_code: EmployeeInvitationLookup["roleCode"];
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
};

function jsonError(errorCode: EmployeeInvitationApiErrorCode, error: string, status: number) {
  return NextResponse.json({ ok: false, errorCode, error }, { status });
}

function mapLookupRow(row: InviteLookupRow): EmployeeInvitationLookup {
  return {
    invitationId: row.invitation_id,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    email: row.email,
    phone: row.phone,
    firstName: row.first_name,
    lastName: row.last_name,
    roleCode: row.role_code,
    expiresAt: row.expires_at,
    acceptedAt: row.accepted_at,
    revokedAt: row.revoked_at,
  };
}

function resolveInvitationState(invitation: EmployeeInvitationLookup) {
  if (invitation.revokedAt) {
    return { errorCode: "INVITATION_REVOKED" as const, error: "Приглашение отозвано.", status: 410 };
  }

  if (invitation.acceptedAt) {
    return { errorCode: "INVITATION_ALREADY_ACCEPTED" as const, error: "Приглашение уже использовано.", status: 410 };
  }

  if (new Date(invitation.expiresAt).getTime() <= Date.now()) {
    return { errorCode: "INVITATION_EXPIRED" as const, error: "Срок действия приглашения истёк.", status: 410 };
  }

  return null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const inviteToken = url.searchParams.get("invite")?.trim() ?? "";

  if (!inviteToken) {
    return jsonError("INVALID_INPUT", "Токен приглашения отсутствует.", 400);
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return jsonError("UNEXPECTED", "Supabase is not configured", 500);
  }

  const { data, error } = await supabase.rpc("get_employee_invitation", {
    invite_token: inviteToken,
  });

  if (error) {
    console.error("Failed to lookup employee invitation:", error);
    return jsonError("UNEXPECTED", error.message, 500);
  }

  const row = Array.isArray(data) ? (data[0] as InviteLookupRow | undefined) : undefined;
  if (!row) {
    return jsonError("INVITATION_NOT_FOUND", "Приглашение не найдено.", 404);
  }

  const invitation = mapLookupRow(row);
  const stateError = resolveInvitationState(invitation);
  if (stateError) {
    return jsonError(stateError.errorCode, stateError.error, stateError.status);
  }

  return NextResponse.json({ ok: true, data: invitation });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { invite?: string } | null;
  const inviteToken = body?.invite?.trim() ?? "";

  if (!inviteToken) {
    return jsonError("INVALID_INPUT", "Токен приглашения отсутствует.", 400);
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return jsonError("UNEXPECTED", "Supabase is not configured", 500);
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    if (authError) {
      console.error("Failed to read auth session for invitation acceptance:", authError);
    }

    return jsonError("AUTH_REQUIRED", "Для принятия приглашения необходимо войти.", 401);
  }

  const { data, error } = await supabase.rpc("accept_employee_invitation", {
    invite_token: inviteToken,
  });

  if (error) {
    console.error("Failed to accept employee invitation:", error);

    if (error.message.includes("MEMBERSHIP_ALREADY_EXISTS")) {
      return jsonError("ALREADY_MEMBER", "Пользователь уже состоит в этой организации.", 409);
    }

    if (error.message.includes("INVITATION_EMAIL_MISMATCH")) {
      return jsonError("INVITATION_EMAIL_MISMATCH", "Приглашение отправлено на другой email адрес.", 409);
    }

    if (error.message.includes("INVITATION_EXPIRED")) {
      return jsonError("INVITATION_EXPIRED", "Срок действия приглашения истёк.", 410);
    }

    if (error.message.includes("INVITATION_REVOKED")) {
      return jsonError("INVITATION_REVOKED", "Приглашение отозвано.", 410);
    }

    if (error.message.includes("INVITATION_ALREADY_ACCEPTED")) {
      return jsonError("INVITATION_ALREADY_ACCEPTED", "Приглашение уже использовано.", 410);
    }

    if (error.message.includes("INVITATION_NOT_FOUND")) {
      return jsonError("INVITATION_NOT_FOUND", "Приглашение не найдено.", 404);
    }

    if (error.message.includes("AUTH_REQUIRED") || error.message.includes("AUTH_EMAIL_MISSING")) {
      return jsonError("AUTH_REQUIRED", "Для принятия приглашения необходимо войти.", 401);
    }

    return jsonError("UNEXPECTED", error.message, 500);
  }

  const row = Array.isArray(data) ? data[0] : null;
  return NextResponse.json({ ok: true, data: row });
}