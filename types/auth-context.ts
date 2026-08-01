export type Profile = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  role: string | null;
  status: string | null;
  additional_permissions: string[] | null;
  denied_permissions: string[] | null;
  created_at: string | null;
  updated_at: string | null;
};

export type Organization = {
  id: string;
  name: string;
  slug: string;
  created_at: string | null;
  updated_at: string | null;
};

export type OrganizationMember = {
  organization_id: string;
  user_id: string;
  role_code: string;
  additional_role_codes: string[];
  status: string;
};

export type CurrentUserContext = {
  authUserId: string;
  authEmail: string;
  profile: Profile;
  organizationMember: OrganizationMember | null;
  organization: Organization | null;
};