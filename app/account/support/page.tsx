"use client";

import { useEffect, useState } from "react";

type Message = { sender_type: string; message: string; created_at: string; is_internal: boolean };
type Ticket = { public_number: string; status: string; priority: string; subject: string; created_at: string; updated_at: string; support_messages?: Message[] };

export default function AccountSupportPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]); const [loading, setLoading] = useState(true);
  useEffect(() => { void fetch("/api/support/tickets").then((response) => response.json()).then((payload) => setTickets(payload.data ?? [])).finally(() => setLoading(false)); }, []);
  return <main className="mx-auto min-h-screen max-w-4xl space-y-6 px-4 py-8"><div><p className="text-sm uppercase tracking-[0.2em] text-cyan-600">Opero Support</p><h1 className="mt-2 text-3xl font-semibold text-slate-900">Мои обращения</h1></div>{loading ? <p className="text-slate-500">Загрузка...</p> : tickets.length === 0 ? <p className="rounded-2xl border border-slate-200 p-6 text-slate-600">Обращений пока нет.</p> : <div className="space-y-4">{tickets.map((ticket) => <article key={ticket.public_number} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap justify-between gap-3"><div><p className="font-semibold text-cyan-700">{ticket.public_number}</p><h2 className="mt-1 text-lg font-semibold text-slate-900">{ticket.subject}</h2></div><p className="text-sm text-slate-500">{ticket.status} · {ticket.priority}</p></div><p className="mt-2 text-xs text-slate-500">Создано: {new Date(ticket.created_at).toLocaleString("ru-RU")} · Обновлено: {new Date(ticket.updated_at).toLocaleString("ru-RU")}</p>{ticket.support_messages?.filter((message) => !message.is_internal).map((message, index) => <div key={`${ticket.public_number}-${index}`} className="mt-4 rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">{message.sender_type === "client" ? "Вы" : "Менеджер"}</p><p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{message.message}</p></div>)}</article>)}</div>}</main>;
}