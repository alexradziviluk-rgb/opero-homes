"use client";

import { useEffect, useState } from "react";

const ITEMS = [
  ["guest_arrived", "Гость приехал"],
  ["check_in_completed", "Check-in завершён"],
  ["balance_received", "Остаток денег получен"],
  ["deposit_received", "Депозит получен"],
  ["documents_verified", "Документы проверены"],
  ["cleaning_assigned", "Уборка назначена"],
  ["cleaning_completed", "Уборка завершена"],
  ["maintenance_completed", "Ремонт выполнен"],
  ["check_out_completed", "Check-out завершён"],
] as const;

export default function BookingControlChecklist({ bookingId }: { bookingId: string }) {
  const [values, setValues] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/operations/checklists?bookingId=${encodeURIComponent(bookingId)}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((payload: { ok: boolean; data?: Array<Record<string, boolean>> }) => {
        if (!cancelled && payload.ok) setValues(payload.data?.[0] ?? {});
      });

    return () => {
      cancelled = true;
    };
  }, [bookingId]);

  function toggle(key: string) {
    setValues((current) => {
      const next = { ...current, [key]: !current[key] };
      void fetch("/api/operations/checklists", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId, field: key, value: next[key] }),
      });
      return next;
    });
  }

  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-slate-900/80">
      <h2 className="bg-white/5 px-5 py-4 font-semibold text-white">Контроль бронирования</h2>
      <div className="grid gap-2 p-5 sm:grid-cols-2 lg:grid-cols-3">
        {ITEMS.map(([key, label]) => (
          <label key={key} className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2 text-sm text-slate-200">
            <input type="checkbox" checked={Boolean(values[key])} onChange={() => toggle(key)} className="h-4 w-4 accent-cyan-500" />
            {label}
          </label>
        ))}
      </div>
    </section>
  );
}
