import {
  CLIENT_MESSAGES_STORAGE_KEY,
  type ClientMessage,
} from "@/types/client-message";

function nowIso() {
  return new Date().toISOString();
}

function generateId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `msg_${Math.random().toString(36).slice(2, 9)}`;
}

function safeParse(raw: string | null): unknown {
  try {
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function normalizeMessage(raw: Partial<ClientMessage>): ClientMessage {
  return {
    id: raw.id ?? generateId(),
    clientId: raw.clientId ?? "",
    bookingId: raw.bookingId,
    type: raw.type ?? "system",
    title: raw.title ?? "",
    body: raw.body ?? "",
    isRead: raw.isRead ?? false,
    createdAt: raw.createdAt ?? nowIso(),
    sourceType: raw.sourceType,
    sourceId: raw.sourceId,
    sourceKey: raw.sourceKey,
  };
}

function readStorage(): ClientMessage[] {
  if (typeof window === "undefined") return [];
  const parsed = safeParse(localStorage.getItem(CLIENT_MESSAGES_STORAGE_KEY));
  if (!Array.isArray(parsed)) return [];
  return parsed.map((item) => normalizeMessage(item as Partial<ClientMessage>));
}

function writeStorage(messages: ClientMessage[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(CLIENT_MESSAGES_STORAGE_KEY, JSON.stringify(messages));
}

export function getClientMessages(): ClientMessage[] {
  return readStorage().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getMessagesByClientId(clientId: string): ClientMessage[] {
  return getClientMessages().filter((message) => message.clientId === clientId);
}

export function findClientMessageBySourceKey(sourceKey: string): ClientMessage | null {
  return readStorage().find((message) => message.sourceKey === sourceKey) ?? null;
}

export function createClientMessage(payload: Omit<ClientMessage, "id" | "createdAt">): ClientMessage {
  const next = normalizeMessage({ ...payload, id: generateId(), createdAt: nowIso() });
  const current = readStorage();
  writeStorage([next, ...current]);
  return next;
}

export function markClientMessageRead(id: string): ClientMessage | null {
  const current = readStorage();
  const message = current.find((item) => item.id === id);
  if (!message) return null;
  const updated = normalizeMessage({ ...message, isRead: true });
  writeStorage(current.map((item) => (item.id === id ? updated : item)));
  return updated;
}

export function saveClientMessages(messages: ClientMessage[]): void {
  writeStorage(messages.map((message) => normalizeMessage(message)));
}
