"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { deleteClient, getClientById } from "@/lib/clients/client-repository";
import { getBookings } from "@/lib/bookings/booking-repository";
import { getBookingStatusPresentation } from "@/lib/bookings/status-presentation";
import type { Client } from "@/types/client";
import type { Booking } from "@/types/booking";

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("ru-RU");
}

export default function ClientDetailsPage() {
  const params = useParams();
  const clientId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const router = useRouter();
  const [client] = useState<Client | null>(() => (clientId ? getClientById(clientId) : null));
  const [bookings] = useState<Booking[]>(() => getBookings());

  const relatedBookings = useMemo(() => {
    if (!client) return [];

    return bookings.filter(
      (booking) =>
        booking.clientId === client.id ||
        (client.email && booking.guestEmail === client.email) ||
        (client.phone && booking.guestPhone === client.phone),
    );
  }, [bookings, client]);

  function handleDelete() {
    if (!client) return;
    if (!confirm("Удалить клиента?")) return;
    deleteClient(client.id);
    router.replace("/clients");
  }

  if (!client) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_32%),linear-gradient(135deg,_#020617_0%,_#0f172a_100%)] text-slate-100">
        <div className="mx-auto flex min-h-screen max-w-7xl flex-col lg:flex-row">
          <Sidebar />
          <div className="flex-1">
            <Header showSearch={false} showNewListing={false} />
            <main className="p-6">
              <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-6 text-slate-300">Клиент не найден.</div>
            </main>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_32%),linear-gradient(135deg,_#020617_0%,_#0f172a_100%)] text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col lg:flex-row">
        <Sidebar />
        <div className="flex-1">
          <Header showSearch={false} showNewListing={false} />
          <main className="p-6">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl font-semibold">{client.firstName} {client.lastName}</h1>
                <p className="text-sm text-slate-400">Карточка клиента</p>
              </div>
              <div className="flex gap-2">
                <Link href="/clients" className="rounded-xl border border-white/10 px-3 py-2 text-sm">Назад</Link>
                <Link href={`/clients/${client.id}/edit`} className="rounded-xl border border-white/10 px-3 py-2 text-sm">Редактировать</Link>
                <button type="button" onClick={handleDelete} className="rounded-xl border border-white/10 px-3 py-2 text-sm text-rose-300">Удалить</button>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <section className="rounded-2xl border border-white/10 bg-slate-900/80 p-6">
                <h2 className="text-lg font-semibold">Профиль</h2>
                <div className="mt-4 grid gap-3 text-sm">
                  <p><span className="text-slate-400">Телефон:</span> {client.phone || "—"}</p>
                  <p><span className="text-slate-400">Email:</span> {client.email || "—"}</p>
                  <p><span className="text-slate-400">Гражданство:</span> {client.nationality || "—"}</p>
                  <p><span className="text-slate-400">Документ:</span> {client.documentType} {client.documentNumber || ""}</p>
                  <p><span className="text-slate-400">Дата рождения:</span> {client.dateOfBirth ? formatDate(client.dateOfBirth) : "—"}</p>
                  <p><span className="text-slate-400">Язык:</span> {client.language || "—"}</p>
                  <p><span className="text-slate-400">Создан:</span> {formatDate(client.createdAt)}</p>
                  <p><span className="text-slate-400">Обновлён:</span> {formatDate(client.updatedAt)}</p>
                </div>
                {client.notes ? <p className="mt-4 rounded-xl bg-white/5 p-3 text-sm text-slate-300">{client.notes}</p> : null}
              </section>

              <section className="rounded-2xl border border-white/10 bg-slate-900/80 p-6">
                <h2 className="text-lg font-semibold">Связанные бронирования</h2>
                <div className="mt-4 space-y-2">
                  {relatedBookings.length === 0 ? (
                    <p className="text-sm text-slate-400">Связанных бронирований пока нет.</p>
                  ) : (
                    relatedBookings.map((booking) => {
                      const status = getBookingStatusPresentation(booking.status);

                      return (
                        <Link key={booking.id} href={`/bookings/${booking.id}`} className="block rounded-xl border border-white/10 bg-white/5 p-3 text-sm hover:bg-white/10">
                          <p className="text-white">{formatDate(booking.checkIn)} - {formatDate(booking.checkOut)}</p>
                          <p className="mt-1 text-slate-400">Статус: {status.label}</p>
                        </Link>
                      );
                    })
                  )}
                </div>
              </section>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
