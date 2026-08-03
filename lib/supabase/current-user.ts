import type { SupabaseClient, User as SupabaseAuthUser } from "@supabase/supabase-js";
import type { CurrentUserContext, Organization, OrganizationMember, Profile } from "@/types/auth-context";

export const PRIMARY_ORGANIZATION_SLUG = "opero-homes";

type SupabaseLikeError = {
  message: string;
  code?: string;
};

export type CurrentUserLoadStage = "profiles" | "organization_members" | "organizations";

export type CurrentUserLoadErrorCode =
  | "profile_missing"
  | "membership_missing"
  | "organization_missing"
  | "rls_error"
  | "supabase_query_error"
  | "unexpected";

export type CurrentUserLoadError = {
  code: CurrentUserLoadErrorCode;
  stage: CurrentUserLoadStage;
  message?: string;
  supabaseCode?: string;
};

export type CurrentUserLoadResult = {
  context: CurrentUserContext | null;
  error?: CurrentUserLoadError;
};

const profileSelect = [
  "id",
  "first_name",
  "last_name",
  "email",
  "phone",
  "address",
  "avatar_url",
  "role",
  "status",
  "additional_permissions",
  "denied_permissions",
  "created_at",
  "updated_at",
].join(",");

const profileFallbackSelect = [
  "id",
  "user_id",
  "first_name",
  "last_name",
  "email",
  "phone",
  "address",
  "avatar_url",
  "role",
  "status",
  "additional_permissions",
  "denied_permissions",
  "created_at",
  "updated_at",
].join(",");

const memberSelect = [
  "organization_id",
  "user_id",
  "role_code",
  "additional_role_codes",
  "status",
].join(",");

const organizationSelect = [
  "id",
  "name",
  "slug",
  "created_at",
  "updated_at",
].join(",");

function classifyQueryError(code: string | undefined): CurrentUserLoadErrorCode {
  if (code === "42501") {
    return "rls_error";
  }

  return "supabase_query_error";
}

function buildQueryError(stage: CurrentUserLoadStage, error: SupabaseLikeError): CurrentUserLoadError {
  return {
    code: classifyQueryError(error.code),
    stage,
    message: error.message,
    supabaseCode: error.code,
  };
}

async function loadProfileByIdOrUserId(
  supabase: SupabaseClient,
  authUserId: string,
): Promise<{ profile: Profile | null; error?: CurrentUserLoadError }> {
  const { data: profileByIdData, error: profileByIdError } = await supabase
    .from("profiles")
    .select(profileSelect)
    .eq("id", authUserId)
    .maybeSingle();

  if (profileByIdError) {
    return { profile: null, error: buildQueryError("profiles", profileByIdError) };
  }

  if (profileByIdData) {
    return { profile: profileByIdData as unknown as Profile };
  }

  const { data: profileByUserIdData, error: profileByUserIdError } = await supabase
    .from("profiles")
    .select(profileFallbackSelect)
    .eq("user_id", authUserId)
    .maybeSingle();

  if (profileByUserIdError) {
    if (profileByUserIdError.code === "42703") {
      return {
        profile: null,
        error: {
          code: "profile_missing",
          stage: "profiles",
          message: "Profile was not found by id and profiles.user_id column is absent.",
          supabaseCode: profileByUserIdError.code,
        },
      };
    }

    return { profile: null, error: buildQueryError("profiles", profileByUserIdError) };
  }

  if (profileByUserIdData) {
    return { profile: profileByUserIdData as unknown as Profile };
  }

  return {
    profile: null,
    error: {
      code: "profile_missing",
      stage: "profiles",
      message: "No profile row matched auth user id in profiles.id or profiles.user_id.",
    },
  };
}

function resolveCurrentOrganization(
  organizations: Organization[],
  members: OrganizationMember[],
): { organization: Organization | null; member: OrganizationMember | null } {
  const organizationById = new Map(organizations.map((organization) => [organization.id, organization]));

  const membershipBySlug = members.find((member) => {
    const organization = organizationById.get(member.organization_id);
    return organization?.slug === PRIMARY_ORGANIZATION_SLUG;
  });

  if (membershipBySlug) {
    return {
      organization: organizationById.get(membershipBySlug.organization_id) ?? null,
      member: membershipBySlug,
    };
  }

  const firstMembership = members[0] ?? null;
  if (!firstMembership) {
    return { organization: null, member: null };
  }

  return {
    organization: organizationById.get(firstMembership.organization_id) ?? null,
    member: firstMembership,
  };
}

export async function loadCurrentUserContext(
  supabase: SupabaseClient,
  authUser: SupabaseAuthUser,
): Promise<CurrentUserLoadResult> {
  const profileResult = await loadProfileByIdOrUserId(supabase, authUser.id);
  if (!profileResult.profile) {
    return {
      context: null,
      error: profileResult.error ?? {
        code: "unexpected",
        stage: "profiles",
      },
    };
  }

  const profile = profileResult.profile;

  const { data: memberData, error: memberError } = await supabase
    .from("organization_members")
    .select(memberSelect)
    .eq("user_id", authUser.id);

  if (memberError) {
    return { context: null, error: buildQueryError("organization_members", memberError) };
  }

  const members = (memberData ?? []) as unknown as OrganizationMember[];
  if (members.length === 0) {
    return {
      context: {
        authUserId: authUser.id,
        authEmail: authUser.email ?? profile.email ?? "",
        profile,
        organizationMember: null,
        organization: null,
      },
    };
  }

  const organizationIdSet = new Set<string>();
  members.forEach((member) => {
    organizationIdSet.add(member.organization_id);
  });

  let organizations: Organization[] = [];

  if (organizationIdSet.size > 0) {
    const organizationIds = Array.from(organizationIdSet);
    const { data: organizationsData, error: organizationsError } = await supabase
      .from("organizations")
      .select(organizationSelect)
      .in("id", organizationIds);

    if (organizationsError) {
      return { context: null, error: buildQueryError("organizations", organizationsError) };
    }

    organizations = (organizationsData ?? []) as unknown as Organization[];
  }

  if (organizations.length === 0) {
    return {
      context: {
        authUserId: authUser.id,
        authEmail: authUser.email ?? profile.email ?? "",
        profile,
        organizationMember: null,
        organization: null,
      },
    };
  }

  const resolvedOrganization = resolveCurrentOrganization(organizations, members);
  const organization = resolvedOrganization.organization;

  if (!organization) {
    return {
      context: {
        authUserId: authUser.id,
        authEmail: authUser.email ?? profile.email ?? "",
        profile,
        organizationMember: null,
        organization: null,
      },
    };
  }

  const organizationMember = resolvedOrganization.member;
  if (!organizationMember) {
    return {
      context: {
        authUserId: authUser.id,
        authEmail: authUser.email ?? profile.email ?? "",
        profile,
        organizationMember: null,
        organization,
      },
    };
  }

  return {
    context: {
      authUserId: authUser.id,
      authEmail: authUser.email ?? profile.email ?? "",
      profile,
      organizationMember,
      organization,
    },
  };
}
