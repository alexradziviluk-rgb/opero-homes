import type { User, UserRole, UserStatus, Permission } from "@/types/user";
import { isPermissionValue } from "@/lib/permissions";

type SupabaseProfileRow = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  role: string | null;
  status: string | null;
  additional_permissions?: string[] | null;
  denied_permissions?: string[] | null;
  created_at: string | null;
  updated_at: string | null;
};

function mapRole(role: string | null): UserRole {
  const normalized = (role ?? "").trim().toLowerCase();

  if (normalized === "owner" || normalized === "владелец") return "Владелец";
  if (normalized === "manager" || normalized === "менеджер") return "Менеджер";
  if (normalized === "employee" || normalized === "сотрудник") return "Сотрудник";
  if (normalized === "cleaner" || normalized === "уборщик") return "Уборщик";
  if (normalized === "maintenance" || normalized === "специалист по обслуживанию") {
    return "Специалист по обслуживанию";
  }
  if (normalized === "guest" || normalized === "гость") return "Гость";

  return "Гость";
}

function mapStatus(status: string | null): UserStatus {
  const normalized = (status ?? "").trim().toLowerCase();

  if (normalized === "active" || normalized === "активен") return "Активен";
  if (normalized === "invited" || normalized === "приглашен") return "Приглашен";
  if (normalized === "pending" || normalized === "ожидает подтверждения") return "Ожидает подтверждения";
  if (normalized === "blocked" || normalized === "inactive" || normalized === "заблокирован") return "Заблокирован";
  if (normalized === "invitation_expired" || normalized === "приглашение истекло") return "Приглашение истекло";

  return "Активен";
}

function mapPermissions(values: string[] | null | undefined): Permission[] {
  if (!values) {
    return [];
  }

  return values
    .map((value) => value.trim())
    .filter((value): value is Permission => isPermissionValue(value));
}

export function isActiveProfileStatus(status: string | null | undefined): boolean {
  return (status ?? "").trim().toLowerCase() === "active" || status === "Активен";
}

export function mapProfileToCurrentUser(
  profile: SupabaseProfileRow,
  organizationId: string,
  roleCodeOverride?: string | null,
  additionalRoleCodes: string[] = [],
): User {
  const now = new Date().toISOString();
  const effectiveRoleSource = roleCodeOverride ?? profile.role;
  const primaryRole = mapRole(effectiveRoleSource);
  const additionalRoles = additionalRoleCodes
    .map((roleCode) => mapRole(roleCode))
    .filter((role, index, roles) => role !== primaryRole && role !== "Гость" && roles.indexOf(role) === index);

  return {
    id: profile.id,
    organizationId,
    firstName: profile.first_name ?? "",
    lastName: profile.last_name ?? "",
    email: profile.email ?? "",
    phone: profile.phone ?? "",
    role: primaryRole,
    additionalRoles,
    status: mapStatus(profile.status),
    avatarUrl: profile.avatar_url,
    language: "ru",
    notes: "",
    additionalPermissions: mapPermissions(profile.additional_permissions),
    deniedPermissions: mapPermissions(profile.denied_permissions),
    createdAt: profile.created_at ?? now,
    updatedAt: profile.updated_at ?? now,
  };
}
