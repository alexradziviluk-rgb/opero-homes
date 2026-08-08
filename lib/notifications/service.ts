import type { SupabaseClient } from "@supabase/supabase-js";
import { renderClientTemplate, renderStaffTemplate } from "@/lib/notifications/templates";
import { loadPreferencesMap, resolveStaffRecipients } from "@/lib/notifications/recipients";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type {
  CreateBookingNotificationInput,
  InAppNotificationRow,
  NotificationEventRow,
  NotificationQueuePayload,
} from "@/types/notification";

type PersistedEventResult = {
  event: NotificationEventRow;
  inserted: boolean;
};

type EventInsertRow = {
  organization_id: string;
  event_type: string;
  entity_type: string;
  entity_id: string;
  booking_id: string;
  apartment_id: string;
  payload: Record<string, unknown>;
  idempotency_key: string;
  created_by_user_id: string;
};

type DeliveryInsertRow = {
  organization_id: string;
  event_id: string;
  recipient_user_id: string | null;
  recipient_guest_id: string | null;
  recipient_key: string;
  channel: "email" | "whatsapp";
  destination: string;
  template_key: string;
  status: "queued";
  attempt_count: number;
  next_attempt_at: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function toEventInsertRow(input: {
  organizationId: string;
  createdByUserId: string;
  request: CreateBookingNotificationInput;
}): EventInsertRow {
  return {
    organization_id: input.organizationId,
    event_type: input.request.eventType,
    entity_type: "booking",
    entity_id: input.request.bookingId,
    booking_id: input.request.bookingId,
    apartment_id: input.request.apartmentId,
    payload: input.request.payload,
    idempotency_key: input.request.idempotencyKey,
    created_by_user_id: input.createdByUserId,
  };
}

async function upsertEvent(params: {
  supabase: SupabaseClient;
  row: EventInsertRow;
}): Promise<PersistedEventResult> {
  const { supabase, row } = params;

  const { data, error } = await supabase
    .from("notification_events")
    .upsert(row, { onConflict: "organization_id,idempotency_key" })
    .select("id,organization_id,event_type,entity_type,entity_id,booking_id,apartment_id,payload,idempotency_key,created_by_user_id,created_at")
    .single();

  if (error || !data) {
    const message = error?.message ?? "Unable to persist notification event";
    throw new Error(message);
  }

  const event = data as NotificationEventRow;
  const inserted = event.idempotency_key === row.idempotency_key;
  return { event, inserted };
}

function shouldSendBackupWhatsApp(fallbackRules: Record<string, unknown> | null): boolean {
  const raw = fallbackRules && typeof fallbackRules === "object" ? fallbackRules["backup_manager_whatsapp_enabled"] : null;
  return raw === true;
}

function buildStaffRecipientKey(userId: string): string {
  return `user:${userId}`;
}

function buildGuestRecipientKey(email: string, phone: string): string {
  if (email.trim()) {
    return `guest-email:${email.trim().toLowerCase()}`;
  }

  return `guest-phone:${phone.trim()}`;
}

function hasWhatsAppConsent(payload: NotificationQueuePayload): boolean {
  return payload.clientWhatsappConsent === true;
}

export type CreateBookingNotificationResult = {
  eventId: string;
  createdNotifications: number;
  queuedDeliveries: number;
  warningNoAssignee: boolean;
};

export async function createBookingNotifications(params: {
  supabase: SupabaseClient;
  organizationId: string;
  actorUserId: string;
  request: CreateBookingNotificationInput;
}): Promise<CreateBookingNotificationResult> {
  const { supabase, organizationId, actorUserId, request } = params;
  const writeClient = createSupabaseServiceRoleClient() ?? supabase;

  const persisted = await upsertEvent({
    supabase: writeClient,
    row: toEventInsertRow({
      organizationId,
      createdByUserId: actorUserId,
      request,
    }),
  });

  const resolution = await resolveStaffRecipients({
    supabase,
    organizationId,
    apartmentId: request.apartmentId,
    apartmentTitleFallback: request.payload.apartmentTitle,
    eventType: request.eventType,
  });

  const recipientIds = resolution.recipients.map((recipient) => recipient.userId);
  const preferences = await loadPreferencesMap({
    supabase,
    organizationId,
    eventType: request.eventType,
    userIds: recipientIds,
  });

  const staffTemplate = renderStaffTemplate(
    {
      ...request.payload,
      apartmentTitle: resolution.apartmentTitle,
    },
    request.eventType,
  );

  const notificationRows: Array<Omit<InAppNotificationRow, "id" | "read_at" | "created_at">> = [];
  const deliveryRows: DeliveryInsertRow[] = [];

  resolution.recipients.forEach((recipient) => {
    const preference = preferences.get(recipient.userId);
    const inAppEnabled = preference ? preference.in_app_enabled : true;
    const emailEnabled = resolution.settings.email_enabled && (preference ? preference.email_enabled : true);
    const whatsappEnabledByUser = preference ? preference.whatsapp_enabled : false;

    if (inAppEnabled) {
      notificationRows.push({
        organization_id: organizationId,
        recipient_user_id: recipient.userId,
        event_id: persisted.event.id,
        title: staffTemplate.title,
        message: staffTemplate.message,
        action_url: request.payload.actionUrl,
      });
    }

    if (emailEnabled && recipient.email) {
      deliveryRows.push({
        organization_id: organizationId,
        event_id: persisted.event.id,
        recipient_user_id: recipient.userId,
        recipient_guest_id: null,
        recipient_key: buildStaffRecipientKey(recipient.userId),
        channel: "email",
        destination: recipient.email,
        template_key: staffTemplate.whatsappTemplateKey.replace("staff_", "email_staff_"),
        status: "queued",
        attempt_count: 0,
        next_attempt_at: nowIso(),
      });
    }

    const backupWhatsAppEnabled = shouldSendBackupWhatsApp(resolution.settings.fallback_rules);
    const canSendBackupWhatsApp = recipient.receivesAs !== "backup_manager" || backupWhatsAppEnabled;
    const canSendWhatsApp =
      resolution.settings.whatsapp_enabled &&
      resolution.settings.whatsapp_channel_connected &&
      whatsappEnabledByUser &&
      recipient.phone &&
      canSendBackupWhatsApp;

    if (canSendWhatsApp) {
      const destinationPhone = recipient.phone;
      if (!destinationPhone) {
        return;
      }

      deliveryRows.push({
        organization_id: organizationId,
        event_id: persisted.event.id,
        recipient_user_id: recipient.userId,
        recipient_guest_id: null,
        recipient_key: buildStaffRecipientKey(recipient.userId),
        channel: "whatsapp",
        destination: destinationPhone,
        template_key: staffTemplate.whatsappTemplateKey,
        status: "queued",
        attempt_count: 0,
        next_attempt_at: nowIso(),
      });
    }
  });

  const clientTemplate = renderClientTemplate(request.payload, request.eventType);

  if (request.payload.clientUserId) {
    notificationRows.push({
      organization_id: organizationId,
      recipient_user_id: request.payload.clientUserId,
      event_id: persisted.event.id,
      title: clientTemplate.title,
      message: clientTemplate.message,
      action_url: "/guest/bookings",
    });
  }

  if (resolution.settings.email_enabled && request.payload.guestEmail.trim()) {
    deliveryRows.push({
      organization_id: organizationId,
      event_id: persisted.event.id,
      recipient_user_id: null,
      recipient_guest_id: request.payload.clientId ?? buildGuestRecipientKey(request.payload.guestEmail, request.payload.guestPhone),
      recipient_key: buildGuestRecipientKey(request.payload.guestEmail, request.payload.guestPhone),
      channel: "email",
      destination: request.payload.guestEmail.trim(),
      template_key: clientTemplate.whatsappTemplateKey.replace("client_", "email_client_"),
      status: "queued",
      attempt_count: 0,
      next_attempt_at: nowIso(),
    });
  }

  if (
    resolution.settings.whatsapp_enabled &&
    resolution.settings.whatsapp_channel_connected &&
    request.payload.guestPhone.trim() &&
    hasWhatsAppConsent(request.payload)
  ) {
    deliveryRows.push({
      organization_id: organizationId,
      event_id: persisted.event.id,
      recipient_user_id: null,
      recipient_guest_id: request.payload.clientId ?? buildGuestRecipientKey(request.payload.guestEmail, request.payload.guestPhone),
      recipient_key: buildGuestRecipientKey(request.payload.guestEmail, request.payload.guestPhone),
      channel: "whatsapp",
      destination: request.payload.guestPhone.trim(),
      template_key: clientTemplate.whatsappTemplateKey,
      status: "queued",
      attempt_count: 0,
      next_attempt_at: nowIso(),
    });
  }

  if (notificationRows.length > 0) {
    const { error } = await writeClient
      .from("notifications")
      .upsert(notificationRows, { onConflict: "organization_id,event_id,recipient_user_id" });

    if (error) {
      throw new Error(error.message);
    }
  }

  if (deliveryRows.length > 0) {
    const { error } = await writeClient
      .from("notification_deliveries")
      .upsert(deliveryRows, { onConflict: "organization_id,event_id,recipient_key,channel,template_key" });

    if (error) {
      throw new Error(error.message);
    }
  }

  return {
    eventId: persisted.event.id,
    createdNotifications: notificationRows.length,
    queuedDeliveries: deliveryRows.length,
    warningNoAssignee: resolution.warningNoAssignee,
  };
}
