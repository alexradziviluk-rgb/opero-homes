"use client";

import StatCard from "@/components/StatCard";
import { useDashboardMetrics } from "@/components/dashboard/dashboard-metrics-provider";

export default function OccupancyWidget() {
  const { data, isLoading } = useDashboardMetrics();

  if (isLoading) {
    return (
      <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 text-sm text-slate-300">
        Загрузка данных по заполняемости...
      </section>
    );
  }

  const occupancyPercent = data?.occupancyPercent;
  const hasOccupancy = typeof occupancyPercent === "number";

  return (
    <StatCard
      title="Заполняемость"
      value={hasOccupancy ? `${occupancyPercent.toFixed(1)}%` : "Недостаточно данных"}
      delta={hasOccupancy ? "На основе реальных бронирований" : "Недостаточно данных"}
      accentClass="from-amber-500/25 to-orange-400/25"
      icon={
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M5 19V9l7-4 7 4v10" />
          <path d="M9 19v-5h6v5" />
        </svg>
      }
    />
  );
}
