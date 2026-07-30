import { TASKS_STORAGE_KEY, type Task } from "@/types/task";

function nowIso() {
  return new Date().toISOString();
}

function generateId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `tsk_${Math.random().toString(36).slice(2, 9)}`;
}

function safeParse(raw: string | null): unknown {
  try {
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function normalizeTask(raw: Partial<Task>): Task {
  const now = nowIso();
  return {
    id: raw.id ?? generateId(),
    title: raw.title ?? "",
    description: raw.description ?? "",
    status: raw.status ?? "pending",
    taskType: raw.taskType ?? "other",
    dueAt: raw.dueAt,
    bookingId: raw.bookingId,
    apartmentId: raw.apartmentId,
    assignedRole: raw.assignedRole,
    createdAt: raw.createdAt ?? now,
    updatedAt: raw.updatedAt ?? now,
    sourceType: raw.sourceType,
    sourceId: raw.sourceId,
    sourceKey: raw.sourceKey,
  };
}

function readStorage(): Task[] {
  if (typeof window === "undefined") return [];
  const parsed = safeParse(localStorage.getItem(TASKS_STORAGE_KEY));
  if (!Array.isArray(parsed)) return [];
  return parsed.map((item) => normalizeTask(item as Partial<Task>));
}

function writeStorage(tasks: Task[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(tasks));
}

export function getTasks(): Task[] {
  return readStorage().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getTasksByBookingId(bookingId: string): Task[] {
  return getTasks().filter((task) => task.bookingId === bookingId);
}

export function findTaskBySourceKey(sourceKey: string): Task | null {
  return readStorage().find((task) => task.sourceKey === sourceKey) ?? null;
}

export function createTask(payload: Omit<Task, "id" | "createdAt" | "updatedAt">): Task {
  const now = nowIso();
  const next = normalizeTask({ ...payload, id: generateId(), createdAt: now, updatedAt: now });
  const current = readStorage();
  writeStorage([next, ...current]);
  return next;
}

export function saveTasks(tasks: Task[]): void {
  writeStorage(tasks.map((task) => normalizeTask(task)));
}
