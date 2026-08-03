"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { useCurrentUser, getHomeRouteForUser } from "@/components/auth/current-user-provider";
import { fetchStaffBookings } from "@/lib/bookings/staff-bookings";
import { loadApartmentsFromSupabase } from "@/lib/apartments/supabase-apartments";
import { bookingsOverlap, findBookingConflict, isBlockingBooking } from "@/lib/bookings/booking-conflicts";
import { getBookingStatusPresentation } from "@/lib/bookings/status-presentation";
import { hasEffectivePermission } from "@/lib/permissions";
import { emitBookingNotificationEvent } from "@/lib/notifications/client-events";
import { deleteRemoteBooking, persistBookingStatus } from "@/lib/bookings/remote-bookings";
import { createRemoteBookingTasks } from "@/lib/bookings/remote-booking-tasks";
import type { Apartment } from "@/types/apartment";
import type { Booking } from "@/types/booking";

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function addDays(d: Date, n: number) {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
}

function toIsoDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateOffset(fromDate: string, toDate: string): number {
  const from = fromDate.split("-").map(Number);
  const to = toDate.split("-").map(Number);
  return Math.round((Date.UTC(to[0], to[1] - 1, to[2]) - Date.UTC(from[0], from[1] - 1, from[2])) / 86400000);
}

function formatPeriod(checkIn: string, checkOut: string): string {
  const [startYear, startMonthNumber, startDayNumber] = checkIn.split("-").map(Number);
  const [endYear, endMonthNumber, endDayNumber] = checkOut.split("-").map(Number);
  const start = new Date(Date.UTC(startYear, startMonthNumber - 1, startDayNumber));
  const end = new Date(Date.UTC(endYear, endMonthNumber - 1, endDayNumber));
  const startDay = String(startDayNumber).padStart(2, "0");
  const endDay = String(endDayNumber).padStart(2, "0");
  const startMonth = start.toLocaleDateString("ru-RU", { month: "long", timeZone: "UTC" });
  const endMonth = end.toLocaleDateString("ru-RU", { month: "long", timeZone: "UTC" });

  if (startYear === endYear && startMonthNumber === endMonthNumber) {
    return `${startDay}-${endDay} ${startMonth}`;
  }

  return `${startDay} ${startMonth} - ${endDay} ${endMonth}`;
}

type ApartmentLabelSource = Apartment & {
  number?: string | number;
  unitNumber?: string | number;
  name?: string;
};

type AvailabilityBlock = {
  id: string;
  apartment_id: string;
  start_date: string;
  end_date: string;
  reason_code: string | null;
  private_note: string | null;
  created_by: string | null;
  created_by_role: string | null;
};

function getApartmentCalendarLabel(booking: Booking, apartments: Apartment[]): string {
  const apartment = apartments.find((item) => item.id === booking.apartmentId) as ApartmentLabelSource | undefined;
  if (!apartment) {
    return "Объект не найден";
  }

  const numberCandidate = apartment.number ?? apartment.unitNumber;
  if (numberCandidate != null && String(numberCandidate).trim()) {
    return `№${String(numberCandidate).trim()}`;
  }

  if (apartment.name?.trim()) {
    return apartment.name.trim();
  }

  if (apartment.title.trim()) {
    return apartment.title.trim();
  }

  return "Объект не найден";
}

export default function CalendarPage() {
  const router = useRouter();
  const { currentUser, isAuthLoading } = useCurrentUser();

  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [calendarView, setCalendarView] = useState<"week" | "month">("month");
  const [showDemoTemplate, setShowDemoTemplate] = useState(false);
  const [filterApartment, setFilterApartment] = useState<string>("");
  const [searchApartment, setSearchApartment] = useState<string>("");
  const [rangeApartmentId, setRangeApartmentId] = useState<string>("");
  const [rangeCheckIn, setRangeCheckIn] = useState<string>("");
  const [rangeCheckOut, setRangeCheckOut] = useState<string>("");
  const [rangeError, setRangeError] = useState<string>("");
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string>("");
  const [actionSuccess, setActionSuccess] = useState<string>("");
  const [isConfirming, setIsConfirming] = useState(false);
  const [version, setVersion] = useState(0);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [apartments, setApartments] = useState<Apartment[]>([]);
  const [availabilityBlocks, setAvailabilityBlocks] = useState<AvailabilityBlock[]>([]);

  const canViewCalendar = currentUser ? hasEffectivePermission(currentUser, "calendar.view") : false;
  const canViewBookings = currentUser ? hasEffectivePermission(currentUser, "bookings.view") : false;
  const canViewClients = currentUser ? hasEffectivePermission(currentUser, "clients.view") : false;
  const canCreateBookings = currentUser ? hasEffectivePermission(currentUser, "bookings.create") : false;
  const canEditBookings = currentUser ? hasEffectivePermission(currentUser, "bookings.edit") : false;
  const canMoveBookings = currentUser ? hasEffectivePermission(currentUser, "bookings.move") : false;
  const canCancelBookings = currentUser ? hasEffectivePermission(currentUser, "bookings.cancel") : false;
  const canDeleteBookings = currentUser ? hasEffectivePermission(currentUser, "bookings.delete") : false;
  const canConfirmBookings = currentUser ? hasEffectivePermission(currentUser, "bookings.confirm") : false;
  const canViewPayments =
    currentUser
      ? hasEffectivePermission(currentUser, "payments.view") || hasEffectivePermission(currentUser, "payments.collect")
      : false;

  useEffect(() => {
    if (isAuthLoading || !currentUser) {
      return;
    }

    if (!canViewCalendar) {
      router.replace(getHomeRouteForUser(currentUser));
    }
  }, [canViewCalendar, currentUser, isAuthLoading, router]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([fetchStaffBookings(), loadApartmentsFromSupabase(), fetch("/api/availability/blocks", { cache: "no-store" }).then((response) => response.json())]).then(([nextBookings, nextApartments, blocksResult]) => {
      if (cancelled) return;
      setBookings(nextBookings);
      setApartments(nextApartments);
      setAvailabilityBlocks(blocksResult.ok ? (blocksResult.data ?? []) : []);
    }).catch(() => {
      if (!cancelled) setActionError("Не удалось загрузить календарь");
    });
    return () => { cancelled = true; };
  }, [version]);

  const days = useMemo(() => {
    const first = calendarView === "month"
      ? startOfMonth(cursor)
      : addDays(cursor, -((cursor.getDay() + 6) % 7));
    const dayCount = calendarView === "month" ? new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate() : 7;
    const arr: Date[] = [];
    for (let index = 0; index < dayCount; index += 1) {
      arr.push(addDays(first, index));
    }
    return arr;
  }, [calendarView, cursor]);

  function prev() {
    setCursor((c) => addMonths(c, -1));
  }

  function next() {
    setCursor((c) => addMonths(c, 1));
  }

  const visibleBookings = bookings.filter((booking) => {
    if (!isBlockingBooking(booking)) return false;
    if (filterApartment) return booking.apartmentId === filterApartment;
    return true;
  });
  const visibleBlocks = availabilityBlocks.filter((block) => !filterApartment || block.apartment_id === filterApartment);

  const visibleApartments = apartments.filter((apartment) => {
    if (filterApartment && apartment.id !== filterApartment) return false;
    const query = searchApartment.trim().toLocaleLowerCase();
    if (!query) return true;
    return `${apartment.title} ${apartment.city}`.toLocaleLowerCase().includes(query);
  });

  const calendarStart = toIsoDate(days[0]);
  const calendarEnd = toIsoDate(addDays(days[days.length - 1], 1));
  const demoCheckIn = "2026-08-03";
  const demoCheckOut = "2026-08-07";

  function bookingPosition(booking: Booking) {
    const calendarStartDate = toIsoDate(days[0]);
    const startOffset = Math.max(0, dateOffset(calendarStartDate, booking.checkIn));
    const endOffset = Math.min(days.length, dateOffset(calendarStartDate, booking.checkOut));
    return { gridColumn: `${startOffset + 1} / ${Math.max(startOffset + 2, endOffset + 1)}`, gridRow: "1" };
  }

  function periodPosition(checkIn: string, checkOut: string) {
    const calendarStartDate = toIsoDate(days[0]);
    const startOffset = Math.max(0, dateOffset(calendarStartDate, checkIn));
    const endOffset = Math.min(days.length, dateOffset(calendarStartDate, checkOut));
    return { gridColumn: `${startOffset + 1} / ${Math.max(startOffset + 2, endOffset + 1)}`, gridRow: "1" };
  }

  const selectedBooking = selectedBookingId ? bookings.find((booking) => booking.id === selectedBookingId) ?? null : null;

  function statusColor(booking: Booking): string {
    const status = getBookingStatusPresentation(booking.status).status;
    if (status === "pending") return "bg-amber-400 text-slate-900";
    if (status === "confirmed" || status === "checked_in") return "bg-rose-400 text-slate-900";
    return "bg-slate-400 text-slate-900";
  }

  function beginQuickRangeFromDay(day: Date) {
    if (!canCreateBookings) {
      return;
    }

    const selectedStart = toIsoDate(day);
    if (!rangeCheckIn || (rangeCheckIn && rangeCheckOut)) {
      setRangeCheckIn(selectedStart);
      setRangeCheckOut("");
      setRangeError("");
      return;
    }

    if (selectedStart < rangeCheckIn) {
      setRangeCheckIn(selectedStart);
      setRangeCheckOut("");
      setRangeError("");
      return;
    }

    setRangeCheckOut(toIsoDate(addDays(day, 1)));
    setRangeError("");
  }

  function openCreateBookingWithRange() {
    if (!canCreateBookings) {
      setRangeError("Недостаточно прав для создания бронирования.");
      return;
    }

    if (!rangeApartmentId || !rangeCheckIn || !rangeCheckOut) {
      setRangeError("Выберите объект, дату заезда и дату выезда.");
      return;
    }

    const conflict = findBookingConflict({
      bookings,
      apartmentId: rangeApartmentId,
      checkIn: rangeCheckIn,
      checkOut: rangeCheckOut,
    });

    if (conflict) {
      setRangeError("Этот объект уже забронирован на выбранные даты.");
      return;
    }

    const blockConflict = visibleBlocks.find((block) => block.apartment_id === rangeApartmentId && bookingsOverlap(rangeCheckIn, rangeCheckOut, block.start_date, block.end_date));
    if (blockConflict) {
      setRangeError("Этот объект заблокирован на выбранные даты.");
      return;
    }

    router.push(`/bookings/new?apartmentId=${rangeApartmentId}&checkIn=${rangeCheckIn}&checkOut=${rangeCheckOut}`);
  }

  async function handleCancelBooking(booking: Booking) {
    if (!currentUser || !canCancelBookings) {
      setActionError("Недостаточно прав для отмены бронирования.");
      return;
    }

    if (!confirm("Отменить бронирование?")) {
      return;
    }

    const cancelledBooking: Booking = {
      ...booking,
      status: "cancelled",
      updatedByUserId: currentUser.id,
      updatedAt: new Date().toISOString(),
    };

    try {
      await persistBookingStatus(booking, "cancelled");
      await emitBookingNotificationEvent("booking_cancelled", cancelledBooking, {
        actionUrl: `/bookings/${booking.id}`,
      });
      setSelectedBookingId(null);
      setVersion((v) => v + 1);
    } catch {
      setActionError("Не удалось отменить бронирование");
    }
  }

  async function handleDeleteBooking(booking: Booking) {
    if (!canDeleteBookings) {
      setActionError("Недостаточно прав для удаления бронирования.");
      return;
    }

    if (!confirm("Удалить бронирование?")) {
      return;
    }

    try {
      await deleteRemoteBooking(booking.id);
      await emitBookingNotificationEvent("booking_cancelled", booking, {
        idempotencySeed: `deleted:${new Date().toISOString()}`,
        actionUrl: "/bookings",
      });
      setSelectedBookingId(null);
      setVersion((v) => v + 1);
    } catch {
      setActionError("Не удалось удалить бронирование");
    }
  }

  async function handleConfirmBooking(booking: Booking) {
    if (!currentUser || !canConfirmBookings) {
      setActionError("Недостаточно прав для подтверждения бронирования.");
      return;
    }

    setActionError("");
    setActionSuccess("");
    setIsConfirming(true);

    try {
      await persistBookingStatus(booking, "confirmed");
      const confirmedBooking = { ...booking, status: "confirmed" as const, confirmedByUserId: currentUser.id };
      const taskWarning = await createRemoteBookingTasks(confirmedBooking);
      await emitBookingNotificationEvent("booking_confirmed", confirmedBooking, {
        actionUrl: `/bookings/${booking.id}`,
      });
      const warnings = taskWarning ? [taskWarning] : [];
      const warning = warnings.length > 0 ? ` (${warnings.join("; ")})` : "";
      setActionSuccess(`Бронирование подтверждено${warning}`);
      setVersion((v) => v + 1);
    } catch {
      setActionError("Не удалось подтвердить бронирование");
    } finally {
      setIsConfirming(false);
    }
  }

  if (isAuthLoading) {
    return <div className="p-6 text-slate-300">Загрузка календаря...</div>;
  }

  if (!currentUser) {
    return null;
  }

  if (!canViewCalendar || !canViewBookings) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_32%),linear-gradient(135deg,_#020617_0%,_#0f172a_100%)] text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col lg:flex-row">
        <Sidebar />
        <div className="flex-1">
          <Header showSearch={false} showNewListing={false} />
          <main className="p-6">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h1 className="text-2xl font-semibold">Календарь</h1>
              <div className="flex items-center gap-2">
                {canCreateBookings ? (
                  <button
                    type="button"
                    onClick={() => router.push("/bookings/new")}
                    className="rounded bg-cyan-500/20 px-3 py-2 text-sm font-semibold text-cyan-200"
                  >
                    + Новая бронь
                  </button>
                ) : null}
                <button type="button" onClick={prev} className="rounded bg-white/5 px-3 py-2">‹</button>
                <div className="px-4 capitalize">
                  {calendarView === "month"
                    ? cursor.toLocaleString("ru-RU", { month: "long", year: "numeric" })
                    : `${days[0].toLocaleDateString("ru-RU", { day: "numeric", month: "short" })} - ${days[days.length - 1].toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" })}`}
                </div>
                <button type="button" onClick={next} className="rounded bg-white/5 px-3 py-2">›</button>
              </div>
            </div>

            {canCreateBookings ? (
              <div className="mb-4 rounded-2xl border border-white/10 bg-slate-900/80 p-4">
                <p className="text-sm text-slate-300">Создание брони из календаря: выберите объект, затем кликните по дате заезда и дате выезда в сетке.</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-4">
                  <select
                    value={rangeApartmentId}
                    onChange={(event) => setRangeApartmentId(event.target.value)}
                    className="rounded-xl bg-white/5 px-3 py-2 text-sm text-white outline-none"
                  >
                    <option value="">Выберите объект</option>
                    {apartments.map((apartment) => (
                      <option key={apartment.id} value={apartment.id}>
                        {apartment.title}
                      </option>
                    ))}
                  </select>
                  <input
                    type="date"
                    value={rangeCheckIn}
                    onChange={(event) => setRangeCheckIn(event.target.value)}
                    className="rounded-xl bg-white/5 px-3 py-2 text-sm text-white outline-none"
                  />
                  <input
                    type="date"
                    value={rangeCheckOut}
                    onChange={(event) => setRangeCheckOut(event.target.value)}
                    className="rounded-xl bg-white/5 px-3 py-2 text-sm text-white outline-none"
                  />
                  <button
                    type="button"
                    onClick={openCreateBookingWithRange}
                    className="rounded-xl bg-cyan-500/20 px-3 py-2 text-sm font-semibold text-cyan-200"
                  >
                    Открыть форму брони
                  </button>
                </div>
                {rangeError ? <p className="mt-2 text-sm text-rose-400">{rangeError}</p> : null}
              </div>
            ) : null}

            <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-4">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <label className="text-sm text-slate-300">Поиск объекта</label>
                    <input
                      value={searchApartment}
                      onChange={(event) => setSearchApartment(event.target.value)}
                      placeholder="Название или город"
                      className="mt-1 block rounded-xl bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-slate-300">Фильтр по объекту</label>
                  <select
                    value={filterApartment}
                    onChange={(event) => setFilterApartment(event.target.value)}
                    className="mt-1 block rounded-xl bg-white/3 px-3 py-2 text-sm text-white"
                  >
                    <option value="">Все объекты</option>
                    {apartments.map((apartment) => (
                      <option key={apartment.id} value={apartment.id}>{apartment.title} - {apartment.city}</option>
                    ))}
                  </select>
                  </div>
                  <div>
                    <span className="text-sm text-slate-300">Период</span>
                    <div className="mt-1 flex rounded-xl bg-white/5 p-1">
                      {(["week", "month"] as const).map((view) => (
                        <button
                          key={view}
                          type="button"
                          onClick={() => setCalendarView(view)}
                          className={`rounded-lg px-3 py-1.5 text-sm ${calendarView === view ? "bg-cyan-500/20 text-cyan-200" : "text-slate-400"}`}
                        >
                          {view === "week" ? "Неделя" : "Месяц"}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDemoTemplate((value) => !value)}
                  className={`rounded-xl border px-3 py-2 text-sm ${showDemoTemplate ? "border-cyan-400/40 bg-cyan-400/15 text-cyan-200" : "border-white/10 bg-white/5 text-slate-300"}`}
                >
                  {showDemoTemplate ? "Скрыть тестовый шаблон" : "Показать тестовый шаблон"}
                </button>
                <div className="flex flex-wrap gap-3 text-xs text-slate-300">
                  <span className="flex items-center gap-2"><span className="h-3 w-3 rounded border border-white/20" />Свободно</span>
                  <span className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-amber-400" />Ожидает подтверждения</span>
                  <span className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-rose-400" />Занято</span>
                  <span className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-violet-400" />Недоступно</span>
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-white/10">
                <div className="max-h-[70vh] overflow-auto">
                  <div className="min-w-[760px]">
                    <div className="grid border-b border-white/10 bg-black/20" style={{ gridTemplateColumns: "170px minmax(570px, 1fr)" }}>
                      <div className="sticky left-0 z-10 border-r border-white/10 bg-slate-900/95 px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Объект</div>
                      <div className="grid" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(44px, 1fr))` }}>
                        {days.map((day) => (
                          <button key={day.toISOString()} type="button" onClick={() => beginQuickRangeFromDay(day)} className={`border-r border-white/5 px-1 py-3 text-center text-xs ${toIsoDate(day) === toIsoDate(new Date()) ? "font-bold text-emerald-300" : "text-slate-400"}`}>
                            <span className="block">{day.toLocaleDateString("ru-RU", { weekday: "short" }).replace(".", "")}</span>
                            <span className="mt-1 block text-sm text-slate-200">{day.getDate()}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    {visibleApartments.map((apartment) => {
                      const apartmentBookings = visibleBookings.filter((booking) => booking.apartmentId === apartment.id && bookingsOverlap(calendarStart, calendarEnd, booking.checkIn, booking.checkOut));
                      const apartmentBlocks = visibleBlocks.filter((block) => block.apartment_id === apartment.id && bookingsOverlap(calendarStart, calendarEnd, block.start_date, block.end_date));
                      const showDemoOccupancy = showDemoTemplate && bookingsOverlap(calendarStart, calendarEnd, demoCheckIn, demoCheckOut);
                      return (
                        <div key={apartment.id} className="grid min-h-[60px] border-b border-white/5 last:border-b-0" style={{ gridTemplateColumns: "170px minmax(570px, 1fr)" }}>
                          <div className="sticky left-0 z-10 border-r border-white/10 bg-slate-900/95 px-2 py-2">
                            <p className="truncate text-sm font-medium text-white">{apartment.title}</p>
                            <p className="truncate text-xs text-slate-500">{apartment.city}</p>
                          </div>
                          <div className="relative grid" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(44px, 1fr))` }}>
                            {days.map((day) => {
                              const isoDay = toIsoDate(day);
                              return <button key={isoDay} type="button" onClick={() => { setRangeApartmentId(apartment.id); beginQuickRangeFromDay(day); }} className={`border-r border-white/5 ${rangeCheckIn === isoDay || rangeCheckOut === isoDay ? "bg-cyan-400/10" : "hover:bg-white/5"}`} aria-label={`${apartment.title}, ${isoDay}`} />;
                            })}
                            <div className="pointer-events-none absolute inset-x-0 top-1 grid h-10" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(44px, 1fr))` }}>
                              {showDemoOccupancy ? (
                                <div
                                  className="pointer-events-auto flex h-9 items-center truncate rounded bg-cyan-400 px-2 py-1 text-left text-[10px] font-semibold text-slate-950 shadow-lg"
                                  style={bookingPosition({ checkIn: demoCheckIn, checkOut: demoCheckOut } as Booking)}
                                  title="Тестовый шаблон: объект занят с 3 по 7 августа"
                                >
                                  Занято · 3-7 августа
                                </div>
                              ) : null}
                              {apartmentBookings.map((booking) => {
                                const apartmentLabel = getApartmentCalendarLabel(booking, apartments);
                                const periodLabel = formatPeriod(booking.checkIn, booking.checkOut);
                                return <button key={booking.id} type="button" onClick={(event) => { event.stopPropagation(); setSelectedBookingId(booking.id); setActionError(""); setActionSuccess(""); }} title={canViewClients ? `${apartmentLabel}\n${booking.guestName}\n${periodLabel}` : `${apartmentLabel}\n${periodLabel}`} className={`pointer-events-auto h-9 truncate rounded px-2 py-1 text-left text-[10px] leading-tight text-slate-900 shadow-lg ${statusColor(booking)}`} style={bookingPosition(booking)}><span className="font-semibold">{periodLabel}</span>{canViewClients ? <span className="ml-1 hidden md:inline">{booking.guestName}</span> : null}</button>;
                              })}
                              {apartmentBlocks.map((block) => <div key={block.id} title={`${block.reason_code ?? "Недоступно"}${block.private_note ? `: ${block.private_note}` : ""}`} className="pointer-events-auto h-9 truncate rounded bg-violet-400 px-2 py-1 text-[10px] font-semibold text-slate-950 shadow-lg" style={periodPosition(block.start_date, block.end_date)}>Недоступно · {formatPeriod(block.start_date, block.end_date)}</div>)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {visibleApartments.length === 0 ? <div className="p-8 text-center text-sm text-slate-400">Объекты не найдены</div> : null}
                  </div>
                </div>
              </div>
            </div>

            {selectedBooking ? (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
                <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900 p-5">
                  <div className="mb-3 flex items-start justify-between">
                    <h2 className="text-lg font-semibold text-white">{getApartmentCalendarLabel(selectedBooking, apartments)}</h2>
                    <button type="button" onClick={() => setSelectedBookingId(null)} className="text-slate-300">✕</button>
                  </div>
                  <p className="text-sm text-slate-300">Статус: {getBookingStatusPresentation(selectedBooking.status).label}</p>
                  <p className="text-sm text-slate-300">{formatPeriod(selectedBooking.checkIn, selectedBooking.checkOut)}</p>
                  <p className="text-sm text-slate-300">Заезд: 15:00</p>
                  <p className="text-sm text-slate-300">Выезд: 11:00</p>
                  {currentUser.role === "Уборщик" ? <p className="mt-1 text-sm text-cyan-300">Уборка после выезда</p> : null}
                  {canViewClients ? (
                    <div className="mt-2 space-y-1 text-sm text-slate-200">
                      <p>Клиент: {selectedBooking.guestName}</p>
                      <p>Телефон: {selectedBooking.guestPhone || "Не указан"}</p>
                    </div>
                  ) : null}
                  {canViewPayments ? (
                    <p className="mt-2 text-sm text-slate-200">
                      Осталось оплатить: {Math.max(0, selectedBooking.totalAmount - selectedBooking.paidAmount).toLocaleString("ru-RU")} ₽
                    </p>
                  ) : null}

                  {actionError ? <p className="mt-3 text-sm text-rose-400">{actionError}</p> : null}
                  {actionSuccess ? <p className="mt-3 text-sm text-emerald-300">{actionSuccess}</p> : null}

                  <div className="mt-4 flex flex-wrap gap-2">
                    {canConfirmBookings && selectedBooking.status === "pending" ? (
                      <button
                        type="button"
                        onClick={() => void handleConfirmBooking(selectedBooking)}
                        disabled={isConfirming}
                        className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {isConfirming ? "Подтверждаем..." : "Подтвердить бронирование"}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => router.push(`/bookings/${selectedBooking.id}`)}
                      className="rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-200"
                    >
                      Открыть детали
                    </button>
                    {canEditBookings ? (
                      <button
                        type="button"
                        onClick={() => router.push(`/bookings/${selectedBooking.id}/edit`)}
                        className="rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-200"
                      >
                        Редактировать
                      </button>
                    ) : null}
                    {canMoveBookings ? (
                      <button
                        type="button"
                        onClick={() => router.push(`/bookings/${selectedBooking.id}/edit?mode=move`)}
                        className="rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-200"
                      >
                        Перенести
                      </button>
                    ) : null}
                    {canCancelBookings ? (
                      <button
                        type="button"
                        onClick={() => void handleCancelBooking(selectedBooking)}
                        className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200"
                      >
                        Отменить
                      </button>
                    ) : null}
                    {canDeleteBookings ? (
                      <button
                        type="button"
                        onClick={() => void handleDeleteBooking(selectedBooking)}
                        className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200"
                      >
                        Удалить
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}
          </main>
        </div>
      </div>
    </div>
  );
}
