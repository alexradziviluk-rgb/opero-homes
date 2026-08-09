import type { SupabaseClient } from "@supabase/supabase-js";
import { NOTIFICATION_MAX_ATTEMPTS, NOTIFICATION_RETRY_BACKOFF_MINUTES } from "@/lib/notifications/constants";
import { createEmailProvider } from "@/lib/notifications/providers/email-provider";
import { createWhatsAppProvider, normalizePhoneToE164 } from "@/lib/notifications/providers/whatsapp-provider";
import { sendTelegramMessage } from "@/lib/support/telegram";
import { renderClientTemplate, renderStaffTemplate } from "@/lib/notifications/templates";
import type { NotificationDeliveryRow, NotificationEventRow, NotificationQueuePayload } from "@/types/notification";

type ProcessQueueResult = {
  processed: number;
  sent: number;
  retryScheduled: number;
  permanentlyFailed: number;
};

function now(): Date {
  return new Date();
}

function scheduleRetry(attemptCount: number): string {
  const index = Math.min(Math.max(attemptCount - 1, 0), NOTIFICATION_RETRY_BACKOFF_MINUTES.length - 1);
  const minutes = NOTIFICATION_RETRY_BACKOFF_MINUTES[index];
  const next = new Date();
  next.setMinutes(next.getMinutes() + minutes);
  return next.toISOString();
}

function isClientTemplate(templateKey: string): boolean {
  return templateKey.startsWith("client_") || templateKey.startsWith("email_client_");
}

function isStaffTemplate(templateKey: string): boolean {
  return templateKey.startsWith("staff_") || templateKey.startsWith("email_staff_");
}

function extractEventType(templateKey: string, fallback: string): string {
  if (templateKey.startsWith("email_client_")) {
    return templateKey.replace("email_client_", "");
  }

  if (templateKey.startsWith("email_staff_")) {
    return templateKey.replace("email_staff_", "");
  }

  if (templateKey.startsWith("client_")) {
    return templateKey.replace("client_", "");
  }

  if (templateKey.startsWith("staff_")) {
    return templateKey.replace("staff_", "");
  }

  return fallback;
}

async function markDeliveryState(params: {
  supabase: SupabaseClient;
  id: string;
  status: NotificationDeliveryRow["status"];
  attemptCount: number;
  providerMessageId?: string;
  lastError?: string;
  nextAttemptAt?: string | null;
  sentAt?: string | null;
  deliveredAt?: string | null;
  failedAt?: string | null;
}) {
  const payload: Record<string, string | number | null> = {
    status: params.status,
    attempt_count: params.attemptCount,
    provider_message_id: params.providerMessageId ?? null,
    last_error: params.lastError ?? null,
    next_attempt_at: params.nextAttemptAt ?? null,
    sent_at: params.sentAt ?? null,
    delivered_at: params.deliveredAt ?? null,
    failed_at: params.failedAt ?? null,
  };

  const { error } = await params.supabase
    .from("notification_deliveries")
    .update(payload)
    .eq("id", params.id);

  if (error) {
    throw new Error(error.message);
  }
}

export async function processNotificationQueue(params: {
  supabase: SupabaseClient;
  organizationId: string;
  limit?: number;
}): Promise<ProcessQueueResult> {
  const { supabase, organizationId } = params;
  const limit = params.limit ?? 25;

  const { data: queueRows, error: queueError } = await supabase
    .from("notification_deliveries")
    .select("id,organization_id,event_id,recipient_user_id,recipient_guest_id,recipient_key,channel,destination,template_key,status,attempt_count,next_attempt_at,provider_message_id,sent_at,delivered_at,failed_at,last_error,created_at,updated_at")
    .eq("organization_id", organizationId)
    .in("status", ["queued", "retry_scheduled", "failed"])
    .order("created_at", { ascending: true })
    .limit(limit);

  if (queueError) {
    throw new Error(queueError.message);
  }

  const queue = (queueRows ?? []) as NotificationDeliveryRow[];
  if (queue.length === 0) {
    return {
      processed: 0,
      sent: 0,
      retryScheduled: 0,
      permanentlyFailed: 0,
    };
  }

  const eventIds = Array.from(new Set(queue.map((row) => row.event_id)));

  const { data: eventRows, error: eventsError } = await supabase
    .from("notification_events")
    .select("id,organization_id,event_type,entity_type,entity_id,booking_id,apartment_id,payload,idempotency_key,created_by_user_id,created_at")
    .in("id", eventIds);

  if (eventsError) {
    throw new Error(eventsError.message);
  }

  const eventMap = new Map((eventRows as NotificationEventRow[] | null ?? []).map((row) => [row.id, row]));

  const emailProvider = createEmailProvider();
  const whatsAppProvider = createWhatsAppProvider();

  let processed = 0;
  let sent = 0;
  let retryScheduled = 0;
  let permanentlyFailed = 0;

  for (const item of queue) {
    const event = eventMap.get(item.event_id);
    if (!event) {
      await markDeliveryState({
        supabase,
        id: item.id,
        status: "permanently_failed",
        attemptCount: item.attempt_count + 1,
        failedAt: now().toISOString(),
        lastError: "Notification event not found",
      });
      processed += 1;
      permanentlyFailed += 1;
      continue;
    }

    if (item.next_attempt_at && new Date(item.next_attempt_at) > now()) {
      continue;
    }

    await markDeliveryState({
      supabase,
      id: item.id,
      status: "processing",
      attemptCount: item.attempt_count,
    });

    processed += 1;

    const payload = event.payload as NotificationQueuePayload;
    const templateEventType = extractEventType(item.template_key, event.event_type);

    const rendered = isClientTemplate(item.template_key)
      ? renderClientTemplate(payload, templateEventType as NotificationEventRow["event_type"])
      : renderStaffTemplate(payload, templateEventType as NotificationEventRow["event_type"]);

    if (item.channel === "email") {
      const result = await emailProvider.send({
        to: item.destination,
        subject: rendered.emailSubject,
        text: rendered.emailText,
      });

      if (result.ok) {
        await markDeliveryState({
          supabase,
          id: item.id,
          status: "sent",
          attemptCount: item.attempt_count + 1,
          providerMessageId: result.providerMessageId,
          sentAt: now().toISOString(),
          deliveredAt: now().toISOString(),
        });
        sent += 1;
      } else {
        const nextAttemptCount = item.attempt_count + 1;
        if (nextAttemptCount >= NOTIFICATION_MAX_ATTEMPTS) {
          await markDeliveryState({
            supabase,
            id: item.id,
            status: "permanently_failed",
            attemptCount: nextAttemptCount,
            failedAt: now().toISOString(),
            lastError: result.errorMessage ?? "Email delivery failed",
          });
          permanentlyFailed += 1;
        } else {
          await markDeliveryState({
            supabase,
            id: item.id,
            status: "retry_scheduled",
            attemptCount: nextAttemptCount,
            failedAt: now().toISOString(),
            nextAttemptAt: scheduleRetry(nextAttemptCount),
            lastError: result.errorMessage ?? "Email delivery failed",
          });
          retryScheduled += 1;
        }
      }

      continue;
    }

    if (item.channel === "telegram") {
      const result = await sendTelegramMessage(item.destination, rendered.message);
      if (result.ok) {
        await markDeliveryState({
          supabase,
          id: item.id,
          status: "sent",
          attemptCount: item.attempt_count + 1,
          providerMessageId: result.messageId ?? undefined,
          sentAt: now().toISOString(),
          deliveredAt: now().toISOString(),
        });
        sent += 1;
      } else {
        const nextAttemptCount = item.attempt_count + 1;
        if (nextAttemptCount >= NOTIFICATION_MAX_ATTEMPTS) {
          await markDeliveryState({
            supabase,
            id: item.id,
            status: "permanently_failed",
            attemptCount: nextAttemptCount,
            failedAt: now().toISOString(),
            lastError: result.error ?? "Telegram delivery failed",
          });
          permanentlyFailed += 1;
        } else {
          await markDeliveryState({
            supabase,
            id: item.id,
            status: "retry_scheduled",
            attemptCount: nextAttemptCount,
            failedAt: now().toISOString(),
            nextAttemptAt: scheduleRetry(nextAttemptCount),
            lastError: result.error ?? "Telegram delivery failed",
          });
          retryScheduled += 1;
        }
      }
      continue;
    }

    if (item.channel === "whatsapp") {
      const phoneE164 = normalizePhoneToE164(item.destination);
      if (!phoneE164) {
        const nextAttemptCount = item.attempt_count + 1;
        await markDeliveryState({
          supabase,
          id: item.id,
          status: "permanently_failed",
          attemptCount: nextAttemptCount,
          failedAt: now().toISOString(),
          lastError: "Destination phone is not in E.164 format",
        });
        permanentlyFailed += 1;
        continue;
      }

      const result = await whatsAppProvider.sendTemplate({
        destinationPhoneE164: phoneE164,
        templateKey: isStaffTemplate(item.template_key)
          ? rendered.whatsappTemplateKey
          : rendered.whatsappTemplateKey,
        variables: rendered.whatsappVariables,
      });

      if (result.ok) {
        await markDeliveryState({
          supabase,
          id: item.id,
          status: "sent",
          attemptCount: item.attempt_count + 1,
          providerMessageId: result.providerMessageId,
          sentAt: now().toISOString(),
          deliveredAt: now().toISOString(),
        });
        sent += 1;
      } else {
        const nextAttemptCount = item.attempt_count + 1;
        if (nextAttemptCount >= NOTIFICATION_MAX_ATTEMPTS) {
          await markDeliveryState({
            supabase,
            id: item.id,
            status: "permanently_failed",
            attemptCount: nextAttemptCount,
            failedAt: now().toISOString(),
            lastError: result.errorMessage ?? "WhatsApp delivery failed",
          });
          permanentlyFailed += 1;
        } else {
          await markDeliveryState({
            supabase,
            id: item.id,
            status: "retry_scheduled",
            attemptCount: nextAttemptCount,
            failedAt: now().toISOString(),
            nextAttemptAt: scheduleRetry(nextAttemptCount),
            lastError: result.errorMessage ?? "WhatsApp delivery failed",
          });
          retryScheduled += 1;
        }
      }
    }
  }

  return {
    processed,
    sent,
    retryScheduled,
    permanentlyFailed,
  };
}
