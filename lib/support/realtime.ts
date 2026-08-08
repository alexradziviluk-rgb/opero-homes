import "server-only";

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { isSupportRealtimeEnabled } from "./feature-flags";

export type ConversationEvent = {
  kind: "message" | "state" | "typing";
  conversation: string;
  state?: string;
  senderType?: string;
  message?: string;
  messageType?: string;
  source?: string;
  clientMessageId?: string;
  createdAt: string;
};

export async function publishConversationEvent(event: ConversationEvent): Promise<void> {
  if (!isSupportRealtimeEnabled()) return;
  const supabase = createSupabaseServiceRoleClient();
  if (!supabase) return;
  if (event.kind !== "typing") {
    const { data: ticket } = await supabase.from("support_tickets").select("id,organization_id,public_number").eq("public_number", event.conversation).maybeSingle();
    if (ticket) {
      await supabase.from("support_realtime_events").insert({
        ticket_id: ticket.id,
        organization_id: ticket.organization_id,
        public_number: ticket.public_number,
        event_type: event.kind,
        conversation_state: event.state ?? null,
        sender_type: event.senderType ?? null,
        public_message: event.message ?? null,
        message_type: event.messageType ?? null,
        source: event.source ?? null,
        created_at: event.createdAt,
      });
    }
  }
  const channel = supabase.channel(`conversation:${event.conversation}`);
  try {
    await channel.send({ type: "broadcast", event: event.kind, payload: event });
  } finally {
    await supabase.removeChannel(channel);
  }
}