"use client";

import { useEffect, useState } from "react";
import type { Task, TaskPriority, TaskStatus, TaskType } from "@/types/task";
import { loadApartmentsFromSupabase } from "@/lib/apartments/supabase-apartments";
import type { Apartment } from "@/types/apartment";
import { useAdminText } from "@/lib/i18n/admin";

type Assignee = {
  userId: string;
  firstName: string;
  lastName: string;
  roleCode: string;
  status: string;
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  pending: "Ожидает",
  assigned: "Назначена",
  in_progress: "В работе",
  completed: "Завершена",
  verified: "Проверена",
  done: "Завершена",
  cancelled: "Отменена",
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
  assigned_user_ids?: string[];
  checklist?: Array<{ id: string; title: string; completed: boolean; completed_by?: string | null; completed_at?: string | null }>;
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
    assignedUserIds: row.assigned_user_ids ?? [row.assigned_user_id],
    checklist: (row.checklist ?? []).map((item) => ({ id: item.id, title: item.title, completed: item.completed, completedBy: item.completed_by ?? undefined, completedAt: item.completed_at ?? undefined })),
    dueAt: row.due_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export default function TaskBoard({ filterType, canManage }: TaskBoardProps) {
  const translate = useAdminText();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [taskType, setTaskType] = useState<TaskType>(filterType ?? "other");
  const [apartmentId, setApartmentId] = useState("");
  const [assignedUserId, setAssignedUserId] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [checklistText, setChecklistText] = useState("");
  const [users, setUsers] = useState<Assignee[]>([]);
  const [apartments, setApartments] = useState<Apartment[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      void fetch("/api/operations/tasks/reminders", { method: "POST" }).catch(() => undefined);
      const [usersResponse, tasksResponse, nextApartments] = await Promise.all([
        fetch("/api/notifications/assignees", { cache: "no-store" }),
        fetch("/api/operations/tasks", { cache: "no-store" }),
        loadApartmentsFromSupabase(),
      ]);
      const usersPayload = (await usersResponse.json()) as { ok: boolean; data?: { responsible?: Assignee[] } };
      const tasksPayload = (await tasksResponse.json()) as { ok: boolean; data?: TaskRow[]; error?: string };
      if (cancelled) return;

      if (usersPayload.ok) {
        setUsers(usersPayload.data?.responsible ?? []);
      } else {
        setError("Не удалось загрузить список сотрудников");
      }
      setApartments(nextApartments);
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

  function resetForm() {
    setTitle(""); setApartmentId(""); setAssignedUserId(""); setDueAt(""); setPriority("normal"); setChecklistText(""); setEditingTaskId(null);
  }

  function editTask(task: Task) {
    setEditingTaskId(task.id);
    setTitle(task.title);
    setTaskType(task.taskType);
    setApartmentId(task.apartmentId ?? "");
    setAssignedUserId(task.assignedUserId ?? "");
    setDueAt(task.dueAt ? new Date(task.dueAt).toISOString().slice(0, 16) : "");
    setPriority(task.priority ?? "normal");
    setChecklistText((task.checklist ?? []).map((item) => item.title).join("\n"));
    setShowForm(true);
  }

  async function saveTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) {
      setError("Введите название задачи");
      return;
    }
    if (!apartmentId.trim()) {
      setError("Выберите объект");
      return;
    }
    if (!assignedUserId) {
      setError("Выберите ответственного сотрудника");
      return;
    }
    if (!dueAt) {
      setError("Укажите срок выполнения");
      return;
    }

    setError(null);

    const checklistItems = checklistText.split("\n").map((item) => item.trim()).filter(Boolean);
    const response = await fetch("/api/operations/tasks", {
      method: editingTaskId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        taskType: filterType ?? taskType,
        apartmentId: apartmentId.trim(),
        assignedUserId,
        ...(editingTaskId ? { id: editingTaskId } : {}),
        checklistItems,
        dueAt: new Date(dueAt).toISOString(),
        priority,
      }),
    });
    const payload = (await response.json()) as { ok: boolean; data?: TaskRow; error?: string };
    if (!response.ok || !payload.ok || !payload.data) {
      setError(payload.error ?? (editingTaskId ? "Не удалось обновить задачу" : "Не удалось создать задачу"));
      return;
    }

    const savedTask = mapTask(payload.data as TaskRow);
    setTasks((current) => (editingTaskId ? current.map((task) => task.id === savedTask.id ? savedTask : task) : [...current, savedTask]).sort((left, right) => (left.dueAt ?? "").localeCompare(right.dueAt ?? "")));
    resetForm();
    setShowForm(false);
  }

  async function changeTask(task: Task, changes: Partial<Task>) {
    const requestChanges = changes.checklist
      ? { ...changes, checklistItems: changes.checklist.map((item) => ({ id: item.id, title: item.title, completed: item.completed })) }
      : changes;
    const response = await fetch("/api/operations/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: task.id, ...requestChanges }),
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
          <button type="button" onClick={() => { if (showForm) resetForm(); setShowForm((value) => !value); }} className="rounded-2xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-500/20">
            {showForm ? "Закрыть форму" : "+ Создать задачу"}
          </button>
        </div>
      ) : null}

      {error ? <p className="border-y border-rose-400/20 py-3 text-sm text-rose-300">{error}</p> : null}

      {showForm ? (
        <form onSubmit={saveTask} className="grid gap-3 border-y border-white/10 bg-slate-900/60 p-4 md:grid-cols-2 xl:grid-cols-3">
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Название задачи" className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm" />
          {!filterType ? (
            <select value={taskType} onChange={(event) => setTaskType(event.target.value as TaskType)} className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm">
              {Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          ) : null}
          <select aria-label="Объект" value={apartmentId} onChange={(event) => setApartmentId(event.target.value)} className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm">
            <option value="">Выберите объект</option>
            {apartments.map((apartment) => <option key={apartment.id} value={apartment.id}>{apartment.title}</option>)}
          </select>
          <select value={assignedUserId} onChange={(event) => setAssignedUserId(event.target.value)} className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm">
            <option value="">Ответственный</option>
            {users.map((user) => <option key={user.userId} value={user.userId}>{user.firstName} {user.lastName} · {user.roleCode}</option>)}
          </select>
          <label className="grid gap-1 text-xs text-slate-400">
            Дата и время выполнения
            <input
              type="datetime-local"
              aria-label="Дата и время выполнения"
              value={dueAt}
              onChange={(event) => setDueAt(event.target.value)}
              onClick={(event) => event.currentTarget.showPicker()}
              onFocus={(event) => event.currentTarget.showPicker()}
              className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            />
          </label>
          <select value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)} className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm">
            {Object.entries(PRIORITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <label className="grid gap-1 text-xs text-slate-400 xl:col-span-2">Пункты одной задачи
            <textarea value={checklistText} onChange={(event) => setChecklistText(event.target.value)} placeholder="Постельное\nРасчёт\nУборка" rows={3} className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100" />
          </label>
          <button type="submit" className="rounded-xl bg-cyan-500/20 px-4 py-2 text-sm font-semibold text-cyan-200">{editingTaskId ? "Сохранить изменения" : "Сохранить"}</button>
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
              <th className="px-4 py-3">{translate("Статус")}</th>
              <th className="px-4 py-3">Пункты</th>
              <th className="px-4 py-3">Действия</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {isLoading ? <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">Загрузка...</td></tr> : tasks.length === 0 ? <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">Нет задач</td></tr> : tasks.map((task) => {
              const assignee = users.find((user) => user.userId === task.assignedUserId);
              const apartment = apartments.find((item) => item.id === task.apartmentId);
              return (
                <tr key={task.id}>
                  <td className="px-4 py-3"><p className="font-medium text-white">{task.title}</p><p className="text-xs text-slate-400">{TYPE_LABELS[task.taskType]}</p></td>
                  <td className="px-4 py-3 text-slate-300">{apartment?.title ?? "Объект не найден"}</td>
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
                      {Object.entries(STATUS_LABELS).filter(([value]) => (canManage || value !== "verified") && value !== "done").map(([value, label]) => <option key={value} value={value}>{translate(label)}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="space-y-1">
                      {(task.checklist ?? []).map((item) => <label key={item.id} className="flex items-center gap-2 whitespace-nowrap text-xs text-slate-300"><input type="checkbox" checked={item.completed} onChange={(event) => void changeTask(task, { checklist: (task.checklist ?? []).map((current) => current.id === item.id ? { ...current, completed: event.target.checked } : current) })} />{item.title}</label>)}
                    </div>
                  </td>
                  <td className="px-4 py-3"><button type="button" onClick={() => editTask(task)} className="rounded-lg border border-white/10 px-2 py-1 text-xs text-cyan-200">Редактировать</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
