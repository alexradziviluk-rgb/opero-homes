"use client";

import { useDashboardMetrics } from "@/components/dashboard/dashboard-metrics-provider";

export default function UrgentTasksWidget() {
  const { data, isLoading } = useDashboardMetrics();

  if (isLoading) {
    return (
      <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-[0_30px_80px_-40px_rgba(248,113,113,0.45)]">
        <p className="text-sm text-slate-300">Загрузка задач...</p>
      </section>
    );
  }

  const tasks = data?.urgentTasks ?? [];

  return (
    <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-[0_30px_80px_-40px_rgba(248,113,113,0.45)]">
      <p className="text-sm font-medium text-rose-300">Срочные задачи</p>
      <h2 className="mt-1 text-xl font-semibold text-white">Операционный приоритет</h2>
      {tasks.length === 0 ? (
        <p className="mt-5 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">Срочных задач пока нет</p>
      ) : (
        <div className="mt-5 space-y-3">
          {tasks.map((task) => (
            <div key={task.taskId} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <p className="font-medium text-white">{task.taskType} - {task.title}</p>
              <p className="mt-1 text-xs text-rose-300">Статус: {task.status}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
