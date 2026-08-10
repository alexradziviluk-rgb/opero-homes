"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Message = { sender_type: string; message: string; is_internal: boolean; created_at: string };
type Ticket = { public_number: string; requester_user_id?: string | null; anonymous_access_revoked_at?: string | null; requester_name: string | null; requester_email: string | null; requester_phone: string | null; status: string; conversation_state?: string; assigned_to?: string | null; priority: string; subject: string; customer_message: string; ai_summary: string; conversation_summary?: string; delivery_status: string; apartment_id?: string | null; booking_id?: string | null; ai?: { intent?: string; action?: string; action_result?: string; task_reference?: string; fallback_used?: boolean } | null; created_at: string; updated_at: string; support_messages?: Message[] };

export default function SupportTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [reply, setReply] = useState("");
  const [internal, setInternal] = useState(false);
  const [replyStatus, setReplyStatus] = useState<"idle" | "sending" | "sent" | "failed" | "retrying">("idle");
  const [failedReply, setFailedReply] = useState<{ message: string; clientMessageId: string; internal: boolean } | null>(null);

  useEffect(() => { void params.then(({ id }) => fetch(`/api/admin/support/${encodeURIComponent(id)}`).then((response) => response.json()).then((payload) => payload.data ? setTicket(payload.data) : setError(payload.error || "Не найдено"))); }, [params]);

  async function update(action: string, status?: string) {
    if (!ticket) return;
    setSaving(true);
    const response = await fetch("/api/admin/support", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ publicNumber: ticket.public_number, action, status }) });
    const payload = await response.json().catch(() => null);
    if (response.ok) setTicket({ ...ticket, status: status ?? ticket.status, conversation_state: payload.conversationState ?? ticket.conversation_state });
    else setError(payload?.error || "Ошибка");
    setSaving(false);
  }

  async function sendReply(retry?: { message: string; clientMessageId: string; internal: boolean }) {
    if (!ticket || (!reply.trim() && !retry)) return;
    setSaving(true); setReplyStatus(retry ? "retrying" : "sending");
    const message = retry?.message ?? reply.trim();
    const clientMessageId = retry?.clientMessageId ?? crypto.randomUUID();
    const isInternal = retry?.internal ?? internal;
    if (!retry) setTicket({ ...ticket, support_messages: [...(ticket.support_messages ?? []), { sender_type: isInternal ? "internal_note" : "manager", message, is_internal: isInternal, created_at: new Date().toISOString() }] });
    const response = await fetch("/api/admin/support", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ publicNumber: ticket.public_number, message, clientMessageId, action: isInternal ? "internal_note" : "" }) });
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    if (response.ok) { setReply(""); setFailedReply(null); setReplyStatus("sent"); }
    else { setFailedReply({ message, clientMessageId, internal: isInternal }); setReplyStatus("failed"); setError(payload?.error || "Ошибка"); }
    setSaving(false);
  }

  if (error) return <p className="text-rose-200">{error}</p>;
  if (!ticket) return <p className="text-slate-400">Загрузка...</p>;
  const state = ticket.conversation_state ?? "bot_active";
  return <div className="max-w-3xl space-y-6">
    <Link href="/admin/support" className="text-sm text-cyan-200">← Все обращения</Link>
    <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-6">
      <div className="flex flex-wrap justify-between gap-3"><div><p className="text-sm text-cyan-300">{ticket.public_number}</p><h2 className="mt-2 text-2xl font-semibold text-white">{ticket.subject}</h2></div><p className="text-sm text-slate-400">{state} · {ticket.priority}</p></div>
      <div className="mt-5 flex flex-wrap gap-2">
        {state === "waiting_manager" ? <button disabled={saving} onClick={() => void update("accept")} className="rounded-xl bg-cyan-300 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50">Принять</button> : null}
        {state === "manager_active" ? <button disabled={saving} onClick={() => void update("", "resolved")} className="rounded-xl bg-emerald-300 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50">Решено</button> : null}
        {state === "resolved" ? <button disabled={saving} onClick={() => void update("", "closed")} className="rounded-xl border border-white/15 px-3 py-2 text-sm text-white disabled:opacity-50">Закрыть</button> : null}
        {!ticket.requester_user_id && !ticket.anonymous_access_revoked_at ? <button disabled={saving} onClick={() => void update("revoke_anonymous")} className="rounded-xl border border-rose-300/40 px-3 py-2 text-sm text-rose-200 disabled:opacity-50">Отозвать ссылку доступа</button> : null}
        <button disabled={saving} onClick={() => setInternal(!internal)} className={`rounded-xl border px-3 py-2 text-sm ${internal ? "border-amber-300/60 text-amber-200" : "border-white/15 text-slate-200"}`}>{internal ? "Внутренняя заметка" : "Ответ клиенту"}</button>
      </div>
      <dl className="mt-6 grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-slate-500">Клиент</dt><dd className="text-white">{ticket.requester_name || "Гость"}</dd></div><div><dt className="text-slate-500">Контакт</dt><dd className="text-white">{ticket.requester_email || ticket.requester_phone || "Не указан"}</dd></div></dl>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-slate-500">AI intent / action</dt><dd className="text-white">{ticket.ai?.intent || "—"} / {ticket.ai?.action || "—"}</dd></div><div><dt className="text-slate-500">AI result</dt><dd className="text-white">{ticket.ai?.action_result || "—"} · fallback {ticket.ai?.fallback_used ? "yes" : "no"}</dd></div><div><dt className="text-slate-500">Квартира</dt><dd className="text-white">{ticket.apartment_id || "Не связана"}</dd></div><div><dt className="text-slate-500">Бронирование / task</dt><dd className="text-white">{ticket.booking_id || "Не связано"} / {ticket.ai?.task_reference || "—"}</dd></div></dl>
      <div className="mt-6 rounded-xl bg-white/5 p-4"><p className="text-xs uppercase tracking-wide text-slate-500">Сообщение клиента</p><p className="mt-2 whitespace-pre-wrap text-slate-200">{ticket.customer_message}</p></div>
      <div className="mt-4 rounded-xl bg-cyan-300/5 p-4"><p className="text-xs uppercase tracking-wide text-slate-500">Conversation summary</p><p className="mt-2 text-slate-200">{ticket.conversation_summary || ticket.ai_summary || "Нет summary"}</p></div>
      {ticket.support_messages?.map((message, index) => <div key={`${message.created_at}-${index}`} className={`mt-4 rounded-xl p-3 ${message.is_internal ? "bg-amber-300/10" : "bg-white/5"}`}><p className="text-xs text-slate-500">{message.is_internal ? "internal note" : message.sender_type}</p><p className="mt-1 whitespace-pre-wrap text-sm text-slate-200">{message.message}</p></div>)}
      <textarea value={reply} onChange={(event) => setReply(event.target.value)} placeholder={internal ? "Заметка для команды" : "Ответить клиенту"} aria-label={internal ? "Заметка для команды" : "Ответить клиенту"} className="mt-6 min-h-28 w-full rounded-xl border border-white/10 bg-slate-950/60 p-3 text-sm text-white" />
      <button disabled={saving || !reply.trim()} onClick={() => void sendReply()} className="mt-2 rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50">{internal ? "Добавить заметку" : "Отправить ответ"}</button>{failedReply ? <button disabled={saving} onClick={() => void sendReply(failedReply)} className="mt-2 ml-2 rounded-xl border border-rose-300/40 px-4 py-2 text-sm text-rose-200 disabled:opacity-50">Повторить отправку</button> : null}{replyStatus === "sending" || replyStatus === "retrying" ? <p className="mt-2 text-xs text-slate-500">Отправляется...</p> : replyStatus === "sent" ? <p className="mt-2 text-xs text-emerald-300">Сохранено</p> : null}
    </div>
  </div>;
}
