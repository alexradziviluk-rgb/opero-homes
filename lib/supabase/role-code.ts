import type { CurrentUserContext } from "@/types/auth-context";

export function normalizeRoleCode(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function isManagerRoleCode(value: string | null | undefined): boolean {
  const normalized = normalizeRoleCode(value);
  return normalized === "owner" || normalized === "manager";
}

export function isStaffRoleCode(value: string | null | undefined): boolean {
  const normalized = normalizeRoleCode(value);
  return (
    normalized === "owner" ||
    normalized === "manager" ||
    normalized === "employee" ||
    normalized === "cleaner" ||
    normalized === "maintenance"
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
  if (!context?.organizationMember || context.organizationMember.status !== "active") {
    return false;
  }

  return isStaffRoleCode(context.organizationMember.role_code);
}
