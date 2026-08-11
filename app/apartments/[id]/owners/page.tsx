"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type Owner = { guestId: string | null; userId: string | null; ownerPublicNumber: string | null; status: string; firstName: string; lastName: string; email: string; phone: string | null };
type SearchOwner = { guest_id: string; user_id: string | null; owner_public_number: string | null; owner_name: string; owner_email: string; owner_phone: string | null; apartment_count: number };

export default function ApartmentOwnersPage() {
  const { id } = useParams<{ id: string }>();
  const [owners, setOwners] = useState<Owner[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [lookup, setLookup] = useState("");
  const [searchResults, setSearchResults] = useState<SearchOwner[]>([]);
  const [assigning, setAssigning] = useState<string | null>(null);

  const load = useCallback(async () => {
    const ownersResponse = await fetch(`/api/owner/relations?apartmentId=${encodeURIComponent(id)}`, { cache: "no-store" });
    const ownersResult = await ownersResponse.json();
    if (ownersResponse.ok && ownersResult.ok) setOwners(ownersResult.data);
    else setError(ownersResult.error ?? "Не удалось загрузить собственников");
    setLoading(false);
  }, [id]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function changeAccess(owner: Owner, action: "pause" | "restore" | "remove") {
    if (!owner.userId && !owner.guestId) return;
    if (action === "remove" && !window.confirm("Отменить связь собственника с квартирой? Auth-пользователь останется в системе.")) return;
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/owner/invitations/${owner.userId ?? owner.guestId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, apartmentId: id, userId: owner.userId, guestId: owner.guestId }) });
      const result = await response.json();
      if (!response.ok || !result.ok) setError(result.error ?? "Не удалось изменить доступ");
      else { setMessage(action === "remove" ? "Связь собственника с квартирой отменена." : "Доступ собственника обновлён."); await load(); }
    } catch {
      setError("Не удалось изменить связь. Проверьте соединение и повторите попытку.");
    } finally {
      setSaving(false);
    }
  }

  async function searchOwners(event: React.FormEvent) {
    event.preventDefault(); setError(""); setMessage(""); setSearchResults([]);
    try {
      const response = await fetch(`/api/owner/directory?q=${encodeURIComponent(lookup.trim())}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok || !result.ok) setError(result.error ?? "Не удалось найти собственника");
      else if (!result.data?.length) setError("Клиент с таким email не найден.");
      else setSearchResults(result.data);
    } catch {
      setError("Не удалось найти собственника. Проверьте соединение и повторите попытку.");
    }
  }

  async function assignOwner(owner: SearchOwner) {
    setAssigning(owner.guest_id); setError("");
    try {
      const response = await fetch("/api/owner/directory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apartmentId: id, guestId: owner.guest_id }) });
      const result = await response.json();
      if (!response.ok || !result.ok) setError(result.error ?? "Не удалось привязать собственника"); else { setMessage(result.data?.notificationSent === false ? "Собственник привязан к объекту, но письмо-подтверждение отправить не удалось." : "Собственник привязан к объекту. Письмо-подтверждение отправлено."); setSearchResults([]); setLookup(""); await load(); }
    } catch {
      setError("Не удалось привязать собственника. Проверьте соединение и повторите попытку.");
    } finally {
      setAssigning(null);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-5 py-8 text-slate-100">
      <div className="mx-auto max-w-4xl">
        <Link href={`/apartments/${id}`} className="text-sm text-cyan-300">Назад к объекту</Link>
        <h1 className="mt-7 text-3xl font-semibold">Собственники</h1>
        <section className="mt-6 rounded-2xl border border-white/10 bg-slate-900 p-5">
          <h2 className="text-xl font-semibold">Привязать существующего собственника</h2>
          <form onSubmit={searchOwners} className="mt-4 flex flex-wrap gap-3">
            <input value={lookup} onChange={(event) => setLookup(event.target.value)} placeholder="OWN-0001, email или телефон" className="min-w-64 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2" />
            <button className="rounded-xl border border-cyan-300/40 px-4 py-2 text-cyan-200">Найти</button>
          </form>
          {searchResults.length > 0 ? <div className="mt-4 space-y-3">{searchResults.map((owner) => <div key={owner.guest_id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 p-3"><div><p>{owner.owner_name} {owner.owner_public_number ? `· ${owner.owner_public_number}` : ""}</p><p className="text-sm text-slate-400">{owner.owner_email}{owner.owner_phone ? ` · ${owner.owner_phone}` : ""} · объектов: {owner.apartment_count}</p></div><button disabled={assigning === owner.guest_id} onClick={() => void assignOwner(owner)} className="rounded-lg bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50">{assigning === owner.guest_id ? "Привязываем..." : "Привязать"}</button></div>)}</div> : null}
        </section>
        <section className="mt-6 rounded-2xl border border-white/10 bg-slate-900 p-5">
          <h2 className="text-xl font-semibold">Связанные собственники</h2>
          {loading ? <p className="mt-4 text-slate-400">Загрузка...</p> : <div className="mt-4 space-y-3">{owners.length === 0 ? <p className="text-sm text-slate-400">Собственники ещё не добавлены.</p> : owners.map((owner) => <div key={`${owner.guestId ?? owner.userId ?? owner.email}-${owner.status}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 p-3"><div><p>{owner.firstName} {owner.lastName} {owner.ownerPublicNumber ? `· ${owner.ownerPublicNumber}` : ""}</p><p className="text-sm text-slate-400">{owner.email} · {owner.status}</p></div>{owner.userId || owner.guestId ? <div className="flex gap-2"><button disabled={saving} onClick={() => void changeAccess(owner, owner.status === "paused" ? "restore" : "pause")} className="rounded-lg border border-white/20 px-3 py-2 text-sm">{owner.status === "paused" ? "Возобновить" : "Пауза"}</button><button disabled={saving} onClick={() => void changeAccess(owner, "remove")} className="rounded-lg border border-rose-300/40 px-3 py-2 text-sm text-rose-200">Отменить связь</button></div> : null}</div>)}</div>}
          {message ? <p className="mt-3 text-sm text-emerald-300">{message}</p> : null}
          {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}
        </section>
      </div>
    </main>
  );
}
