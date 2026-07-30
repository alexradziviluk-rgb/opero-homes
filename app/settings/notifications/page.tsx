"use client";

import { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { BOOKING_NOTIFICATION_EVENT_TYPES } from "@/lib/notifications/constants";

type PreferenceItem = {
  eventType: string;
  inAppEnabled: boolean;
  emailEnabled: boolean;
  whatsappEnabled: boolean;
};

type SettingsDto = {
  defaultBookingManagerUserId: string | null;
  emailEnabled: boolean;
  whatsappEnabled: boolean;
  whatsappProvider: string | null;
  whatsappChannelConnected: boolean;
  checkinReminderHours: number;
  checkoutReminderHours: number;
  backupManagerWhatsAppEnabled: boolean;
};

type AssigneeItem = {
  userId: string;
  roleCode: string;
  firstName: string;
  lastName: string;
  email: string;
};

const defaultSettings: SettingsDto = {
  defaultBookingManagerUserId: null,
  emailEnabled: true,
  whatsappEnabled: false,
  whatsappProvider: null,
  whatsappChannelConnected: false,
  checkinReminderHours: 24,
  checkoutReminderHours: 24,
  backupManagerWhatsAppEnabled: false,
};

function eventLabel(eventType: string): string {
  return eventType
    .replace("booking_", "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function NotificationSettingsPage() {
  const [prefs, setPrefs] = useState<PreferenceItem[]>([]);
  const [settings, setSettings] = useState<SettingsDto>(defaultSettings);
  const [assignees, setAssignees] = useState<AssigneeItem[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  async function loadAll() {
    setError("");
    const [prefsResponse, settingsResponse, assigneesResponse] = await Promise.all([
      fetch("/api/notifications/preferences", { cache: "no-store" }),
      fetch("/api/notifications/settings", { cache: "no-store" }),
      fetch("/api/notifications/assignees", { cache: "no-store" }),
    ]);

    const prefsPayload = (await prefsResponse.json()) as { ok: boolean; data?: PreferenceItem[]; error?: string };
    const settingsPayload = (await settingsResponse.json()) as { ok: boolean; data?: SettingsDto; error?: string };
    const assigneesPayload = (await assigneesResponse.json()) as {
      ok: boolean;
      data?: { responsible: AssigneeItem[]; backupManagers: AssigneeItem[] };
      error?: string;
    };

    if (!prefsPayload.ok || !settingsPayload.ok || !assigneesPayload.ok) {
      setError(prefsPayload.error ?? settingsPayload.error ?? assigneesPayload.error ?? "Не удалось загрузить настройки");
      return;
    }

    setPrefs(prefsPayload.data ?? []);
    setSettings(settingsPayload.data ?? defaultSettings);
    setAssignees(assigneesPayload.data?.backupManagers ?? []);
  }

  useEffect(() => {
    void loadAll();
  }, []);

  async function savePreference(item: PreferenceItem) {
    setStatus("");
    setError("");

    const response = await fetch("/api/notifications/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item),
    });

    const payload = (await response.json()) as { ok: boolean; error?: string };

    if (!payload.ok) {
      setError(payload.error ?? "Не удалось сохранить настройку");
      return;
    }

    setStatus("Настройки событий сохранены");
  }

  async function saveOrganizationSettings() {
    setStatus("");
    setError("");

    const response = await fetch("/api/notifications/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });

    const payload = (await response.json()) as { ok: boolean; error?: string };
    if (!payload.ok) {
      setError(payload.error ?? "Не удалось сохранить настройки");
      return;
    }

    setStatus("Организационные настройки сохранены");
  }

  const filledPrefs = useMemo(() => {
    const map = new Map(prefs.map((item) => [item.eventType, item]));

    return BOOKING_NOTIFICATION_EVENT_TYPES.map((eventType) => {
      return (
        map.get(eventType) ?? {
          eventType,
          inAppEnabled: true,
          emailEnabled: true,
          whatsappEnabled: false,
        }
      );
    });
  }, [prefs]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_32%),linear-gradient(135deg,_#020617_0%,_#0f172a_100%)] text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col lg:flex-row">
        <Sidebar />
        <div className="flex-1">
          <Header showSearch={false} showNewListing={false} />
          <main className="space-y-6 p-6">
            <div>
              <h1 className="text-2xl font-semibold">Настройки уведомлений</h1>
              <p className="text-sm text-slate-400">Каналы отправки и персональные предпочтения</p>
            </div>

            {error ? <p className="text-sm text-rose-400">{error}</p> : null}
            {status ? <p className="text-sm text-emerald-300">{status}</p> : null}

            <section className="rounded-2xl border border-white/10 bg-slate-900/80 p-5">
              <h2 className="text-lg font-semibold text-white">Организация</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label>
                  <div className="text-sm text-slate-300">Менеджер по умолчанию</div>
                  <select
                    value={settings.defaultBookingManagerUserId ?? ""}
                    onChange={(event) => setSettings((prev) => ({ ...prev, defaultBookingManagerUserId: event.target.value || null }))}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                  >
                    <option value="">Не выбран</option>
                    {assignees.map((item) => (
                      <option key={item.userId} value={item.userId}>
                        {item.firstName} {item.lastName} ({item.roleCode})
                      </option>
                    ))}
                  </select>
                </label>

                <label className="inline-flex items-center gap-2 text-sm text-slate-200">
                  <input
                    type="checkbox"
                    checked={settings.emailEnabled}
                    onChange={(event) => setSettings((prev) => ({ ...prev, emailEnabled: event.target.checked }))}
                  />
                  Email канал включен
                </label>

                <label className="inline-flex items-center gap-2 text-sm text-slate-200">
                  <input
                    type="checkbox"
                    checked={settings.whatsappEnabled}
                    onChange={(event) => setSettings((prev) => ({ ...prev, whatsappEnabled: event.target.checked }))}
                  />
                  WhatsApp канал включен
                </label>

                <label className="inline-flex items-center gap-2 text-sm text-slate-200">
                  <input
                    type="checkbox"
                    checked={settings.whatsappChannelConnected}
                    onChange={(event) => setSettings((prev) => ({ ...prev, whatsappChannelConnected: event.target.checked }))}
                  />
                  WhatsApp канал подключен
                </label>

                <label>
                  <div className="text-sm text-slate-300">WhatsApp провайдер</div>
                  <input
                    value={settings.whatsappProvider ?? ""}
                    onChange={(event) => setSettings((prev) => ({ ...prev, whatsappProvider: event.target.value || null }))}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                    placeholder="meta-cloud-api"
                  />
                </label>

                <label>
                  <div className="text-sm text-slate-300">Напоминание о заезде, часов</div>
                  <input
                    type="number"
                    min={1}
                    value={settings.checkinReminderHours}
                    onChange={(event) => setSettings((prev) => ({ ...prev, checkinReminderHours: Number(event.target.value) || 24 }))}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                  />
                </label>

                <label>
                  <div className="text-sm text-slate-300">Напоминание о выезде, часов</div>
                  <input
                    type="number"
                    min={1}
                    value={settings.checkoutReminderHours}
                    onChange={(event) => setSettings((prev) => ({ ...prev, checkoutReminderHours: Number(event.target.value) || 24 }))}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                  />
                </label>

                <label className="inline-flex items-center gap-2 text-sm text-slate-200">
                  <input
                    type="checkbox"
                    checked={settings.backupManagerWhatsAppEnabled}
                    onChange={(event) => setSettings((prev) => ({ ...prev, backupManagerWhatsAppEnabled: event.target.checked }))}
                  />
                  Разрешить WhatsApp backup-менеджеру
                </label>
              </div>

              <button
                type="button"
                onClick={() => void saveOrganizationSettings()}
                className="mt-4 rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-200"
              >
                Сохранить организационные настройки
              </button>
            </section>

            <section className="rounded-2xl border border-white/10 bg-slate-900/80 p-5">
              <h2 className="text-lg font-semibold text-white">Мои события</h2>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-400">
                      <th className="px-3 py-2">Событие</th>
                      <th className="px-3 py-2">In-App</th>
                      <th className="px-3 py-2">Email</th>
                      <th className="px-3 py-2">WhatsApp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filledPrefs.map((item) => (
                      <tr key={item.eventType} className="border-t border-white/5">
                        <td className="px-3 py-2 text-slate-200">{eventLabel(item.eventType)}</td>
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={item.inAppEnabled}
                            onChange={(event) => {
                              const next = { ...item, inAppEnabled: event.target.checked };
                              setPrefs((prev) => {
                                const filtered = prev.filter((p) => p.eventType !== item.eventType);
                                return [...filtered, next];
                              });
                              void savePreference(next);
                            }}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={item.emailEnabled}
                            onChange={(event) => {
                              const next = { ...item, emailEnabled: event.target.checked };
                              setPrefs((prev) => {
                                const filtered = prev.filter((p) => p.eventType !== item.eventType);
                                return [...filtered, next];
                              });
                              void savePreference(next);
                            }}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={item.whatsappEnabled}
                            onChange={(event) => {
                              const next = { ...item, whatsappEnabled: event.target.checked };
                              setPrefs((prev) => {
                                const filtered = prev.filter((p) => p.eventType !== item.eventType);
                                return [...filtered, next];
                              });
                              void savePreference(next);
                            }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}
