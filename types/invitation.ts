import type { EmployeeInviteRoleCode } from "@/lib/users/invitations";

export type EmployeeInvitationLookup = {
  invitationId: string;
  organizationId: string;
  organizationName: string;
  email: string;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  roleCode: EmployeeInviteRoleCode;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
};

export type ManagedEmployeeInvitation = {
  invitationId: string;
  email: string;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  roleCode: EmployeeInviteRoleCode;
  deliveryStatus: string;
  expiresAt: string;
  createdAt: string;
};

export type EmployeeInvitationApiErrorCode =
  | "INVALID_INPUT"
  | "AUTH_REQUIRED"
  | "INSUFFICIENT_PERMISSIONS"
  | "ALREADY_MEMBER"
  | "ALREADY_INVITED"
  | "EMAIL_PROVIDER_UNAVAILABLE"
  | "EMAIL_DELIVERY_FAILED"
  | "SMS_UNAVAILABLE"
  | "INVITATION_NOT_FOUND"
  | "INVITATION_EXPIRED"
  | "INVITATION_REVOKED"
  | "INVITATION_ALREADY_ACCEPTED"
  | "INVITATION_EMAIL_MISMATCH"
  | "PROFILE_MISSING"
  | "UNEXPECTED";
