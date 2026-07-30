import type { UserRole } from "@/types/user";

export type TaskStatus = "pending" | "in_progress" | "done" | "cancelled";

export type TaskType = "payment" | "instructions" | "cleaning" | "technical" | "other";

export type Task = {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  taskType: TaskType;
  dueAt?: string;
  bookingId?: string;
  apartmentId?: string;
  assignedRole?: UserRole;
  createdAt: string;
  updatedAt: string;
  sourceType?: "booking_confirmation";
  sourceId?: string;
  sourceKey?: string;
};

export const TASKS_STORAGE_KEY = "opero-homes-tasks";
