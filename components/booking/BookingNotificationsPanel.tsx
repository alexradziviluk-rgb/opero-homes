"use client";

import { useEffect, useMemo, useState } from "react";

type BookingNotificationsPanelProps = {
  bookingId: string;
};

type EventRow = {
  id: string;
  event_type: string;
  created_at: string;
};

type DeliveryRow = {
  id: string;
  event_id: string;
  channel: "email" | "whatsapp";
  destination: string;
  status: string;
  attempt_count: number;
  last_error: string | null;
  created_at: string;
};

type ApiPayload = {
  ok: boolean;
  data?: {
    events: EventRow[];
    deliveries: DeliveryRow[];
  };
};

function statusLabel(status: string): string {
  if (status === "queued") return "В очереди";
  if (status === "processing") return "Обрабатывается";
  if (status === "sent") return "Отправлено";
  if (status === "delivered") return "Доставлено";
  if (status === "retry_scheduled") return "Повтор запланирован";
  if (status === "failed") return "Ошибка";
  if (status === "permanently_failed") return "Остановлено";
  return status;
}

export default function BookingNotificationsPanel({ bookingId }: BookingNotificationsPanelProps) {
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/notifications/bookings/${bookingId}`, { cache: "no-store" });
      const payload = (await response.json()) as ApiPayload;
      if (!payload.ok || !payload.data) {
        setError("Не удалось загрузить уведомления");
        return;
      }

      setEvents(payload.data.events ?? []);
      setDeliveries(payload.data.deliveries ?? []);
    } catch {
      setError("Не удалось загрузить уведомления");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [bookingId]);

  const deliveriesByEvent = useMemo(() => {
    const map = new Map<string, DeliveryRow[]>();
    for (const delivery of deliveries) {
      const list = map.get(delivery.event_id) ?? [];
      list.push(delivery);
      map.set(delivery.event_id, list);
    }
    return map;
  }, [deliveries]);

  async function retryDelivery(id: string) {
    await fetch(`/api/notifications/deliveries/${id}/retry`, {
      method: "POST",
    });
    await load();
  }

  return (
    <section className="mt-6 rounded-2xl border border-white/10 bg-slate-900/80 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Уведомления</h2>
        <button type="button" onClick={() => void load()} className="rounded-lg border border-white/10 px-3 py-1 text-xs text-slate-300">
          Обновить
        </button>
      </div>

      {loading ? <p className="text-sm text-slate-400">Загрузка...</p> : null}
      {error ? <p className="text-sm text-rose-400">{error}</p> : null}
      {!loading && !error && events.length === 0 ? <p className="text-sm text-slate-400">События уведомлений пока не созданы.</p> : null}

      <div className="space-y-3">
        {events.map((event) => {
          const eventDeliveries = deliveriesByEvent.get(event.id) ?? [];

          return (
            <div key={event.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-white">{event.event_type}</p>
                <p className="text-xs text-slate-400">{new Date(event.created_at).toLocaleString("ru-RU")}</p>
              </div>

              {eventDeliveries.length === 0 ? (
                <p className="mt-2 text-xs text-slate-400">Нет внешних доставок</p>
              ) : (
                <div className="mt-2 space-y-2">
                  {eventDeliveries.map((delivery) => {
                    const canRetry = delivery.status === "failed" || delivery.status === "permanently_failed";

                    return (
                      <div key={delivery.id} className="rounded-lg border border-white/10 bg-slate-950/60 p-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs text-slate-200">
                            {delivery.channel}: {delivery.destination}
                          </p>
                          <p className="text-xs text-slate-300">{statusLabel(delivery.status)} · попыток: {delivery.attempt_count}</p>
                        </div>
                        {delivery.last_error ? <p className="mt-1 text-xs text-rose-300">{delivery.last_error}</p> : null}
                        {canRetry ? (
                          <button
                            type="button"
                            onClick={() => void retryDelivery(delivery.id)}
                            className="mt-2 rounded-lg border border-amber-400/30 bg-amber-500/10 px-2 py-1 text-xs text-amber-200"
                          >
                            Повторить отправку
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
