"use client";

import Link from "next/link";
import StatCard from "@/components/StatCard";
import { useDashboardMetrics } from "@/components/dashboard/dashboard-metrics-provider";

export default function BookingsWidget() {
  const { data, isLoading } = useDashboardMetrics();

  if (isLoading) {
    return (
      <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 text-sm text-slate-300">
        Загрузка данных по бронированиям...
      </section>
    );
  }

  const bookingsTotal = data?.bookingsTotal ?? 0;
  const activeFuture = data?.bookingsActiveFuture ?? 0;

  return (
    <Link
      href="/bookings"
      className="group cursor-pointer transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_30px_50px_-30px_rgba(139,92,246,0.6)]"
    >
      <StatCard
        title="Бронирования"
        value={String(bookingsTotal)}
        delta={`Активные/будущие: ${activeFuture}`}
        description={bookingsTotal === 0 ? "Бронирований пока нет" : undefined}
        accentClass="from-violet-500/25 to-fuchsia-400/25"
        icon={
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect x="4" y="5" width="16" height="14" rx="3" />
            <path d="M8 3v4M16 3v4M4 10h16" />
          </svg>
        }
      />
    </Link>
  );
}
