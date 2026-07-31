import type { Permission } from "@/types/user";

export const MANAGEABLE_ORGANIZATION_ROLE_CODES = ["manager", "employee", "cleaner", "maintenance"] as const;
export const MANAGEABLE_MEMBER_STATUSES = ["active", "paused"] as const;

export type ManageableOrganizationRoleCode = (typeof MANAGEABLE_ORGANIZATION_ROLE_CODES)[number];
export type ManageableMemberStatus = (typeof MANAGEABLE_MEMBER_STATUSES)[number];

export type OrganizationUser = {
  userId: string;
  organizationId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  roleCode: string;
  status: string;
  joinedAt: string;
  createdAt: string;
  updatedAt: string;
  additionalPermissions: Permission[];
  deniedPermissions: Permission[];
};

export type OrganizationUserUpdate = {
  firstName: string;
  lastName: string;
  phone: string;
  roleCode: ManageableOrganizationRoleCode;
  status: ManageableMemberStatus;
  additionalPermissions: Permission[];
  deniedPermissions: Permission[];
};
