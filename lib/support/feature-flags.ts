import "server-only";

function enabled(name: string): boolean {
  return process.env[name] === "true";
}

export function isLiveConversationT2Enabled(): boolean {
  return enabled("LIVE_CONVERSATION_T2_ENABLED");
}

export function isTelegramMessageRepliesEnabled(): boolean {
  return enabled("TELEGRAM_MESSAGE_REPLIES_ENABLED") && isLiveConversationT2Enabled();
}

export function isSupportRealtimeEnabled(): boolean {
  return enabled("SUPPORT_REALTIME_ENABLED") && isLiveConversationT2Enabled();
}

export function isAnonymousContinuationEnabled(): boolean {
  return enabled("ANONYMOUS_CONTINUATION_ENABLED") && isLiveConversationT2Enabled();
}
