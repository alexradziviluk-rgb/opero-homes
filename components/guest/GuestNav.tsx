"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCurrentUser } from "@/components/auth/current-user-provider";

const items = [
  { href: "/", label: "Найти жилье" },
];

export default function GuestNav() {
  const pathname = usePathname();
  const { currentUser, hasPropertyAccess, logout } = useCurrentUser();
  const isGuestUser = currentUser?.role === "Гость";
  const isStaffUser = Boolean(currentUser && !isGuestUser);

  return (
    <header className="border-b border-white/10 bg-slate-950/80 px-4 py-4 backdrop-blur sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">Opero Homes</p>
          <p className="text-sm text-slate-300">Каталог и бронирование</p>
        </div>

        <nav className="flex flex-wrap items-center gap-2">
          {isGuestUser ? (
            <Link
              href="/guest/profile"
              className={`rounded-xl px-3 py-2 text-sm ${pathname === "/guest/profile" ? "bg-cyan-500/20 text-cyan-200" : "text-slate-300 hover:bg-white/10"}`}
            >
              Профиль
            </Link>
          ) : isStaffUser ? (
            <Link
              href="/admin"
              className="rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-200 hover:bg-cyan-500/20"
            >
              Панель управления
            </Link>
          ) : (
            <>
              <Link
                href="/guest/login"
                className="rounded-xl px-3 py-2 text-sm text-slate-300 hover:bg-white/10"
              >
                Вход для гостей
              </Link>
              <Link
                href="/login"
                className="rounded-xl px-3 py-2 text-sm text-slate-300 hover:bg-white/10"
              >
                Вход для сотрудников
              </Link>
              <Link
                href="/guest/register"
                className="rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-300 hover:bg-white/10"
              >
                Регистрация
              </Link>
            </>
          )}

          {items.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-xl px-3 py-2 text-sm ${active ? "bg-cyan-500/20 text-cyan-200" : "text-slate-300 hover:bg-white/10"}`}
              >
                {item.label}
              </Link>
            );
          })}
          {isGuestUser ? (
            <Link
              href="/guest/bookings"
              className={`rounded-xl px-3 py-2 text-sm ${pathname === "/guest/bookings" ? "bg-cyan-500/20 text-cyan-200" : "text-slate-300 hover:bg-white/10"}`}
            >
              Мои бронирования
            </Link>
          ) : null}
          {isGuestUser ? (
            <Link href="/account" className={`rounded-xl px-3 py-2 text-sm ${pathname === "/account" ? "bg-cyan-500/20 text-cyan-200" : "text-slate-300 hover:bg-white/10"}`}>
              Мой аккаунт
            </Link>
          ) : null}
          {isGuestUser && hasPropertyAccess ? (
            <Link href="/account/properties" className={`rounded-xl px-3 py-2 text-sm ${pathname.startsWith("/account/properties") ? "bg-cyan-500/20 text-cyan-200" : "text-slate-300 hover:bg-white/10"}`}>
              Моя недвижимость
            </Link>
          ) : null}
          {isGuestUser ? (
            <button
              type="button"
              onClick={() => void logout()}
              className="rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-300 hover:bg-white/10"
            >
              Выйти
            </button>
          ) : null}
          {isStaffUser ? (
            <button
              type="button"
              onClick={() => void logout()}
              className="rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-300 hover:bg-white/10"
            >
              Выйти
            </button>
          ) : null}
        </nav>
      </div>
    </header>
  );
}
