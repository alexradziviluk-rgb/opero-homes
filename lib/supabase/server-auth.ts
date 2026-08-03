import "server-only";

import { redirect } from "next/navigation";
import { createSupabaseServerClient, getServerCurrentUserContext } from "@/lib/supabase/server";
import { getRoleCodeFromContext, hasStaffMembership, isStaffRoleCode } from "@/lib/supabase/role-code";
import type { CurrentUserContext } from "@/types/auth-context";

type ServerAuthState = {
  isAuthenticated: boolean;
  isStaff: boolean;
  isClient: boolean;
  isPropertyOwner: boolean;
  roleCode: string;
  roleCodes: string[];
  context: CurrentUserContext | null;
};

export async function getServerAuthState(): Promise<ServerAuthState> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return {
      isAuthenticated: false,
      isStaff: false,
      isClient: false,
      isPropertyOwner: false,
      roleCode: "",
      roleCodes: [],
      context: null,
    };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      isAuthenticated: false,
      isStaff: false,
      isClient: false,
      isPropertyOwner: false,
      roleCode: "",
      roleCodes: [],
      context: null,
    };
  }

  const currentUserResult = await getServerCurrentUserContext();
  const context = currentUserResult.currentUserContext;

  if (!context) {
    return {
      isAuthenticated: true,
      isStaff: false,
      isClient: true,
      isPropertyOwner: false,
      roleCode: "",
      roleCodes: [],
      context: null,
    };
  }

  const hasMembership = hasStaffMembership(context);
  const roleCode = getRoleCodeFromContext(context);
  const roleCodes = [roleCode, ...(context.organizationMember?.additional_role_codes ?? [])];
  const isStaff = hasMembership && roleCodes.some((code) => isStaffRoleCode(code));
  const { data: hasActiveProperty } = await supabase.rpc("is_active_property_owner_user");
  const isPropertyOwner = Boolean(hasActiveProperty);

  return {
    isAuthenticated: true,
    isStaff,
    isClient: !isStaff,
    isPropertyOwner,
    roleCode,
    roleCodes,
    context,
  };
}

export async function requireServerPropertyOwnerPage(): Promise<CurrentUserContext> {
  const authState = await getServerAuthState();
  if (!authState.isAuthenticated) redirect("/guest/login");
  if (!authState.isPropertyOwner || !authState.context) redirect("/guest");
  if (authState.context.organization) return authState.context;
  const supabase = await createSupabaseServerClient();
  const { data: relation } = await supabase?.from("apartment_owner_access").select("organization_id").eq("user_id", authState.context.authUserId).eq("status", "active").limit(1).maybeSingle() ?? { data: null };
  if (!relation) redirect("/guest");
  return {
    ...authState.context,
    organization: { id: relation.organization_id, name: "", slug: "", created_at: null, updated_at: null },
  };
}

export async function requireServerStaffPage(): Promise<CurrentUserContext> {
  const authState = await getServerAuthState();

  if (!authState.isAuthenticated) {
    redirect("/login");
  }

  if (!authState.isStaff || !authState.context) {
    redirect("/guest");
  }

  return authState.context;
}

export async function requireServerRoleCodesPage(allowedRoleCodes: string[]): Promise<CurrentUserContext> {
  const authState = await getServerAuthState();

  if (!authState.isAuthenticated) {
    redirect("/login");
  }

  if (!authState.isStaff || !authState.context) {
    redirect("/guest");
  }

  if (!authState.roleCodes.some((roleCode) => allowedRoleCodes.includes(roleCode))) {
    redirect("/admin");
  }

  return authState.context;
}
