"use client";

import Link from "next/link";
import { useDashboardMetrics } from "@/components/dashboard/dashboard-metrics-provider";

export default function PendingConfirmationsWidget() {
  const { data, isLoading } = useDashboardMetrics();

  if (isLoading) {
    return (
      <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 text-sm text-slate-300">
        Загрузка ожидающих подтверждения...
      </section>
    );
  }

  const pendingCount = data?.pendingConfirmationsCount ?? 0;

  return (
    <Link
      href="/bookings?status=pending"
      className="rounded-3xl border border-amber-400/30 bg-amber-500/10 p-6 transition hover:bg-amber-500/15"
    >
      <p className="text-sm font-medium text-amber-200">Ожидают подтверждения</p>
      <h2 className="mt-2 text-3xl font-semibold text-white">{pendingCount}</h2>
      <p className="mt-1 text-sm text-amber-100">
        {pendingCount === 0 ? "Бронирований пока нет" : pendingCount === 1 ? "1 бронирование" : `${pendingCount} бронирований`}
      </p>
      <span className="mt-4 inline-block rounded-xl border border-amber-300/40 px-3 py-2 text-sm text-amber-100">Открыть</span>
    </Link>
  );
}
