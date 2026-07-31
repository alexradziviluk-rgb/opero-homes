"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getHomeRouteForUser, useCurrentUser } from "@/components/auth/current-user-provider";
import { getAdminNextPath } from "@/lib/auth/next-route";
import { login } from "@/lib/supabase/auth";

function formatLoginError(
  errorCode: string | undefined,
  errorStage: string | undefined,
  errorMessage: string | undefined,
  supabaseErrorCode: string | undefined,
): string {
  const details = [errorMessage, supabaseErrorCode ? `code: ${supabaseErrorCode}` : null].filter(Boolean).join(" | ");

  if (errorCode === "sign_in_failed") {
    return details ? `Ошибка входа Supabase (${errorStage ?? "sign_in"}): ${details}` : "Ошибка входа Supabase.";
  }

  if (errorCode === "session_missing_after_sign_in") {
    return "Вход выполнен, но Supabase не вернул session.";
  }

  if (errorCode === "user_missing_after_sign_in") {
    return "Вход выполнен, но Supabase не вернул user.";
  }

  if (errorCode === "profile_missing") {
    return details
      ? `Профиль не найден в public.profiles после автоматического восстановления (${errorStage ?? "profiles"}): ${details}`
      : "Профиль не найден в public.profiles после автоматического восстановления.";
  }

  if (errorCode === "membership_missing") {
    return details
      ? `Членство в public.organization_members не найдено (${errorStage ?? "organization_members"}): ${details}`
      : "Членство в public.organization_members не найдено.";
  }

  if (errorCode === "organization_missing") {
    return details
      ? `Организация opero-homes не найдена (${errorStage ?? "organizations"}): ${details}`
      : "Организация opero-homes не найдена.";
  }

  if (errorCode === "uid_mismatch") {
    return details ? `UID не совпадает: ${details}` : "UID пользователя не совпадает с ожидаемым.";
  }

  if (errorCode === "rls_error") {
    return details
      ? `Ошибка RLS при чтении данных (${errorStage ?? "unknown"}): ${details}`
      : "Ошибка RLS при чтении данных пользователя.";
  }

  if (errorCode === "supabase_query_error") {
    return details
      ? `Ошибка запроса Supabase (${errorStage ?? "unknown"}): ${details}`
      : "Ошибка запроса Supabase при загрузке профиля/организации.";
  }

  if (errorCode === "cookie_session_error") {
    return details
      ? `Session cookie недоступна на сервере (${errorStage ?? "session"}): ${details}`
      : "Session cookie недоступна на сервере.";
  }

  if (errorCode === "redirect_error") {
    return details ? `Ошибка redirect: ${details}` : "Не удалось выполнить redirect после входа.";
  }

  if (errorCode === "profile_inactive") {
    return "Профиль пользователя неактивен. Обратитесь к администратору.";
  }

  if (errorCode === "supabase_not_configured") {
    return "Авторизация недоступна: проверьте переменные окружения Supabase.";
  }

  return details ? `Неожиданная ошибка авторизации: ${details}` : "Неожиданная ошибка авторизации.";
}

export default function LoginPage() {
  const router = useRouter();
  const { currentUser, isAuthLoading } = useCurrentUser();
  const [nextPath] = useState(() => {
    if (typeof window === "undefined") return "/admin";
    const params = new URLSearchParams(window.location.search);
    return getAdminNextPath(params.get("next"));
  });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    return params.get("error") === "profile_missing"
      ? "Профиль пользователя не найден в public.profiles. Обратитесь к администратору системы."
      : null;
  });

  useEffect(() => {
    if (!isAuthLoading && currentUser) {
      router.replace(currentUser.role === "Гость" ? getHomeRouteForUser(currentUser) : nextPath);
      router.refresh();
    }
  }, [currentUser, isAuthLoading, nextPath, router]);

  async function handleLogin() {
    setError(null);

    if (!email.trim() || !password) {
      setError("Введите email и пароль.");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await login(email, password);

      if (!result.currentUser) {
        setError(
          formatLoginError(result.errorCode, result.errorStage, result.errorMessage, result.supabaseErrorCode),
        );
        return;
      }

      setError(null);

      try {
        router.replace(result.currentUser.role === "Гость" ? getHomeRouteForUser(result.currentUser) : nextPath);
        router.refresh();
      } catch (redirectError) {
        const message = redirectError instanceof Error ? redirectError.message : "unknown redirect error";
        setError(formatLoginError("redirect_error", "redirect", message, undefined));
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void handleLogin();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_32%),linear-gradient(135deg,_#020617_0%,_#0f172a_100%)] px-6 py-16 text-slate-100">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900/80 p-8 shadow-2xl shadow-cyan-950/30">
        <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">Opero Homes</p>
        <h1 className="mt-3 text-3xl font-semibold text-white">Вход в систему управления</h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          Для менеджеров, уборщиков и другого персонала. После принятия приглашения входите по email и созданному паролю.
        </p>

        <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="text-sm text-slate-300">Email</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none"
              placeholder="alex.radziviluk@gmail.com"
            />
          </label>

          <label className="block">
            <span className="text-sm text-slate-300">Пароль</span>
            <div className="mt-1 flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3">
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full bg-transparent px-1 py-3 text-sm text-white outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="rounded-lg px-2 py-1 text-xs text-cyan-200 hover:bg-cyan-500/10"
              >
                {showPassword ? "Скрыть" : "Показать"}
              </button>
            </div>
          </label>

          <button
            type="submit"
            disabled={isSubmitting || isAuthLoading}
            className="w-full rounded-2xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-3 text-sm font-semibold text-cyan-200 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSubmitting ? "Входим..." : "Войти"}
          </button>
        </form>

        {error ? <p className="mt-6 text-sm text-rose-300">{error}</p> : null}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-2 text-sm">
          <Link href="/guest/login" className="text-slate-300 hover:text-white">
            Вход для гостей
          </Link>
          <Link href="/forgot-password" className="text-slate-300 hover:text-white">
            Забыли пароль?
          </Link>
          <Link href="/stay" className="text-cyan-300 hover:text-cyan-200">
            Посмотреть объекты
          </Link>
        </div>
      </div>
    </main>
  );
}
