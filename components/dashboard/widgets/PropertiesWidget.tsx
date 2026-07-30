"use client";

import Link from "next/link";
import StatCard from "@/components/StatCard";
import { useDashboardMetrics } from "@/components/dashboard/dashboard-metrics-provider";

export default function PropertiesWidget() {
  const { data, isLoading } = useDashboardMetrics();

  if (isLoading) {
    return (
      <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 text-sm text-slate-300">
        Загрузка данных по объектам...
      </section>
    );
  }

  const propertiesTotal = data?.propertiesTotal ?? 0;
  const propertiesActive = data?.propertiesActive;

  if (propertiesTotal === 0) {
    return (
      <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-[0_30px_50px_-30px_rgba(34,211,238,0.6)]">
        <p className="text-sm font-medium text-slate-400">Объекты</p>
        <p className="mt-3 text-3xl font-semibold tracking-tight text-white">0</p>
        <p className="mt-4 text-sm text-slate-300">Объекты ещё не добавлены</p>
        <Link
          href="/apartments/new"
          className="mt-4 inline-flex rounded-2xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-500/20"
        >
          Добавить первый объект
        </Link>
      </section>
    );
  }

  const activeLabel =
    propertiesActive === null ? "Статус operational_status недоступен" : `Активные: ${propertiesActive}`;

  return (
    <Link
      href="/apartments"
      className="group cursor-pointer transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_30px_50px_-30px_rgba(34,211,238,0.6)]"
    >
      <StatCard
        title="Объекты"
        value={String(propertiesTotal)}
        delta={activeLabel}
        accentClass="from-cyan-500/25 to-sky-400/25"
        icon={
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect x="4" y="5" width="16" height="14" rx="2" />
            <path d="M8 10h8M8 14h5" />
          </svg>
        }
      />
    </Link>
  );
}
