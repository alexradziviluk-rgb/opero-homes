export const CONVERSATION_STATES = ["bot_active", "waiting_manager", "manager_active", "resolved", "closed"] as const;
export type ConversationState = (typeof CONVERSATION_STATES)[number];

export const CONVERSATION_TRANSITIONS: Record<ConversationState, readonly ConversationState[]> = {
  bot_active: ["waiting_manager"],
  waiting_manager: ["manager_active"],
  manager_active: ["resolved"],
  resolved: ["closed"],
  closed: [],
};

export type ConversationTransition = {
  result: "applied" | "noop";
  stateBefore: ConversationState;
  stateAfter: ConversationState;
};

export function isConversationState(value: unknown): value is ConversationState {
  return typeof value === "string" && (CONVERSATION_STATES as readonly string[]).includes(value);
}

export function transitionConversation(state: ConversationState, nextState: ConversationState): ConversationTransition {
  if (state === nextState || !CONVERSATION_TRANSITIONS[state].includes(nextState)) {
    return { result: "noop", stateBefore: state, stateAfter: state };
  }
  return { result: "applied", stateBefore: state, stateAfter: nextState };
}

export function canClientSend(state: ConversationState): boolean {
  return state === "waiting_manager" || state === "manager_active";
}

export function canManagerSend(state: ConversationState): boolean {
  return state === "manager_active";
}

export function canReturnToAi(state: ConversationState): boolean {
  return state === "closed";
}