"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { InAppNotificationRow } from "@/types/notification";

type NotificationApiResponse = {
  ok: boolean;
  data?: {
    items: InAppNotificationRow[];
    unreadCount: number;
  };
};

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<InAppNotificationRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/notifications?limit=8", { cache: "no-store" });
      const payload = (await response.json()) as NotificationApiResponse;
      if (payload.ok && payload.data) {
        setItems(payload.data.items);
        setUnreadCount(payload.data.unreadCount);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    function handleChange() {
      void load();
    }

    window.addEventListener("opero-notifications-changed", handleChange);
    return () => window.removeEventListener("opero-notifications-changed", handleChange);
  }, []);

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

  const hasItems = items.length > 0;

  const unreadBadge = useMemo(() => {
    if (unreadCount <= 0) return null;
    return unreadCount > 99 ? "99+" : String(unreadCount);
  }, [unreadCount]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative rounded-xl border border-white/10 bg-white/5 p-2 text-slate-200 hover:bg-white/10"
        aria-label="Открыть уведомления"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M15 17h5l-1.4-1.4a2 2 0 0 1-.6-1.4V10a6 6 0 0 0-12 0v4.2c0 .53-.21 1.04-.59 1.41L4 17h5" />
          <path d="M10 18a2 2 0 1 0 4 0" />
        </svg>
        {unreadBadge ? (
          <span className="absolute -right-1 -top-1 rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            {unreadBadge}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-[22rem] rounded-2xl border border-white/10 bg-slate-950/95 p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-white">Уведомления</p>
            <button
              type="button"
              onClick={() => void markAllAsRead()}
              className="text-xs text-cyan-300 hover:text-cyan-200"
              disabled={unreadCount === 0}
            >
              Прочитать все
            </button>
          </div>

          {loading ? <p className="py-4 text-sm text-slate-400">Загрузка...</p> : null}

          {!loading && !hasItems ? <p className="py-4 text-sm text-slate-400">Пока нет уведомлений</p> : null}

          {!loading && hasItems ? (
            <div className="space-y-2">
              {items.map((item) => (
                <div key={item.id} className="rounded-xl border border-white/10 bg-white/5 p-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-white">{item.title}</p>
                    {!item.read_at ? (
                      <button
                        type="button"
                        onClick={() => void markOneAsRead(item.id)}
                        className="text-[11px] text-cyan-300 hover:text-cyan-200"
                      >
                        Прочитать
                      </button>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-slate-300 whitespace-pre-line">{item.message}</p>
                  {item.action_url ? (
                    <Link href={item.action_url} className="mt-2 inline-block text-xs text-cyan-300 hover:text-cyan-200">
                      Открыть
                    </Link>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          <Link href="/notifications" className="mt-3 block text-center text-xs text-slate-300 hover:text-white">
            Все уведомления
          </Link>
        </div>
      ) : null}
    </div>
  );
}
