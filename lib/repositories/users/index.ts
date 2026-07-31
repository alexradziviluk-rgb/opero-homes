import {
  DEMO_ORGANIZATION_ID,
  type User,
  type UserCreateInput,
  type UserUpdateInput,
  USER_STORAGE_KEY,
} from "@/types/user";

type InviteUserInput = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: "Менеджер" | "Сотрудник" | "Уборщик" | "Специалист по обслуживанию";
  language?: string;
  notes?: string;
  invitedByUserId: string;
  invitationExpiresAt?: string;
};

type AcceptInvitationInput = {
  invitationCode: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
};

type UserRepository = {
  getAll(): User[];
  getById(id: string): User | null;
  create(data: UserCreateInput): User;
  update(id: string, data: UserUpdateInput): User;
  upsert(user: User): User;
  remove(id: string): void;
  invite(data: InviteUserInput): User;
  acceptInvitation(data: AcceptInvitationInput): User;
  approve(id: string, approvedByUserId: string): User;
  block(id: string, blockedByUserId: string): User;
  expireInvitation(id: string): User;
  createGuestUserFromBooking(params: { clientId: string; guestEmail: string; guestName: string; bookingId?: string }): User;
};

function nowIso() {
  return new Date().toISOString();
}

function generateId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `usr_${Math.random().toString(36).slice(2, 9)}`;
}

function generateInvitationCode() {
  return `INV-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
}

function normalizePhone(phone: string): string {
  return phone.replace(/[^\d+]/g, "").trim();
}

function normalizeUser(raw: Partial<User>): User {
  const now = nowIso();
  return {
    id: raw.id ?? generateId(),
    organizationId: raw.organizationId ?? DEMO_ORGANIZATION_ID,
    firstName: raw.firstName ?? "",
    lastName: raw.lastName ?? "",
    email: (raw.email ?? "").trim().toLowerCase(),
    phone: normalizePhone(raw.phone ?? ""),
    role: raw.role ?? "Сотрудник",
    status: raw.status ?? "Приглашен",
    avatarUrl: raw.avatarUrl ?? null,
    language: raw.language ?? "ru",
    notes: raw.notes ?? "",
    clientId: raw.clientId,
    invitedByUserId: raw.invitedByUserId,
    approvedByUserId: raw.approvedByUserId,
    invitedAt: raw.invitedAt,
    approvedAt: raw.approvedAt,
    invitationCode: raw.invitationCode,
    invitationExpiresAt: raw.invitationExpiresAt,
    additionalPermissions: raw.additionalPermissions ?? [],
    deniedPermissions: raw.deniedPermissions ?? [],
    createdAt: raw.createdAt ?? now,
    updatedAt: raw.updatedAt ?? now,
  };
}

function readStorage(): User[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => normalizeUser(item as Partial<User>));
  } catch {
    return [];
  }
}

function writeStorage(users: User[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(users));
}

function assertUniqueEmail(users: User[], email: string, ignoreId?: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const exists = users.some((user) => user.email === normalizedEmail && user.id !== ignoreId);
  if (exists) {
    throw new Error("Пользователь с таким email уже существует");
  }
}

function splitGuestName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { firstName: "Гость", lastName: "" };
  }

  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "" };
  }

  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

const localUserRepository: UserRepository = {
  getAll() {
    const users = readStorage();
    return users.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  getById(id) {
    return this.getAll().find((user) => user.id === id) ?? null;
  },
  create(data) {
    const users = this.getAll();
    assertUniqueEmail(users, data.email);
    const now = nowIso();
    const nextUser = normalizeUser({
      ...data,
      id: generateId(),
      organizationId: data.organizationId ?? DEMO_ORGANIZATION_ID,
      status: data.status ?? "Активен",
      createdAt: now,
      updatedAt: now,
    });
    const next = [nextUser, ...users];
    writeStorage(next);
    return nextUser;
  },
  update(id, data) {
    const users = this.getAll();
    const current = users.find((user) => user.id === id);
    if (!current) {
      throw new Error("Пользователь не найден");
    }

    const nextEmail = data.email ?? current.email;
    assertUniqueEmail(users, nextEmail, id);

    const updated = normalizeUser({
      ...current,
      ...data,
      id,
      organizationId: current.organizationId,
      createdAt: current.createdAt,
      updatedAt: nowIso(),
    });

    const next = users.map((user) => (user.id === id ? updated : user));
    writeStorage(next);
    return updated;
  },
  upsert(user) {
    const users = this.getAll();
    const existing = users.find((item) => item.id === user.id);
    if (existing) {
      const updated = normalizeUser({
        ...existing,
        ...user,
        id: existing.id,
        createdAt: existing.createdAt,
        updatedAt: nowIso(),
      });
      const next = users.map((item) => (item.id === existing.id ? updated : item));
      writeStorage(next);
      return updated;
    }

    assertUniqueEmail(users, user.email);
    const created = normalizeUser(user);
    const next = [created, ...users];
    writeStorage(next);
    return created;
  },
  remove(id) {
    const users = this.getAll();
    const next = users.filter((user) => user.id !== id);
    writeStorage(next);
  },
  invite(data) {
    const users = this.getAll();
    assertUniqueEmail(users, data.email);

    const now = nowIso();
    const invited = normalizeUser({
      id: generateId(),
      organizationId: DEMO_ORGANIZATION_ID,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phone: data.phone,
      role: data.role,
      status: "Приглашен",
      avatarUrl: null,
      language: data.language ?? "ru",
      notes: data.notes ?? "",
      invitedByUserId: data.invitedByUserId,
      invitedAt: now,
      invitationCode: generateInvitationCode(),
      invitationExpiresAt: data.invitationExpiresAt,
      createdAt: now,
      updatedAt: now,
    });

    const next = [invited, ...users];
    writeStorage(next);
    return invited;
  },
  acceptInvitation(data) {
    const users = this.getAll();
    const current = users.find((user) => user.invitationCode === data.invitationCode);
    if (!current) {
      throw new Error("Приглашение не найдено");
    }

    if (current.status === "Приглашение истекло") {
      throw new Error("Приглашение истекло");
    }

    const updated = normalizeUser({
      ...current,
      firstName: data.firstName ?? current.firstName,
      lastName: data.lastName ?? current.lastName,
      phone: data.phone ?? current.phone,
      status: "Ожидает подтверждения",
      updatedAt: nowIso(),
    });

    const next = users.map((user) => (user.id === updated.id ? updated : user));
    writeStorage(next);
    return updated;
  },
  approve(id, approvedByUserId) {
    const users = this.getAll();
    const current = users.find((user) => user.id === id);
    if (!current) {
      throw new Error("Пользователь не найден");
    }

    const approved = normalizeUser({
      ...current,
      status: "Активен",
      approvedByUserId,
      approvedAt: nowIso(),
      updatedAt: nowIso(),
    });

    const next = users.map((user) => (user.id === id ? approved : user));
    writeStorage(next);
    return approved;
  },
  block(id, blockedByUserId) {
    const users = this.getAll();
    const current = users.find((user) => user.id === id);
    if (!current) {
      throw new Error("Пользователь не найден");
    }

    const blocked = normalizeUser({
      ...current,
      status: "Заблокирован",
      notes: current.notes
        ? `${current.notes}\n\nЗаблокирован пользователем ${blockedByUserId} ${nowIso()}`
        : `Заблокирован пользователем ${blockedByUserId} ${nowIso()}`,
      updatedAt: nowIso(),
    });

    const next = users.map((user) => (user.id === id ? blocked : user));
    writeStorage(next);
    return blocked;
  },
  expireInvitation(id) {
    const users = this.getAll();
    const current = users.find((user) => user.id === id);
    if (!current) {
      throw new Error("Пользователь не найден");
    }

    const expired = normalizeUser({
      ...current,
      status: "Приглашение истекло",
      updatedAt: nowIso(),
    });

    const next = users.map((user) => (user.id === id ? expired : user));
    writeStorage(next);
    return expired;
  },
  createGuestUserFromBooking({ clientId, guestEmail, guestName, bookingId }) {
    const users = this.getAll();
    const normalizedEmail = guestEmail.trim().toLowerCase();

    const existingGuest = users.find((user) => user.role === "Гость" && user.email === normalizedEmail);
    if (existingGuest) {
      const updatedGuest = normalizeUser({
        ...existingGuest,
        clientId,
        status: "Активен",
        notes: bookingId
          ? `${existingGuest.notes ?? ""}\nБронирование: ${bookingId}`.trim()
          : existingGuest.notes,
        updatedAt: nowIso(),
      });
      writeStorage(users.map((user) => (user.id === existingGuest.id ? updatedGuest : user)));
      return updatedGuest;
    }

    const name = splitGuestName(guestName);
    const now = nowIso();
    const guestUser = normalizeUser({
      id: generateId(),
      organizationId: DEMO_ORGANIZATION_ID,
      firstName: name.firstName,
      lastName: name.lastName,
      email: normalizedEmail,
      phone: "",
      role: "Гость",
      status: "Активен",
      avatarUrl: null,
      language: "ru",
      notes: bookingId ? `Автоматически создан из бронирования ${bookingId}` : "Автоматически создан из бронирования",
      clientId,
      createdAt: now,
      updatedAt: now,
    });

    const next = [guestUser, ...users];
    writeStorage(next);
    return guestUser;
  },
};

export const userRepository = localUserRepository;
export type { UserRepository, InviteUserInput, AcceptInvitationInput };
