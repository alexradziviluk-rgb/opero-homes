"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { createSupabaseClient } from "@/lib/supabase/client";

type Message = { senderType: string; message: string; createdAt: string };
type Payload = { ok?: boolean; state?: string; readOnly?: boolean; messages?: Message[]; error?: string };

function ConversationView() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const [payload, setPayload] = useState<Payload | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [accessLost, setAccessLost] = useState(false);
  const [optimistic, setOptimistic] = useState<Message[]>([]);
  const load = useCallback(async () => { const access = search.get("access"); const response = await fetch(`/api/support/anonymous/${encodeURIComponent(params.id)}${access ? `?access=${encodeURIComponent(access)}` : ""}`, { cache: "no-store" }); const data = await response.json() as Payload; if (!response.ok) { window.setTimeout(() => { setAccessLost(true); setOptimistic([]); setDraft(""); setError(data.error || "Ссылка доступа больше недействительна."); }, 0); } else { window.setTimeout(() => { setPayload(data); setAccessLost(false); }, 0); } }, [params.id, search]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (accessLost || payload?.readOnly) return; const supabase = createSupabaseClient(); if (!supabase) return; const channel = supabase.channel(`conversation:${params.id}`).on("broadcast", { event: "message" }, () => { void load(); }).on("broadcast", { event: "state" }, ({ payload: event }) => { if (event?.state === "closed") { setPayload((current) => current ? { ...current, state: "closed", readOnly: true } : current); setDraft(""); setOptimistic([]); } }); channel.subscribe(); const poll = window.setInterval(() => { void load(); }, 30_000); return () => { window.clearInterval(poll); void supabase.removeChannel(channel); }; }, [accessLost, load, params.id, payload?.readOnly]);
  async function send() { const message = draft.trim(); if (!message || sending || payload?.readOnly || accessLost) return; setSending(true); const clientMessageId = crypto.randomUUID(); setOptimistic((current) => [...current, { senderType: "client", message, createdAt: new Date().toISOString() }]); const response = await fetch(`/api/support/anonymous/${encodeURIComponent(params.id)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, clientMessageId }) }); const data = await response.json() as Payload; if (!response.ok) { setOptimistic([]); setError(data.error || "Не удалось отправить сообщение"); if (response.status === 401 || response.status === 404) setAccessLost(true); } else { setDraft(""); setOptimistic([]); await load(); } setSending(false); }
  if (error && accessLost) return <main className="mx-auto max-w-xl space-y-3 p-6 text-rose-700"><h1 className="text-xl font-semibold">Ссылка доступа больше недействительна.</h1><p className="text-sm text-slate-600">Без сохранённой ссылки восстановить этот анонимный диалог нельзя.</p><Link href="/" className="inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm text-white">Вернуться в Opero AI</Link></main>;
  return <main className="mx-auto max-w-xl space-y-5 p-6"><header><p className="text-sm text-slate-500">Opero Homes</p><h1 className="mt-2 text-2xl font-semibold text-slate-900">Диалог {params.id}</h1><p className="mt-1 text-sm text-slate-500">Состояние: {payload?.state || "загрузка"}</p></header><section className="space-y-3">{payload?.messages?.map((message, index) => <div key={`${message.createdAt}-${index}`} className={`rounded-2xl p-3 ${message.senderType === "client" ? "ml-8 bg-cyan-100" : "mr-8 bg-slate-100"}`}>{message.message}</div>)}{optimistic.map((message, index) => <div key={`optimistic-${index}`} className="ml-8 rounded-2xl bg-cyan-100 p-3 opacity-70">{message.message}</div>)}</section>{payload?.readOnly ? <p className="rounded-xl bg-slate-100 p-3 text-sm text-slate-600">Диалог закрыт. История доступна только для чтения.</p> : <div className="flex gap-2"><input value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void send(); }} disabled={accessLost} className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2" placeholder="Сообщение" /><button type="button" disabled={sending || !draft.trim() || accessLost} onClick={() => void send()} className="rounded-xl bg-slate-900 px-4 py-2 text-white disabled:opacity-50">Отправить</button></div>}</main>;
}

export default function AnonymousConversationPage() { return <Suspense fallback={<main className="p-6 text-slate-500">Загрузка...</main>}><ConversationView /></Suspense>; }
