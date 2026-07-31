"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { getBookingById, getBookings, updateBooking } from "@/lib/bookings/booking-repository";
import { Booking } from "@/types/booking";
import { findBookingConflict, isBlockingBooking } from "@/lib/bookings/booking-conflicts";
import { emitBookingNotificationEvent } from "@/lib/notifications/client-events";

function formatDate(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString("ru-RU");
}

export default function EditBookingPage() {
  const params = useParams();
  const bookingId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const router = useRouter();

  const [booking] = useState<Booking | null>(() => (bookingId ? getBookingById(bookingId) : null));
  const [form, setForm] = useState<Booking | null>(() => booking);
  const loading = false;
  const notFound = !booking;
  const [errors, setErrors] = useState<Record<string,string>>({});

  const [bookings] = useState<Booking[]>(() => getBookings());

  const occupiedRanges = (() => {
    if (!form?.apartmentId) return [];

    return bookings
      .filter(
        (item) =>
          item.apartmentId === form.apartmentId &&
          item.id !== booking?.id &&
          isBlockingBooking(item),
      )
      .map((item) => ({ id: item.id, from: item.checkIn, to: item.checkOut }));
  })();

  const dateConflict = (() => {
    if (!form?.apartmentId || !form.checkIn || !form.checkOut || !booking) {
      return undefined;
    }

    return findBookingConflict({
      bookings,
      apartmentId: form.apartmentId,
      checkIn: form.checkIn,
      checkOut: form.checkOut,
      excludeBookingId: booking.id,
    });
  })();

  const conflictMessage =
    errors.dates ??
    (dateConflict
      ? `Объект уже забронирован с ${formatDate(dateConflict.checkIn)} по ${formatDate(dateConflict.checkOut)}`
      : "");

  function update<K extends keyof Booking>(key: K, value: Booking[K]) {
    setForm((prev) => {
      if (!prev) return prev;
      return { ...prev, [key]: value };
    });
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function validate(): boolean {
    if (!form) {
      setErrors({ form: "Данные бронирования ещё не загружены" });
      return false;
    }

    const e: Record<string, string> = {};

    if (!form.apartmentId) {
      e.apartmentId = "Выберите объект";
    }

    if (!form.guestName.trim()) {
      e.guestName = "Имя гостя обязательно";
    }

    if (!form.checkIn || !form.checkOut) {
      e.dates = "Укажите заезд и выезд";
    }

    if (
      form.checkIn &&
      form.checkOut &&
      new Date(form.checkOut) <= new Date(form.checkIn)
    ) {
      e.dates = "Дата выезда должна быть позже даты заезда";
    }

    // occupancy excluding current booking
    if (form.apartmentId && form.checkIn && form.checkOut) {
      const currentBooking = booking;
      if (!currentBooking) {
        setErrors({ form: "Бронирование ещё не загружено" });
        return false;
      }

      const conflict = findBookingConflict({
        bookings: getBookings(),
        apartmentId: form.apartmentId,
        checkIn: form.checkIn,
        checkOut: form.checkOut,
        excludeBookingId: currentBooking.id,
      });
      if (conflict) {
        e.dates = `Объект уже забронирован с ${formatDate(conflict.checkIn)} по ${formatDate(conflict.checkOut)}`;
      }
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSave() {
    if (!booking || !form) {
      setErrors({ form: "Данные бронирования ещё не загружены" });
      return;
    }

    if (!validate()) return;

    const conflict = findBookingConflict({
      bookings: getBookings(),
      apartmentId: form.apartmentId,
      checkIn: form.checkIn,
      checkOut: form.checkOut,
      excludeBookingId: booking.id,
    });

    if (conflict) {
      setErrors((previous) => ({
        ...previous,
        dates: `Объект уже забронирован с ${formatDate(conflict.checkIn)} по ${formatDate(conflict.checkOut)}`,
      }));
      return;
    }

    updateBooking(form);
    await emitBookingNotificationEvent("booking_changed", form, {
      actionUrl: `/bookings/${booking.id}`,
    });
    router.push(`/bookings/${booking.id}`);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_32%),linear-gradient(135deg,_#020617_0%,_#0f172a_100%)] text-slate-100">
        <div className="mx-auto flex min-h-screen max-w-7xl flex-col lg:flex-row">
          <Sidebar />
          <div className="flex-1">
            <Header showSearch={false} showNewListing={false} />
            <main className="p-6">
              <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-6 text-slate-300">Загрузка бронирования...</div>
            </main>
          </div>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_32%),linear-gradient(135deg,_#020617_0%,_#0f172a_100%)] text-slate-100">
        <div className="mx-auto flex min-h-screen max-w-7xl flex-col lg:flex-row">
          <Sidebar />
          <div className="flex-1">
            <Header showSearch={false} showNewListing={false} />
            <main className="p-6">
              <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-6 text-slate-300">Бронирование не найдено.</div>
            </main>
          </div>
        </div>
      </div>
    );
  }

  if (!form || !booking) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_32%),linear-gradient(135deg,_#020617_0%,_#0f172a_100%)] text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col lg:flex-row">
        <Sidebar />
        <div className="flex-1">
          <Header showSearch={false} showNewListing={false} />
          <main className="p-6">
            <div className="mb-6 flex items-center justify-between">
              <h1 className="text-2xl font-semibold">Редактировать бронирование</h1>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <label>
                  <div className="text-sm text-slate-300">Гость</div>
                  <input value={form.guestName} onChange={(e) => update("guestName", e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/3 px-3 py-2 text-sm text-white outline-none" />
                </label>
                <label>
                  <div className="text-sm text-slate-300">Телефон</div>
                  <input value={form.guestPhone} onChange={(e) => update("guestPhone", e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/3 px-3 py-2 text-sm text-white outline-none" />
                </label>
                <label>
                  <div className="text-sm text-slate-300">Заезд</div>
                  <input type="date" value={form.checkIn} onChange={(e) => update("checkIn", e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/3 px-3 py-2 text-sm text-white outline-none" />
                </label>
                <label>
                  <div className="text-sm text-slate-300">Выезд</div>
                  <input type="date" value={form.checkOut} onChange={(e) => update("checkOut", e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/3 px-3 py-2 text-sm text-white outline-none" />
                </label>
                <label className="sm:col-span-2">
                  <div className="text-sm text-slate-300">Примечания</div>
                  <textarea value={form.notes} onChange={(e) => update("notes", e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/3 px-3 py-2 text-sm text-white outline-none" />
                </label>
              </div>

              {conflictMessage ? <p className="text-rose-400 mt-4 text-sm">{conflictMessage}</p> : null}

              {occupiedRanges.length > 0 ? (
                <div className="mt-4 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3">
                  <p className="text-sm font-semibold text-rose-300">Занятые даты:</p>
                  <div className="mt-2 space-y-1 text-sm text-rose-200">
                    {occupiedRanges.map((range) => (
                      <p key={range.id}>{formatDate(range.from)}-{formatDate(range.to)}</p>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-rose-200/80">Дата выезда не считается занятым днём.</p>
                </div>
              ) : null}

              {errors.form ? <p className="text-rose-400 mt-4">{errors.form}</p> : null}
              <div className="mt-6 flex gap-2">
                <button type="button" onClick={() => void handleSave()} className="rounded-2xl bg-cyan-500/20 px-4 py-2 font-semibold text-cyan-200">Сохранить</button>
                <button type="button" onClick={() => router.push(`/bookings/${booking.id}`)} className="rounded-2xl bg-white/5 px-4 py-2">Отмена</button>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
