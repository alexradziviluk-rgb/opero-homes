import type { ConversationState } from "./conversation";

export type ConversationStateRecord = {
  status?: string | null;
  conversation_state?: string | null;
  assigned_to?: string | null;
  resolved_at?: string | null;
  closed_at?: string | null;
};

export function isLegacyWaitingManagerConversation(record: ConversationStateRecord): boolean {
  return record.status === "in_progress"
    && record.conversation_state === "bot_active"
    && !record.assigned_to
    && !record.resolved_at
    && !record.closed_at;
}

export function effectiveConversationState(record: ConversationStateRecord): ConversationState | null {
  if (isLegacyWaitingManagerConversation(record)) return "waiting_manager";
  const state = record.conversation_state;
  return state === "bot_active" || state === "waiting_manager" || state === "manager_active" || state === "resolved" || state === "closed" ? state : null;
}
