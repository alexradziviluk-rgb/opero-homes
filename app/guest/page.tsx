"use client";

import Link from "next/link";
import { useCurrentUser } from "@/components/auth/current-user-provider";

export default function GuestHomePage() {
  const { currentUser } = useCurrentUser();

  return (
    <section>
      <h1 className="text-2xl font-semibold text-white">Добро пожаловать, {currentUser?.firstName ?? "Гость"}</h1>
      <p className="mt-2 text-sm text-slate-300">Личный кабинет для ваших бронирований и поиска жилья.</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Link href="/guest/bookings" className="rounded-2xl border border-white/10 bg-slate-900/80 p-5 hover:border-cyan-300/40">
          <p className="text-lg font-semibold text-white">Мои бронирования</p>
          <p className="mt-2 text-sm text-slate-400">Даты, статус оплаты и инструкции</p>
        </Link>

        <Link href="/" className="rounded-2xl border border-white/10 bg-slate-900/80 p-5 hover:border-cyan-300/40">
          <p className="text-lg font-semibold text-white">Найти жилье</p>
          <p className="mt-2 text-sm text-slate-400">Каталог опубликованных объектов</p>
        </Link>

        <Link href="/guest/profile" className="rounded-2xl border border-white/10 bg-slate-900/80 p-5 hover:border-cyan-300/40">
          <p className="text-lg font-semibold text-white">Профиль</p>
          <p className="mt-2 text-sm text-slate-400">Имя, контакты и адрес проживания</p>
        </Link>
      </div>
    </section>
  );
}
