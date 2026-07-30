import type { BookingNotificationEventType, NotificationQueuePayload } from "@/types/notification";

export type RenderedNotificationTemplate = {
  title: string;
  message: string;
  emailSubject: string;
  emailText: string;
  whatsappTemplateKey: string;
  whatsappVariables: Record<string, string>;
};

function formatDate(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString("ru-RU");
}

function eventLabel(eventType: BookingNotificationEventType): string {
  if (eventType === "booking_confirmed") return "Новое подтвержденное бронирование";
  if (eventType === "booking_created") return "Новая заявка на бронирование";
  if (eventType === "booking_cancelled") return "Бронирование отменено";
  if (eventType === "booking_payment_succeeded") return "Оплата по бронированию успешна";
  if (eventType === "booking_payment_failed") return "Ошибка оплаты бронирования";
  if (eventType === "booking_changed") return "Бронирование изменено";
  if (eventType === "new_guest_message") return "Новое сообщение гостя";
  if (eventType === "owner_invitation_accepted") return "Приглашение владельца принято";
  if (eventType === "apartment_published") return "Объект опубликован";
  if (eventType === "apartment_unpublished") return "Объект снят с публикации";
  if (eventType === "calendar_conflict") return "Конфликт календаря";
  if (eventType === "maintenance_created") return "Создано обслуживание";
  if (eventType === "maintenance_completed") return "Обслуживание завершено";
  if (eventType === "booking_checkin_upcoming") return "Скорый заезд по бронированию";
  if (eventType === "booking_checkout_upcoming") return "Скорый выезд по бронированию";
  return "Объект без ответственного";
}

function formatStaffMessage(payload: NotificationQueuePayload, eventType: BookingNotificationEventType): string {
  return [
    `${eventLabel(eventType)}`,
    `Бронирование: ${payload.bookingId}`,
    `Объект: ${payload.apartmentTitle}`,
    `Гость: ${payload.guestName}`,
    `Телефон: ${payload.guestPhone || "не указан"}`,
    `Email: ${payload.guestEmail || "не указан"}`,
    `Даты: ${formatDate(payload.checkIn)} - ${formatDate(payload.checkOut)}`,
    `Гостей: ${payload.guests}`,
    `Сумма: ${payload.totalAmount} ${payload.currency}`,
    `Статус бронирования: ${payload.bookingStatus}`,
    `Статус оплаты: ${payload.paymentStatus}`,
    `Комментарий: ${payload.notes || "-"}`,
  ].join("\n");
}

function formatClientMessage(payload: NotificationQueuePayload, eventType: BookingNotificationEventType): string {
  const base = [
    `Бронирование: ${payload.bookingId}`,
    `Объект: ${payload.apartmentTitle}`,
    `Даты: ${formatDate(payload.checkIn)} - ${formatDate(payload.checkOut)}`,
    `Гостей: ${payload.guests}`,
    `Итог: ${payload.totalAmount} ${payload.currency}`,
    `Статус оплаты: ${payload.paymentStatus}`,
  ];

  if (eventType === "booking_cancelled") {
    return ["Ваше бронирование отменено.", ...base].join("\n");
  }

  if (eventType === "booking_payment_succeeded") {
    return ["Оплата подтверждена.", ...base].join("\n");
  }

  if (eventType === "booking_payment_failed") {
    return ["Оплата не прошла.", ...base].join("\n");
  }

  if (eventType === "booking_changed") {
    return ["Параметры бронирования обновлены.", ...base].join("\n");
  }

  return ["Бронирование подтверждено.", ...base].join("\n");
}

export function renderStaffTemplate(payload: NotificationQueuePayload, eventType: BookingNotificationEventType): RenderedNotificationTemplate {
  return {
    title: eventLabel(eventType),
    message: formatStaffMessage(payload, eventType),
    emailSubject: `${eventLabel(eventType)} · ${payload.apartmentTitle}`,
    emailText: formatStaffMessage(payload, eventType),
    whatsappTemplateKey: `staff_${eventType}`,
    whatsappVariables: {
      booking_id: payload.bookingId,
      apartment: payload.apartmentTitle,
      guest_name: payload.guestName,
      check_in: formatDate(payload.checkIn),
      check_out: formatDate(payload.checkOut),
      guests: String(payload.guests),
      amount: `${payload.totalAmount} ${payload.currency}`,
      payment_status: payload.paymentStatus,
      action_url: payload.actionUrl,
    },
  };
}

export function renderClientTemplate(payload: NotificationQueuePayload, eventType: BookingNotificationEventType): RenderedNotificationTemplate {
  return {
    title: eventLabel(eventType),
    message: formatClientMessage(payload, eventType),
    emailSubject: `${eventLabel(eventType)} · ${payload.apartmentTitle}`,
    emailText: formatClientMessage(payload, eventType),
    whatsappTemplateKey: `client_${eventType}`,
    whatsappVariables: {
      booking_id: payload.bookingId,
      apartment: payload.apartmentTitle,
      check_in: formatDate(payload.checkIn),
      check_out: formatDate(payload.checkOut),
      guests: String(payload.guests),
      amount: `${payload.totalAmount} ${payload.currency}`,
      payment_status: payload.paymentStatus,
      action_url: "/guest/bookings",
    },
  };
}
