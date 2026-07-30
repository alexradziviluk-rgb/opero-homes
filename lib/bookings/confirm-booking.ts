import { getApartmentById } from "@/app/apartments/apartment-utils";
import { getBookingById, getBookings } from "@/lib/bookings/booking-repository";
import { getClientById } from "@/lib/clients/client-repository";
import { hasBookingOverlap } from "@/lib/bookings/availability";
import { getEffectivePermissions } from "@/lib/permissions";
import { userRepository } from "@/lib/repositories/users";
import type { Booking } from "@/types/booking";
import { BOOKINGS_STORAGE_KEY } from "@/types/booking";
import {
  CLIENT_MESSAGES_STORAGE_KEY,
  type ClientMessage,
} from "@/types/client-message";
import {
  OUTGOING_EMAILS_STORAGE_KEY,
  type OutgoingEmail,
} from "@/types/outgoing-email";
import { TASKS_STORAGE_KEY, type Task } from "@/types/task";
import { AUDIT_LOG_STORAGE_KEY, type AuditLogEntry } from "@/types/audit-log";

export interface ConfirmBookingInput {
  bookingId: string;
  confirmedByUserId: string;
}

export interface ConfirmBookingResult {
  success: boolean;
  booking: Booking;
  notificationId?: string;
  emailQueueItemId?: string;
  createdTaskIds: string[];
  warnings: string[];
  alreadyConfirmed?: boolean;
}

function generateId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function formatDate(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function parseDate(value: string): Date | null {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function minusHours(value: string, hours: number): string {
  const start = new Date(`${value}T15:00:00`);
  start.setHours(start.getHours() - hours);
  return start.toISOString();
}

function safeParseArray<T>(raw: string | null): T[] {
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function commitLocalStorage(changes: Array<{ key: string; value: string }>): void {
  if (typeof window === "undefined") {
    throw new Error("Подтверждение доступно только в браузере");
  }

  const snapshots = new Map<string, string | null>();

  try {
    for (const change of changes) {
      if (!snapshots.has(change.key)) {
        snapshots.set(change.key, window.localStorage.getItem(change.key));
      }
      window.localStorage.setItem(change.key, change.value);
    }
  } catch (error) {
    for (const [key, snapshot] of snapshots.entries()) {
      if (snapshot === null) {
        window.localStorage.removeItem(key);
      } else {
        window.localStorage.setItem(key, snapshot);
      }
    }
    throw error;
  }
}

function readWorkflowCollections() {
  if (typeof window === "undefined") {
    return {
      bookings: [] as Booking[],
      messages: [] as ClientMessage[],
      emails: [] as OutgoingEmail[],
      tasks: [] as Task[],
      auditLog: [] as AuditLogEntry[],
    };
  }

  const bookings = getBookings();
  const messages = safeParseArray<ClientMessage>(window.localStorage.getItem(CLIENT_MESSAGES_STORAGE_KEY));
  const emails = safeParseArray<OutgoingEmail>(window.localStorage.getItem(OUTGOING_EMAILS_STORAGE_KEY));
  const tasks = safeParseArray<Task>(window.localStorage.getItem(TASKS_STORAGE_KEY));
  const auditLog = safeParseArray<AuditLogEntry>(window.localStorage.getItem(AUDIT_LOG_STORAGE_KEY));

  return {
    bookings,
    messages,
    emails,
    tasks,
    auditLog,
  };
}

function emitWorkflowUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("opero-bookings-changed"));
  window.dispatchEvent(new Event("opero-dashboard-changed"));
  window.dispatchEvent(new Event("opero-client-messages-changed"));
}

export function confirmBooking(input: ConfirmBookingInput): ConfirmBookingResult {
  if (typeof window === "undefined") {
    throw new Error("Подтверждение доступно только в браузере");
  }

  const booking = getBookingById(input.bookingId);
  if (!booking) {
    throw new Error("Бронирование не найдено");
  }

  const currentUser = userRepository.getById(input.confirmedByUserId);
  if (!currentUser) {
    throw new Error("Пользователь не найден");
  }

  const permissions = getEffectivePermissions(currentUser);
  if (!permissions.includes("bookings.confirm")) {
    throw new Error("Недостаточно прав для подтверждения бронирования");
  }

  if (booking.status === "cancelled") {
    throw new Error("Нельзя подтвердить отмененное бронирование");
  }

  const checkInDate = parseDate(booking.checkIn);
  const checkOutDate = parseDate(booking.checkOut);
  if (!checkInDate || !checkOutDate || checkInDate >= checkOutDate) {
    throw new Error("Некорректные даты бронирования");
  }

  const apartment = getApartmentById(booking.apartmentId);
  if (!apartment) {
    throw new Error("Объект бронирования не найден");
  }

  const collections = readWorkflowCollections();
  const warnings: string[] = [];

  const messageKey = `booking-confirmed-message:${booking.id}`;
  const emailKey = `booking-confirmed-email:${booking.id}`;
  const paymentTaskKey = `booking-payment-task:${booking.id}`;
  const instructionsTaskKey = `booking-instructions-task:${booking.id}`;
  const cleaningTaskKey = `booking-cleaning-task:${booking.id}`;
  const technicalTaskKey = `booking-technical-task:${booking.id}`;
  const auditKey = `booking-confirmed-audit:${booking.id}`;

  const existingMessage = collections.messages.find((item) => item.sourceKey === messageKey);
  const existingEmail = collections.emails.find((item) => item.sourceKey === emailKey);
  const existingTasks = collections.tasks.filter((task) =>
    task.sourceKey === paymentTaskKey ||
    task.sourceKey === instructionsTaskKey ||
    task.sourceKey === cleaningTaskKey ||
    task.sourceKey === technicalTaskKey,
  );

  if (booking.status === "confirmed") {
    return {
      success: true,
      booking,
      notificationId: existingMessage?.id,
      emailQueueItemId: existingEmail?.id,
      createdTaskIds: existingTasks.map((task) => task.id),
      warnings,
      alreadyConfirmed: true,
    };
  }

  if (booking.status !== "pending") {
    throw new Error("Текущий статус не допускает подтверждение");
  }

  const now = new Date().toISOString();
  const confirmedBooking: Booking = {
    ...booking,
    status: "confirmed",
    confirmedAt: now,
    confirmedByUserId: currentUser.id,
    updatedAt: now,
    updatedByUserId: currentUser.id,
  };

  const nextBookings = collections.bookings.map((item) => {
    if (item.id === booking.id) {
      return confirmedBooking;
    }

    const overlapsConfirmedRange =
      item.apartmentId === booking.apartmentId &&
      item.status === "pending" &&
      hasBookingOverlap(item.checkIn, item.checkOut, booking.checkIn, booking.checkOut);

    if (!overlapsConfirmedRange) {
      return item;
    }

    const conflictNote = "Конфликт с подтверждённым бронированием";
    if (item.notes.includes(conflictNote)) {
      return item;
    }

    return {
      ...item,
      notes: item.notes ? `${item.notes}\n${conflictNote}` : conflictNote,
      updatedAt: now,
      updatedByUserId: currentUser.id,
    };
  });

  const client = booking.clientId ? getClientById(booking.clientId) : null;
  if (!booking.clientId) {
    warnings.push("Клиент не привязан к бронированию");
  }

  const nextMessages = [...collections.messages];
  let notificationId: string | undefined = existingMessage?.id;

  if (booking.clientId && !existingMessage) {
    const message: ClientMessage = {
      id: generateId("msg"),
      clientId: booking.clientId,
      bookingId: booking.id,
      type: "booking_confirmed",
      title: "Бронирование подтверждено",
      body: `Ваше бронирование объекта ${apartment.title} подтверждено.\n\nЗаезд: ${formatDate(booking.checkIn)}\nВыезд: ${formatDate(booking.checkOut)}`,
      isRead: false,
      createdAt: now,
      sourceType: "booking_confirmation",
      sourceId: booking.id,
      sourceKey: messageKey,
    };
    nextMessages.unshift(message);
    notificationId = message.id;
  }

  const nextEmails = [...collections.emails];
  let emailQueueItemId: string | undefined = existingEmail?.id;

  if (!client?.email) {
    warnings.push("Email клиента не указан");
  }

  if (client?.email && !existingEmail) {
    const greetingName = client.firstName?.trim() || booking.guestName || "гость";
    const emailItem: OutgoingEmail = {
      id: generateId("mail"),
      clientId: client.id,
      bookingId: booking.id,
      to: client.email,
      subject: "Ваше бронирование подтверждено",
      text: `Здравствуйте, ${greetingName}!\n\nВаше бронирование подтверждено.\n\nОбъект: ${apartment.title}\nЗаезд: ${formatDate(booking.checkIn)}\nВыезд: ${formatDate(booking.checkOut)}\n\nСпасибо,\nOpero Homes`,
      status: "pending",
      attempts: 0,
      createdAt: now,
      sourceType: "booking_confirmation",
      sourceId: booking.id,
      sourceKey: emailKey,
    };
    nextEmails.unshift(emailItem);
    emailQueueItemId = emailItem.id;
  }

  const nextTasks = [...collections.tasks];
  const createdTaskIds: string[] = [];

  const maybeCreateTask = (task: Task) => {
    if (nextTasks.some((item) => item.sourceKey === task.sourceKey)) {
      const existing = nextTasks.find((item) => item.sourceKey === task.sourceKey);
      if (existing) createdTaskIds.push(existing.id);
      return;
    }
    nextTasks.unshift(task);
    createdTaskIds.push(task.id);
  };

  maybeCreateTask({
    id: generateId("tsk"),
    title: "Проверить оплату по бронированию",
    description: `Проверить поступление оплаты по бронированию ${booking.id}.`,
    status: "pending",
    taskType: "payment",
    dueAt: new Date(`${booking.checkIn}T10:00:00`).toISOString(),
    bookingId: booking.id,
    apartmentId: booking.apartmentId,
    assignedRole: "Менеджер",
    createdAt: now,
    updatedAt: now,
    sourceType: "booking_confirmation",
    sourceId: booking.id,
    sourceKey: paymentTaskKey,
  });

  maybeCreateTask({
    id: generateId("tsk"),
    title: "Отправить инструкции по заселению",
    description: `Отправить клиенту инструкции по заселению для бронирования ${booking.id}.`,
    status: "pending",
    taskType: "instructions",
    dueAt: minusHours(booking.checkIn, 24),
    bookingId: booking.id,
    apartmentId: booking.apartmentId,
    assignedRole: "Сотрудник",
    createdAt: now,
    updatedAt: now,
    sourceType: "booking_confirmation",
    sourceId: booking.id,
    sourceKey: instructionsTaskKey,
  });

  maybeCreateTask({
    id: generateId("tsk"),
    title: "Подготовить объект к заезду",
    description: `Подготовить объект ${apartment.title} к заезду по бронированию ${booking.id}.`,
    status: "pending",
    taskType: "cleaning",
    dueAt: new Date(`${booking.checkIn}T12:00:00`).toISOString(),
    bookingId: booking.id,
    apartmentId: booking.apartmentId,
    assignedRole: "Уборщик",
    createdAt: now,
    updatedAt: now,
    sourceType: "booking_confirmation",
    sourceId: booking.id,
    sourceKey: cleaningTaskKey,
  });

  const apartmentWithTechCheck = apartment as typeof apartment & {
    requiresPreArrivalTechnicalCheck?: boolean;
  };

  if (apartmentWithTechCheck.requiresPreArrivalTechnicalCheck === true) {
    maybeCreateTask({
      id: generateId("tsk"),
      title: "Проверить техническое состояние перед заездом",
      description: `Проверить техническое состояние объекта ${apartment.title} перед заездом.`,
      status: "pending",
      taskType: "technical",
      dueAt: minusHours(booking.checkIn, 12),
      bookingId: booking.id,
      apartmentId: booking.apartmentId,
      assignedRole: "Технический специалист",
      createdAt: now,
      updatedAt: now,
      sourceType: "booking_confirmation",
      sourceId: booking.id,
      sourceKey: technicalTaskKey,
    });
  }

  const nextAuditLog = [...collections.auditLog];
  if (!nextAuditLog.some((item) => item.sourceKey === auditKey)) {
    nextAuditLog.unshift({
      id: generateId("aud"),
      entityType: "booking",
      entityId: booking.id,
      action: "booking_confirmed",
      performedByUserId: currentUser.id,
      previousValue: {
        status: booking.status,
      },
      nextValue: {
        status: confirmedBooking.status,
      },
      createdAt: now,
      sourceType: "booking_confirmation",
      sourceId: booking.id,
      sourceKey: auditKey,
    });
  }

  commitLocalStorage([
    { key: BOOKINGS_STORAGE_KEY, value: JSON.stringify(nextBookings) },
    { key: CLIENT_MESSAGES_STORAGE_KEY, value: JSON.stringify(nextMessages) },
    { key: OUTGOING_EMAILS_STORAGE_KEY, value: JSON.stringify(nextEmails) },
    { key: TASKS_STORAGE_KEY, value: JSON.stringify(nextTasks) },
    { key: AUDIT_LOG_STORAGE_KEY, value: JSON.stringify(nextAuditLog) },
  ]);

  emitWorkflowUpdated();

  return {
    success: true,
    booking: confirmedBooking,
    notificationId,
    emailQueueItemId,
    createdTaskIds,
    warnings,
  };
}
