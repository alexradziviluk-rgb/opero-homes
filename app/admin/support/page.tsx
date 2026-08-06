"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Ticket = { public_number: string; requester_name: string | null; category: string; priority: string; status: string; subject: string; delivery_status: string; created_at: string };

export default function SupportPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]); const [status, setStatus] = useState(""); const [loading, setLoading] = useState(true);
  useEffect(() => { void fetch(`/api/admin/support${status ? `?status=${encodeURIComponent(status)}` : ""}`).then((response) => response.json()).then((payload) => setTickets(payload.data ?? [])).finally(() => setLoading(false)); }, [status]);
  return <div className="space-y-6"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm uppercase tracking-[0.2em] text-cyan-300">Opero Support</p><h2 className="mt-2 text-3xl font-semibold text-white">Обращения к менеджеру</h2></div><select value={status} onChange={(event) => { setLoading(true); setStatus(event.target.value); }} className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white"><option value="">Все обращения</option><option value="open">Новые</option><option value="in_progress">В работе</option><option value="waiting_for_client">Ожидают клиента</option><option value="resolved">Решённые</option></select></div>{loading ? <p className="text-slate-400">Загрузка...</p> : <div className="overflow-hidden rounded-2xl border border-white/10"><div className="divide-y divide-white/10">{tickets.map((ticket) => <Link key={ticket.public_number} href={`/admin/support/${ticket.public_number}`} className="block p-4 transition hover:bg-white/5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold text-cyan-200">{ticket.public_number}</p><p className="mt-1 text-white">{ticket.subject}</p><p className="mt-1 text-xs text-slate-400">{ticket.requester_name || "Гость"} · {ticket.category} · {ticket.priority}</p></div><div className="text-right text-xs text-slate-400"><p>{ticket.status}</p><p>{new Date(ticket.created_at).toLocaleString("ru-RU")}</p></div></div></Link>)}{tickets.length === 0 ? <p className="p-6 text-slate-400">Обращений пока нет.</p> : null}</div></div>}</div>;
}
