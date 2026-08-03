"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

type Property = { id: string; name: string; city: string | null; district: string | null; address: string | null; coverPhotoUrl: string | null; upcomingOccupied: { startDate: string; endDate: string; status: string }[] };

export default function AccountPropertiesClient() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [error, setError] = useState("");
  useEffect(() => { void fetch("/api/owner/properties", { cache: "no-store" }).then(async (response) => { const result = await response.json(); if (!response.ok || !result.ok) throw new Error(result.error ?? "Не удалось загрузить объекты"); setProperties(result.data ?? []); }).catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить объекты")); }, []);
  return <main className="min-h-screen bg-slate-950 px-5 py-8 text-slate-100 sm:px-8"><div className="mx-auto max-w-5xl"><div className="flex flex-wrap gap-4 text-sm"><Link href="/account" className="text-cyan-300">Мой аккаунт</Link><Link href="/" className="text-emerald-300">Найти жильё для поездки</Link></div><h1 className="mt-6 text-3xl font-semibold">Моя недвижимость</h1><p className="mt-2 text-sm text-slate-400">Только связанные с вашим аккаунтом объекты.</p>{error ? <p className="mt-6 text-rose-300">{error}</p> : null}<div className="mt-6 grid gap-5 md:grid-cols-2">{properties.map((property) => <article key={property.id} className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900">{property.coverPhotoUrl ? <Image src={property.coverPhotoUrl} alt="" width={800} height={384} className="h-48 w-full object-cover" /> : <div className="h-48 bg-slate-800" />}<div className="p-5"><h2 className="text-xl font-semibold">{property.name}</h2><p className="mt-1 text-sm text-slate-400">{[property.city, property.district, property.address].filter(Boolean).join(", ") || "Адрес не указан"}</p><p className="mt-4 text-sm text-slate-300">Будущие занятые периоды: {property.upcomingOccupied.length || "нет"}</p><Link href={`/account/properties/${property.id}/calendar`} className="mt-5 inline-flex rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950">Открыть календарь</Link></div></article>)}</div></div></main>;
}