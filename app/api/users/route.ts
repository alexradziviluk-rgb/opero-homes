import { NextRequest, NextResponse } from "next/server";
import { hasEffectivePermission, isPermissionValue } from "@/lib/permissions";
import { mapProfileToCurrentUser } from "@/lib/auth/profile-mapper";
import { requireStaffApiAuth } from "@/lib/supabase/api-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  ADDITIONAL_ORGANIZATION_ROLE_CODES,
  MANAGEABLE_MEMBER_STATUSES,
  MANAGEABLE_ORGANIZATION_ROLE_CODES,
  type AdditionalOrganizationRoleCode,
  type ManageableMemberStatus,
  type ManageableOrganizationRoleCode,
  type OrganizationUser,
} from "@/types/organization-user";
import type { Permission } from "@/types/user";

type OrganizationUserRow = {
  user_id: string;
  organization_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  role_code: string;
  additional_role_codes: string[] | null;
  member_status: string;
  joined_at: string;
  created_at: string;
  updated_at: string;
  additional_permissions: string[] | null;
  denied_permissions: string[] | null;
};

function isManageableRoleCode(value: unknown): value is ManageableOrganizationRoleCode {
  return typeof value === "string" && MANAGEABLE_ORGANIZATION_ROLE_CODES.some((role) => role === value);
}

function isManageableStatus(value: unknown): value is ManageableMemberStatus {
  return typeof value === "string" && MANAGEABLE_MEMBER_STATUSES.some((status) => status === value);
}

function parsePermissions(value: unknown): Permission[] | null {
  if (!Array.isArray(value) || !value.every((permission) => typeof permission === "string" && isPermissionValue(permission))) {
    return null;
  }

  return value;
}

function isAdditionalRoleCode(value: unknown): value is AdditionalOrganizationRoleCode {
  return typeof value === "string" && ADDITIONAL_ORGANIZATION_ROLE_CODES.some((role) => role === value);
}

function parseRoleCodes(value: unknown): AdditionalOrganizationRoleCode[] | null {
  if (!Array.isArray(value) || !value.every(isAdditionalRoleCode)) {
    return null;
  }

  return Array.from(new Set(value));
}

function mapUser(row: OrganizationUserRow): OrganizationUser {
  return {
    userId: row.user_id,
    organizationId: row.organization_id,
    firstName: row.first_name ?? "",
    lastName: row.last_name ?? "",
    email: row.email ?? "",
    phone: row.phone ?? "",
    roleCode: row.role_code,
    additionalRoleCodes: (row.additional_role_codes ?? []).filter(isAdditionalRoleCode),
    status: row.member_status,
    joinedAt: row.joined_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    additionalPermissions: (row.additional_permissions ?? []).filter(isPermissionValue),
    deniedPermissions: (row.denied_permissions ?? []).filter(isPermissionValue),
  };
}

async function authorize(permission: Permission) {
  const auth = await requireStaffApiAuth();
  if (!auth.ok) {
    return auth;
  }

  const currentUser = mapProfileToCurrentUser(
    auth.context.profile,
    auth.context.organization.id,
    auth.context.organizationMember.role_code,
    auth.context.organizationMember.additional_role_codes ?? [],
  );
  if (!hasEffectivePermission(currentUser, permission)) {
    return {
      ok: false as const,
      response: NextResponse.json({ ok: false, error: "Insufficient permissions" }, { status: 403 }),
    };
  }

  return auth;
}

export async function GET() {
  const auth = await authorize("users.view");
  if (!auth.ok) {
    return auth.response;
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Supabase is not configured" }, { status: 500 });
  }

  const { data, error } = await supabase.rpc("list_organization_users", {
    target_organization_id: auth.context.organization.id,
  });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 422 });
  }

  return NextResponse.json({ ok: true, data: ((data ?? []) as OrganizationUserRow[]).map(mapUser) });
}

export async function PATCH(request: NextRequest) {
  const auth = await authorize("users.manage");
  if (!auth.ok) {
    return auth.response;
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const additionalPermissions = parsePermissions(body?.additionalPermissions);
  const deniedPermissions = parsePermissions(body?.deniedPermissions);
  const additionalRoleCodes = parseRoleCodes(body?.additionalRoleCodes);

  if (
    !body ||
    typeof body.userId !== "string" ||
    typeof body.firstName !== "string" ||
    typeof body.lastName !== "string" ||
    typeof body.phone !== "string" ||
    !isManageableRoleCode(body.roleCode) ||
    !additionalRoleCodes ||
    additionalRoleCodes.some((roleCode) => roleCode === body.roleCode) ||
    !isManageableStatus(body.status) ||
    !additionalPermissions ||
    !deniedPermissions
  ) {
    return NextResponse.json({ ok: false, error: "Invalid member update" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Supabase is not configured" }, { status: 500 });
  }

  const { error } = await supabase.rpc("update_organization_user", {
    target_organization_id: auth.context.organization.id,
    target_user_id: body.userId,
    next_first_name: body.firstName,
    next_last_name: body.lastName,
    next_phone: body.phone,
    next_role_code: body.roleCode,
    next_additional_role_codes: additionalRoleCodes,
    next_status: body.status,
    next_additional_permissions: additionalPermissions,
    next_denied_permissions: deniedPermissions,
  });

  if (error) {
    const forbidden = error.message.includes("NOT_ALLOWED") || error.message.includes("OWNER_CANNOT_BE_MODIFIED");
    return NextResponse.json({ ok: false, error: error.message }, { status: forbidden ? 403 : 422 });
  }

  return NextResponse.json({ ok: true });
}