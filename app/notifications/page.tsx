"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { NOTIFICATION_EVENT_TYPES } from "@/lib/notifications/constants";
import type { NotificationCenterItem } from "@/types/notification";

type NotificationApiResponse = {
  ok: boolean;
  data?: {
    items: NotificationCenterItem[];
    unreadCount: number;
    totalCount: number;
    hasMore: boolean;
    nextOffset: number | null;
  };
  error?: string;
};

type ReadFilter = "all" | "unread" | "read";

const PAGE_SIZE = 10;
const EVENT_LABELS: Record<string, string> = {
  booking_created: "Бронирование создано",
  booking_confirmed: "Бронирование подтверждено",
  booking_cancelled: "Бронирование отменено",
  booking_changed: "Бронирование изменено",
  booking_payment_succeeded: "Оплата получена",
  booking_payment_failed: "Ошибка оплаты",
  new_guest_message: "Новое сообщение гостя",
  owner_invitation_accepted: "Приглашение принято",
  apartment_published: "Объект опубликован",
  apartment_unpublished: "Объект снят с публикации",
  calendar_conflict: "Конфликт календаря",
  maintenance_created: "Создана заявка на ремонт",
  maintenance_completed: "Ремонт завершен",
  booking_ready_for_checkin: "Объект готов к заезду",
  booking_checkin_upcoming: "Скоро заезд",
  booking_checkout_upcoming: "Скоро выезд",
  booking_unassigned: "Бронирование без ответственного",
};

function readableNotificationMessage(message: string): string {
  return message
    .split("\n")
    .filter((line) => !/^Бронирование:\s*[0-9a-f-]{36}\s*$/i.test(line.trim()))
    .join("\n");
}

function normalizeReadFilter(value: string | null): ReadFilter {
  if (value === "unread" || value === "read") {
    return value;
  }

  return "all";
}

export default function NotificationsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [items, setItems] = useState<NotificationCenterItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [readFilter, setReadFilter] = useState<ReadFilter>(() =>
    typeof window === "undefined" ? "all" : normalizeReadFilter(new URLSearchParams(window.location.search).get("read")),
  );
  const [eventType, setEventType] = useState<string>(() =>
    typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("eventType") ?? "",
  );
  const [offset, setOffset] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams();
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(offset));
      params.set("read", readFilter);
      if (eventType) {
        params.set("eventType", eventType);
      }

      const response = await fetch(`/api/notifications?${params.toString()}`, { cache: "no-store" });
      const payload = (await response.json()) as NotificationApiResponse;
      if (!payload.ok || !payload.data) {
        setError(payload.error ?? "Не удалось загрузить уведомления");
        return;
      }

      setItems(payload.data.items);
      setUnreadCount(payload.data.unreadCount);
      setTotalCount(payload.data.totalCount);
      setHasMore(payload.data.hasMore);
      setNextOffset(payload.data.nextOffset);
    } catch {
      setError("Не удалось загрузить уведомления");
    } finally {
      setLoading(false);
    }
  }, [eventType, offset, readFilter]);

  useEffect(() => {
    const loadId = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(loadId);
  }, [load]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (readFilter !== "all") {
      params.set("read", readFilter);
    }
    if (eventType) {
      params.set("eventType", eventType);
    }
    if (offset > 0) {
      params.set("offset", String(offset));
    }

    const nextUrl = params.toString() ? `/notifications?${params.toString()}` : "/notifications";
    window.history.replaceState({}, "", nextUrl);
  }, [eventType, offset, readFilter]);

  function resetPage() {
    setOffset(0);
  }

  function applyReadFilter(value: ReadFilter) {
    setReadFilter(value);
    resetPage();
  }

  function applyEventFilter(value: string) {
    setEventType(value);
    resetPage();
  }

  async function markOneAsRead(id: string) {
    await fetch(`/api/notifications/${id}/read`, { method: "POST" });
    await load();
    window.dispatchEvent(new Event("opero-notifications-changed"));
  }

  async function markAllAsRead() {
    await fetch("/api/notifications/read-all", { method: "POST" });
    await load();
    window.dispatchEvent(new Event("opero-notifications-changed"));
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function toggleAllVisible() {
    setSelectedIds((current) => current.length === items.length ? [] : items.map((item) => item.id));
  }

  async function deleteSelected() {
    if (selectedIds.length === 0 || !confirm(`Удалить выбранные уведомления (${selectedIds.length})?`)) return;
    setIsDeleting(true);
    setError("");
    try {
      const response = await fetch("/api/notifications", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        setError(payload.error ?? "Не удалось удалить уведомления");
        return;
      }
      setSelectedIds([]);
      await load();
      window.dispatchEvent(new Event("opero-notifications-changed"));
    } catch {
      setError("Не удалось удалить уведомления");
    } finally {
      setIsDeleting(false);
    }
  }

  function goPrev() {
    setOffset((current) => Math.max(0, current - PAGE_SIZE));
  }

  function goNext() {
    if (!hasMore || nextOffset === null) {
      return;
    }

    setOffset(nextOffset);
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_32%),linear-gradient(135deg,_#020617_0%,_#0f172a_100%)] text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col lg:flex-row">
        <Sidebar />
        <div className="flex-1">
          <Header showSearch={false} showNewListing={false} />
          <main className="p-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-semibold">Уведомления</h1>
                <p className="text-sm text-slate-400">Непрочитанных: {unreadCount}</p>
                <p className="text-xs text-slate-500">Всего в выборке: {totalCount}</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void deleteSelected()}
                  disabled={selectedIds.length === 0 || isDeleting}
                  className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isDeleting ? "Удаление..." : `Удалить выбранные${selectedIds.length ? ` (${selectedIds.length})` : ""}`}
                </button>
                <button
                  type="button"
                  onClick={() => void markAllAsRead()}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200"
                >
                  Прочитать все
                </button>
                <Link href="/settings/notifications" className="rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-sm font-semibold text-cyan-200">
                  Настройки
                </Link>
              </div>
            </div>

            {loading ? <p className="text-sm text-slate-400">Загрузка...</p> : null}
            {error ? <p className="text-sm text-rose-400">{error}</p> : null}

            <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/80 p-3 text-sm">
              <label className="flex items-center gap-2 text-slate-300">
                <input type="checkbox" checked={items.length > 0 && selectedIds.length === items.length} onChange={toggleAllVisible} />
                Выбрать на странице
              </label>
              <button
                type="button"
                onClick={() => applyReadFilter("all")}
                className={`rounded-xl px-3 py-2 ${readFilter === "all" ? "bg-cyan-500/20 text-cyan-200" : "bg-white/5 text-slate-300"}`}
              >
                Все
              </button>
              <button
                type="button"
                onClick={() => applyReadFilter("unread")}
                className={`rounded-xl px-3 py-2 ${readFilter === "unread" ? "bg-cyan-500/20 text-cyan-200" : "bg-white/5 text-slate-300"}`}
              >
                Непрочитанные
              </button>
              <button
                type="button"
                onClick={() => applyReadFilter("read")}
                className={`rounded-xl px-3 py-2 ${readFilter === "read" ? "bg-cyan-500/20 text-cyan-200" : "bg-white/5 text-slate-300"}`}
              >
                Прочитанные
              </button>

              <label className="ml-auto flex items-center gap-2 text-slate-300">
                <span className="text-xs uppercase tracking-[0.2em] text-slate-500">Событие</span>
                <select
                  value={eventType}
                  onChange={(event) => applyEventFilter(event.target.value)}
                  className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none"
                >
                  <option value="">Все события</option>
                  {NOTIFICATION_EVENT_TYPES.map((item) => (
                    <option key={item} value={item}>{EVENT_LABELS[item] ?? item}</option>
                  ))}
                </select>
              </label>
            </div>

            {!loading && !error && items.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-6 text-sm text-slate-400">Пока нет уведомлений.</div>
            ) : null}

            <div className="space-y-3">
              {items.map((item) => (
                <article key={item.id} className="rounded-2xl border border-white/10 bg-slate-900/80 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <input type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => toggleSelected(item.id)} className="mt-1" aria-label={`Выбрать уведомление: ${item.title}`} />
                      <div>
                      <h2 className="text-base font-semibold text-white">{item.title}</h2>
                      <p className="mt-1 text-xs text-slate-500">{EVENT_LABELS[item.event_type] ?? "Системное событие"}</p>
                      <p className="mt-1 whitespace-pre-line text-sm text-slate-300">{readableNotificationMessage(item.message)}</p>
                      <p className="mt-2 text-xs text-slate-500">{new Date(item.created_at).toLocaleString("ru-RU")}</p>
                    </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {!item.read_at ? (
                        <button
                          type="button"
                          onClick={() => void markOneAsRead(item.id)}
                          className="rounded-lg border border-white/10 px-2 py-1 text-xs text-cyan-300"
                        >
                          Прочитать
                        </button>
                      ) : (
                        <span className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-200">Прочитано</span>
                      )}
                    </div>
                  </div>
                  {item.action_url ? (
                    <Link href={item.action_url} className="mt-3 inline-block text-sm text-cyan-300 hover:text-cyan-200">
                      Перейти к источнику
                    </Link>
                  ) : null}
                </article>
              ))}
            </div>

            <div className="mt-4 flex items-center justify-between rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-slate-300">
              <button
                type="button"
                onClick={goPrev}
                disabled={offset === 0}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Назад
              </button>
              <p>Страница {Math.floor(offset / PAGE_SIZE) + 1}</p>
              <button
                type="button"
                onClick={goNext}
                disabled={!hasMore}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Вперёд
              </button>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
