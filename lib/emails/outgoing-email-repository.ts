import {
  OUTGOING_EMAILS_STORAGE_KEY,
  type OutgoingEmail,
} from "@/types/outgoing-email";

function nowIso() {
  return new Date().toISOString();
}

function generateId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `mail_${Math.random().toString(36).slice(2, 9)}`;
}

function safeParse(raw: string | null): unknown {
  try {
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function normalizeEmail(raw: Partial<OutgoingEmail>): OutgoingEmail {
  return {
    id: raw.id ?? generateId(),
    clientId: raw.clientId,
    bookingId: raw.bookingId,
    to: raw.to ?? "",
    subject: raw.subject ?? "",
    html: raw.html,
    text: raw.text ?? "",
    status: raw.status ?? "pending",
    attempts: Number(raw.attempts ?? 0),
    createdAt: raw.createdAt ?? nowIso(),
    sentAt: raw.sentAt,
    errorMessage: raw.errorMessage,
    sourceType: raw.sourceType,
    sourceId: raw.sourceId,
    sourceKey: raw.sourceKey,
  };
}

function readStorage(): OutgoingEmail[] {
  if (typeof window === "undefined") return [];
  const parsed = safeParse(localStorage.getItem(OUTGOING_EMAILS_STORAGE_KEY));
  if (!Array.isArray(parsed)) return [];
  return parsed.map((item) => normalizeEmail(item as Partial<OutgoingEmail>));
}

function writeStorage(items: OutgoingEmail[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(OUTGOING_EMAILS_STORAGE_KEY, JSON.stringify(items));
}

export function getOutgoingEmails(): OutgoingEmail[] {
  return readStorage().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function findOutgoingEmailBySourceKey(sourceKey: string): OutgoingEmail | null {
  return readStorage().find((item) => item.sourceKey === sourceKey) ?? null;
}

export function createOutgoingEmail(payload: Omit<OutgoingEmail, "id" | "createdAt">): OutgoingEmail {
  const current = readStorage();
  const next = normalizeEmail({ ...payload, id: generateId(), createdAt: nowIso() });
  writeStorage([next, ...current]);
  return next;
}

export function saveOutgoingEmails(items: OutgoingEmail[]): void {
  writeStorage(items.map((item) => normalizeEmail(item)));
}
