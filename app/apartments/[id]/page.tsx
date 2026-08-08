"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import type { Apartment } from "@/types/apartment";
import { loadApartmentFromSupabase, deleteApartmentFromSupabase } from "@/lib/apartments/supabase-apartments";
import { Booking } from "@/types/booking";
import { fetchStaffBookings } from "@/lib/bookings/staff-bookings";

export default function ApartmentDetailsPage() {
  const params = useParams();
  const apartmentId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const router = useRouter();
  const [apartment, setApartment] = useState<Apartment | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [upcomingBookings, setUpcomingBookings] = useState<Booking[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!apartmentId) {
        setNotFound(true);
        return;
      }

      const found = await loadApartmentFromSupabase(apartmentId);
      if (cancelled) return;
      if (!found) {
        setNotFound(true);
        return;
      }
      setApartment(found);
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [apartmentId]);

  useEffect(() => {
    if (!apartment) return;
    let mounted = true;
    void fetchStaffBookings().then((bookings) => {
      const today = new Date().toISOString().slice(0, 10);
      const list = bookings
        .filter((booking) => booking.apartmentId === apartment.id && booking.checkOut >= today && booking.status !== "cancelled")
        .sort((left, right) => left.checkIn.localeCompare(right.checkIn));
      if (mounted) setUpcomingBookings(list.slice(0, 5));
    }).catch(() => {
      if (mounted) setUpcomingBookings([]);
    });
    return () => { mounted = false; };
  }, [apartment]);

  function handleDelete() {
    if (!apartment) return;
    const confirmed = window.confirm("Вы уверены, что хотите удалить этот объект?");
    if (!confirmed) return;
    void deleteApartmentFromSupabase(apartment.id).then(() => router.push("/apartments"));
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_32%),linear-gradient(135deg,_#020617_0%,_#0f172a_100%)] text-slate-100">
        <div className="mx-auto flex min-h-screen max-w-7xl flex-col lg:flex-row">
          <Sidebar />
          <div className="flex-1">
            <Header showSearch={false} showNewListing={false} />
            <main className="p-6">
              <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-8 text-center">
                <h1 className="text-3xl font-semibold text-white">Объект не найден</h1>
                <p className="mt-4 text-slate-400">Похоже, объект был удалён или url некорректен.</p>
                <Link href="/apartments" className="mt-6 inline-flex rounded-2xl border border-white/10 bg-cyan-500/10 px-5 py-3 text-sm font-semibold text-cyan-200 hover:bg-cyan-500/20">
                  Вернуться к объектам
                </Link>
              </div>
            </main>
          </div>
        </div>
      </div>
    );
  }

  if (!apartment) {
    return null;
  }

  

  const items = [
    { label: "Название", value: apartment.title },
    { label: "Тип объекта", value: apartment.type },
    { label: "Статус публикации", value: apartment.publishStatus },
    { label: "Город", value: apartment.city },
    { label: "Район", value: apartment.district },
    { label: "Полный адрес", value: apartment.address },
    { label: "Описание", value: apartment.shortDesc },
    { label: "Комнаты", value: apartment.rooms },
    { label: "Спальни", value: apartment.bedrooms },
    { label: "Санузлы", value: apartment.bathrooms },
    { label: "Площадь", value: apartment.area !== null && apartment.area !== undefined ? `${apartment.area} м²` : "" },
    { label: "Этаж", value: apartment.floor !== null && apartment.floor !== undefined ? apartment.floor : "" },
    { label: "Макс. гостей", value: apartment.maxGuests },
    { label: "Залог", value: apartment.deposit !== null && apartment.deposit !== undefined ? `${apartment.deposit} €` : "" },
    { label: "Стоимость уборки", value: apartment.cleaningFee !== null && apartment.cleaningFee !== undefined ? `${apartment.cleaningFee} €` : "" },
    { label: "Координаты", value: apartment.latitude && apartment.longitude ? `${apartment.latitude}, ${apartment.longitude}` : "" },
    { label: "Ссылка Google Maps", value: apartment.googleLink },
  ].filter((item) => item.value !== undefined && item.value !== null && item.value !== "");

  const rentalItems = [
    apartment.rentalTypes.daily ? `Посуточно (${apartment.dailyPrice != null ? `${apartment.dailyPrice} €` : "—"})` : null,
    apartment.rentalTypes.weekly ? `Понедельная (${apartment.weeklyPrice != null ? `${apartment.weeklyPrice} €` : "—"})` : null,
    apartment.rentalTypes.monthly ? `Помесячная (${apartment.monthlyPrice != null ? `${apartment.monthlyPrice} €` : "—"})` : null,
  ].filter(Boolean) as string[];

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_32%),linear-gradient(135deg,_#020617_0%,_#0f172a_100%)] text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col lg:flex-row">
        <Sidebar />
        <div className="flex-1">
          <Header showSearch={false} showNewListing={false} />
          <main className="p-6">
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-3xl font-semibold text-white">{apartment.title}</h1>
                <p className="mt-2 text-sm text-slate-400">{apartment.internalNumber ? `ID-${apartment.internalNumber} · ` : ""}{apartment.city}, {apartment.district}</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link href="/apartments" className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300 hover:bg-white/10">
                  Назад к объектам
                </Link>
                <Link href={`/apartments/${apartment.id}/edit`} className="rounded-2xl border border-white/10 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-500/20">
                  Редактировать
                </Link>
                <Link href={`/apartments/${apartment.id}/owners`} className="rounded-2xl border border-white/10 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/20">
                  Собственники
                </Link>
                <button onClick={handleDelete} className="rounded-2xl border border-white/10 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-300 hover:bg-rose-500/20">
                  Удалить объект
                </button>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-6">
                <div className="grid gap-4">
                  {items.map((item) => (
                    <div key={item.label} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="text-sm uppercase tracking-wide text-slate-500">{item.label}</div>
                      {item.label === "Ссылка Google Maps" ? (
                        <a href={String(item.value)} target="_blank" rel="noreferrer" className="mt-2 block text-sm text-cyan-200 hover:underline">
                          Открыть карту
                        </a>
                      ) : (
                        <div className="mt-2 text-sm text-slate-100">{item.value}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-6">
                <div className="text-sm uppercase tracking-wide text-slate-500">Типы аренды</div>
                <div className="mt-4 space-y-3">
                  {rentalItems.length ? (
                    rentalItems.map((type) => (
                      <div key={type} className="rounded-2xl bg-white/5 p-4 text-sm text-slate-100">{type}</div>
                    ))
                  ) : (
                    <div className="rounded-2xl bg-white/5 p-4 text-sm text-slate-400">Нет активных типов аренды</div>
                  )}
                </div>
                <div className="mt-6 space-y-2 text-sm text-slate-300">
                  {apartment.minimumNights != null ? <div>Мин. ночей: {String(apartment.minimumNights)}</div> : null}
                  {apartment.minimumWeeks != null ? <div>Мин. недель: {String(apartment.minimumWeeks)}</div> : null}
                  {apartment.minimumMonths != null ? <div>Мин. месяцев: {String(apartment.minimumMonths)}</div> : null}
                </div>
                <div className="mt-6">
                  <div className="text-sm uppercase tracking-wide text-slate-500">Ближайшие бронирования</div>
                  <div className="mt-3 space-y-2">
                    {upcomingBookings.length === 0 ? (
                      <div className="text-sm text-slate-400">Нет будущих бронирований</div>
                    ) : (
                      upcomingBookings.map((b) => (
                        <div key={b.id} className="rounded p-2 bg-white/5 text-sm">
                          <div className="flex items-center justify-between">
                            <div>{b.guestName}</div>
                            <div className="text-slate-400 text-xs">{new Date(b.checkIn).toLocaleDateString()}</div>
                          </div>
                        </div>
                      ))
                    )}
                    <div className="mt-3">
                      <Link href={`/bookings/new?apartmentId=${apartment.id}`} className="rounded-2xl border border-white/10 bg-cyan-500/10 px-3 py-2 text-sm font-semibold text-cyan-200">Создать бронирование</Link>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
