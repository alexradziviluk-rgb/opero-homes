"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import BookingCalendar from "@/components/booking/BookingCalendar";
import { normalizeBlockPeriod, type CanonicalAvailabilityPeriod } from "@/lib/bookings/canonical-availability";

type Period = { apartment_id: string; start_date: string; end_date: string; status: "occupied" | "blocked" };
type Block = { id: string; apartmentId: string; startDate: string; endDate: string; reasonCode: string; guestName: string | null; guestCount: number | null; comment: string | null; status: string };

export default function OwnerCalendarClient() {
  const params = useParams<{ id: string }>();
  const apartmentId = params.id;
  const [occupied, setOccupied] = useState<Period[]>([]);
  const [blocked, setBlocked] = useState<Period[]>([]);
  const [ownBlocks, setOwnBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reasonCode, setReasonCode] = useState("owner_stay");
  const [guestName, setGuestName] = useState("");
  const [guestCount, setGuestCount] = useState("");
  const [comment, setComment] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [response, canonicalResponse] = await Promise.all([
      fetch(`/api/owner/properties/${apartmentId}/blocks`, { cache: "no-store" }),
      fetch(`/api/availability/calendar/${apartmentId}`, { cache: "no-store" }),
    ]);
    const result = await response.json();
    const canonicalResult = await canonicalResponse.json();
    if (!response.ok || !result.ok || !canonicalResponse.ok || !canonicalResult.ok) setError(result.error ?? canonicalResult.error ?? "Не удалось загрузить календарь");
    else {
      const periods = canonicalResult.data as Array<{ apartmentId: string; startDate: string; endDate: string; kind: string; status: string }>;
      setOccupied(periods.filter((period) => period.kind === "customer_booking").map((period) => ({ apartment_id: period.apartmentId, start_date: period.startDate, end_date: period.endDate, status: "occupied" as const })));
      setBlocked(periods.filter((period) => period.kind !== "customer_booking").map((period) => ({ apartment_id: period.apartmentId, start_date: period.startDate, end_date: period.endDate, status: "blocked" as const })));
      setOwnBlocks(result.data.ownBlocks ?? []);
    }
    setLoading(false);
  }, [apartmentId]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const periods = useMemo<CanonicalAvailabilityPeriod[]>(() => [
    ...occupied.map((period) => ({ id: `booking-${period.start_date}`, apartmentId: period.apartment_id, startDate: period.start_date, endDate: period.end_date, kind: "customer_booking" as const, status: period.status })),
    ...blocked.map((period) => normalizeBlockPeriod({ id: `block-${period.start_date}`, apartment_id: period.apartment_id, start_date: period.start_date, end_date: period.end_date, block_source: "owner", status: period.status })),
  ], [blocked, occupied]);

  function resetForm() { setEditingId(null); setStartDate(""); setEndDate(""); setReasonCode("owner_stay"); setGuestName(""); setGuestCount(""); setComment(""); }
  function editBlock(block: Block) { setEditingId(block.id); setStartDate(block.startDate); setEndDate(block.endDate); setReasonCode(block.reasonCode); setGuestName(block.guestName ?? ""); setGuestCount(block.guestCount ? String(block.guestCount) : ""); setComment(block.comment ?? ""); setMessage(""); setError(""); document.getElementById("block-form")?.scrollIntoView({ behavior: "smooth" }); }

  async function saveBlock(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError(""); setMessage("");
    const response = await fetch(`/api/owner/properties/${apartmentId}/blocks`, { method: editingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ blockId: editingId, startDate, endDate, reasonCode, guestName, guestCount: guestCount ? Number(guestCount) : null, comment }) });
    const result = await response.json();
    if (!response.ok || !result.ok) setError(result.error ?? "Не удалось сохранить блокировку");
    else { setMessage("Ваша блокировка сохранена. Даты больше недоступны для бронирования."); resetForm(); await load(); }
    setSaving(false);
  }

  async function removeBlock(blockId: string) {
    if (!window.confirm("Удалить эту будущую блокировку? Даты снова станут доступны для бронирования.")) return;
    setSaving(true); setError("");
    const response = await fetch(`/api/owner/properties/${apartmentId}/blocks?blockId=${encodeURIComponent(blockId)}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok || !result.ok) setError(result.error ?? "Не удалось удалить блокировку");
    else { setMessage("Блокировка удалена."); await load(); }
    setSaving(false);
  }

  return <main className="min-h-screen bg-slate-950 px-5 py-8 text-slate-100"><div className="mx-auto max-w-6xl"><Link href="/owner" className="text-sm text-cyan-300">Назад к квартирам</Link><div className="mt-6"><p className="text-sm uppercase tracking-[0.25em] text-cyan-300">Календарь</p><h1 className="mt-2 text-3xl font-semibold">Доступность квартиры</h1><p className="mt-2 text-sm text-slate-400">Занято клиентом, занято вашей блокировкой или свободно.</p></div>
    {loading ? <p className="mt-8 text-slate-400">Загрузка календаря...</p> : <div className="mt-8"><BookingCalendar apartmentId={apartmentId} periods={periods} startDate={startDate} endDate={endDate} capabilities={{ canCreateOwnerBlock: true, canSeeOperationalDetails: true }} actionLabel="Заблокировать даты" onChange={({ startDate: nextStart, endDate: nextEnd }) => { setStartDate(nextStart); setEndDate(nextEnd); setError(""); }} onAction={() => document.getElementById("block-form")?.scrollIntoView({ behavior: "smooth" })} onConflict={(conflict) => setError(conflict)} /></div>}
    <section id="block-form" className="mt-8 rounded-2xl border border-white/10 bg-slate-900 p-5"><h2 className="text-xl font-semibold">{editingId ? "Изменить свою блокировку" : "Заблокировать даты"}</h2><form onSubmit={saveBlock} className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-sm text-slate-300">Дата заезда<input required type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white" /></label><label className="text-sm text-slate-300">Дата выезда<input required type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white" /></label><label className="text-sm text-slate-300">Имя гостя<input value={guestName} onChange={(event) => setGuestName(event.target.value)} placeholder="Необязательно" className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white" /></label><label className="text-sm text-slate-300">Количество гостей<input min="1" type="number" value={guestCount} onChange={(event) => setGuestCount(event.target.value)} placeholder="Необязательно" className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white" /></label><label className="text-sm text-slate-300 sm:col-span-2">Комментарий<textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Необязательно" className="mt-1 min-h-20 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white" /></label><div className="flex gap-2 sm:col-span-2"><button type="submit" disabled={saving} className="rounded-xl bg-cyan-400 px-4 py-2 font-semibold text-slate-950 disabled:opacity-50">{saving ? "Сохраняем..." : editingId ? "Сохранить изменения" : "Заблокировать даты"}</button>{editingId ? <button type="button" onClick={resetForm} className="rounded-xl border border-white/10 px-4 py-2">Отмена</button> : null}</div></form>{error ? <p className="mt-4 text-sm text-rose-300">{error}</p> : null}{message ? <p className="mt-4 text-sm text-emerald-300">{message}</p> : null}</section>
    <section className="mt-6 rounded-2xl border border-white/10 bg-slate-900 p-5"><h2 className="text-xl font-semibold">Мои блокировки</h2><div className="mt-4 space-y-3">{ownBlocks.filter((block) => block.status === "active").length === 0 ? <p className="text-sm text-slate-400">Активных блокировок нет.</p> : ownBlocks.filter((block) => block.status === "active").map((block) => <div key={block.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 p-3"><div><p className="font-medium">{block.startDate} — {block.endDate}</p><p className="text-sm text-slate-400">{block.guestName ? `Гость: ${block.guestName}` : "Без имени гостя"}{block.guestCount ? ` · ${block.guestCount} гостей` : ""}{block.comment ? ` · ${block.comment}` : ""}</p></div><div className="flex gap-2"><button type="button" onClick={() => editBlock(block)} className="rounded-lg border border-white/10 px-3 py-1 text-sm">Изменить</button><button type="button" disabled={saving} onClick={() => void removeBlock(block.id)} className="rounded-lg border border-rose-400/30 px-3 py-1 text-sm text-rose-300">Отменить</button></div></div>)}</div></section>
  </div></main>;
}
