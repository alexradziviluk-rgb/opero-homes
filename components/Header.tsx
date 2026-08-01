"use client";

import Link from "next/link";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import NotificationBell from "@/components/notifications/NotificationBell";
import LanguageSwitcher, { useLanguage } from "@/components/LanguageSwitcher";

type HeaderProps = {
  showSearch?: boolean;
  showNewListing?: boolean;
  newListingLabel?: string;
};

export default function Header({ showSearch = true, showNewListing = true, newListingLabel = "+ Добавить объект" }: HeaderProps) {
  const { currentUser, currentUserContext, logout } = useCurrentUser();
  const [language, setLanguage] = useLanguage();
  const text = {
    ru: { eyebrow: "Обзор операций", welcome: "Добро пожаловать в Opero Homes", search: "Поиск", searchPlaceholder: "Поиск объектов...", logout: "Выйти", guest: "Гость" },
    en: { eyebrow: "Operations overview", welcome: "Welcome to Opero Homes", search: "Search", searchPlaceholder: "Search properties...", logout: "Log out", guest: "Guest" },
    tr: { eyebrow: "Operasyon özeti", welcome: "Opero Homes'a hoş geldiniz", search: "Arama", searchPlaceholder: "Mülkleri ara...", logout: "Çıkış yap", guest: "Misafir" },
  }[language];
  const fullName = currentUser ? `${currentUser.firstName} ${currentUser.lastName}`.trim() : "";
  const displayName = fullName || currentUserContext?.authEmail?.split("@")[0] || "Пользователь";

  async function handleLogout() {
    await logout();
  }

  return (
    <header className="border-b border-white/10 bg-slate-950/70 px-4 py-4 backdrop-blur sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.28em] text-cyan-300">{text.eyebrow}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            {text.welcome}
          </h1>
        </div>

        <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-center">
          {showSearch ? (
            <label className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-300">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="11" cy="11" r="6" />
                <path d="m20 20-4.2-4.2" />
              </svg>
              <input
                aria-label={text.search}
                placeholder={text.searchPlaceholder}
                className="w-full bg-transparent text-sm outline-none placeholder:text-slate-500 sm:w-48"
              />
            </label>
          ) : null}

          {showNewListing ? (
            <Link
              href="/apartments/new"
              className="rounded-2xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-200 transition hover:bg-cyan-500/20 cursor-pointer"
            >
              {newListingLabel}
            </Link>
          ) : null}

          <NotificationBell />

          <LanguageSwitcher language={language} onChange={setLanguage} />

          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-cyan-500/20 text-sm font-semibold text-cyan-200">
              {displayName.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">{displayName}</p>
              <p className="text-xs text-slate-400">{currentUser?.role ?? text.guest}</p>
            </div>
            <button type="button" onClick={handleLogout} className="rounded-lg border border-white/10 px-2 py-1 text-xs text-slate-300 hover:bg-white/10">
              {text.logout}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
