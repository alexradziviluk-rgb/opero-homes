"use client";

import { useDashboardMetrics } from "@/components/dashboard/dashboard-metrics-provider";

export default function CheckoutPaymentsWidget() {
  const { data, isLoading } = useDashboardMetrics();

  if (isLoading) {
    return (
      <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-[0_30px_80px_-40px_rgba(45,212,191,0.45)]">
        <p className="text-sm text-slate-300">Загрузка данных по платежам...</p>
      </section>
    );
  }

  const items = data?.checkoutPayments ?? [];
  const status = data?.checkoutPaymentsStatus ?? "insufficient_schema";

  return (
    <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-[0_30px_80px_-40px_rgba(45,212,191,0.45)]">
      <p className="text-sm font-medium text-teal-300">К оплате при выезде</p>
      <h2 className="mt-1 text-xl font-semibold text-white">Платежи по текущим бронированиям</h2>

      {items.length === 0 ? (
        <p className="mt-5 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
          {status === "no_payments" ? "Платежей пока нет" : "Недостаточно данных"}
        </p>
      ) : (
        <div className="mt-5 space-y-3">
          {items.map((item) => (
            <div key={item.bookingId} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm">
              <p className="font-semibold text-white">{item.apartmentTitle}</p>
              <p className="text-slate-300">{item.guestName}</p>
              <p className="mt-1 text-xs text-teal-300">Выезд: {item.checkoutDate}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
