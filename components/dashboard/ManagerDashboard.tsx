"use client";

import Link from "next/link";
import { useDashboardMetrics } from "@/components/dashboard/dashboard-metrics-provider";

const ITEMS = [
  { key: "arrivals", label: "Сегодняшние заезды", href: "/check-in-out", tone: "text-cyan-300" },
  { key: "departures", label: "Сегодняшние выезды", href: "/check-in-out", tone: "text-sky-300" },
  { key: "cleaning", label: "Просроченные уборки", href: "/cleaning", tone: "text-amber-300" },
  { key: "maintenance", label: "Просроченные ремонты", href: "/maintenance", tone: "text-rose-300" },
  { key: "tasks", label: "Задачи на сегодня", href: "/tasks", tone: "text-violet-300" },
  { key: "notifications", label: "Новые уведомления", href: "/notifications", tone: "text-fuchsia-300" },
  { key: "occupied", label: "Занятые квартиры", href: "/apartments?availability=occupied", tone: "text-orange-300" },
  { key: "available", label: "Свободные квартиры", href: "/apartments?availability=available", tone: "text-emerald-300" },
] as const;

export default function ManagerDashboard() {
  const { data, isLoading, error } = useDashboardMetrics();

  const values: Record<(typeof ITEMS)[number]["key"], number> = {
    arrivals: data?.todayArrivals.length ?? 0,
    departures: data?.todayDepartures.length ?? 0,
    cleaning: data?.overdueCleaningCount ?? 0,
    maintenance: data?.overdueMaintenanceCount ?? 0,
    tasks: data?.tasksDueTodayCount ?? 0,
    notifications: data?.unreadNotificationsCount ?? 0,
    occupied: data?.propertiesOccupied ?? 0,
    available: data?.propertiesAvailable ?? 0,
  };

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-medium text-cyan-300">Операционный центр</p>
        <h1 className="mt-1 text-2xl font-semibold text-white">Dashboard менеджера</h1>
        <p className="mt-1 text-sm text-slate-400">Сводка на сегодня без финансовых показателей компании</p>
      </header>

      {error ? <p className="border-y border-rose-400/20 py-3 text-sm text-rose-300">{error}</p> : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {ITEMS.map((item) => (
          <Link key={item.key} href={item.href} className="rounded-2xl border border-white/10 bg-slate-900/70 p-5 transition hover:border-cyan-400/30 hover:bg-slate-900">
            <p className="text-sm text-slate-400">{item.label}</p>
            <p className={`mt-3 text-3xl font-semibold ${item.tone}`}>{isLoading ? "—" : values[item.key]}</p>
          </Link>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border border-white/10">
          <h2 className="bg-white/5 px-5 py-4 font-semibold text-white">Ближайшие заезды</h2>
          {(data?.todayArrivals ?? []).length === 0 ? <p className="p-5 text-sm text-slate-400">Заездов сегодня нет</p> : data?.todayArrivals.map((item) => <Link key={item.bookingId} href={`/bookings/${item.bookingId}`} className="block border-t border-white/5 px-5 py-3 text-sm hover:bg-white/[0.03]"><span className="text-white">{item.guestName}</span><span className="ml-2 text-slate-400">{item.apartmentTitle}</span></Link>)}
        </div>
        <div className="overflow-hidden rounded-2xl border border-white/10">
          <h2 className="bg-white/5 px-5 py-4 font-semibold text-white">Ближайшие выезды</h2>
          {(data?.todayDepartures ?? []).length === 0 ? <p className="p-5 text-sm text-slate-400">Выездов сегодня нет</p> : data?.todayDepartures.map((item) => <Link key={item.bookingId} href={`/bookings/${item.bookingId}`} className="block border-t border-white/5 px-5 py-3 text-sm hover:bg-white/[0.03]"><span className="text-white">{item.guestName}</span><span className="ml-2 text-slate-400">{item.apartmentTitle}</span></Link>)}
        </div>
      </section>
    </div>
  );
}
