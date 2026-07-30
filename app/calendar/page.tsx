"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { useCurrentUser, getHomeRouteForUser } from "@/components/auth/current-user-provider";
import {
  deleteBooking,
  getBookingById,
  getBookings,
  updateBooking,
} from "@/lib/bookings/booking-repository";
import { getLocalApartments } from "@/app/apartments/apartment-utils";
import { bookingsOverlap, findBookingConflict, isBlockingBooking } from "@/lib/bookings/booking-conflicts";
import { confirmBooking } from "@/lib/bookings/confirm-booking";
import { getBookingStatusPresentation } from "@/lib/bookings/status-presentation";
import { hasEffectivePermission } from "@/lib/permissions";
import { emitBookingNotificationEvent } from "@/lib/notifications/client-events";
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

function formatPeriod(checkIn: string, checkOut: string): string {
  const start = new Date(`${checkIn}T00:00:00`);
  const end = new Date(`${checkOut}T00:00:00`);
  const startDay = String(start.getDate()).padStart(2, "0");
  const endDay = String(end.getDate()).padStart(2, "0");
  const startMonth = start.toLocaleDateString("ru-RU", { month: "long" });
  const endMonth = end.toLocaleDateString("ru-RU", { month: "long" });

  if (start.getMonth() === end.getMonth()) {
    return `${startDay}-${endDay} ${startMonth}`;
  }

  return `${startDay} ${startMonth} - ${endDay} ${endMonth}`;
}

type ApartmentLabelSource = Apartment & {
  number?: string | number;
  unitNumber?: string | number;
  name?: string;
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
  const [filterApartment, setFilterApartment] = useState<string>("");
  const [rangeApartmentId, setRangeApartmentId] = useState<string>("");
  const [rangeCheckIn, setRangeCheckIn] = useState<string>("");
  const [rangeCheckOut, setRangeCheckOut] = useState<string>("");
  const [rangeError, setRangeError] = useState<string>("");
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string>("");
  const [actionSuccess, setActionSuccess] = useState<string>("");
  const [isConfirming, setIsConfirming] = useState(false);
  const [version, setVersion] = useState(0);

  const bookings = useMemo(() => getBookings(), [version]);
  const apartments = useMemo(() => getLocalApartments(), []);

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

  const days = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const arr: Date[] = [];
    for (let d = new Date(first); d <= last; d.setDate(d.getDate() + 1)) {
      arr.push(new Date(d));
    }
    return arr;
  }, [cursor]);

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

  const selectedBooking = selectedBookingId ? getBookingById(selectedBookingId) : null;

  function statusColor(booking: Booking): string {
    return getBookingStatusPresentation(booking.status).dotClassName;
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

    updateBooking(cancelledBooking);
    await emitBookingNotificationEvent("booking_cancelled", cancelledBooking, {
      actionUrl: `/bookings/${booking.id}`,
    });
    setSelectedBookingId(null);
    setVersion((v) => v + 1);
  }

  async function handleDeleteBooking(booking: Booking) {
    if (!canDeleteBookings) {
      setActionError("Недостаточно прав для удаления бронирования.");
      return;
    }

    if (!confirm("Удалить бронирование?")) {
      return;
    }

    deleteBooking(booking.id);
    await emitBookingNotificationEvent("booking_cancelled", booking, {
      idempotencySeed: `deleted:${new Date().toISOString()}`,
      actionUrl: "/bookings",
    });
    setSelectedBookingId(null);
    setVersion((v) => v + 1);
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
      const result = confirmBooking({
        bookingId: booking.id,
        confirmedByUserId: currentUser.id,
      });
      await emitBookingNotificationEvent("booking_confirmed", result.booking, {
        actionUrl: `/bookings/${booking.id}`,
      });
      const warning = result.warnings.length > 0 ? ` (${result.warnings.join("; ")})` : "";
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
                <div className="px-4">{cursor.toLocaleString(undefined, { month: "long", year: "numeric" })}</div>
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
              <div className="mb-4">
                <label className="text-sm text-slate-300">Фильтр по объекту</label>
                <select
                  value={filterApartment}
                  onChange={(event) => setFilterApartment(event.target.value)}
                  className="mt-1 rounded-xl bg-white/3 px-3 py-2 text-sm text-white"
                >
                  <option value="">Все объекты</option>
                  {apartments.map((apartment) => (
                    <option key={apartment.id} value={apartment.id}>{apartment.title} - {apartment.city}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-7 gap-2">
                {["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"].map((dayName) => (
                  <div key={dayName} className="text-xs text-slate-400">{dayName}</div>
                ))}
                {days.map((day) => {
                  const isoDay = toIsoDate(day);
                  const isSelectionStart = rangeCheckIn === isoDay;
                  const isSelectionEnd = rangeCheckOut === isoDay;

                  return (
                    <div
                      key={day.toISOString()}
                      className={`min-h-[100px] rounded border border-white/5 bg-black/10 p-2 text-left ${
                        isSelectionStart || isSelectionEnd ? "ring-1 ring-cyan-400/80" : ""
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => beginQuickRangeFromDay(day)}
                        className={`text-sm ${day.toDateString() === new Date().toDateString() ? "font-bold text-emerald-300" : "text-slate-300"}`}
                      >
                        {day.getDate()}
                      </button>
                      <div className="mt-2 space-y-1">
                        {visibleBookings.map((booking) => {
                          const dayStart = isoDay;
                          const dayEnd = toIsoDate(addDays(day, 1));
                          if (!bookingsOverlap(dayStart, dayEnd, booking.checkIn, booking.checkOut)) {
                            return null;
                          }

                          const apartmentLabel = getApartmentCalendarLabel(booking, apartments);
                          const statusLabel = getBookingStatusPresentation(booking.status).label;
                          const periodLabel = formatPeriod(booking.checkIn, booking.checkOut);

                          return (
                            <button
                              key={booking.id}
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setSelectedBookingId(booking.id);
                                setActionError("");
                                setActionSuccess("");
                              }}
                              title={canViewClients ? `${apartmentLabel}\n${booking.guestName}\n${periodLabel}` : `${apartmentLabel}\n${periodLabel}`}
                              className={`block w-full rounded px-2 py-1 text-left text-[11px] leading-tight text-slate-900 ${statusColor(booking)}`}
                            >
                              <p className="font-semibold">{apartmentLabel}</p>
                              <p>{periodLabel}</p>
                              <p className="hidden md:block">{statusLabel}</p>
                              {canViewClients ? <p className="mt-0.5 hidden lg:block">{booking.guestName}</p> : null}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
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
