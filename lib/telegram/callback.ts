import { createHash } from "node:crypto";

import type { SupportStatus } from "@/lib/support/types";

export type TelegramCallbackAction = "accept" | "resolve";
export type TelegramCallbackResult = "applied" | "noop" | "replay" | "rejected";

export type TelegramCallbackTransition = {
  result: Exclude<TelegramCallbackResult, "replay" | "rejected">;
  statusBefore: SupportStatus;
  statusAfter: SupportStatus;
};

const acceptableAcceptStatuses: SupportStatus[] = ["open", "assigned"];
const acceptableResolveStatuses: SupportStatus[] = ["open", "assigned", "in_progress", "waiting_for_client"];

export function parseTelegramCallbackData(data: unknown): { action: TelegramCallbackAction; actionToken: string } | null {
  if (typeof data !== "string") return null;
  const match = data.match(/^support:(accept|resolve):([a-f0-9]{36})$/i);
  if (!match) return null;
  return { action: match[1].toLowerCase() as TelegramCallbackAction, actionToken: match[2].toLowerCase() };
}

export function transitionTelegramCallback(action: TelegramCallbackAction, status: SupportStatus): TelegramCallbackTransition {
  const nextStatus = action === "accept" ? "in_progress" : "resolved";
  const canApply = action === "accept" ? acceptableAcceptStatuses.includes(status) : acceptableResolveStatuses.includes(status);
  return {
    result: canApply ? "applied" : "noop",
    statusBefore: status,
    statusAfter: canApply ? nextStatus : status,
  };
}

export function hashTelegramUpdateId(updateId: number): string {
  return createHash("sha256").update(String(updateId)).digest("hex").slice(0, 16);
}

export function isAllowedTelegramChat(ticketChatId: string | null, requestChatId: string, managerChatId: string | undefined): boolean {
  return Boolean(requestChatId) && (ticketChatId === requestChatId || managerChatId === requestChatId);
}

export function callbackAuditMetadata(params: {
  action: TelegramCallbackAction;
  result: TelegramCallbackResult;
  statusBefore: SupportStatus | null;
  statusAfter: SupportStatus | null;
  updateIdHash: string;
}) {
  return {
    action: params.action,
    result: params.result,
    status_before: params.statusBefore,
    status_after: params.statusAfter,
    update_id_hash: params.updateIdHash,
  };
}