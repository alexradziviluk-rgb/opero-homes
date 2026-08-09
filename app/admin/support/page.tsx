"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Ticket = { public_number: string; requester_name: string | null; category: string; priority: string; status: string; conversation_state?: string; subject: string; delivery_status: string; created_at: string };
type TelegramStatus = { bot_connected: boolean; configured: boolean; url: string; allowed_updates: string[]; pending_update_count: number; last_error_message: string | null };

function TelegramPanel() {
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [command, setCommand] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { void fetch("/api/admin/telegram/webhook/status").then((response) => response.ok ? response.json() : null).then((payload) => setStatus(payload?.data ?? null)); }, []);
  async function setupWebhook() {
    setBusy(true); setError("");
    const response = await fetch("/api/admin/telegram/webhook/activate", { method: "POST" });
    const payload = await response.json().catch(() => null);
    if (response.ok) setStatus(payload.status ?? null); else setError(payload?.error || "Не удалось настроить Telegram webhook.");
    setBusy(false);
  }
  async function createLink() {
    setBusy(true); setError("");
    const response = await fetch("/api/admin/telegram/link", { method: "POST" });
    const payload = await response.json().catch(() => null);
    if (response.ok) setCommand(payload.command || ""); else setError(payload?.error || "Не удалось создать Telegram-ссылку.");
    setBusy(false);
  }
  return <section className="rounded-2xl border border-cyan-200/15 bg-slate-950/50 p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Telegram</p><h3 className="mt-2 text-xl font-semibold text-white">Связь менеджера</h3><p className="mt-2 max-w-xl text-sm text-slate-400">Одноразовая команда действует ограниченное время и привязывает текущего менеджера к его Telegram-чату.</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => void setupWebhook()} disabled={busy} className="rounded-xl border border-cyan-300/50 px-3 py-2 text-sm font-semibold text-cyan-200 disabled:opacity-50">{busy ? "Настройка..." : "Настроить Telegram"}</button><button type="button" onClick={() => void createLink()} disabled={busy} className="rounded-xl bg-cyan-300 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50">{busy ? "Создание..." : "Создать команду"}</button></div></div>{status ? <div className="mt-4 grid gap-2 text-sm text-slate-300 sm:grid-cols-2"><p>Bot connected: <strong className={status.bot_connected ? "text-emerald-300" : "text-amber-300"}>{status.bot_connected ? "Yes" : "No"}</strong></p><p>Webhook configured: <strong className={status.configured ? "text-emerald-300" : "text-amber-300"}>{status.configured ? "Yes" : "No"}</strong></p><p className="sm:col-span-2">URL: <span className="break-all text-slate-400">{status.url || "—"}</span></p><p className="sm:col-span-2">Allowed updates: <span className="text-slate-400">{status.allowed_updates.join(", ") || "—"}</span></p><p className="sm:col-span-2">Last error: <span className={status.last_error_message ? "text-amber-300" : "text-slate-400"}>{status.last_error_message || "—"}</span></p></div> : null}{command ? <div className="mt-4 rounded-xl border border-white/10 bg-slate-900 p-3"><p className="text-xs text-slate-500">Отправьте эту команду боту в Telegram:</p><code className="mt-2 block break-all text-sm text-cyan-200">{command}</code></div> : null}{error ? <p role="alert" className="mt-4 text-sm text-amber-300">{error}</p> : null}</section>;
}

export default function SupportPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => { void fetch(`/api/admin/support${status ? `?status=${encodeURIComponent(status)}` : ""}`).then((response) => response.json()).then((payload) => setTickets(payload.data ?? [])).finally(() => setLoading(false)); }, [status]);
  return <div className="space-y-6"><TelegramPanel /><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm uppercase tracking-[0.2em] text-cyan-300">Opero Support</p><h2 className="mt-2 text-3xl font-semibold text-white">Обращения к менеджеру</h2></div><select value={status} onChange={(event) => { setLoading(true); setStatus(event.target.value); }} className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white"><option value="">Все обращения</option><option value="open">Новые</option><option value="in_progress">В работе</option><option value="waiting_for_client">Ожидают клиента</option><option value="resolved">Решённые</option></select></div>{loading ? <p className="text-slate-400">Загрузка...</p> : <div className="overflow-hidden rounded-2xl border border-white/10"><div className="divide-y divide-white/10">{tickets.map((ticket) => <Link key={ticket.public_number} href={`/admin/support/${ticket.public_number}`} className="block p-4 transition hover:bg-white/5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold text-cyan-200">{ticket.public_number}</p><p className="mt-1 text-white">{ticket.subject}</p><p className="mt-1 text-xs text-slate-400">{ticket.requester_name || "Гость"} · {ticket.category} · {ticket.priority}</p></div><div className="text-right text-xs text-slate-400"><p>{ticket.conversation_state || ticket.status}</p><p>{new Date(ticket.created_at).toLocaleString("ru-RU")}</p></div></div></Link>)}{tickets.length === 0 ? <p className="p-6 text-slate-400">Обращений пока нет.</p> : null}</div></div>}</div>;
}
