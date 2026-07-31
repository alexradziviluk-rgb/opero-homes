"use client";

import { useEffect, useState } from "react";
import OperationalShell from "@/components/operations/OperationalShell";

const CHECK_IN_ITEMS = [
  ["apartment_ready", "Апартаменты готовы — уведомить гостя"],
  ["guest_registered", "Гость зарегистрирован"],
  ["documents_verified", "Документы проверены"],
  ["key_handed_over", "Ключ передан"],
  ["balance_received", "Остаток оплаты получен"],
  ["deposit_received", "Залог получен"],
  ["check_in_completed", "Check-in завершён"],
] as const;

const CHECK_OUT_ITEMS = [
  ["key_returned", "Ключ возвращён"],
  ["apartment_inspected", "Квартира проверена"],
  ["damages_found", "Повреждения есть"],
  ["deposit_refunded", "Возврат депозита выполнен"],
  ["cleaning_assigned", "Уборка назначена"],
  ["check_out_completed", "Check-out завершён"],
] as const;

type ChecklistState = Record<string, Record<string, boolean>>;

type OperationalBooking = {
  id: string;
  apartmentId: string | null;
  guestName: string;
  checkIn: string;
  checkOut: string;
  status: string;
};

function dateKey(value: string): string {
  return value.slice(0, 10);
}

function BookingChecklist({ booking, items, values, onToggle }: {
  booking: OperationalBooking;
  items: ReadonlyArray<readonly [string, string]>;
  values: Record<string, boolean>;
  onToggle: (key: string) => void;
}) {
  return (
    <article className="border-b border-white/10 bg-slate-900/60 p-5 last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h3 className="font-semibold text-white">{booking.guestName}</h3><p className="mt-1 text-sm text-slate-400">Объект: {booking.apartmentId}</p></div>
        <span className="rounded-full bg-cyan-500/10 px-3 py-1 text-xs text-cyan-200">{booking.status}</span>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {items.map(([key, label]) => (
          <label key={key} className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2 text-sm text-slate-200">
            <input type="checkbox" checked={Boolean(values[key])} onChange={() => onToggle(key)} className="h-4 w-4 accent-cyan-500" />
            {label}
          </label>
        ))}
      </div>
    </article>
  );
}

export default function CheckInOutPage() {
  const [bookings, setBookings] = useState<OperationalBooking[]>([]);
  const [checklists, setChecklists] = useState<ChecklistState>({});
  const [isLoading, setIsLoading] = useState(true);
  const today = new Date().toISOString().slice(0, 10);
  const arrivals = bookings.filter((booking) => dateKey(booking.checkIn) === today && booking.status !== "cancelled");
  const departures = bookings.filter((booking) => dateKey(booking.checkOut) === today && booking.status !== "cancelled");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [bookingsResponse, checklistsResponse] = await Promise.all([
        fetch("/api/bookings", { cache: "no-store" }),
        fetch("/api/operations/checklists", { cache: "no-store" }),
      ]);
      const bookingsPayload = (await bookingsResponse.json()) as { ok: boolean; data?: OperationalBooking[] };
      const checklistsPayload = (await checklistsResponse.json()) as { ok: boolean; data?: Array<Record<string, boolean> & { booking_id: string }> };
      if (cancelled) return;

      if (bookingsPayload.ok) setBookings(bookingsPayload.data ?? []);
      if (checklistsPayload.ok) {
        setChecklists(Object.fromEntries((checklistsPayload.data ?? []).map((row) => [row.booking_id, row])));
      }
      setIsLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  function toggle(bookingId: string, key: string) {
    setChecklists((current) => {
      const next = {
        ...current,
        [bookingId]: {
          ...current[bookingId],
          [key]: !current[bookingId]?.[key],
        },
      };
      void fetch("/api/operations/checklists", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId, field: key, value: next[bookingId][key] }),
      });
      return next;
    });
  }

  return (
    <OperationalShell title="Заезд / Выезд" description="Сегодняшние заезды и выезды с операционными чек-листами">
      {isLoading ? <p className="mb-4 text-sm text-slate-400">Загрузка...</p> : null}
      <div className="grid gap-6 xl:grid-cols-2">
        <section className="overflow-hidden rounded-2xl border border-white/10">
          <h2 className="bg-white/5 px-5 py-4 font-semibold text-white">Сегодняшние заезды · {arrivals.length}</h2>
          {arrivals.length === 0 ? <p className="p-6 text-sm text-slate-400">Заездов сегодня нет</p> : arrivals.map((booking) => <BookingChecklist key={booking.id} booking={booking} items={CHECK_IN_ITEMS} values={checklists[booking.id] ?? {}} onToggle={(key) => toggle(booking.id, key)} />)}
        </section>
        <section className="overflow-hidden rounded-2xl border border-white/10">
          <h2 className="bg-white/5 px-5 py-4 font-semibold text-white">Сегодняшние выезды · {departures.length}</h2>
          {departures.length === 0 ? <p className="p-6 text-sm text-slate-400">Выездов сегодня нет</p> : departures.map((booking) => <BookingChecklist key={booking.id} booking={booking} items={CHECK_OUT_ITEMS} values={checklists[booking.id] ?? {}} onToggle={(key) => toggle(booking.id, key)} />)}
        </section>
      </div>
    </OperationalShell>
  );
}
