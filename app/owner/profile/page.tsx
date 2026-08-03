"use client";

import Link from "next/link";
import { useCurrentUser } from "@/components/auth/current-user-provider";

export default function OwnerProfilePage() {
  const { currentUser } = useCurrentUser();
  return <main className="min-h-screen bg-slate-950 px-5 py-8 text-slate-100"><div className="mx-auto max-w-2xl"><Link href="/owner" className="text-sm text-cyan-300">Назад к квартирам</Link><h1 className="mt-8 text-3xl font-semibold">Профиль</h1><div className="mt-6 space-y-4 rounded-2xl border border-white/10 bg-slate-900 p-6"><p><span className="text-slate-400">Имя</span><br />{currentUser?.firstName} {currentUser?.lastName}</p><p><span className="text-slate-400">Email</span><br />{currentUser?.email}</p><p><span className="text-slate-400">Телефон</span><br />{currentUser?.phone || "Не указан"}</p></div></div></main>;
}
