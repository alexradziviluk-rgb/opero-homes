"use client";

import StatCard from "@/components/StatCard";
import { useDashboardMetrics } from "@/components/dashboard/dashboard-metrics-provider";

function formatRevenueByCurrency(values: Array<{ currency: string; amount: number }>): string {
  if (values.length === 0) {
    return "0";
  }

  return values.map((item) => `${item.amount.toLocaleString("ru-RU")} ${item.currency}`).join(" | ");
}

export default function RevenueWidget() {
  const { data, isLoading } = useDashboardMetrics();

  if (isLoading) {
    return (
      <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 text-sm text-slate-300">
        Загрузка данных по платежам...
      </section>
    );
  }

  const revenueByCurrency = data?.revenueByCurrency ?? [];
  const valueLabel = formatRevenueByCurrency(revenueByCurrency);

  const description =
    data?.revenueDataStatus === "no_payments"
      ? "Платежей пока нет"
      : data?.revenueDataStatus === "insufficient_schema"
        ? "Недостаточно данных"
        : undefined;

  return (
    <StatCard
      title="Доход за месяц"
      value={valueLabel}
      delta={revenueByCurrency.length > 0 ? "Оплаченные поступления" : "0"}
      description={description}
      accentClass="from-emerald-500/25 to-lime-400/25"
      icon={
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M5 12h14" />
          <path d="m12 5 7 7-7 7" />
        </svg>
      }
    />
  );
}
