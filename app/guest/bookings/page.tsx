"use client";

import { useEffect, useMemo, useState } from "react";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { getBookingStatusPresentation } from "@/lib/bookings/status-presentation";

type GuestBookingRecord = {
  id: string;
  apartmentTitle: string;
  checkIn: string;
  checkOut: string;
  totalAmount: number;
  status: string;
  paymentStatus: string | null;
  source: string | null;
  createdAt: string;
};

type GuestBookingsResponse =
  | { ok: true; data: GuestBookingRecord[] }
  | { ok: false; errorCode: string; errorMessage: string };

function formatMoney(value: number): string {
  return `${value.toLocaleString("ru-RU")} €`;
}

function formatDate(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString("ru-RU");
}

export default function GuestBookingsPage() {
  const { currentUser } = useCurrentUser();
  const [bookings, setBookings] = useState<GuestBookingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUser) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();

    async function loadBookings() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/guest/bookings", { signal: controller.signal });
        const payload = (await response.json()) as GuestBookingsResponse;

        if (!response.ok || !payload.ok) {
          if ((payload as { errorCode?: string }).errorCode === "permission_denied") {
            setError("У вас нет доступа к этим бронированиям.");
          } else if ((payload as { errorCode?: string }).errorCode === "profile_missing") {
            setError("Профиль клиента не найден.");
          } else {
            setError((payload as { errorMessage?: string }).errorMessage ?? "Не удалось загрузить бронирования.");
          }

          setBookings([]);
          return;
        }

        setBookings(payload.data);
      } catch {
        if (!controller.signal.aborted) {
          setError("Не удалось загрузить бронирования.");
          setBookings([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadBookings();

    return () => controller.abort();
  }, [currentUser]);

  const ownBookings = useMemo(() => bookings, [bookings]);

  if (loading) {
    return <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-6 text-slate-300">Загрузка бронирований...</div>;
  }

  if (!currentUser) {
    return <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-6 text-slate-300">Требуется авторизация.</div>;
  }

  if (error) {
    return <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-6 text-rose-300">{error}</div>;
  }

  return (
    <section>
      <h1 className="text-2xl font-semibold text-white">Мои бронирования</h1>
      <p className="mt-2 text-sm text-slate-300">Показаны только ваши бронирования.</p>

      {ownBookings.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-white/10 bg-slate-900/80 p-6 text-slate-300">Бронирований пока нет</div>
      ) : (
        <div className="mt-6 space-y-4">
          {ownBookings.map((booking) => {
            const status = getBookingStatusPresentation(booking.status);

            return (
              <article key={booking.id} className="rounded-2xl border border-white/10 bg-slate-900/80 p-5">
                <h2 className="text-lg font-semibold text-white">{booking.apartmentTitle}</h2>
                <p className="mt-1 text-sm text-slate-400">{formatDate(booking.checkIn)} - {formatDate(booking.checkOut)}</p>
                <p className="mt-2 text-sm text-slate-300">Статус бронирования: {status.label}</p>
                {booking.paymentStatus ? <p className="text-sm text-slate-300">Статус оплаты: {booking.paymentStatus}</p> : null}

                <div className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
                  <p>Итого: <span className="text-white">{formatMoney(booking.totalAmount)}</span></p>
                  <p>Создано: <span className="text-white">{new Date(booking.createdAt).toLocaleString("ru-RU")}</span></p>
                </div>

                <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-slate-300">
                  Источник: {booking.source ?? "website"}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
