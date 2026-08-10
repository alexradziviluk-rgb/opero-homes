"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

type Period = { start_date: string; end_date: string; status: "occupied" | "blocked" };
type Block = { id: string; start_date: string; end_date: string; reason_code: string; guestName: string | null; guestCount: number | null; comment: string | null; status: string };

function dateKey(date: Date) { return date.toISOString().slice(0, 10); }
function displayDate(value: string) { return new Date(`${value}T00:00:00`).toLocaleDateString("ru-RU"); }
function isInPeriod(day: string, period: Period) { return day >= period.start_date && day < period.end_date; }

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
    const response = await fetch(`/api/owner/properties/${apartmentId}/blocks`, { cache: "no-store" });
    const result = await response.json();
    if (!response.ok || !result.ok) setError(result.error ?? "Не удалось загрузить календарь");
    else { setOccupied(result.data.occupied ?? []); setBlocked(result.data.blocked ?? []); setOwnBlocks(result.data.ownBlocks ?? []); }
    setLoading(false);
  }, [apartmentId]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const days = useMemo(() => Array.from({ length: 90 }, (_, index) => { const day = new Date(); day.setHours(0, 0, 0, 0); day.setDate(day.getDate() + index); return dateKey(day); }), []);

  function resetForm() { setEditingId(null); setStartDate(""); setEndDate(""); setReasonCode("owner_stay"); setGuestName(""); setGuestCount(""); setComment(""); }
  function editBlock(block: Block) { setEditingId(block.id); setStartDate(block.start_date); setEndDate(block.end_date); setReasonCode(block.reason_code); setGuestName(block.guestName ?? ""); setGuestCount(block.guestCount ? String(block.guestCount) : ""); setComment(block.comment ?? ""); setMessage(""); setError(""); }

  async function saveBlock(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError(""); setMessage("");
    const response = await fetch(`/api/owner/properties/${apartmentId}/blocks`, { method: editingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ blockId: editingId, startDate, endDate, reasonCode, guestName, guestCount: guestCount ? Number(guestCount) : null, comment }) });
    const result = await response.json();
    if (!response.ok || !result.ok) setError(result.error ?? "Не удалось сохранить блокировку");
    else { setMessage("Ваша бронь сохранена. Даты больше недоступны для бронирования."); resetForm(); await load(); }
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

  return <main className="min-h-screen bg-slate-950 px-5 py-8 text-slate-100"><div className="mx-auto max-w-6xl"><Link href="/owner" className="text-sm text-cyan-300">Назад к квартирам</Link><div className="mt-6 flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm uppercase tracking-[0.25em] text-cyan-300">Календарь</p><h1 className="mt-2 text-3xl font-semibold">Доступность квартиры</h1><p className="mt-2 text-sm text-slate-400">Занято клиентом, занято вашей бронью или свободно.</p></div><button type="button" onClick={() => { resetForm(); document.getElementById("block-form")?.scrollIntoView({ behavior: "smooth" }); }} className="rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950">Добавить свою бронь</button></div>
    {loading ? <p className="mt-8 text-slate-400">Загрузка календаря...</p> : <><div className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-5 md:grid-cols-7">{days.map((day) => { const occupiedDay = occupied.some((period) => isInPeriod(day, period)); const blockedDay = blocked.some((period) => isInPeriod(day, period)); const state = occupiedDay ? "Занято" : blockedDay ? "Моя блокировка" : "Свободно"; return <div key={day} className={`min-h-20 rounded-xl border p-2 text-xs ${occupiedDay ? "border-rose-400/30 bg-rose-950/40" : blockedDay ? "border-amber-400/30 bg-amber-950/40" : "border-emerald-400/20 bg-emerald-950/20"}`}><div className="font-semibold">{displayDate(day)}</div><div className="mt-2 text-slate-300">{state}</div></div>; })}</div><div className="mt-5 flex flex-wrap gap-4 text-sm text-slate-300"><span><b className="text-emerald-300">●</b> Свободно</span><span><b className="text-rose-300">●</b> Занято</span><span><b className="text-amber-300">●</b> Моя блокировка</span></div></>}
    <section id="block-form" className="mt-10 rounded-2xl border border-white/10 bg-slate-900 p-5"><h2 className="text-xl font-semibold">{editingId ? "Изменить свою бронь" : "Добавить свою бронь"}</h2><form onSubmit={saveBlock} className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-sm text-slate-300">Дата заезда<input required type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white" /></label><label className="text-sm text-slate-300">Дата выезда<input required type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white" /></label><label className="text-sm text-slate-300">Имя гостя<input value={guestName} onChange={(event) => setGuestName(event.target.value)} placeholder="Необязательно" className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white" /></label><label className="text-sm text-slate-300">Количество гостей<input min="1" type="number" value={guestCount} onChange={(event) => setGuestCount(event.target.value)} placeholder="Необязательно" className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white" /></label><label className="text-sm text-slate-300 sm:col-span-2">Комментарий<textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Необязательно" className="mt-1 min-h-20 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white" /></label><div className="flex gap-2 sm:col-span-2"><button type="submit" disabled={saving} className="rounded-xl bg-cyan-400 px-4 py-2 font-semibold text-slate-950 disabled:opacity-50">{saving ? "Сохраняем..." : editingId ? "Сохранить изменения" : "Добавить бронь"}</button>{editingId ? <button type="button" onClick={resetForm} className="rounded-xl border border-white/10 px-4 py-2">Отмена</button> : null}</div></form>{error ? <p className="mt-4 text-sm text-rose-300">{error}</p> : null}{message ? <p className="mt-4 text-sm text-emerald-300">{message}</p> : null}</section>
    <section className="mt-6 rounded-2xl border border-white/10 bg-slate-900 p-5"><h2 className="text-xl font-semibold">Мои брони</h2><div className="mt-4 space-y-3">{ownBlocks.length === 0 ? <p className="text-sm text-slate-400">Активных броней нет.</p> : ownBlocks.filter((block) => block.status === "active").map((block) => <div key={block.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 p-3"><div><p className="font-medium">{displayDate(block.start_date)} — {displayDate(block.end_date)}</p><p className="text-sm text-slate-400">{block.guestName ? `Гость: ${block.guestName}` : "Без имени гостя"}{block.guestCount ? ` · ${block.guestCount} гостей` : ""}{block.comment ? ` · ${block.comment}` : ""}</p></div><div className="flex gap-2"><button type="button" onClick={() => editBlock(block)} className="rounded-lg border border-white/10 px-3 py-1 text-sm">Изменить</button><button type="button" disabled={saving} onClick={() => void removeBlock(block.id)} className="rounded-lg border border-rose-400/30 px-3 py-1 text-sm text-rose-300">Отменить</button></div></div>)}</div></section>
  </div></main>;
}
