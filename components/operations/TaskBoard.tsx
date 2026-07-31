"use client";

import { useEffect, useState } from "react";
import type { Task, TaskPriority, TaskStatus, TaskType } from "@/types/task";

type Assignee = {
  userId: string;
  firstName: string;
  lastName: string;
  roleCode: string;
  status: string;
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  pending: "Pending",
  assigned: "Assigned",
  in_progress: "In Progress",
  completed: "Completed",
  verified: "Verified",
  done: "Completed",
  cancelled: "Cancelled",
};

const TYPE_LABELS: Record<TaskType, string> = {
  cleaning: "Уборка",
  technical: "Ремонт",
  linen: "Замена белья",
  purchase: "Закупка",
  inspection: "Осмотр квартиры",
  keys: "Передача ключей",
  payment: "Оплата",
  instructions: "Инструкции",
  other: "Другое",
};

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Низкий",
  normal: "Обычный",
  high: "Высокий",
  urgent: "Срочный",
};

type TaskBoardProps = {
  filterType?: "cleaning" | "technical";
  canManage: boolean;
};

type TaskRow = {
  id: string;
  title: string;
  description: string;
  task_type: TaskType;
  priority: TaskPriority;
  status: TaskStatus;
  apartment_id: string;
  booking_id: string | null;
  assigned_user_id: string;
  due_at: string;
  created_at: string;
  updated_at: string;
};

function mapTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    taskType: row.task_type,
    priority: row.priority,
    status: row.status,
    apartmentId: row.apartment_id,
    bookingId: row.booking_id ?? undefined,
    assignedUserId: row.assigned_user_id,
    dueAt: row.due_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export default function TaskBoard({ filterType, canManage }: TaskBoardProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [taskType, setTaskType] = useState<TaskType>(filterType ?? "other");
  const [apartmentId, setApartmentId] = useState("");
  const [assignedUserId, setAssignedUserId] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [users, setUsers] = useState<Assignee[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [usersResponse, tasksResponse] = await Promise.all([
        fetch("/api/notifications/assignees", { cache: "no-store" }),
        fetch("/api/operations/tasks", { cache: "no-store" }),
      ]);
      const usersPayload = (await usersResponse.json()) as { ok: boolean; data?: { responsible?: Assignee[] } };
      const tasksPayload = (await tasksResponse.json()) as { ok: boolean; data?: TaskRow[]; error?: string };
      if (cancelled) return;

      if (usersPayload.ok) setUsers(usersPayload.data?.responsible ?? []);
      if (tasksPayload.ok) {
        setTasks((tasksPayload.data ?? []).map(mapTask).filter((task) => !filterType || task.taskType === filterType));
      } else {
        setError(tasksPayload.error ?? "Не удалось загрузить задачи");
      }
      setIsLoading(false);
    }

    void load().catch(() => {
      if (!cancelled) {
        setError("Не удалось загрузить задачи");
        setIsLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [filterType]);

  async function saveNewTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || !apartmentId.trim() || !assignedUserId || !dueAt) return;

    const response = await fetch("/api/operations/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        taskType: filterType ?? taskType,
        apartmentId: apartmentId.trim(),
        assignedUserId,
        dueAt: new Date(dueAt).toISOString(),
        priority,
      }),
    });
    const payload = (await response.json()) as { ok: boolean; data?: TaskRow; error?: string };
    if (!response.ok || !payload.ok || !payload.data) {
      setError(payload.error ?? "Не удалось создать задачу");
      return;
    }

    setTasks((current) => [...current, mapTask(payload.data as TaskRow)].sort((left, right) => (left.dueAt ?? "").localeCompare(right.dueAt ?? "")));

    setTitle("");
    setApartmentId("");
    setAssignedUserId("");
    setDueAt("");
    setPriority("normal");
    setShowForm(false);
  }

  async function changeTask(task: Task, changes: Partial<Task>) {
    const response = await fetch("/api/operations/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: task.id, ...changes }),
    });
    const payload = (await response.json()) as { ok: boolean; data?: TaskRow; error?: string };
    if (!response.ok || !payload.ok || !payload.data) {
      setError(payload.error ?? "Не удалось обновить задачу");
      return;
    }

    const updated = mapTask(payload.data);
    setTasks((current) => current.map((item) => item.id === updated.id ? updated : item));
  }

  return (
    <div className="space-y-4">
      {canManage ? (
        <div className="flex justify-end">
          <button type="button" onClick={() => setShowForm((value) => !value)} className="rounded-2xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-500/20">
            {showForm ? "Закрыть форму" : "+ Создать задачу"}
          </button>
        </div>
      ) : null}

      {error ? <p className="border-y border-rose-400/20 py-3 text-sm text-rose-300">{error}</p> : null}

      {showForm ? (
        <form onSubmit={saveNewTask} className="grid gap-3 border-y border-white/10 bg-slate-900/60 p-4 md:grid-cols-2 xl:grid-cols-3">
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Название задачи" className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm" />
          {!filterType ? (
            <select value={taskType} onChange={(event) => setTaskType(event.target.value as TaskType)} className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm">
              {Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          ) : null}
          <input value={apartmentId} onChange={(event) => setApartmentId(event.target.value)} placeholder="ID объекта" className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm" />
          <select value={assignedUserId} onChange={(event) => setAssignedUserId(event.target.value)} className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm">
            <option value="">Ответственный</option>
            {users.map((user) => <option key={user.userId} value={user.userId}>{user.firstName} {user.lastName} · {user.roleCode}</option>)}
          </select>
          <input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm" />
          <select value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)} className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm">
            {Object.entries(PRIORITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <button type="submit" className="rounded-xl bg-cyan-500/20 px-4 py-2 text-sm font-semibold text-cyan-200">Сохранить</button>
        </form>
      ) : null}

      <div className="overflow-x-auto border-y border-white/10 bg-slate-900/70">
        <table className="min-w-[820px] w-full text-sm">
          <thead className="bg-white/5 text-left text-slate-300">
            <tr>
              <th className="px-4 py-3">Задача</th>
              <th className="px-4 py-3">Объект</th>
              <th className="px-4 py-3">Срок</th>
              <th className="px-4 py-3">Исполнитель</th>
              <th className="px-4 py-3">Приоритет</th>
              <th className="px-4 py-3">Статус</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {isLoading ? <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Загрузка...</td></tr> : tasks.length === 0 ? <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Нет задач</td></tr> : tasks.map((task) => {
              const assignee = users.find((user) => user.userId === task.assignedUserId);
              return (
                <tr key={task.id}>
                  <td className="px-4 py-3"><p className="font-medium text-white">{task.title}</p><p className="text-xs text-slate-400">{TYPE_LABELS[task.taskType]}</p></td>
                  <td className="px-4 py-3 text-slate-300">{task.apartmentId || "—"}</td>
                  <td className="px-4 py-3 text-slate-300">{task.dueAt ? new Date(task.dueAt).toLocaleString("ru-RU") : "—"}</td>
                  <td className="px-4 py-3">
                    {canManage ? (
                      <select value={task.assignedUserId ?? ""} onChange={(event) => void changeTask(task, { assignedUserId: event.target.value, status: "assigned" })} className="rounded-lg border border-white/10 bg-slate-950 px-2 py-1">
                        <option value="">Не назначен</option>
                        {users.map((user) => <option key={user.userId} value={user.userId}>{user.firstName} {user.lastName}</option>)}
                      </select>
                    ) : <span>{assignee ? `${assignee.firstName} ${assignee.lastName}` : "Вы"}</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-300">{PRIORITY_LABELS[task.priority ?? "normal"]}</td>
                  <td className="px-4 py-3">
                    <select value={task.status} onChange={(event) => void changeTask(task, { status: event.target.value as TaskStatus })} className="rounded-lg border border-white/10 bg-slate-950 px-2 py-1">
                      {Object.entries(STATUS_LABELS).filter(([value]) => canManage || value !== "verified").map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
