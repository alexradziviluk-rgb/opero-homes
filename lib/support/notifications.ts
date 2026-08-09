import type { SupabaseClient } from "@supabase/supabase-js";

export type SupportNotificationEvent = "support_ticket_created" | "support_manager_replied" | "support_conversation_closed";

type SupportNotificationInput = {
  supabase: SupabaseClient;
  organizationId: string;
  ticketId: string;
  publicNumber: string;
  eventType: SupportNotificationEvent;
  title: string;
  message: string;
  actionUrl: string;
  idempotencyKey: string;
  priority: string;
  apartmentId?: string | null;
  bookingId?: string | null;
  preferredUserId?: string | null;
};

type MemberRow = { user_id: string; role_code: string; status: string };

function managerRole(roleCode: string): boolean {
  const role = roleCode.trim().toLowerCase();
  return role === "owner" || role === "manager" || role === "admin";
}

export async function notifyStaff(params: SupportNotificationInput): Promise<void> {
  const membersResult = await params.supabase
    .from("organization_members")
    .select("user_id,role_code,status")
    .eq("organization_id", params.organizationId)
    .eq("status", "active");
  if (membersResult.error) throw new Error(membersResult.error.message);

  const members = (membersResult.data ?? []) as MemberRow[];
  const managers = members.filter((member) => managerRole(member.role_code));
  let preferredUserId = params.preferredUserId;
  if (!preferredUserId && params.apartmentId) {
    const apartmentResult = await params.supabase.from("apartments").select("responsible_user_id,backup_manager_user_id").eq("organization_id", params.organizationId).eq("id", params.apartmentId).maybeSingle();
    const apartment = apartmentResult.data as { responsible_user_id?: string | null; backup_manager_user_id?: string | null } | null;
    preferredUserId = apartment?.responsible_user_id ?? apartment?.backup_manager_user_id ?? null;
  }
  const preferred = preferredUserId ? managers.find((member) => member.user_id === preferredUserId) : undefined;
  const fallback = managers.find((member) => member.role_code.trim().toLowerCase() === "manager") ?? managers.find((member) => ["owner", "admin"].includes(member.role_code.trim().toLowerCase()));
  const recipients = [preferred ?? fallback].filter((recipient): recipient is MemberRow => Boolean(recipient));
  if (recipients.length === 0) return;

  const eventResult = await params.supabase
    .from("notification_events")
    .upsert({
      organization_id: params.organizationId,
      event_type: params.eventType,
      entity_type: "support_ticket",
      entity_id: params.ticketId,
      booking_id: params.bookingId ?? null,
      apartment_id: params.apartmentId ?? null,
      payload: {
        publicNumber: params.publicNumber,
        priority: params.priority,
        actionUrl: params.actionUrl,
      },
      idempotency_key: params.idempotencyKey,
      created_by_user_id: null,
    }, { onConflict: "organization_id,idempotency_key" })
    .select("id")
    .single();
  if (eventResult.error || !eventResult.data) throw new Error(eventResult.error?.message ?? "Unable to persist support notification event");

  const rows = recipients.map((recipient) => ({
    organization_id: params.organizationId,
    recipient_user_id: recipient.user_id,
    event_id: eventResult.data.id,
    title: params.title,
    message: params.message,
    action_url: params.actionUrl,
  }));
  const notificationResult = await params.supabase
    .from("notifications")
    .upsert(rows, { onConflict: "organization_id,event_id,recipient_user_id", ignoreDuplicates: true });
  if (notificationResult.error) throw new Error(notificationResult.error.message);
}