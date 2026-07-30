import type { NotificationEventType } from "@/types/notification";

export const NOTIFICATION_EVENT_TYPES: NotificationEventType[] = [
  "booking_created",
  "booking_confirmed",
  "booking_cancelled",
  "booking_payment_succeeded",
  "booking_payment_failed",
  "new_guest_message",
  "owner_invitation_accepted",
  "apartment_published",
  "apartment_unpublished",
  "calendar_conflict",
  "maintenance_created",
  "maintenance_completed",
  "booking_changed",
  "booking_checkin_upcoming",
  "booking_checkout_upcoming",
  "booking_unassigned",
];

export const BOOKING_NOTIFICATION_EVENT_TYPES = NOTIFICATION_EVENT_TYPES;

export const NOTIFICATION_MAX_ATTEMPTS = 5;

export const NOTIFICATION_RETRY_BACKOFF_MINUTES = [5, 15, 60, 240, 720] as const;

export function isNotificationEventType(value: string): value is NotificationEventType {
  return NOTIFICATION_EVENT_TYPES.includes(value as NotificationEventType);
}

export function isBookingNotificationEventType(value: string): value is NotificationEventType {
  return isNotificationEventType(value);
}
