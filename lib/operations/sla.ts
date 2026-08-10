export type SlaTaskInput = {
  taskType: string;
  priority: string;
  createdAt: string;
  dueAt: string;
};

export type SlaState = "ok" | "warning" | "expired";

const WARNING_RATIO = 0.25;

export function calculateSla(task: SlaTaskInput, now = new Date()): { warningAt: string; dueAt: string; state: SlaState; remainingMs: number } {
  const dueAt = new Date(task.dueAt);
  const createdAt = new Date(task.createdAt);
  const durationMs = Math.max(0, dueAt.getTime() - createdAt.getTime());
  const warningAt = new Date(dueAt.getTime() - durationMs * WARNING_RATIO);
  const nowMs = now.getTime();
  const dueMs = dueAt.getTime();
  const warningMs = warningAt.getTime();
  const state: SlaState = nowMs >= dueMs ? "expired" : nowMs >= warningMs ? "warning" : "ok";
  return { warningAt: warningAt.toISOString(), dueAt: dueAt.toISOString(), state, remainingMs: Math.max(0, dueMs - nowMs) };
}

export function nextEscalationLevel(currentLevel: number, state: SlaState): number {
  if (state !== "expired") return currentLevel;
  return Math.min(2, Math.max(0, currentLevel) + 1);
}