import "server-only";

import { redirect } from "next/navigation";
import { createSupabaseServerClient, getServerCurrentUserContext } from "@/lib/supabase/server";
import { getRoleCodeFromContext, isStaffRoleCode } from "@/lib/supabase/role-code";
import type { CurrentUserContext } from "@/types/auth-context";

type ServerAuthState = {
  isAuthenticated: boolean;
  isStaff: boolean;
  isClient: boolean;
  roleCode: string;
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
      context: null,
    };
  }

  const hasMembership = Boolean(context.organizationMember);
  const roleCode = getRoleCodeFromContext(context);
  const isStaff = hasMembership && isStaffRoleCode(roleCode);

  return {
    isAuthenticated: true,
    isStaff,
    isClient: !isStaff,
    roleCode,
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
