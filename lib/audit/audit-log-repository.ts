import { AUDIT_LOG_STORAGE_KEY, type AuditLogEntry } from "@/types/audit-log";

function nowIso() {
  return new Date().toISOString();
}

function generateId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `aud_${Math.random().toString(36).slice(2, 9)}`;
}

function safeParse(raw: string | null): unknown {
  try {
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function normalizeAuditLog(raw: Partial<AuditLogEntry>): AuditLogEntry {
  return {
    id: raw.id ?? generateId(),
    entityType: "booking",
    entityId: raw.entityId ?? "",
    action: "booking_confirmed",
    performedByUserId: raw.performedByUserId ?? "",
    previousValue: raw.previousValue ?? { status: "" },
    nextValue: raw.nextValue ?? { status: "" },
    createdAt: raw.createdAt ?? nowIso(),
    sourceType: raw.sourceType,
    sourceId: raw.sourceId,
    sourceKey: raw.sourceKey,
  };
}

function readStorage(): AuditLogEntry[] {
  if (typeof window === "undefined") return [];
  const parsed = safeParse(localStorage.getItem(AUDIT_LOG_STORAGE_KEY));
  if (!Array.isArray(parsed)) return [];
  return parsed.map((item) => normalizeAuditLog(item as Partial<AuditLogEntry>));
}

function writeStorage(items: AuditLogEntry[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(AUDIT_LOG_STORAGE_KEY, JSON.stringify(items));
}

export function getAuditLogEntries(): AuditLogEntry[] {
  return readStorage().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function findAuditLogBySourceKey(sourceKey: string): AuditLogEntry | null {
  return readStorage().find((item) => item.sourceKey === sourceKey) ?? null;
}

export function createAuditLogEntry(payload: Omit<AuditLogEntry, "id" | "createdAt">): AuditLogEntry {
  const next = normalizeAuditLog({ ...payload, id: generateId(), createdAt: nowIso() });
  const current = readStorage();
  writeStorage([next, ...current]);
  return next;
}

export function saveAuditLogEntries(items: AuditLogEntry[]): void {
  writeStorage(items.map((item) => normalizeAuditLog(item)));
}
