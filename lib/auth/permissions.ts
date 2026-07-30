import type { UserRole } from "@/types/user";
import { hasPermission, ROLE_PERMISSIONS } from "@/lib/permissions";
import type { Permission } from "@/lib/permissions";

export type { UserRole, Permission };

export type UserProfile = {
  id: string;
  organizationId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  role: UserRole;
  status: "Приглашен" | "Ожидает подтверждения" | "Активен" | "Заблокирован" | "Приглашение истекло";
  createdAt: string;
  updatedAt: string;
};

export { hasPermission, ROLE_PERMISSIONS };

export function getRoleLabel(role: UserRole): string {
  return role;
}
