import { getApartmentById } from "@/app/apartments/apartment-utils";
import type { Booking } from "@/types/booking";
import type { BookingNotificationEventType, NotificationQueuePayload } from "@/types/notification";

type EmitOptions = {
  actionUrl?: string;
  clientWhatsappConsent?: boolean;
  idempotencySeed?: string;
};

function normalizeNumber(value: number): number {
  if (Number.isFinite(value)) {
    return Number(value);
  }

  return 0;
}

function resolveCurrency(): string {
  return "EUR";
}

function buildPayload(booking: Booking, options: EmitOptions): NotificationQueuePayload {
  const apartment = getApartmentById(booking.apartmentId);

  return {
    bookingId: booking.id,
    apartmentId: booking.apartmentId,
    apartmentTitle: apartment?.title ?? "Объект",
    clientId: booking.clientId || undefined,
    clientUserId: booking.guestUserId,
    clientWhatsappConsent: options.clientWhatsappConsent ?? false,
    guestName: booking.guestName,
    guestPhone: booking.guestPhone,
    guestEmail: booking.guestEmail,
    checkIn: booking.checkIn,
    checkOut: booking.checkOut,
    guests: booking.guests,
    totalAmount: normalizeNumber(booking.totalAmount),
    currency: resolveCurrency(),
    bookingStatus: booking.status,
    paymentStatus: booking.paymentStatus,
    notes: booking.notes,
    actionUrl: options.actionUrl ?? `/bookings/${booking.id}`,
  };
}

function buildIdempotencyKey(eventType: BookingNotificationEventType, booking: Booking, options: EmitOptions): string {
  const seed = options.idempotencySeed ?? booking.updatedAt ?? booking.createdAt ?? "manual";
  return `${eventType}:${booking.id}:${seed}`;
}

export async function emitBookingNotificationEvent(
  eventType: BookingNotificationEventType,
  booking: Booking,
  options: EmitOptions = {},
): Promise<void> {
  const payload = buildPayload(booking, options);

  await fetch("/api/notifications/events", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      eventType,
      idempotencyKey: buildIdempotencyKey(eventType, booking, options),
      bookingId: booking.id,
      apartmentId: booking.apartmentId,
      payload,
    }),
  }).catch(() => null);
}
