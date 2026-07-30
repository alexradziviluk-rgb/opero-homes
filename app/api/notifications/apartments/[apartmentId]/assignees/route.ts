import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStaffApiAuth } from "@/lib/supabase/api-auth";
import { getRoleCodeFromContext, isManagerRoleCode } from "@/lib/supabase/role-code";

type AssignPayload = {
  responsibleUserId: string | null;
  backupManagerUserId: string | null;
};

function isAssignPayload(value: unknown): value is AssignPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<AssignPayload>;
  return (
    (typeof candidate.responsibleUserId === "string" || candidate.responsibleUserId === null) &&
    (typeof candidate.backupManagerUserId === "string" || candidate.backupManagerUserId === null)
  );
}

function normalizeRoleCode(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function isAllowedResponsibleRole(roleCode: string): boolean {
  return ["owner", "admin", "manager", "employee", "staff", "cleaner", "maintenance", "technician"].includes(roleCode);
}

function isAllowedBackupRole(roleCode: string): boolean {
  return ["owner", "admin", "manager"].includes(roleCode);
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ apartmentId: string }> },
) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Supabase is not configured" }, { status: 500 });
  }

  const auth = await requireStaffApiAuth();
  if (!auth.ok) {
    return auth.response;
  }

  if (!isManagerRoleCode(getRoleCodeFromContext(auth.context))) {
    return NextResponse.json({ ok: false, error: "Insufficient permissions" }, { status: 403 });
  }

  const payload = (await request.json().catch(() => null)) as unknown;
  if (!isAssignPayload(payload)) {
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  const { apartmentId } = await context.params;
  const memberIds = [payload.responsibleUserId, payload.backupManagerUserId].filter((value): value is string => Boolean(value));

  if (memberIds.length > 0) {
    const { data: members, error: memberError } = await supabase
      .from("organization_members")
      .select("user_id,role_code")
      .eq("organization_id", auth.context.organization.id)
      .in("user_id", memberIds);

    if (memberError) {
      return NextResponse.json({ ok: false, error: memberError.message }, { status: 422 });
    }

    const roleMap = new Map(((members ?? []) as Array<{ user_id: string; role_code: string }>).map((row) => [row.user_id, normalizeRoleCode(row.role_code)]));

    if (payload.responsibleUserId) {
      const roleCode = roleMap.get(payload.responsibleUserId);
      if (!roleCode || !isAllowedResponsibleRole(roleCode)) {
        return NextResponse.json({ ok: false, error: "Responsible user is not allowed for this organization" }, { status: 422 });
      }
    }

    if (payload.backupManagerUserId) {
      const roleCode = roleMap.get(payload.backupManagerUserId);
      if (!roleCode || !isAllowedBackupRole(roleCode)) {
        return NextResponse.json({ ok: false, error: "Backup manager is not allowed for this organization" }, { status: 422 });
      }
    }
  }

  const { error } = await supabase
    .from("apartments")
    .update({
      responsible_user_id: payload.responsibleUserId,
      backup_manager_user_id: payload.backupManagerUserId,
    })
    .eq("organization_id", auth.context.organization.id)
    .eq("id", apartmentId);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 422 });
  }

  return NextResponse.json({ ok: true });
}
