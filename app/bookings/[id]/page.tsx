"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { getBookingById, deleteBooking } from "@/lib/bookings/booking-repository";
import { getApartmentById } from "@/app/apartments/apartment-utils";
import { getClientById } from "@/lib/clients/client-repository";
import { getBookingStatusPresentation } from "@/lib/bookings/status-presentation";
import { Booking } from "@/types/booking";
import { emitBookingNotificationEvent } from "@/lib/notifications/client-events";
import BookingNotificationsPanel from "@/components/booking/BookingNotificationsPanel";
import BookingControlChecklist from "@/components/booking/BookingControlChecklist";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { hasEffectivePermission } from "@/lib/permissions";

type BookingDetailsResponse =
  | {
      ok: true;
      data: {
        id: string;
        apartmentId: string | null;
        apartmentTitle: string;
        guestName: string;
        guestPhone: string | null;
        guestEmail: string | null;
        checkIn: string;
        checkOut: string;
        guests: number | null;
        totalAmount: number | null;
        status: string | null;
        paymentStatus: string | null;
        source: string | null;
        notes: string | null;
        createdAt: string;
        updatedAt: string;
      };
    }
  | { ok: false; error: string };

export default function BookingPage() {
  const { currentUser } = useCurrentUser();
  const params = useParams();
  const bookingId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const router = useRouter();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!bookingId) return;
    let cancelled = false;

    async function loadBooking() {
      setLoading(true);

      try {
        const response = await fetch(`/api/bookings/${bookingId}`);
        const payload = (await response.json()) as BookingDetailsResponse;

        if (response.ok && payload.ok) {
          if (!cancelled) {
            setBooking({
              id: payload.data.id,
              apartmentId: payload.data.apartmentId ?? "",
              clientId: "",
              guestName: payload.data.guestName,
              guestPhone: payload.data.guestPhone ?? "",
              guestEmail: payload.data.guestEmail ?? "",
              checkIn: payload.data.checkIn,
              checkOut: payload.data.checkOut,
              guests: payload.data.guests ?? 1,
              rentalType: "daily",
              pricePerPeriod: 0,
              periodsCount: 0,
              accommodationAmount: 0,
              cleaningFee: 0,
              deposit: 0,
              discount: 0,
              totalAmount: payload.data.totalAmount ?? 0,
              paidAmount: 0,
              status: (payload.data.status ?? "pending") as Booking["status"],
              paymentStatus: (payload.data.paymentStatus ?? "unpaid") as Booking["paymentStatus"],
              source: (payload.data.source ?? "website") as Booking["source"],
              notes: payload.data.notes ?? "",
              createdAt: payload.data.createdAt,
              updatedAt: payload.data.updatedAt,
            });
          }
          return;
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }

      if (bookingId) {
        const fallback = getBookingById(bookingId);
        if (!cancelled) {
          setBooking(fallback);
        }
      }
    }

    void loadBooking();

    return () => {
      cancelled = true;
    };
  }, [bookingId]);

  if (loading) return null;
  if (!booking) return null;

  async function handleDelete() {
    if (!booking) return;
    if (!confirm("Удалить бронирование?")) return;
    deleteBooking(booking.id);
    await emitBookingNotificationEvent("booking_cancelled", booking, {
      idempotencySeed: `deleted:${new Date().toISOString()}`,
      actionUrl: "/bookings",
    });
    router.push('/bookings');
  }

  const apartment = getApartmentById(booking.apartmentId);
  const client = booking.clientId ? getClientById(booking.clientId) : null;
  const statusPresentation = getBookingStatusPresentation(booking.status);
  const canDeleteBooking = Boolean(currentUser && hasEffectivePermission(currentUser, "bookings.delete"));

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_32%),linear-gradient(135deg,_#020617_0%,_#0f172a_100%)] text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col lg:flex-row">
        <Sidebar />
        <div className="flex-1">
          <Header showSearch={false} showNewListing={false} />
          <main className="p-6">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-semibold">Бронирование</h1>
                <p className="text-sm text-slate-400">{booking.guestName} — {apartment?.title ?? "—"}</p>
              </div>
              <div className="flex gap-2">
                <Link href="/bookings" className="rounded px-3 py-2 bg-white/5">Назад к бронированиям</Link>
                <Link href={`/bookings/${booking.id}/edit`} className="rounded px-3 py-2 bg-white/5">Редактировать</Link>
                {canDeleteBooking ? <button type="button" onClick={() => void handleDelete()} className="rounded px-3 py-2 bg-rose-600/10">Удалить</button> : null}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <div className="text-sm text-slate-300">Гость</div>
                  <div className="text-white">{client ? `${client.firstName} ${client.lastName}` : booking.guestName}</div>
                </div>
                <div>
                  <div className="text-sm text-slate-300">Телефон</div>
                  <div className="text-white">{client?.phone ?? booking.guestPhone}</div>
                </div>
                <div>
                  <div className="text-sm text-slate-300">Email</div>
                  <div className="text-white">{client?.email ?? booking.guestEmail}</div>
                </div>
                {client ? (
                  <div>
                    <div className="text-sm text-slate-300">Карточка клиента</div>
                    <Link href={`/clients/${client.id}`} className="text-cyan-300 hover:underline">Открыть клиента</Link>
                  </div>
                ) : null}
                <div>
                  <div className="text-sm text-slate-300">Объект</div>
                  <div className="text-white">{apartment?.title ?? "—"}</div>
                </div>
                <div>
                  <div className="text-sm text-slate-300">Заезд — Выезд</div>
                  <div className="text-white">{new Date(booking.checkIn).toLocaleDateString()} — {new Date(booking.checkOut).toLocaleDateString()}</div>
                </div>
                <div>
                  <div className="text-sm text-slate-300">Гостей</div>
                  <div className="text-white">{booking.guests}</div>
                </div>
                <div>
                  <div className="text-sm text-slate-300">Итого</div>
                  <div className="text-white">{booking.totalAmount} €</div>
                </div>
                <div>
                  <div className="text-sm text-slate-300">Статус</div>
                  <div>
                    <span className={`inline-flex rounded-full px-2 py-1 text-xs ${statusPresentation.badgeClassName}`}>
                      {statusPresentation.label}
                    </span>
                  </div>
                </div>
                <div>
                  <div className="text-sm text-slate-300">Оплата</div>
                  <div className="text-white">{booking.paymentStatus} ({booking.paidAmount} €)</div>
                </div>
                <div className="sm:col-span-2">
                  <div className="text-sm text-slate-300">Примечания</div>
                  <div className="text-white">{booking.notes}</div>
                </div>
              </div>
            </div>

            <BookingControlChecklist bookingId={booking.id} />
            <BookingNotificationsPanel bookingId={booking.id} />
          </main>
        </div>
      </div>
    </div>
  );
}
