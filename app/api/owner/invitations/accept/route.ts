import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type InvitationRow = { invitation_id: string; organization_id: string; organization_name: string; email: string; phone: string | null; first_name: string; last_name: string | null; apartment_ids: string[]; expires_at: string; accepted_at: string | null; revoked_at: string | null };
function errorResponse(status: number, error: string, code: string) { return NextResponse.json({ ok: false, error, code }, { status }); }
function state(row: InvitationRow) {
  if (row.revoked_at) return [410, "Приглашение отозвано.", "INVITATION_REVOKED"] as const;
  if (row.accepted_at) return [410, "Приглашение уже использовано.", "INVITATION_ALREADY_ACCEPTED"] as const;
  if (new Date(row.expires_at).getTime() <= Date.now()) return [410, "Срок действия приглашения истёк.", "INVITATION_EXPIRED"] as const;
  return null;
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("invite")?.trim() ?? "";
  if (!token) return errorResponse(400, "Токен приглашения отсутствует.", "INVALID_INPUT");
  const supabase = await createSupabaseServerClient();
  if (!supabase) return errorResponse(500, "Supabase is not configured", "CONFIGURATION_MISSING");
  const { data, error } = await supabase.rpc("get_property_owner_invitation", { invite_token: token });
  if (error) return errorResponse(500, error.message, "INVITATION_LOOKUP_FAILED");
  const row = Array.isArray(data) ? data[0] as InvitationRow | undefined : undefined;
  if (!row) return errorResponse(404, "Приглашение не найдено.", "INVITATION_NOT_FOUND");
  const invitationState = state(row);
  if (invitationState) return errorResponse(invitationState[0], invitationState[1], invitationState[2]);
  return NextResponse.json({ ok: true, data: { invitationId: row.invitation_id, organizationName: row.organization_name, email: row.email, firstName: row.first_name, lastName: row.last_name, apartmentCount: row.apartment_ids.length, expiresAt: row.expires_at } });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { invite?: string } | null;
  const token = body?.invite?.trim() ?? "";
  if (!token) return errorResponse(400, "Токен приглашения отсутствует.", "INVALID_INPUT");
  const supabase = await createSupabaseServerClient();
  if (!supabase) return errorResponse(500, "Supabase is not configured", "CONFIGURATION_MISSING");
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return errorResponse(401, "Для принятия приглашения необходимо войти.", "AUTH_REQUIRED");
  const { data, error } = await supabase.rpc("accept_property_owner_invitation", { invite_token: token });
  if (error) {
    const message = error.message;
    const known: Record<string, [number, string, string]> = { AUTH_REQUIRED: [401, "Для принятия приглашения необходимо войти.", "AUTH_REQUIRED"], INVITATION_NOT_FOUND: [404, "Приглашение не найдено.", "INVITATION_NOT_FOUND"], INVITATION_EXPIRED: [410, "Срок действия приглашения истёк.", "INVITATION_EXPIRED"], INVITATION_REVOKED: [410, "Приглашение отозвано.", "INVITATION_REVOKED"], INVITATION_ALREADY_ACCEPTED: [410, "Приглашение уже использовано.", "INVITATION_ALREADY_ACCEPTED"], INVITATION_EMAIL_MISMATCH: [409, "Приглашение отправлено на другой email адрес.", "INVITATION_EMAIL_MISMATCH"], OWNER_ACCESS_PAUSED: [409, "Доступ собственника приостановлен.", "OWNER_ACCESS_PAUSED"], MEMBERSHIP_ALREADY_EXISTS: [409, "Пользователь уже состоит в этой организации с другой ролью.", "MEMBERSHIP_ALREADY_EXISTS"] };
    const found = Object.entries(known).find(([key]) => message.includes(key));
    return found ? errorResponse(found[1][0], found[1][1], found[1][2]) : errorResponse(500, message, "INVITATION_ACCEPT_FAILED");
  }
  return NextResponse.json({ ok: true, data: Array.isArray(data) ? data[0] : data });
}
