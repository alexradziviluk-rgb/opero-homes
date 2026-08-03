"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type Owner = { userId: string | null; status: string; firstName: string; lastName: string; email: string; phone: string | null };
type Invitation = { invitationId: string; email: string; firstName: string; apartmentIds: string[]; deliveryStatus: string; expiresAt: string };

export default function ApartmentOwnersPage() {
  const { id } = useParams<{ id: string }>();
  const [owners, setOwners] = useState<Owner[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reinviting, setReinviting] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const [ownersResponse, invitationsResponse] = await Promise.all([
      fetch(`/api/owner/relations?apartmentId=${encodeURIComponent(id)}`, { cache: "no-store" }),
      fetch("/api/owner/invitations", { cache: "no-store" }),
    ]);
    const ownersResult = await ownersResponse.json();
    const invitationsResult = await invitationsResponse.json();
    if (ownersResponse.ok && ownersResult.ok) setOwners(ownersResult.data);
    else setError(ownersResult.error ?? "Не удалось загрузить собственников");
    if (invitationsResponse.ok && invitationsResult.ok) {
      setInvitations((invitationsResult.data ?? []).filter((invitation: Invitation) => invitation.apartmentIds.includes(id)));
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function invite(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true); setError(""); setMessage("");
    const response = await fetch("/api/owner/invitations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, apartmentIds: [id] }) });
    const result = await response.json();
    if (!response.ok || !result.ok) setError(result.error ?? "Не удалось отправить приглашение");
    else { setMessage("Приглашение отправлено."); setForm({ firstName: "", lastName: "", email: "", phone: "" }); await load(); }
    setSaving(false);
  }

  async function reinvite(invitation: Invitation) {
    setReinviting(invitation.invitationId); setError(""); setMessage("");
    const response = await fetch(`/api/owner/invitations/${invitation.invitationId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "resend" }) });
    const result = await response.json();
    if (!response.ok || !result.ok) setError(result.error ?? "Не удалось повторно отправить приглашение");
    else { setMessage("Новое приглашение отправлено."); await load(); }
    setReinviting(null);
  }

  async function changeAccess(owner: Owner, action: "pause" | "restore" | "remove") {
    if (!owner.userId) return;
    if (action === "remove" && !window.confirm("Удалить связь с квартирой? Auth-пользователь останется в системе.")) return;
    setSaving(true); setError("");
    const response = await fetch(`/api/owner/invitations/${owner.userId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, apartmentId: id, userId: owner.userId }) });
    const result = await response.json();
    if (!response.ok || !result.ok) setError(result.error ?? "Не удалось изменить доступ"); else await load();
    setSaving(false);
  }

  return (
    <main className="min-h-screen bg-slate-950 px-5 py-8 text-slate-100">
      <div className="mx-auto max-w-4xl">
        <Link href={`/apartments/${id}`} className="text-sm text-cyan-300">Назад к объекту</Link>
        <h1 className="mt-7 text-3xl font-semibold">Собственники</h1>
        <section className="mt-6 rounded-2xl border border-white/10 bg-slate-900 p-5">
          <h2 className="text-xl font-semibold">Пригласить собственника</h2>
          <form onSubmit={invite} className="mt-4 grid gap-3 sm:grid-cols-2">
            <input required placeholder="Имя" value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2" />
            <input placeholder="Фамилия" value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2" />
            <input required type="email" placeholder="Email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2" />
            <input placeholder="Телефон (необязательно)" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2" />
            <button disabled={saving} className="rounded-xl bg-cyan-400 px-4 py-2 font-semibold text-slate-950 disabled:opacity-50 sm:col-span-2">{saving ? "Отправляем..." : "Отправить приглашение"}</button>
          </form>
          {message ? <p className="mt-3 text-sm text-emerald-300">{message}</p> : null}
          {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}
        </section>
        <section className="mt-6 rounded-2xl border border-white/10 bg-slate-900 p-5">
          <h2 className="text-xl font-semibold">Ожидающие приглашения</h2>
          {invitations.length === 0 ? <p className="mt-4 text-sm text-slate-400">Ожидающих приглашений нет.</p> : <div className="mt-4 space-y-3">{invitations.map((invitation) => <div key={invitation.invitationId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 p-3"><div><p>{invitation.email}</p><p className="text-sm text-slate-400">До {new Date(invitation.expiresAt).toLocaleString("ru-RU")}</p></div><button disabled={reinviting === invitation.invitationId} onClick={() => void reinvite(invitation)} className="rounded-lg border border-cyan-300/40 px-3 py-2 text-sm text-cyan-200 disabled:opacity-50">{reinviting === invitation.invitationId ? "Отправляем..." : "Повторить приглашение"}</button></div>)}</div>}
        </section>
        <section className="mt-6 rounded-2xl border border-white/10 bg-slate-900 p-5">
          <h2 className="text-xl font-semibold">Связанные собственники</h2>
          {loading ? <p className="mt-4 text-slate-400">Загрузка...</p> : <div className="mt-4 space-y-3">{owners.length === 0 ? <p className="text-sm text-slate-400">Собственники ещё не добавлены.</p> : owners.map((owner) => <div key={`${owner.userId ?? owner.email}-${owner.status}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 p-3"><div><p>{owner.firstName} {owner.lastName}</p><p className="text-sm text-slate-400">{owner.email} · {owner.status}</p></div>{owner.userId ? <div className="flex gap-2"><button disabled={saving} onClick={() => void changeAccess(owner, owner.status === "paused" ? "restore" : "pause")} className="rounded-lg border border-white/20 px-3 py-2 text-sm">{owner.status === "paused" ? "Возобновить" : "Пауза"}</button><button disabled={saving} onClick={() => void changeAccess(owner, "remove")} className="rounded-lg border border-rose-300/40 px-3 py-2 text-sm text-rose-200">Отозвать</button></div> : null}</div>)}</div>}
        </section>
      </div>
    </main>
  );
}
