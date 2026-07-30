export type NotificationEventType =
  | "booking_created"
  | "booking_confirmed"
  | "booking_cancelled"
  | "booking_payment_succeeded"
  | "booking_payment_failed"
  | "new_guest_message"
  | "owner_invitation_accepted"
  | "apartment_published"
  | "apartment_unpublished"
  | "calendar_conflict"
  | "maintenance_created"
  | "maintenance_completed"
  | "booking_changed"
  | "booking_checkin_upcoming"
  | "booking_checkout_upcoming"
  | "booking_unassigned";

export type BookingNotificationEventType = NotificationEventType;

export type NotificationDeliveryChannel = "email" | "whatsapp";

export type NotificationDeliveryStatus =
  | "queued"
  | "processing"
  | "sent"
  | "delivered"
  | "failed"
  | "retry_scheduled"
  | "permanently_failed";

export type NotificationEventRow = {
  id: string;
  organization_id: string;
  event_type: NotificationEventType;
  entity_type: string;
  entity_id: string;
  booking_id: string | null;
  apartment_id: string | null;
  payload: Record<string, unknown>;
  idempotency_key: string;
  created_by_user_id: string | null;
  created_at: string;
};

export type InAppNotificationRow = {
  id: string;
  organization_id: string;
  recipient_user_id: string;
  event_id: string;
  title: string;
  message: string;
  action_url: string | null;
  read_at: string | null;
  created_at: string;
};

export type NotificationDeliveryRow = {
  id: string;
  organization_id: string;
  event_id: string;
  recipient_user_id: string | null;
  recipient_guest_id: string | null;
  recipient_key: string;
  channel: NotificationDeliveryChannel;
  destination: string;
  template_key: string;
  status: NotificationDeliveryStatus;
  attempt_count: number;
  next_attempt_at: string | null;
  provider_message_id: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  failed_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export type NotificationPreferenceRow = {
  organization_id: string;
  user_id: string;
  event_type: BookingNotificationEventType;
  in_app_enabled: boolean;
  email_enabled: boolean;
  whatsapp_enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type OrganizationNotificationSettingsRow = {
  organization_id: string;
  default_booking_manager_user_id: string | null;
  email_enabled: boolean;
  whatsapp_enabled: boolean;
  whatsapp_provider: string | null;
  whatsapp_channel_connected: boolean;
  fallback_rules: Record<string, unknown>;
  checkin_reminder_hours: number;
  checkout_reminder_hours: number;
  created_at: string;
  updated_at: string;
};

export type NotificationRecipient = {
  userId: string;
  email: string | null;
  phone: string | null;
  roleCode: string;
  receivesAs: "responsible" | "backup_manager" | "fallback_manager" | "client";
};

export type NotificationQueuePayload = {
  bookingId: string;
  apartmentId: string;
  apartmentTitle: string;
  clientId?: string;
  clientUserId?: string;
  clientWhatsappConsent?: boolean;
  guestName: string;
  guestPhone: string;
  guestEmail: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  totalAmount: number;
  currency: string;
  bookingStatus: string;
  paymentStatus: string;
  notes: string;
  actionUrl: string;
};

export type CreateBookingNotificationInput = {
  eventType: BookingNotificationEventType;
  idempotencyKey: string;
  bookingId: string;
  apartmentId: string;
  payload: NotificationQueuePayload;
};

export type NotificationListResponse = {
  items: InAppNotificationRow[];
  unreadCount: number;
  totalCount: number;
  hasMore: boolean;
  nextOffset: number | null;
};

export type NotificationCenterItem = InAppNotificationRow & {
  event_type: NotificationEventType;
};
