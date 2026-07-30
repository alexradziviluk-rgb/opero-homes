export const EMPLOYEE_INVITE_ROLE_CODES = ["manager", "employee", "cleaner", "technician"] as const;

export type EmployeeInviteRoleCode = (typeof EMPLOYEE_INVITE_ROLE_CODES)[number];

export const EMPLOYEE_INVITE_ROLE_LABELS: Record<EmployeeInviteRoleCode, string> = {
  manager: "Менеджер",
  employee: "Сотрудник",
  cleaner: "Уборщик",
  technician: "Технический специалист",
};

export function mapUserRoleToInviteRoleCode(role: string): EmployeeInviteRoleCode | null {
  const normalized = role.trim().toLowerCase();

  if (normalized === "менеджер") return "manager";
  if (normalized === "сотрудник") return "employee";
  if (normalized === "уборщик") return "cleaner";
  if (normalized === "технический специалист") return "technician";

  return null;
}

export function mapInviteRoleCodeToUserRoleLabel(roleCode: string): string {
  const normalized = roleCode.trim().toLowerCase();
  if (normalized === "manager") return EMPLOYEE_INVITE_ROLE_LABELS.manager;
  if (normalized === "employee") return EMPLOYEE_INVITE_ROLE_LABELS.employee;
  if (normalized === "cleaner") return EMPLOYEE_INVITE_ROLE_LABELS.cleaner;
  if (normalized === "technician") return EMPLOYEE_INVITE_ROLE_LABELS.technician;
  return roleCode;
}

export function isEmployeeInviteRoleCode(value: string): value is EmployeeInviteRoleCode {
  return EMPLOYEE_INVITE_ROLE_CODES.includes(value as EmployeeInviteRoleCode);
}

export function normalizeInviteEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidInviteEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeInviteEmail(value));
}

export function normalizeInvitePhone(value: string): string | null {
  const normalized = value.replace(/[^\d+]/g, "").trim();
  return normalized ? normalized : null;
}

export function buildInvitationNextPath(token: string): string {
  return `/invite?invite=${encodeURIComponent(token)}`;
}
