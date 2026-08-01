import "server-only";

import { redirect } from "next/navigation";
import { createSupabaseServerClient, getServerCurrentUserContext } from "@/lib/supabase/server";
import { getRoleCodeFromContext, hasStaffMembership, isStaffRoleCode } from "@/lib/supabase/role-code";
import type { CurrentUserContext } from "@/types/auth-context";

type ServerAuthState = {
  isAuthenticated: boolean;
  isStaff: boolean;
  isClient: boolean;
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
      roleCode: "",
      roleCodes: [],
      context: null,
    };
  }

  const hasMembership = hasStaffMembership(context);
  const roleCode = getRoleCodeFromContext(context);
  const roleCodes = [roleCode, ...(context.organizationMember?.additional_role_codes ?? [])];
  const isStaff = hasMembership && roleCodes.some((code) => isStaffRoleCode(code));

  return {
    isAuthenticated: true,
    isStaff,
    isClient: !isStaff,
    roleCode,
    roleCodes,
    context,
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
