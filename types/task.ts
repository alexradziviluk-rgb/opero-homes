import type { UserRole } from "@/types/user";

export type TaskStatus = "pending" | "assigned" | "in_progress" | "completed" | "verified" | "done" | "cancelled";

export type TaskType = "payment" | "instructions" | "cleaning" | "technical" | "linen" | "purchase" | "inspection" | "keys" | "other";

export type TaskPriority = "low" | "normal" | "high" | "urgent";

export type Task = {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  taskType: TaskType;
  dueAt?: string;
  bookingId?: string;
  apartmentId?: string;
  assignedUserId?: string;
  assignedUserIds?: string[];
  checklist?: TaskChecklistItem[];
  assignedRole?: UserRole;
  priority?: TaskPriority;
  createdAt: string;
  updatedAt: string;
  sourceType?: "booking_confirmation";
  sourceId?: string;
  sourceKey?: string;
};

export type TaskChecklistItem = {
  id: string;
  title: string;
  completed: boolean;
  completedBy?: string;
  completedAt?: string;
};

export const TASKS_STORAGE_KEY = "opero-homes-tasks";
