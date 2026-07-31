"use client";

import { useMemo, useState } from "react";
import {
  getApartmentDateAvailability,
  getRangeAvailability,
  type AvailabilityBooking,
  type PublicAvailabilityStatus,
} from "@/lib/bookings/availability";

type CalendarChange = {
  checkIn: string;
  checkOut: string;
  statuses: PublicAvailabilityStatus[];
};

type Props = {
  apartmentId: string;
  bookings: AvailabilityBooking[];
  checkIn: string;
  checkOut: string;
  onChange: (next: CalendarChange) => void;
  onInvalidRange: (message: string) => void;
};

const WEEKDAY_LABELS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

function toIsoDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function isDateInsideRange(dateIso: string, checkIn: string, checkOut: string): boolean {
  if (!checkIn || !checkOut) return false;
  return dateIso >= checkIn && dateIso < checkOut;
}

function buildCalendarDays(cursor: Date): Date[] {
  const firstDayOfMonth = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const firstWeekday = firstDayOfMonth.getDay();
  const gridStart = addDays(firstDayOfMonth, -firstWeekday);

  const days: Date[] = [];
  for (let index = 0; index < 42; index += 1) {
    days.push(addDays(gridStart, index));
  }

  return days;
}

function getStatusMeta(status: PublicAvailabilityStatus) {
  if (status === "occupied") {
    return {
      label: "Занято",
      className: "bg-rose-500/25 text-rose-100 border border-rose-400/40",
      dotClassName: "bg-rose-400",
    };
  }

  if (status === "pending") {
    return {
      label: "Есть заявка",
      className: "bg-amber-500/25 text-amber-100 border border-amber-400/40",
      dotClassName: "bg-amber-400",
    };
  }

  return {
    label: "Свободно",
    className: "bg-emerald-500/25 text-emerald-100 border border-emerald-400/40",
    dotClassName: "bg-emerald-400",
  };
}

export default function PublicAvailabilityCalendar({
  apartmentId,
  bookings,
  checkIn,
  checkOut,
  onChange,
  onInvalidRange,
}: Props) {
  const [cursor, setCursor] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [hoverDate, setHoverDate] = useState<string>("");

  const todayIso = toIsoDate(new Date());

  const days = useMemo(() => buildCalendarDays(cursor), [cursor]);

  const previewStatuses = useMemo(() => {
    if (!checkIn || checkOut || !hoverDate || hoverDate <= checkIn) {
      return [] as PublicAvailabilityStatus[];
    }

    return getRangeAvailability(apartmentId, checkIn, hoverDate, bookings);
  }, [apartmentId, bookings, checkIn, checkOut, hoverDate]);

  function handlePick(dateIso: string, status: PublicAvailabilityStatus, disabled: boolean) {
    if (disabled || status === "occupied") {
      return;
    }

    if (!checkIn || (checkIn && checkOut)) {
      onChange({ checkIn: dateIso, checkOut: "", statuses: [] });
      setHoverDate("");
      return;
    }

    if (dateIso <= checkIn) {
      onChange({ checkIn: dateIso, checkOut: "", statuses: [] });
      setHoverDate("");
      return;
    }

    const statuses = getRangeAvailability(apartmentId, checkIn, dateIso, bookings);
    if (statuses.some((item) => item === "occupied")) {
      onInvalidRange("В выбранном периоде есть занятые даты. Выберите другой диапазон.");
      return;
    }

    onChange({ checkIn, checkOut: dateIso, statuses });
    setHoverDate("");
  }

  function prevMonth() {
    setCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  }

  function nextMonth() {
    setCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <button type="button" onClick={prevMonth} className="rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-200 hover:bg-white/10">‹</button>
        <p className="text-sm font-semibold text-white">
          {cursor.toLocaleDateString("ru-RU", { month: "long", year: "numeric" })}
        </p>
        <button type="button" onClick={nextMonth} className="rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-200 hover:bg-white/10">›</button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs text-slate-400">
        {WEEKDAY_LABELS.map((day) => (
          <div key={day} className="py-1">{day}</div>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1">
        {days.map((day) => {
          const iso = toIsoDate(day);
          const isCurrentMonth = day.getMonth() === cursor.getMonth();
          const isPast = iso < todayIso;
          const status = getApartmentDateAvailability(apartmentId, day, bookings);
          const statusMeta = getStatusMeta(status);
          const disabled = isPast || status === "occupied";
          const isStart = checkIn === iso;
          const isEnd = checkOut === iso;
          const isToday = iso === todayIso;

          const previewRangeActive =
            Boolean(checkIn) &&
            !checkOut &&
            hoverDate > checkIn &&
            iso >= checkIn &&
            iso < hoverDate;

          const selectedRangeActive = isDateInsideRange(iso, checkIn, checkOut);
          const inRange = selectedRangeActive || previewRangeActive;
          const rangeClasses = inRange ? "ring-2 ring-cyan-300/70" : "";
          const endpointClasses = isStart || isEnd ? "outline outline-2 outline-cyan-300" : "";
          const todayClasses = isToday ? "shadow-[inset_0_0_0_1px_rgba(56,189,248,0.9)]" : "";

          return (
            <button
              key={iso}
              type="button"
              disabled={disabled}
              aria-disabled={disabled ? "true" : "false"}
              aria-label={`${day.getDate()} — ${statusMeta.label}${disabled ? ", недоступно" : ""}`}
              onClick={() => handlePick(iso, status, disabled)}
              onMouseEnter={() => {
                if (checkIn && !checkOut && iso > checkIn) {
                  setHoverDate(iso);
                }
              }}
              className={`min-h-[42px] rounded-lg px-1 py-1 text-xs transition sm:min-h-[48px] sm:text-sm ${statusMeta.className} ${rangeClasses} ${endpointClasses} ${todayClasses} ${!isCurrentMonth ? "opacity-45" : ""} ${disabled ? "cursor-not-allowed opacity-45" : "hover:brightness-110"}`}
            >
              <span>{day.getDate()}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 grid gap-2 text-xs text-slate-200 sm:grid-cols-3">
        <div className="flex items-center gap-2" aria-label="Свободно">
          <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
          <span>Свободно</span>
        </div>
        <div className="flex items-center gap-2" aria-label="Есть заявка">
          <span className="inline-flex h-2.5 w-2.5 rounded-full bg-amber-400" />
          <span>Есть заявка</span>
        </div>
        <div className="flex items-center gap-2" aria-label="Занято">
          <span className="inline-flex h-2.5 w-2.5 rounded-full bg-rose-400" />
          <span>Занято</span>
        </div>
      </div>

      {previewStatuses.some((status) => status === "pending") ? (
        <p className="mt-3 rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          На выбранные даты уже есть заявка, которая ожидает подтверждения.
        </p>
      ) : null}
    </div>
  );
}
