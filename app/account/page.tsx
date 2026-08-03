"use client";

import Link from "next/link";
import { useCurrentUser } from "@/components/auth/current-user-provider";

export default function AccountPage() {
  const { currentUser, hasPropertyAccess } = useCurrentUser();
  return (
    <section>
      <h1 className="text-2xl font-semibold text-white">Мой аккаунт</h1>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link href="/account/bookings" className="rounded-2xl border border-white/10 bg-slate-900/80 p-5">
          <p className="text-lg font-semibold text-white">Мои поездки</p>
          <p className="mt-2 text-sm text-slate-400">Заявки и бронирования</p>
        </Link>
        {hasPropertyAccess ? (
          <Link href="/account/properties" className="rounded-2xl border border-cyan-400/30 bg-cyan-500/10 p-5">
            <p className="text-lg font-semibold text-white">Моя недвижимость</p>
            <p className="mt-2 text-sm text-slate-300">Связанные с аккаунтом объекты</p>
          </Link>
        ) : null}
        <Link href="/guest/profile" className="rounded-2xl border border-white/10 bg-slate-900/80 p-5">
          <p className="text-lg font-semibold text-white">Профиль</p>
          <p className="mt-2 text-sm text-slate-400">{currentUser?.email ?? "Контакты аккаунта"}</p>
        </Link>
      </div>
    </section>
  );
}