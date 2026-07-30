import type { CurrentUserContext } from "@/types/auth-context";

export function normalizeRoleCode(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function isManagerRoleCode(value: string | null | undefined): boolean {
  const normalized = normalizeRoleCode(value);
  return normalized === "owner" || normalized === "admin" || normalized === "manager";
}

export function isStaffRoleCode(value: string | null | undefined): boolean {
  const normalized = normalizeRoleCode(value);
  return (
    normalized === "owner" ||
    normalized === "admin" ||
    normalized === "manager" ||
    normalized === "employee" ||
    normalized === "staff" ||
    normalized === "cleaner" ||
    normalized === "maintenance" ||
    normalized === "technician"
  );
}

export function isGuestRoleCode(value: string | null | undefined): boolean {
  const normalized = normalizeRoleCode(value);
  return normalized === "guest" || normalized === "гость";
}

export function getRoleCodeFromContext(context: CurrentUserContext): string {
  return normalizeRoleCode(context.organizationMember?.role_code);
}

export function hasStaffMembership(context: CurrentUserContext | null): boolean {
  if (!context?.organizationMember) {
    return false;
  }

  return isStaffRoleCode(context.organizationMember.role_code);
}
