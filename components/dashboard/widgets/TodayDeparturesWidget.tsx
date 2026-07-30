"use client";

import { useDashboardMetrics } from "@/components/dashboard/dashboard-metrics-provider";

export default function TodayDeparturesWidget() {
  const { data, isLoading } = useDashboardMetrics();

  if (isLoading) {
    return (
      <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-[0_30px_80px_-40px_rgba(251,191,36,0.45)]">
        <p className="text-sm text-slate-300">Загрузка выездов...</p>
      </section>
    );
  }

  const departures = data?.todayDepartures ?? [];

  return (
    <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-[0_30px_80px_-40px_rgba(251,191,36,0.45)]">
      <p className="text-sm font-medium text-amber-300">Выезды сегодня</p>
      <h2 className="mt-1 text-xl font-semibold text-white">Контроль чекаута</h2>
      {departures.length === 0 ? (
        <p className="mt-5 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">Выездов сегодня нет</p>
      ) : (
        <div className="mt-5 space-y-3">
          {departures.map((item) => (
            <div key={item.bookingId} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <p className="font-medium text-white">{item.guestName}</p>
              <p className="text-sm text-slate-400">{item.apartmentTitle}</p>
              <p className="mt-1 text-xs text-amber-300">Выезд: {item.dateLabel}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
