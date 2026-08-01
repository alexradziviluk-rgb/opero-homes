import { NextResponse } from "next/server";
import { requireStaffApiAuth } from "@/lib/supabase/api-auth";
import { normalizeRoleCode } from "@/lib/supabase/role-code";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ManagedEmployeeInvitation } from "@/types/invitation";

const INVITATION_MANAGER_ROLES = new Set(["owner", "manager"]);

type InvitationRow = {
  invitation_id: string;
  email: string;
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
  role_code: ManagedEmployeeInvitation["roleCode"];
  delivery_status: string;
  expires_at: string;
  created_at: string;
};

function error(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

async function authorizeInvitationManager() {
  const auth = await requireStaffApiAuth();
  if (!auth.ok) return auth;

  const roleCode = normalizeRoleCode(auth.context.organizationMember.role_code);
  if (!INVITATION_MANAGER_ROLES.has(roleCode)) {
    return { ok: false as const, response: error(403, "Недостаточно прав для управления приглашениями.") };
  }

  return auth;
}

function mapInvitation(row: InvitationRow): ManagedEmployeeInvitation {
  return {
    invitationId: row.invitation_id,
    email: row.email,
    phone: row.phone,
    firstName: row.first_name,
    lastName: row.last_name,
    roleCode: row.role_code,
    deliveryStatus: row.delivery_status,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

export async function GET() {
  const auth = await authorizeInvitationManager();
  if (!auth.ok) return auth.response;

  const supabase = await createSupabaseServerClient();
  if (!supabase) return error(500, "Supabase is not configured");

  const { data, error: listError } = await supabase.rpc("list_active_employee_invitations", {
    target_organization_id: auth.context.organization.id,
  });

  if (listError) return error(422, listError.message);
  return NextResponse.json({ ok: true, data: ((data ?? []) as InvitationRow[]).map(mapInvitation) });
}

export async function DELETE(request: Request) {
  const auth = await authorizeInvitationManager();
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => null)) as { invitationId?: string } | null;
  const invitationId = body?.invitationId?.trim() ?? "";
  if (!invitationId) return error(400, "Invitation id is required");

  const supabase = await createSupabaseServerClient();
  if (!supabase) return error(500, "Supabase is not configured");

  const { data, error: revokeError } = await supabase.rpc("revoke_employee_invitation", {
    target_organization_id: auth.context.organization.id,
    target_invitation_id: invitationId,
  });

  if (revokeError) {
    if (revokeError.message.includes("INVITATION_NOT_ACTIVE")) {
      return error(409, "Приглашение уже принято, отозвано или не найдено.");
    }
    return error(revokeError.message.includes("NOT_ALLOWED") ? 403 : 422, revokeError.message);
  }

  return NextResponse.json({ ok: true, data });
}
