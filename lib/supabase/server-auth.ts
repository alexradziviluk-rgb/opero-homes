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
  const { data: hasActiveProperty } = await supabase.rpc("is_active_property_owner_user");

  if (!context) {
    if (hasActiveProperty) {
      const [{ data: relation }, { data: profile }] = await Promise.all([
        supabase.from("apartment_owner_access").select("organization_id").eq("user_id", user.id).eq("status", "active").limit(1).maybeSingle(),
        supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      ]);

      if (relation && profile) {
        const ownerContext: CurrentUserContext = {
          authUserId: user.id,
          authEmail: user.email ?? profile.email ?? "",
          profile,
          organizationMember: null,
          organization: { id: relation.organization_id, name: "", slug: "", created_at: null, updated_at: null },
        };
        return { isAuthenticated: true, isStaff: false, isClient: true, isPropertyOwner: true, roleCode: "", roleCodes: [], context: ownerContext };
      }
    }

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

export async function requireServerPropertyOwnerPage(apartmentId?: string): Promise<CurrentUserContext> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/guest");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/guest/login");

  const { data: hasOwnerAccess } = await supabase.rpc("is_active_property_owner_user");
  if (!hasOwnerAccess) redirect("/guest");

  const authState = await getServerAuthState();
  if (authState.context?.organization) return authState.context;

  const { data: properties } = await supabase.rpc("get_property_owner_properties");
  const ownerProperties = (properties as Array<{ id: string; organization_id?: string }> | null) ?? [];
  if (apartmentId && !ownerProperties.some((property) => property.id === apartmentId)) redirect("/guest");
  const organizationId = ownerProperties[0]?.organization_id ?? "property-owner";

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  return {
    authUserId: user.id,
    authEmail: user.email ?? profile?.email ?? "",
    profile: profile ?? {
      id: user.id,
      first_name: user.user_metadata?.first_name ?? null,
      last_name: user.user_metadata?.last_name ?? null,
      email: user.email ?? null,
      phone: user.user_metadata?.phone ?? null,
      address: null,
      avatar_url: null,
      role: "guest",
      status: "active",
      additional_permissions: [],
      denied_permissions: [],
      created_at: null,
      updated_at: null,
    },
    organizationMember: null,
    organization: { id: organizationId, name: "", slug: "", created_at: null, updated_at: null },
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
