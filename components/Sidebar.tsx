"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { useDashboardMetrics } from "@/components/dashboard/dashboard-metrics-provider";
import { getEffectivePermissions, hasPermissionInList, type Permission } from "@/lib/permissions";

type NavItem = {
  label: string;
  href: string;
  icon: ReactNode;
  requiredPermission?: Permission;
  hiddenForManager?: boolean;
};

const navItems: NavItem[] = [
  {
    label: "Dashboard",
    href: "/admin",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M4 12.5 12 5l8 7.5V20a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" />
      </svg>
    ),
  },
  {
    label: "Объекты",
    href: "/apartments",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="M8 10h8M8 14h5" />
      </svg>
    ),
    requiredPermission: "properties.view",
  },
  {
    label: "Бронирования",
    href: "/bookings",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="4" y="5" width="16" height="14" rx="3" />
        <path d="M8 3v4M16 3v4M4 10h16" />
      </svg>
    ),
    requiredPermission: "bookings.view",
  },
  {
    label: "Уборки",
    href: "/cleaning",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="m5 20 3-8 5 2-3 7M9 12l2-6 4 1-2 7M15 4l3-1" />
      </svg>
    ),
    requiredPermission: "cleaning.view",
  },
  {
    label: "Ремонты",
    href: "/maintenance",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="m14 6 4-4 4 4-4 4M3 21l9-9M6 12l6 6M4 10l10 10" />
      </svg>
    ),
    requiredPermission: "maintenance.view",
  },
  {
    label: "Сотрудники",
    href: "/employees",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="8" r="3" />
        <path d="M5 19a5 5 0 0 1 10 0M14 10.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
      </svg>
    ),
    requiredPermission: "users.view",
  },
  {
    label: "Управление пользователями",
    href: "/users",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="9" cy="8" r="3" />
        <path d="M3 19a6 6 0 0 1 12 0M17 8h4M19 6v4" />
      </svg>
    ),
    requiredPermission: "users.manage",
    hiddenForManager: true,
  },
  {
    label: "Задачи",
    href: "/tasks",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="5" y="3" width="14" height="18" rx="2" />
        <path d="m8 9 1.5 1.5L12 8M8 15h8" />
      </svg>
    ),
    requiredPermission: "tasks.view",
  },
  {
    label: "Заезд / Выезд",
    href: "/check-in-out",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M4 12h12M12 8l4 4-4 4M20 5v14" />
      </svg>
    ),
    requiredPermission: "checkins.view",
  },
  {
    label: "Календарь",
    href: "/calendar",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="4" y="5" width="16" height="15" rx="2" />
        <path d="M4 10h16M8 3v4M16 3v4" />
      </svg>
    ),
    requiredPermission: "calendar.view",
    hiddenForManager: true,
  },
  {
    label: "Клиенты",
    href: "/clients",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M8 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM4 19a4 4 0 0 1 4-4h.5a3.5 3.5 0 0 1 3.5 3.5V20H4zM12 15h4a4 4 0 0 1 4 4v1h-8" />
      </svg>
    ),
    requiredPermission: "clients.view",
    hiddenForManager: true,
  },
  {
    label: "Уведомления",
    href: "/notifications",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M15 17h5l-1.4-1.4a2 2 0 0 1-.6-1.4V10a6 6 0 0 0-12 0v4.2c0 .53-.21 1.04-.59 1.41L4 17h5" />
        <path d="M10 18a2 2 0 1 0 4 0" />
      </svg>
    ),
    requiredPermission: "bookings.view",
  },
  {
    label: "Настройки",
    href: "/settings/notifications",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.06V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1-.3 1.7 1.7 0 0 0-1.2.5l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.06-.4H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.3-1 1.7 1.7 0 0 0-.5-1.2l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6c.38 0 .74-.12 1-.35A1.7 1.7 0 0 0 10.4 3.2V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1 .3c.45 0 .88-.18 1.2-.5l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c0 .38.12.74.35 1 .26.29.4.66.4 1.06V11a2 2 0 1 1 0 4h-.09c-.4 0-.77.14-1.06.4-.26.26-.4.62-.4 1z" />
      </svg>
    ),
    requiredPermission: "settings.manage",
    hiddenForManager: true,
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { currentUser, isAuthLoading } = useCurrentUser();
  const { data: dashboardData, isLoading: isDashboardLoading } = useDashboardMetrics();
  const permissions = useMemo(() => (currentUser ? getEffectivePermissions(currentUser) : []), [currentUser]);
  const canViewWeeklyRevenue = hasPermissionInList(permissions, "finance.view");

  const weeklyRevenueLabel = useMemo(() => {
    if (isDashboardLoading) {
      return "Загрузка...";
    }

    const revenues = dashboardData?.weeklyRevenueByCurrency ?? [];
    if (revenues.length === 0) {
      return "0";
    }

    return revenues
      .map((item) => `${item.amount.toLocaleString("ru-RU")} ${item.currency}`)
      .join(" | ");
  }, [dashboardData, isDashboardLoading]);

  const weeklyRevenueDescription = useMemo(() => {
    if (isDashboardLoading) {
      return "Подготовка данных";
    }

    if (!dashboardData) {
      return "Нет данных";
    }

    if (dashboardData.revenueDataStatus === "no_payments") {
      return "Нет оплаченных поступлений";
    }

    if (dashboardData.revenueDataStatus === "insufficient_schema") {
      return "Недостаточно данных";
    }

    return "Оплаченные поступления за неделю";
  }, [dashboardData, isDashboardLoading]);

  const visibleItems = navItems.filter((item) => {
    if (currentUser?.role === "Менеджер" && item.hiddenForManager) {
      return false;
    }

    if (!item.requiredPermission) {
      return currentUser?.role !== "Уборщик" && currentUser?.role !== "Специалист по обслуживанию";
    }

    return hasPermissionInList(permissions, item.requiredPermission);
  });

  if (isAuthLoading) {
    return (
      <aside className="w-full border-b border-white/10 bg-slate-950/95 px-4 py-5 backdrop-blur-sm lg:w-72 lg:border-b-0 lg:border-r lg:px-6 lg:py-8">
        <p className="text-sm text-slate-400">Загрузка профиля...</p>
      </aside>
    );
  }

  return (
    <aside className="w-full border-b border-white/10 bg-slate-950/95 px-4 py-5 backdrop-blur-sm lg:w-72 lg:border-b-0 lg:border-r lg:px-6 lg:py-8">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 via-sky-500 to-indigo-600 shadow-lg shadow-cyan-500/20">
          <span className="text-sm font-semibold tracking-[0.24em] text-white">OH</span>
        </div>
        <div>
          <p className="text-base font-semibold tracking-tight text-white">Opero Homes</p>
          <p className="text-sm text-slate-400">Центр управления</p>
        </div>
      </div>

      <nav className="mt-8 flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
        {visibleItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.label}
              href={item.href}
              className={`group flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium transition ${active ? "bg-cyan-500/15 text-white" : "text-slate-300 hover:bg-white/10 hover:text-white"}`}
            >
              <span className={`rounded-xl border border-white/10 bg-white/5 p-2 transition ${active ? "border-cyan-400/40 text-cyan-300" : "text-slate-200 group-hover:border-cyan-400/40 group-hover:text-cyan-300"}`}>
                {item.icon}
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {canViewWeeklyRevenue ? (
        <div className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-4">
          <p className="text-sm font-semibold text-white">На этой неделе</p>
          <p className="mt-2 text-2xl font-semibold text-white">{weeklyRevenueLabel}</p>
          <p className="mt-1 text-sm text-slate-400">{weeklyRevenueDescription}</p>
        </div>
      ) : null}
    </aside>
  );
}
