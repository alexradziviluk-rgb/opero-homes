"use client";

import { useMemo } from "react";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { getEffectivePermissions } from "@/lib/permissions";
import ManagerDashboard from "@/components/dashboard/ManagerDashboard";
import {
  DASHBOARD_WIDGET_COMPONENTS,
  getVisibleDashboardWidgets,
} from "@/lib/dashboard/widget-registry";

function widgetGridClass(size: "small" | "medium" | "large" | undefined): string {
  if (size === "large") return "md:col-span-2 xl:col-span-2";
  if (size === "medium") return "md:col-span-1 xl:col-span-1";
  return "md:col-span-1 xl:col-span-1";
}

export default function AdminPage() {
  const { currentUser, currentUserContext, isAuthLoading } = useCurrentUser();

  const permissions = useMemo(() => (currentUser ? getEffectivePermissions(currentUser) : []), [currentUser]);
  const visibleWidgets = useMemo(() => getVisibleDashboardWidgets(permissions), [permissions]);

  if (isAuthLoading) {
    return (
      <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-8 text-center">
        <p className="text-sm text-slate-300">Загрузка Dashboard...</p>
      </section>
    );
  }

  if (!currentUser) {
    return null;
  }

  if (currentUser.role === "Менеджер") {
    return <ManagerDashboard />;
  }

  if (visibleWidgets.length === 0) {
    return (
      <div className="space-y-4">
        <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-6">
          <h2 className="text-xl font-semibold text-white">Профиль и организация</h2>
          <dl className="mt-4 grid gap-3 text-sm text-slate-300 sm:grid-cols-2">
            <div>
              <dt className="text-slate-400">Имя</dt>
              <dd className="text-white">{`${currentUser.firstName} ${currentUser.lastName}`.trim() || "Не указано"}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Email</dt>
              <dd className="text-white">{currentUserContext?.authEmail || currentUser.email || "Не указано"}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Глобальная роль</dt>
              <dd className="text-white">{currentUserContext?.profile.role ?? "Не назначена"}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Роль в организации</dt>
              <dd className="text-white">{currentUserContext?.organizationMember?.role_code ?? "Не назначена"}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Организация</dt>
              <dd className="text-white">{currentUserContext?.organization?.name ?? "Не определена"}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Тариф</dt>
              <dd className="text-white">Недоступно</dd>
            </div>
            <div>
              <dt className="text-slate-400">Статус подписки</dt>
              <dd className="text-white">Недоступно</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-8 text-center">
          <h2 className="text-xl font-semibold text-white">Dashboard</h2>
          <p className="mt-2 text-sm text-slate-300">Для вашей роли пока нет доступных разделов Dashboard.</p>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-6">
        <h2 className="text-xl font-semibold text-white">Профиль и организация</h2>
        <dl className="mt-4 grid gap-3 text-sm text-slate-300 sm:grid-cols-2">
          <div>
            <dt className="text-slate-400">Имя</dt>
            <dd className="text-white">{`${currentUser.firstName} ${currentUser.lastName}`.trim() || "Не указано"}</dd>
          </div>
          <div>
            <dt className="text-slate-400">Email</dt>
            <dd className="text-white">{currentUserContext?.authEmail || currentUser.email || "Не указано"}</dd>
          </div>
          <div>
            <dt className="text-slate-400">Глобальная роль</dt>
            <dd className="text-white">{currentUserContext?.profile.role ?? "Не назначена"}</dd>
          </div>
          <div>
            <dt className="text-slate-400">Роль в организации</dt>
            <dd className="text-white">{currentUserContext?.organizationMember?.role_code ?? "Не назначена"}</dd>
          </div>
          <div>
            <dt className="text-slate-400">Организация</dt>
            <dd className="text-white">{currentUserContext?.organization?.name ?? "Не определена"}</dd>
          </div>
          <div>
            <dt className="text-slate-400">Тариф</dt>
            <dd className="text-white">Недоступно</dd>
          </div>
          <div>
            <dt className="text-slate-400">Статус подписки</dt>
            <dd className="text-white">Недоступно</dd>
          </div>
        </dl>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {visibleWidgets.map((widget) => {
          const WidgetComponent = DASHBOARD_WIDGET_COMPONENTS[widget.id];
          return (
            <div key={widget.id} className={widgetGridClass(widget.size)}>
              <WidgetComponent />
            </div>
          );
        })}
      </section>
    </div>
  );
}
