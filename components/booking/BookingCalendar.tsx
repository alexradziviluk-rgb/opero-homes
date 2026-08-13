"use client";

import { useMemo, useState } from "react";
import {
  getCanonicalDayKind,
  getCanonicalRangeKinds,
  type CalendarCapabilities,
  type CanonicalAvailabilityPeriod,
  type CalendarDayKind,
} from "@/lib/bookings/canonical-availability";

type BookingCalendarChange = {
  startDate: string;
  endDate: string;
  kinds: CalendarDayKind[];
};

type Props = {
  apartmentId: string;
  periods: CanonicalAvailabilityPeriod[];
  startDate?: string;
  endDate?: string;
  capabilities?: CalendarCapabilities;
  actionLabel?: string;
  onChange?: (change: BookingCalendarChange) => void;
  onAction?: (change: BookingCalendarChange) => void;
  onPeriodClick?: (period: CanonicalAvailabilityPeriod) => void;
  onConflict?: (message: string) => void;
  className?: string;
};

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const MONTH_NAMES = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function monthStart(value: string): string {
  return `${value.slice(0, 7)}-01`;
}

function monthCursor(value: string, offset: number): string {
  const [year, month] = value.slice(0, 7).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1 + offset, 1)).toISOString().slice(0, 10);
}

function buildDays(cursor: string): string[] {
  const [year, month] = cursor.slice(0, 7).split("-").map(Number);
  const first = new Date(Date.UTC(year, month - 1, 1));
  const mondayOffset = (first.getUTCDay() + 6) % 7;
  const start = new Date(Date.UTC(year, month - 1, 1 - mondayOffset));
  return Array.from({ length: 42 }, (_, index) => new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + index)).toISOString().slice(0, 10));
}

function formatDay(value: string): string {
  return value.slice(8, 10);
}

function formatMonth(value: string): string {
  const [year, month] = value.slice(0, 7).split("-").map(Number);
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

function kindMeta(kind: CalendarDayKind) {
  if (kind === "customer_booking") return { label: "Занято", className: "border-rose-400/40 bg-rose-500/25 text-rose-100", dot: "bg-rose-400" };
  if (kind === "owner_block") return { label: "Моя блокировка", className: "border-amber-400/40 bg-amber-500/25 text-amber-100", dot: "bg-amber-400" };
  if (kind === "staff_block") return { label: "Системная блокировка", className: "border-violet-400/40 bg-violet-500/25 text-violet-100", dot: "bg-violet-400" };
  return { label: "Свободно", className: "border-emerald-400/30 bg-emerald-500/15 text-emerald-100", dot: "bg-emerald-400" };
}

function canSelect(kind: CalendarDayKind, capabilities: CalendarCapabilities): boolean {
  if (kind === "available") return Boolean(capabilities.canBook || capabilities.canCreateOwnerBlock || capabilities.canCreateStaffBlock);
  return false;
}

function visibleKind(kind: CalendarDayKind, capabilities: CalendarCapabilities): CalendarDayKind {
  return !capabilities.canSeeOperationalDetails && kind !== "available" ? "customer_booking" : kind;
}

export default function BookingCalendar({
  apartmentId,
  periods,
  startDate = "",
  endDate = "",
  capabilities = {},
  actionLabel,
  onChange,
  onAction,
  onPeriodClick,
  onConflict,
  className = "",
}: Props) {
  const [cursor, setCursor] = useState(() => monthStart(startDate || todayIso()));
  const [hoverDate, setHoverDate] = useState("");
  const days = useMemo(() => buildDays(cursor), [cursor]);
  const selectedKinds = useMemo(() => startDate && endDate ? getCanonicalRangeKinds(apartmentId, startDate, endDate, periods) : [], [apartmentId, endDate, periods, startDate]);
  const selectedChange = startDate && endDate ? { startDate, endDate, kinds: selectedKinds } : null;

  function pick(date: string) {
    const kind = getCanonicalDayKind(apartmentId, date, periods);
    if (!canSelect(kind, capabilities) || date < todayIso()) return;
    if (!startDate || endDate || date <= startDate) {
      onChange?.({ startDate: date, endDate: "", kinds: [] });
      setHoverDate("");
      return;
    }
    const kinds = getCanonicalRangeKinds(apartmentId, startDate, date, periods);
    if (kinds.some((item) => item !== "available")) {
      onConflict?.("Эти даты уже заняты.");
      return;
    }
    onChange?.({ startDate, endDate: date, kinds });
    setHoverDate("");
  }

  return (
    <section className={`rounded-2xl border border-white/10 bg-slate-950/60 p-3 sm:p-4 ${className}`} aria-label="Календарь доступности">
      <div className="mb-3 flex items-center justify-between gap-2">
        <button type="button" onClick={() => setCursor((value) => monthCursor(value, -1))} className="min-h-10 min-w-10 rounded-xl border border-white/10 px-3 py-2 text-sm hover:bg-white/10" aria-label="Предыдущий месяц">‹</button>
        <p className="text-sm font-semibold capitalize text-white">{formatMonth(cursor)}</p>
        <button type="button" onClick={() => setCursor((value) => monthCursor(value, 1))} className="min-h-10 min-w-10 rounded-xl border border-white/10 px-3 py-2 text-sm hover:bg-white/10" aria-label="Следующий месяц">›</button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-slate-400">{WEEKDAYS.map((day) => <div key={day} className="py-1">{day}</div>)}</div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {days.map((date) => {
          const kind = getCanonicalDayKind(apartmentId, date, periods);
          const displayKind = visibleKind(kind, capabilities);
          const meta = kindMeta(displayKind);
          const isOutsideMonth = date.slice(0, 7) !== cursor.slice(0, 7);
          const isToday = date === todayIso();
          const isStart = date === startDate;
          const isEnd = date === endDate;
          const preview = Boolean(startDate && !endDate && hoverDate > startDate && date >= startDate && date < hoverDate);
          const selected = Boolean(startDate && endDate && date >= startDate && date < endDate);
          const period = periods.find((item) => item.apartmentId === apartmentId && item.startDate <= date && date < item.endDate && item.kind === kind);
          const disabled = !canSelect(displayKind, capabilities) && !period;
          return <button key={date} type="button" disabled={disabled} onClick={() => period && onPeriodClick ? onPeriodClick(period) : pick(date)} onMouseEnter={() => startDate && !endDate && date > startDate && setHoverDate(date)} aria-label={`${date} — ${meta.label}${disabled ? ", недоступно" : ""}`} className={`min-h-[42px] rounded-lg border px-1 py-1 text-xs transition sm:min-h-[48px] sm:text-sm ${meta.className} ${isOutsideMonth ? "opacity-40" : ""} ${disabled ? "cursor-not-allowed opacity-50" : "hover:brightness-110"} ${selected || preview ? "ring-2 ring-cyan-300/80" : ""} ${isStart || isEnd ? "outline outline-2 outline-cyan-300" : ""} ${isToday ? "shadow-[inset_0_0_0_1px_rgba(56,189,248,0.9)]" : ""}`}>
            <span>{formatDay(date)}</span>
          </button>;
        })}
      </div>
      <div className="mt-4 grid gap-2 text-xs text-slate-200 sm:grid-cols-2 lg:grid-cols-5">
        {(["available", "customer_booking", "owner_block", "staff_block"] as CalendarDayKind[]).map((kind) => { const meta = kindMeta(kind); const visible = kind === "available" || kind === "customer_booking" || (kind === "owner_block" && capabilities.canCreateOwnerBlock && capabilities.canSeeOperationalDetails) || (kind === "staff_block" && capabilities.canCreateStaffBlock && capabilities.canSeeOperationalDetails); return visible ? <div key={kind} className="flex items-center gap-2"><span className={`inline-flex h-2.5 w-2.5 rounded-full ${meta.dot}`} /><span>{meta.label}</span></div> : null; })}
        {selectedChange ? <div className="flex items-center gap-2"><span className="inline-flex h-2.5 w-2.5 rounded border-2 border-cyan-300" /><span>Выбрано</span></div> : null}
      </div>
      {selectedChange && actionLabel && onAction ? <button type="button" onClick={() => onAction(selectedChange)} className="mt-4 w-full rounded-xl bg-cyan-400 px-4 py-2 font-semibold text-slate-950 hover:bg-cyan-300">{actionLabel}</button> : null}
    </section>
  );
}

export type { BookingCalendarChange };
