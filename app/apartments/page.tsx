"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import StoredImage from "@/components/StoredImage";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { hasEffectivePermission } from "@/lib/permissions";
import type { Apartment } from "@/types/apartment";
import { getRentalCostText } from "@/app/apartments/apartment-utils";
import { deleteApartmentFromSupabase, loadApartmentsFromSupabase, saveApartmentToSupabase } from "@/lib/apartments/supabase-apartments";

export default function ApartmentsPage() {
  const router = useRouter();
  const { currentUser } = useCurrentUser();
  const [localApartments, setLocalApartments] = useState<Apartment[]>([]);
  const canManagePublication = currentUser ? hasEffectivePermission(currentUser, "properties.manage") : false;
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const all = await loadApartmentsFromSupabase();
        if (!cancelled) {
          setLocalApartments(all);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const apartments = localApartments;

  async function handleDelete(id: string) {
    await deleteApartmentFromSupabase(id);
    setLocalApartments((items) => items.filter((item) => item.id !== id));
  }

  async function handlePublicationStatus(id: string, publicationStatus: "draft" | "published" | "hidden" | "archived") {
    if (!canManagePublication) return;

    const current = apartments.find((item) => item.id === id);
    if (!current) return;

    const updated = await saveApartmentToSupabase({
      ...current,
      publicationStatus,
      publishStatus: publicationStatus === "published" ? "Опубликован" : publicationStatus === "archived" ? "На обслуживании" : "Черновик",
      updatedAt: new Date().toISOString(),
    });

    setLocalApartments((items) => items.map((item) => (item.id === id ? updated : item)));
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_32%),linear-gradient(135deg,_#020617_0%,_#0f172a_100%)] text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col lg:flex-row">
        <Sidebar />

        <div className="flex-1">
          <Header showSearch={false} showNewListing={false} />

          <main className="p-4 sm:p-6 lg:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-white">Объекты</h1>
                <p className="mt-1 text-sm text-slate-400">Список объектов и их параметры</p>
              </div>

              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-300">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <circle cx="11" cy="11" r="6" />
                    <path d="m20 20-4.2-4.2" />
                  </svg>
                  <input placeholder="Поиск объектов..." className="w-48 bg-transparent text-sm outline-none placeholder:text-slate-500" />
                </label>

                <Link href="/apartments/new" className="cursor-pointer rounded-2xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-200 transition hover:bg-cyan-500/20 inline-flex items-center justify-center">
                  ➕ Новый объект
                </Link>
              </div>
            </div>

            <div className="mt-6 flex items-center gap-3">
              <button className="rounded-2xl bg-white/5 px-3 py-1.5 text-sm font-medium text-white">Все</button>
              <button className="rounded-2xl bg-white/5 px-3 py-1.5 text-sm text-slate-300">Свободные</button>
              <button className="rounded-2xl bg-white/5 px-3 py-1.5 text-sm text-slate-300">Занятые</button>
              <button className="rounded-2xl bg-white/5 px-3 py-1.5 text-sm text-slate-300">Черновики</button>
            </div>

            <div className="mt-6 overflow-hidden rounded-3xl border border-white/10 bg-slate-900/80">
              <div className="w-full overflow-x-auto">
                <table className="min-w-[900px] w-full table-auto text-sm">
                  <thead className="bg-white/3 text-slate-300">
                  <tr>
                    <th className="px-4 py-3 text-left">Фото</th>
                    <th className="px-4 py-3 text-left">Название</th>
                    <th className="px-4 py-3 text-left">Город</th>
                    <th className="px-4 py-3 text-left">Комнаты</th>
                    <th className="px-4 py-3 text-left">Стоимость аренды</th>
                    <th className="px-4 py-3 text-left">Статус</th>
                    <th className="px-4 py-3 text-left">Доступность</th>
                    <th className="px-4 py-3 text-left">Бронирования</th>
                    <th className="px-4 py-3 text-left">Статус публикации</th>
                    <th className="px-4 py-3 text-left">Действия</th>
                  </tr>
                  </thead>

                  <tbody className="divide-y divide-white/5">
                    {isLoading ? (
                      <tr>
                        <td className="px-4 py-6 text-slate-400" colSpan={10}>Загрузка...</td>
                      </tr>
                    ) : apartments.length === 0 ? (
                      <tr>
                        <td className="px-4 py-6 text-slate-400" colSpan={10}>Пока нет объектов. Создайте первый объект.</td>
                      </tr>
                    ) : apartments.map((a) => (
                      <tr key={a.id} onClick={() => router.push(`/apartments/${a.id}`)} className="hover:bg-white/2 cursor-pointer">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {(() => {
                              const photos = a.photos ?? [];
                              const coverPhoto = (photos.find((p) => p.isCover) ?? photos[0]) ?? null;
                              if (coverPhoto && coverPhoto.storagePath) {
                                return (
                                  <div className="h-16 w-24 flex-shrink-0 rounded-xl overflow-hidden bg-slate-800">
                                    <Link href={`/apartments/${a.id}`} onClick={(e) => e.stopPropagation()}>
                                      <StoredImage
                                        storagePath={coverPhoto.storagePath}
                                        alt={a.title}
                                        className="h-16 w-24 rounded-xl object-cover"
                                        fallback={
                                          <div className="h-16 w-24 flex items-center justify-center bg-slate-800">
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-5 w-5 fill-current text-white/60">
                                              <path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
                                            </svg>
                                          </div>
                                        }
                                      />
                                    </Link>
                                  </div>
                                );
                              }

                              return (
                                <div className="h-16 w-24 flex-shrink-0 rounded-lg bg-gradient-to-br from-cyan-400 to-indigo-600 flex items-center justify-center text-slate-900">
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-5 w-5 fill-current text-white/90">
                                    <path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
                                  </svg>
                                </div>
                              );
                            })()}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Link href={`/apartments/${a.id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-white hover:underline">
                            {a.title}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-slate-300">{a.city}</td>
                        <td className="px-4 py-3 text-slate-300">{a.rooms}</td>
                        <td className="px-4 py-3 text-slate-300 whitespace-pre-line">{getRentalCostText(a)}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${a.status === 'Свободно' ? 'bg-emerald-500/20 text-emerald-300' : a.status === 'Занято' ? 'bg-rose-500/20 text-rose-300' : 'bg-yellow-500/20 text-yellow-300'}`}>
                            {a.status}
                          </span>
                        </td>

                        <td className="px-4 py-3 text-slate-300">{a.availability}</td>
                        <td className="px-4 py-3 text-slate-300">{a.bookings}</td>
                        <td className="px-4 py-3 text-slate-300">{a.publicationStatus ?? "draft"}</td>

                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                                        <button onClick={(e) => { e.stopPropagation(); router.push(`/apartments/${a.id}`); }} className="rounded-2xl border border-white/10 px-3 py-1 text-sm text-slate-300 hover:bg-white/5">Открыть</button>
                            <button onClick={(e) => { e.stopPropagation(); router.push(`/apartments/${a.id}/edit`); }} className="rounded-2xl border border-white/10 px-3 py-1 text-sm text-slate-300 hover:bg-white/5">Редактировать</button>
                            {canManagePublication && (a.publicationStatus ?? "draft") !== "published" ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePublicationStatus(a.id, "published");
                                }}
                                className="rounded-2xl border border-emerald-400/30 px-3 py-1 text-sm text-emerald-300 hover:bg-emerald-500/10"
                              >
                                Опубликовать
                              </button>
                            ) : null}
                            {canManagePublication && (a.publicationStatus ?? "draft") === "published" ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePublicationStatus(a.id, "hidden");
                                }}
                                className="rounded-2xl border border-amber-400/30 px-3 py-1 text-sm text-amber-300 hover:bg-amber-500/10"
                              >
                                Скрыть с сайта
                              </button>
                            ) : null}
                            <button onClick={(e) => { e.stopPropagation(); void handleDelete(a.id); }} className="rounded-2xl border border-white/10 px-3 py-1 text-sm text-rose-300 hover:bg-white/5">Удалить</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
