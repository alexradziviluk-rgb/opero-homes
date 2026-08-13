"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { useCurrentUser, getHomeRouteForUser } from "@/components/auth/current-user-provider";
import { fetchStaffBookings } from "@/lib/bookings/staff-bookings";
import { loadApartmentsFromSupabase } from "@/lib/apartments/supabase-apartments";
import { bookingsOverlap, findBookingConflict } from "@/lib/bookings/booking-conflicts";
import { getBookingStatusPresentation } from "@/lib/bookings/status-presentation";
import { hasEffectivePermission } from "@/lib/permissions";
import { emitBookingNotificationEvent } from "@/lib/notifications/client-events";
import { deleteRemoteBooking, persistBookingStatus } from "@/lib/bookings/remote-bookings";
import { createRemoteBookingTasks } from "@/lib/bookings/remote-booking-tasks";
import BookingCalendar from "@/components/booking/BookingCalendar";
import type { CanonicalAvailabilityPeriod } from "@/lib/bookings/canonical-availability";
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
  block_source?: string | null;
  owner_public_number?: string | null;
  owner_name?: string | null;
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
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string>("");
  const [actionSuccess, setActionSuccess] = useState<string>("");
  const [isConfirming, setIsConfirming] = useState(false);
  const [version, setVersion] = useState(0);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [apartments, setApartments] = useState<Apartment[]>([]);
  const [canonicalPeriods, setCanonicalPeriods] = useState<CanonicalAvailabilityPeriod[]>([]);
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
    async function loadCalendar() {
      try {
        const [nextBookings, nextApartments] = await Promise.all([fetchStaffBookings(), loadApartmentsFromSupabase()]);
        const canonicalResults = await Promise.all(nextApartments.map(async (apartment) => {
          const response = await fetch(`/api/availability/calendar/${apartment.id}`, { cache: "no-store" });
          return response.ok ? response.json() as Promise<{ ok: boolean; data?: Array<{ id: string; apartmentId: string; startDate: string; endDate: string; kind: string; status: string }> }> : { ok: false, data: [] };
        }));
        const detailsResponse = await fetch("/api/availability/blocks", { cache: "no-store" });
        const detailsResult = detailsResponse.ok ? await detailsResponse.json() as { ok: boolean; data?: AvailabilityBlock[] } : { ok: false };
        if (cancelled) return;
        setBookings(nextBookings);
        setApartments(nextApartments);
        const nextCanonicalPeriods = canonicalResults.flatMap((result) => (result.ok ? result.data ?? [] : [])) as CanonicalAvailabilityPeriod[];
        setCanonicalPeriods(nextCanonicalPeriods);
        setAvailabilityBlocks(detailsResult.ok && detailsResult.data ? detailsResult.data : nextCanonicalPeriods.filter((period) => period.kind !== "customer_booking").map((period) => ({
          id: period.id,
          apartment_id: period.apartmentId,
          start_date: period.startDate,
          end_date: period.endDate,
          reason_code: period.kind,
          private_note: null,
          created_by: null,
          created_by_role: null,
          block_source: period.kind === "owner_block" ? "owner" : "staff",
        })));
      } catch {
        if (!cancelled) setActionError("Не удалось загрузить календарь");
      }
    }
    void loadCalendar();
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

  const visibleBlocks = availabilityBlocks.filter((block) => !filterApartment || block.apartment_id === filterApartment);

  const visibleApartments = apartments.filter((apartment) => {
    if (filterApartment && apartment.id !== filterApartment) return false;
    const query = searchApartment.trim().toLocaleLowerCase();
    if (!query) return true;
    return `${apartment.title} ${apartment.city}`.toLocaleLowerCase().includes(query);
  });

  function getCanonicalPeriods(apartmentId: string): CanonicalAvailabilityPeriod[] {
    return canonicalPeriods.filter((period) => period.apartmentId === apartmentId);
  }

  const selectedBooking = selectedBookingId ? bookings.find((booking) => booking.id === selectedBookingId) ?? null : null;
  const selectedBlock = selectedBlockId ? availabilityBlocks.find((block) => block.id === selectedBlockId) ?? null : null;

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

              <div className="grid gap-5">
                {visibleApartments.map((apartment) => (
                  <article key={apartment.id} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                    <div className="mb-3"><p className="font-medium text-white">{apartment.title}</p><p className="text-xs text-slate-500">{apartment.city}</p></div>
                    <BookingCalendar
                      apartmentId={apartment.id}
                      periods={getCanonicalPeriods(apartment.id)}
                      startDate={rangeApartmentId === apartment.id ? rangeCheckIn : ""}
                      endDate={rangeApartmentId === apartment.id ? rangeCheckOut : ""}
                      capabilities={{ canBook: canCreateBookings, canCreateStaffBlock: canViewCalendar, canSeeOperationalDetails: canViewCalendar }}
                      actionLabel={canCreateBookings ? "Открыть форму брони" : undefined}
                      onChange={({ startDate, endDate }) => { setRangeApartmentId(apartment.id); setRangeCheckIn(startDate); setRangeCheckOut(endDate); setRangeError(""); }}
                      onAction={openCreateBookingWithRange}
                      onConflict={setRangeError}
                      onPeriodClick={(period) => { setSelectedBookingId(period.kind === "customer_booking" ? period.id : null); setSelectedBlockId(period.kind === "customer_booking" ? null : period.id); setActionError(""); setActionSuccess(""); }}
                    />
                  </article>
                ))}
                {visibleApartments.length === 0 ? <div className="p-8 text-center text-sm text-slate-400">Объекты не найдены</div> : null}
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
            {selectedBlock ? (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
                <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900 p-5">
                  <div className="mb-3 flex items-start justify-between">
                    <h2 className="text-lg font-semibold text-white">Операционная блокировка</h2>
                    <button type="button" onClick={() => setSelectedBlockId(null)} className="text-slate-300">✕</button>
                  </div>
                  <p className="text-sm text-slate-300">Тип: {selectedBlock.block_source === "owner" ? "Блокировка собственника" : "Системная блокировка"}</p>
                  <p className="text-sm text-slate-300">{formatPeriod(selectedBlock.start_date, selectedBlock.end_date)}</p>
                  {selectedBlock.reason_code ? <p className="mt-2 text-sm text-slate-300">Причина: {selectedBlock.reason_code}</p> : null}
                  {selectedBlock.block_source === "owner" && selectedBlock.owner_public_number ? <p className="mt-2 text-sm text-slate-300">Собственник: {selectedBlock.owner_public_number}</p> : null}
                  {selectedBlock.private_note && selectedBlock.block_source !== "owner" ? <p className="mt-2 text-sm text-slate-300">Заметка: {selectedBlock.private_note}</p> : null}
                </div>
              </div>
            ) : null}
          </main>
        </div>
      </div>
    </div>
  );
}
