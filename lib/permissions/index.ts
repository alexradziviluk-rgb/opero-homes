import type { Permission, User, UserRole } from "@/types/user";

export type { Permission } from "@/types/user";

const ALL_PERMISSIONS: Permission[] = [
  "finance.view",
  "finance.reports",
  "analytics.view",
  "operations.view",
  "payments.view",
  "payments.collect",
  "bookings.view",
  "bookings.create",
  "bookings.edit",
  "bookings.confirm",
  "bookings.cancel",
  "bookings.delete",
  "bookings.move",
  "bookings.manage",
  "properties.view",
  "properties.manage",
  "clients.view",
  "clients.manage",
  "tasks.view",
  "tasks.manage",
  "cleaning.view",
  "cleaning.manage",
  "maintenance.view",
  "maintenance.manage",
  "employees.assign",
  "checkins.view",
  "checkins.manage",
  "users.view",
  "users.manage",
  "users.invite",
  "users.approve",
  "users.block",
  "users.assignRole",
  "settings.manage",
  "apartments.view",
  "apartments.manage",
  "calendar.view",
];

export function isPermissionValue(value: string): value is Permission {
  return ALL_PERMISSIONS.includes(value as Permission);
}

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  "Владелец": ALL_PERMISSIONS,
  "Собственник квартиры": [],
  "Менеджер": [
    "operations.view",
    "payments.view",
    "payments.collect",
    "bookings.view",
    "bookings.create",
    "bookings.edit",
    "bookings.confirm",
    "bookings.cancel",
    "bookings.move",
    "bookings.manage",
    "properties.view",
    "properties.manage",
    "clients.view",
    "clients.manage",
    "tasks.view",
    "tasks.manage",
    "cleaning.view",
    "cleaning.manage",
    "maintenance.view",
    "maintenance.manage",
    "employees.assign",
    "checkins.view",
    "checkins.manage",
    "users.view",
    "users.manage",
    "users.invite",
    "users.assignRole",
    "apartments.view",
    "apartments.manage",
    "calendar.view",
  ],
  "Сотрудник": [
    "operations.view",
    "bookings.view",
    "bookings.create",
    "bookings.edit",
    "bookings.confirm",
    "bookings.move",
    "payments.view",
    "properties.view",
    "tasks.view",
    "apartments.view",
    "calendar.view",
  ],
  "Уборщик": ["tasks.view", "cleaning.view"],
  "Специалист по обслуживанию": ["tasks.view", "maintenance.view"],
  "Гость": ["properties.view"],
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function getEffectivePermissions(user: User): Permission[] {
  const roles = [user.role, ...(user.additionalRoles ?? [])];
  const base = roles.flatMap((role) => ROLE_PERMISSIONS[role] ?? []);
  const additional = user.additionalPermissions ?? [];
  const denied = new Set(user.deniedPermissions ?? []);

  const merged = new Set<Permission>([...base, ...additional]);
  const effective = Array.from(merged).filter((permission) => !denied.has(permission));
  return effective;
}

export function hasEffectivePermission(user: User, permission: Permission): boolean {
  return getEffectivePermissions(user).includes(permission);
}

export function hasPermissionInList(permissions: Permission[], permission: Permission): boolean {
  return permissions.includes(permission);
}

export function canInviteUsers(role: UserRole): boolean {
  return hasPermission(role, "users.invite");
}

export function canApproveUsers(role: UserRole): boolean {
  return hasPermission(role, "users.approve");
}
