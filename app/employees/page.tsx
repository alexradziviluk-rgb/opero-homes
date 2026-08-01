"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import OperationalShell from "@/components/operations/OperationalShell";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { useAdminText } from "@/lib/i18n/admin";

type Employee = {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  status: string;
  roleCode: string;
  additionalRoleCodes: string[];
  lastSeenAt: string | null;
};

type TaskSummary = {
  assigned_user_id: string;
  apartment_id: string;
  status: string;
};

const roleLabels: Record<string, string> = {
  owner: "Владелец",
  manager: "Менеджер",
  employee: "Сотрудник",
  cleaner: "Уборщик",
  maintenance: "Специалист по обслуживанию",
};

const statusLabels: Record<string, string> = {
  active: "Активен",
  suspended: "Приостановлен",
  blocked: "Заблокирован",
  inactive: "Неактивен",
  invited: "Приглашен",
};

export default function EmployeesPage() {
  const { currentUser } = useCurrentUser();
  const translate = useAdminText();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [renderedAt] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      fetch("/api/notifications/assignees", { cache: "no-store" }),
      fetch("/api/operations/tasks", { cache: "no-store" }),
    ]).then(async ([employeesResponse, tasksResponse]) => {
      const employeesPayload = (await employeesResponse.json()) as { ok: boolean; data?: { responsible?: Employee[] } };
      const tasksPayload = (await tasksResponse.json()) as { ok: boolean; data?: TaskSummary[] };
      if (cancelled) return;
      if (employeesPayload.ok) setEmployees(employeesPayload.data?.responsible ?? []);
      if (tasksPayload.ok) setTasks(tasksPayload.data ?? []);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <OperationalShell title={translate("Сотрудники")} description={translate("Ежедневная работа команды: назначения, задачи, объекты и текущая занятость")}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-y border-white/10 py-3 text-sm text-slate-300">
        <span>Приглашения, роли, статусы и права доступа управляются отдельно.</span>
        <Link href="/users" className="text-cyan-300 hover:underline">{translate("Управление пользователями")}</Link>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {employees.length === 0 ? <p className="border-y border-white/10 py-8 text-center text-slate-400 lg:col-span-2">Сотрудники ещё не добавлены</p> : employees.map((employee) => {
          const assignedTasks = tasks.filter((task) => task.assigned_user_id === employee.userId);
          const completedTasks = assignedTasks.filter((task) => task.status === "completed" || task.status === "verified" || task.status === "done");
          const apartmentIds = Array.from(new Set(assignedTasks.map((task) => task.apartment_id).filter(Boolean)));
          const isCurrent = employee.userId === currentUser?.id;
          const isOnline = isCurrent || Boolean(employee.lastSeenAt && renderedAt - new Date(employee.lastSeenAt).getTime() < 5 * 60 * 1000);

          return (
            <article key={employee.userId} className="min-w-0 rounded-2xl border border-white/10 bg-slate-900/70 p-5">
              <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h2 className="break-words font-semibold text-white">{employee.firstName} {employee.lastName}</h2>
                  <p className="mt-1 break-words text-sm text-cyan-300">{[employee.roleCode, ...employee.additionalRoleCodes].map((role) => translate(roleLabels[role] ?? role)).join(" + ")}</p>
                </div>
                <span className={`self-start rounded-full px-2 py-1 text-xs ${isOnline ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-700/60 text-slate-300"}`}>
                  {translate(isOnline ? "Онлайн" : "Офлайн")}
                </span>
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div><dt className="text-slate-500">Назначенные объекты</dt><dd className="mt-1 text-white">{apartmentIds.length}</dd></div>
                <div><dt className="text-slate-500">Активные задачи</dt><dd className="mt-1 text-white">{assignedTasks.length - completedTasks.length}</dd></div>
                <div><dt className="text-slate-500">Выполнено</dt><dd className="mt-1 text-white">{completedTasks.length}</dd></div>
                <div><dt className="text-slate-500">{translate("Статус")}</dt><dd className="mt-1 text-white">{translate(statusLabels[employee.status] ?? employee.status)}</dd></div>
              </dl>

              <div className="mt-4 space-y-1 text-sm text-slate-300">
                <p>{employee.phone || translate("Телефон не указан")}</p>
                <p>{employee.email}</p>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Link href="/tasks" className="rounded-xl border border-cyan-400/30 px-3 py-1.5 text-xs text-cyan-200">Распределить задачи</Link>
                <Link href="/apartments" className="rounded-xl border border-white/10 px-3 py-1.5 text-xs text-slate-300">Назначить объект</Link>
              </div>
            </article>
          );
        })}
      </div>
    </OperationalShell>
  );
}
