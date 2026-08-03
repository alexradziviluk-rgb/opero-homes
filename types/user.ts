export type UserRole =
  | "Владелец"
  | "Собственник квартиры"
  | "Менеджер"
  | "Сотрудник"
  | "Уборщик"
  | "Специалист по обслуживанию"
  | "Гость";

export type Permission =
  | "finance.view"
  | "finance.reports"
  | "analytics.view"
  | "operations.view"
  | "payments.view"
  | "payments.collect"
  | "bookings.view"
  | "bookings.create"
  | "bookings.edit"
  | "bookings.confirm"
  | "bookings.cancel"
  | "bookings.delete"
  | "bookings.move"
  | "bookings.manage"
  | "properties.view"
  | "properties.manage"
  | "clients.view"
  | "clients.manage"
  | "tasks.view"
  | "tasks.manage"
  | "cleaning.view"
  | "cleaning.manage"
  | "maintenance.view"
  | "maintenance.manage"
  | "employees.assign"
  | "checkins.view"
  | "checkins.manage"
  | "users.view"
  | "users.manage"
  | "users.invite"
  | "users.approve"
  | "users.block"
  | "users.assignRole"
  | "settings.manage"
  | "apartments.view"
  | "apartments.manage"
  | "calendar.view";

export type UserStatus =
  | "Приглашен"
  | "Ожидает подтверждения"
  | "Активен"
  | "Заблокирован"
  | "Приглашение истекло";

export type User = {
  id: string;
  organizationId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  role: UserRole;
  status: UserStatus;
  avatarUrl: string | null;
  language: string;
  notes: string;
  additionalRoles?: UserRole[];
  clientId?: string;
  invitedByUserId?: string;
  approvedByUserId?: string;
  invitedAt?: string;
  approvedAt?: string;
  invitationCode?: string;
  invitationExpiresAt?: string;
  additionalPermissions?: Permission[];
  deniedPermissions?: Permission[];
  createdAt: string;
  updatedAt: string;
};

export type UserCreateInput = Omit<User, "id" | "createdAt" | "updatedAt" | "organizationId"> & {
  organizationId?: string;
};

export type UserUpdateInput = Partial<UserCreateInput>;

export const USER_STORAGE_KEY = "opero-homes-users";
export const DEMO_ORGANIZATION_ID = "demo-organization";
