"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { Booking } from "@/types/booking";
import { findBookingConflict, isBlockingBooking } from "@/lib/bookings/booking-conflicts";
import { hasPastBookingDate } from "@/lib/bookings/date-validation";
import { fetchStaffBookings } from "@/lib/bookings/staff-bookings";
import { emitBookingNotificationEvent } from "@/lib/notifications/client-events";

function formatDate(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString("ru-RU");
}

export default function EditBookingPage() {
  const params = useParams();
  const bookingId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const router = useRouter();

  const [booking, setBooking] = useState<Booking | null>(null);
  const [form, setForm] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(Boolean(bookingId));
  const [loadFailed, setLoadFailed] = useState(false);
  const notFound = !bookingId || loadFailed;
  const [errors, setErrors] = useState<Record<string,string>>({});
  const [bookings, setBookings] = useState<Booking[]>([]);

  useEffect(() => {
    if (!bookingId) {
      return;
    }

    let cancelled = false;
    void Promise.all([
      fetch(`/api/bookings/${bookingId}`, { cache: "no-store" }),
      fetchStaffBookings(),
    ]).then(async ([response, allBookings]) => {
      const payload = (await response.json()) as { ok: boolean; data?: Record<string, unknown> };
      if (cancelled) return;
      if (!response.ok || !payload.ok || !payload.data) {
        setLoadFailed(true);
        return;
      }

      const data = payload.data;
      const loaded: Booking = {
        id: String(data.id),
        apartmentId: String(data.apartmentId ?? ""),
        clientId: String(data.clientId ?? ""),
        guestName: String(data.guestName ?? ""),
        guestPhone: String(data.guestPhone ?? ""),
        guestEmail: String(data.guestEmail ?? ""),
        checkIn: String(data.checkIn ?? ""),
        checkOut: String(data.checkOut ?? ""),
        checkInTime: String(data.checkInTime ?? "15:00"),
        checkOutTime: String(data.checkOutTime ?? "11:00"),
        guests: Number(data.guests ?? 1),
        rentalType: (data.rentalType ?? "daily") as Booking["rentalType"],
        pricePerPeriod: Number(data.pricePerPeriod ?? 0),
        periodsCount: 1,
        accommodationAmount: Number(data.accommodationAmount ?? 0),
        cleaningFee: Number(data.cleaningFee ?? 0),
        deposit: Number(data.deposit ?? 0),
        discount: Number(data.discount ?? 0),
        totalAmount: Number(data.totalAmount ?? 0),
        paidAmount: Number(data.paidAmount ?? 0),
        status: (data.status ?? "pending") as Booking["status"],
        paymentStatus: (data.paymentStatus ?? "unpaid") as Booking["paymentStatus"],
        source: (data.source ?? "direct") as Booking["source"],
        notes: String(data.notes ?? ""),
        createdAt: String(data.createdAt ?? ""),
        updatedAt: String(data.updatedAt ?? ""),
      };
      setBooking(loaded);
      setForm(loaded);
      setBookings(allBookings);
    }).catch(() => {
      if (!cancelled) setLoadFailed(true);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [bookingId]);

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

    if (
      form.checkIn &&
      form.checkOut &&
      booking &&
      hasPastBookingDate(form.checkIn, form.checkOut) &&
      (form.checkIn !== booking.checkIn || form.checkOut !== booking.checkOut)
    ) {
      e.dates = "Нельзя выбрать прошедшие даты";
    }

    // occupancy excluding current booking
    if (form.apartmentId && form.checkIn && form.checkOut) {
      const currentBooking = booking;
      if (!currentBooking) {
        setErrors({ form: "Бронирование ещё не загружено" });
        return false;
      }

      const conflict = findBookingConflict({
        bookings,
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
      bookings,
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

    const response = await fetch(`/api/bookings/${booking.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: form.status,
        guestName: form.guestName,
        guestPhone: form.guestPhone,
        guestEmail: form.guestEmail,
        checkIn: form.checkIn,
        checkOut: form.checkOut,
        checkInTime: form.checkInTime,
        checkOutTime: form.checkOutTime,
        notes: form.notes,
      }),
    });
    const payload = (await response.json()) as { ok: boolean; error?: string };
    if (!response.ok || !payload.ok) {
      setErrors({ form: payload.error ?? "Не удалось сохранить бронирование" });
      return;
    }
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
                <label>
                  <div className="text-sm text-slate-300">Время заезда</div>
                  <input type="time" value={form.checkInTime ?? "15:00"} onChange={(e) => update("checkInTime", e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/3 px-3 py-2 text-sm text-white outline-none" />
                </label>
                <label>
                  <div className="text-sm text-slate-300">Время выезда</div>
                  <input type="time" value={form.checkOutTime ?? "11:00"} onChange={(e) => update("checkOutTime", e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/3 px-3 py-2 text-sm text-white outline-none" />
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
