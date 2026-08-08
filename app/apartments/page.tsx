"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import StoredImage from "@/components/StoredImage";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { hasEffectivePermission } from "@/lib/permissions";
import type { Apartment } from "@/types/apartment";
import { getRentalCostText } from "@/app/apartments/apartment-utils";
import { deleteApartmentFromSupabase, loadApartmentsFromSupabase, saveApartmentToSupabase } from "@/lib/apartments/supabase-apartments";

type Assignee = {
  userId: string;
  firstName: string;
  lastName: string;
  roleCode: string;
};

type BookingSummary = {
  apartmentId: string | null;
  guestName: string;
  checkIn: string;
  checkOut: string;
  status: string;
};

type TaskSummary = {
  apartment_id: string;
  task_type: string;
  status: string;
};

type AvailabilityFilter = "all" | "available" | "occupied" | "draft";

function normalizeStatus(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function isCancelledBooking(status: string): boolean {
  return ["cancelled", "canceled", "rejected", "declined", "expired", "отменено", "отклонено"].includes(normalizeStatus(status));
}

export default function ApartmentsPage() {
  const router = useRouter();
  const { currentUser } = useCurrentUser();
  const [localApartments, setLocalApartments] = useState<Apartment[]>([]);
  const canManagePublication = currentUser ? hasEffectivePermission(currentUser, "properties.manage") : false;
  const canManagePropertyDefinition = currentUser ? hasEffectivePermission(currentUser, "apartments.manage") : false;
  const canDeleteProperty = currentUser ? hasEffectivePermission(currentUser, "apartments.manage") : false;
  const [isLoading, setIsLoading] = useState(true);
  const [bookings, setBookings] = useState<BookingSummary[]>([]);
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [availabilityFilter, setAvailabilityFilter] = useState<AvailabilityFilter>(() => {
    if (typeof window === "undefined") return "all";
    const filter = new URLSearchParams(window.location.search).get("availability");
    return filter === "available" || filter === "occupied" || filter === "draft" ? filter : "all";
  });

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

    void Promise.all([
      fetch("/api/notifications/assignees", { cache: "no-store" }),
      fetch("/api/bookings", { cache: "no-store" }),
      fetch("/api/operations/tasks", { cache: "no-store" }),
    ]).then(async ([assigneesResponse, bookingsResponse, tasksResponse]) => {
      const assigneesPayload = (await assigneesResponse.json()) as { ok: boolean; data?: { responsible?: Assignee[] } };
      const bookingsPayload = (await bookingsResponse.json()) as { ok: boolean; data?: BookingSummary[] };
      const tasksPayload = (await tasksResponse.json()) as { ok: boolean; data?: TaskSummary[] };
      if (cancelled) return;
      if (assigneesPayload.ok) setAssignees(assigneesPayload.data?.responsible ?? []);
      if (bookingsPayload.ok) setBookings(bookingsPayload.data ?? []);
      if (tasksPayload.ok) setTasks(tasksPayload.data ?? []);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const occupiedApartmentIds = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return new Set(
      bookings
        .filter((booking) => !isCancelledBooking(booking.status) && booking.checkIn.slice(0, 10) <= today && booking.checkOut.slice(0, 10) > today)
        .map((booking) => booking.apartmentId)
        .filter((apartmentId): apartmentId is string => Boolean(apartmentId)),
    );
  }, [bookings]);

  const apartments = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase("ru-RU");
    const idQuery = normalizedQuery.replace(/^id\s*-?\s*/i, "").replace(/\D/g, "");
    return localApartments.filter((apartment) => {
      const matchesId = Boolean(idQuery) && String(apartment.internalNumber ?? "").startsWith(idQuery);
      const matchesSearch = !normalizedQuery || matchesId || [apartment.title, apartment.unitNumber ?? "", apartment.city, apartment.district, apartment.address].some((value) => value.toLocaleLowerCase("ru-RU").includes(normalizedQuery));
      const isOccupied = occupiedApartmentIds.has(apartment.id);
      const matchesFilter = availabilityFilter === "all"
        || (availabilityFilter === "occupied" && isOccupied)
        || (availabilityFilter === "available" && !isOccupied && normalizeStatus(apartment.status) !== "черновик")
        || (availabilityFilter === "draft" && normalizeStatus(apartment.status) === "черновик");
      return matchesSearch && matchesFilter;
    }).sort((left, right) => {
      if (!idQuery) return 0;
      const leftId = String(left.internalNumber ?? "");
      const rightId = String(right.internalNumber ?? "");
      const leftMatches = leftId.startsWith(idQuery);
      const rightMatches = rightId.startsWith(idQuery);
      if (leftMatches !== rightMatches) return leftMatches ? -1 : 1;
      if (!leftMatches) return 0;
      const leftIsExact = leftId === idQuery;
      const rightIsExact = rightId === idQuery;
      if (leftIsExact !== rightIsExact) return leftIsExact ? -1 : 1;
      return Number(leftId) - Number(rightId);
    });
  }, [availabilityFilter, localApartments, occupiedApartmentIds, searchQuery]);

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

  async function handleAvailabilityStatus(apartment: Apartment) {
    if (!canManagePropertyDefinition || normalizeStatus(apartment.status) === "черновик") return;

    const isOccupied = normalizeStatus(apartment.status) === "занято";
    const updated = await saveApartmentToSupabase({
      ...apartment,
      status: isOccupied ? "Свободно" : "Занято",
      availability: isOccupied ? "Свободен" : "Занят",
      updatedAt: new Date().toISOString(),
    });

    setLocalApartments((items) => items.map((item) => (item.id === apartment.id ? updated : item)));
  }

  async function handleResponsibleUser(apartment: Apartment, responsibleUserId: string) {
    const response = await fetch(`/api/notifications/apartments/${apartment.id}/assignees`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        responsibleUserId: responsibleUserId || null,
        backupManagerUserId: apartment.backupManagerUserId ?? null,
      }),
    });

    if (!response.ok) return;
    setLocalApartments((items) => items.map((item) => item.id === apartment.id ? { ...item, responsibleUserId: responsibleUserId || null } : item));
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_32%),linear-gradient(135deg,_#020617_0%,_#0f172a_100%)] text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col lg:flex-row">
        <Sidebar />

        <div className="flex-1">
          <Header showSearch={false} showNewListing={false} />

          <main className="p-4 sm:p-6 lg:p-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-white">Объекты</h1>
                <p className="mt-1 text-sm text-slate-400">Список объектов и их параметры</p>
              </div>

              <div className="flex w-full min-w-0 flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
                <label className="flex w-full min-w-0 items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-300 sm:w-auto">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <circle cx="11" cy="11" r="6" />
                    <path d="m20 20-4.2-4.2" />
                  </svg>
                  <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Поиск объектов..." className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-500 sm:w-48 sm:flex-none" />
                </label>

                {canManagePropertyDefinition ? (
                  <Link href="/apartments/new" className="inline-flex w-full cursor-pointer items-center justify-center rounded-2xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-200 transition hover:bg-cyan-500/20 sm:w-auto sm:whitespace-nowrap">
                    + Новый объект
                  </Link>
                ) : null}
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              {(["all", "available", "occupied", "draft"] as const).map((filter) => (
                <button key={filter} type="button" onClick={() => setAvailabilityFilter(filter)} className={`rounded-2xl px-3 py-1.5 text-sm ${availabilityFilter === filter ? "bg-cyan-500/20 font-medium text-cyan-100" : "bg-white/5 text-slate-300"}`}>
                  {filter === "all" ? "Все" : filter === "available" ? "Свободные" : filter === "occupied" ? "Занятые" : "Черновики"}
                </button>
              ))}
            </div>

            <div className="mt-6 overflow-hidden rounded-3xl border border-white/10 bg-slate-900/80">
              <div className="w-full overflow-x-auto">
                <table className="min-w-[900px] w-full table-auto text-sm">
                  <thead className="bg-white/3 text-slate-300">
                  <tr>
                    <th className="px-4 py-3 text-left">Фото</th>
                    <th className="px-4 py-3 text-left">Название</th>
                    <th className="px-4 py-3 text-left">ID объекта</th>
                    <th className="px-4 py-3 text-left">Город</th>
                    <th className="px-4 py-3 text-left">Комнаты</th>
                    <th className="px-4 py-3 text-left">Стоимость аренды</th>
                    <th className="px-4 py-3 text-left">Статус</th>
                    <th className="px-4 py-3 text-left">Доступность</th>
                    <th className="px-4 py-3 text-left">Текущий гость</th>
                    <th className="px-4 py-3 text-left">Следующий заезд / выезд</th>
                    <th className="px-4 py-3 text-left">Работы</th>
                    <th className="px-4 py-3 text-left">Ответственный</th>
                    <th className="px-4 py-3 text-left">Статус публикации</th>
                    <th className="px-4 py-3 text-left">Действия</th>
                  </tr>
                  </thead>

                  <tbody className="divide-y divide-white/5">
                    {isLoading ? (
                      <tr>
                        <td className="px-4 py-6 text-slate-400" colSpan={14}>Загрузка...</td>
                      </tr>
                    ) : apartments.length === 0 ? (
                      <tr>
                        <td className="px-4 py-6 text-slate-400" colSpan={14}>Пока нет объектов. Создайте первый объект.</td>
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
                                        sourceUrl={coverPhoto.url}
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
                        <td className="px-4 py-3 text-slate-300">{a.internalNumber ? `ID-${a.internalNumber}` : "—"}</td>
                        <td className="px-4 py-3 text-slate-300">{a.city}</td>
                        <td className="px-4 py-3 text-slate-300">{a.rooms}</td>
                        <td className="px-4 py-3 text-slate-300 whitespace-pre-line">{getRentalCostText(a)}</td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            title="Быстро изменить статус объекта"
                            disabled={!canManagePropertyDefinition || normalizeStatus(a.status) === "черновик"}
                            onClick={(event) => { event.stopPropagation(); void handleAvailabilityStatus(a); }}
                            className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${occupiedApartmentIds.has(a.id) || normalizeStatus(a.status) === "занято" ? "bg-rose-500/20 text-rose-300 hover:bg-rose-500/30" : "bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30"}`}
                          >
                            {occupiedApartmentIds.has(a.id) ? "Занято по брони" : a.status}
                          </button>
                        </td>

                        <td className="px-4 py-3 text-slate-300">{a.availability}</td>
                        <td className="px-4 py-3 text-slate-300">{bookings.find((booking) => booking.apartmentId === a.id && occupiedApartmentIds.has(a.id) && !isCancelledBooking(booking.status))?.guestName ?? "—"}</td>
                        <td className="px-4 py-3 text-slate-300">{(() => {
                          const now = new Date().toISOString();
                          const next = bookings.filter((booking) => booking.apartmentId === a.id && booking.checkOut >= now && booking.status !== "cancelled").sort((left, right) => left.checkIn.localeCompare(right.checkIn))[0];
                          return next ? `${new Date(next.checkIn).toLocaleDateString("ru-RU")} / ${new Date(next.checkOut).toLocaleDateString("ru-RU")}` : "—";
                        })()}</td>
                        <td className="px-4 py-3 text-xs text-slate-300">{(() => {
                          const open = tasks.filter((task) => task.apartment_id === a.id && !["completed", "verified", "done", "cancelled"].includes(task.status));
                          const cleaning = open.some((task) => task.task_type === "cleaning");
                          const repair = open.some((task) => task.task_type === "technical");
                          return `${cleaning ? "Уборка требуется" : "Уборка: нет"} · ${repair ? "Ремонт требуется" : "Ремонт: нет"}`;
                        })()}</td>
                        <td className="px-4 py-3 text-slate-300">
                          <select value={a.responsibleUserId ?? ""} onClick={(event) => event.stopPropagation()} onChange={(event) => { event.stopPropagation(); void handleResponsibleUser(a, event.target.value); }} className="max-w-44 rounded-lg border border-white/10 bg-slate-950 px-2 py-1 text-xs">
                            <option value="">Не назначен</option>
                            {assignees.map((user) => <option key={user.userId} value={user.userId}>{user.firstName} {user.lastName}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-3 text-slate-300">{a.publicationStatus ?? "draft"}</td>

                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                                        <button onClick={(e) => { e.stopPropagation(); router.push(`/apartments/${a.id}`); }} className="rounded-2xl border border-white/10 px-3 py-1 text-sm text-slate-300 hover:bg-white/5">Открыть</button>
                            {canManagePropertyDefinition ? <button onClick={(e) => { e.stopPropagation(); router.push(`/apartments/${a.id}/edit`); }} className="rounded-2xl border border-white/10 px-3 py-1 text-sm text-slate-300 hover:bg-white/5">Редактировать</button> : null}
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
                            <Link href={`/tasks?apartment=${encodeURIComponent(a.id)}`} onClick={(e) => e.stopPropagation()} className="rounded-2xl border border-white/10 px-3 py-1 text-sm text-cyan-300 hover:bg-white/5">Создать задачу</Link>
                            {canDeleteProperty ? <button onClick={(e) => { e.stopPropagation(); void handleDelete(a.id); }} className="rounded-2xl border border-white/10 px-3 py-1 text-sm text-rose-300 hover:bg-white/5">Удалить</button> : null}
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
