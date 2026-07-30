"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { getGuestNextPath } from "@/lib/auth/next-route";
import { login, requestGuestOtpSignIn, verifyGuestEmailOtp } from "@/lib/supabase/auth";

function normalizeAuthError(message: string | undefined): string {
  if (!message) {
    return "Не удалось выполнить вход. Проверьте email и пароль.";
  }

  if (message.toLowerCase().includes("invalid login credentials")) {
    return "Неверный email или пароль.";
  }

  return message;
}

function normalizeOtpRequestError(code: string | undefined): string {
  switch (code) {
    case "invalid_email":
      return "Введите корректный email адрес.";
    case "rate_limit":
      return "Слишком много попыток. Подождите и попробуйте снова.";
    default:
      return "Не удалось отправить код. Попробуйте позже.";
  }
}

function normalizeOtpVerifyError(code: string | undefined): string {
  switch (code) {
    case "invalid_email":
      return "Введите корректный email адрес.";
    case "invalid_otp":
      return "Неверный код подтверждения.";
    case "expired_otp":
      return "Срок действия кода истек. Запросите новый код.";
    default:
      return "Не удалось подтвердить код. Попробуйте снова.";
  }
}

function normalizeCallbackError(code: string | null): string | null {
  switch (code) {
    case "callback_code_missing":
      return "Ссылка для входа неполная. Запросите новую ссылку.";
    case "callback_exchange_failed":
      return "Не удалось подтвердить ссылку входа. Запросите новую ссылку.";
    case "session_missing":
      return "Сессия не создана. Попробуйте ещё раз.";
    case "profile_provision_failed":
      return "Профиль пользователя не готов. Попробуйте позже.";
    case "unsafe_next":
      return "Некорректный параметр перехода. Выполните вход повторно.";
    case "access_denied":
      return "Доступ запрещен для этого аккаунта.";
    default:
      return null;
  }
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export default function GuestLoginPage() {
  const router = useRouter();
  const { currentUser, isAuthLoading } = useCurrentUser();
  const [nextPath, setNextPath] = useState("/guest");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpEmail, setOtpEmail] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [isOtpSending, setIsOtpSending] = useState(false);
  const [isOtpVerifying, setIsOtpVerifying] = useState(false);
  const [otpCooldownUntil, setOtpCooldownUntil] = useState<number | null>(null);
  const [otpNow, setOtpNow] = useState(Date.now());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpMessage, setOtpMessage] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setNextPath(getGuestNextPath(params.get("next")));
    setError(normalizeCallbackError(params.get("error")));
  }, []);

  useEffect(() => {
    if (!otpCooldownUntil) {
      return;
    }

    const timer = window.setInterval(() => {
      setOtpNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [otpCooldownUntil]);

  useEffect(() => {
    if (isAuthLoading || !currentUser) {
      return;
    }

    if (currentUser.role === "Гость") {
      router.replace(nextPath);
      router.refresh();
      return;
    }

    router.replace("/admin");
    router.refresh();
  }, [currentUser, isAuthLoading, nextPath, router]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError(null);

    if (!email.trim() || !password) {
      setError("Введите email и пароль.");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await login(email, password);

      if (!result.currentUser) {
        setError(normalizeAuthError(result.errorMessage));
        return;
      }

      if (result.currentUser.role !== "Гость") {
        router.replace("/admin");
        router.refresh();
        return;
      }

      router.replace(nextPath);
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleOtpRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setOtpError(null);
    setOtpMessage(null);

    const normalizedEmail = normalizeEmail(otpEmail);
    if (!normalizedEmail) {
      setOtpError("Введите email.");
      return;
    }

    if (otpCooldownUntil && otpCooldownUntil > Date.now()) {
      return;
    }

    setIsOtpSending(true);
    try {
      const result = await requestGuestOtpSignIn({
        email: normalizedEmail,
        nextPath,
        origin: window.location.origin,
      });

      if (!result.ok) {
        setOtpError(normalizeOtpRequestError(result.errorCode));
        return;
      }

      setOtpSent(true);
      setOtpEmail(normalizedEmail);
      setOtpCooldownUntil(Date.now() + 45_000);
      setOtpMessage("Если аккаунт найден, письмо с кодом или ссылкой уже отправлено.");
    } finally {
      setIsOtpSending(false);
    }
  }

  async function handleOtpVerify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setOtpError(null);
    setOtpMessage(null);

    const normalizedEmail = normalizeEmail(otpEmail);
    if (!normalizedEmail || !otpCode.trim()) {
      setOtpError("Введите email и код из письма.");
      return;
    }

    setIsOtpVerifying(true);
    try {
      const result = await verifyGuestEmailOtp({
        email: normalizedEmail,
        token: otpCode,
        nextPath,
      });

      if (!result.ok) {
        setOtpError(normalizeOtpVerifyError(result.errorCode));
        return;
      }

      router.replace(result.redirectTo ?? nextPath);
      router.refresh();
    } finally {
      setIsOtpVerifying(false);
    }
  }

  const cooldownSeconds = otpCooldownUntil ? Math.max(0, Math.ceil((otpCooldownUntil - otpNow) / 1000)) : 0;
  const isCooldownActive = cooldownSeconds > 0;

  return (
    <section className="mx-auto w-full max-w-md rounded-3xl border border-white/10 bg-slate-900/80 p-8 shadow-2xl shadow-cyan-950/30">
      <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">Opero Homes</p>
      <h1 className="mt-3 text-3xl font-semibold text-white">Вход для гостей</h1>
      <p className="mt-2 text-sm text-slate-300">Войдите, чтобы отправлять бронирования, смотреть сообщения и статусы заявок.</p>

      <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
        <label className="block">
          <span className="text-sm text-slate-300">Email</span>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none"
            placeholder="guest@example.com"
          />
        </label>

        <label className="block">
          <span className="text-sm text-slate-300">Пароль</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none"
          />
        </label>

        <button
          type="submit"
          disabled={isSubmitting || isAuthLoading}
          className="w-full rounded-2xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-3 text-sm font-semibold text-cyan-200 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isSubmitting ? "Входим..." : "Войти"}
        </button>
      </form>

      <div className="mt-6 rounded-2xl border border-white/10 bg-slate-950/60 p-4">
        <p className="text-sm font-medium text-slate-200">Вход без пароля</p>
        <p className="mt-1 text-xs text-slate-400">Получите одноразовый код или magic link на email.</p>

        <form className="mt-4 space-y-3" onSubmit={handleOtpRequest}>
          <label className="block">
            <span className="text-sm text-slate-300">Email</span>
            <input
              type="email"
              autoComplete="email"
              value={otpEmail}
              onChange={(event) => setOtpEmail(event.target.value)}
              className="mt-1 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none"
              placeholder="guest@example.com"
            />
          </label>

          <button
            type="submit"
            disabled={isAuthLoading || isOtpSending || isCooldownActive}
            className="w-full rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isOtpSending ? "Отправляем..." : isCooldownActive ? `Повторно через ${cooldownSeconds}с` : "Отправить код/ссылку"}
          </button>
        </form>

        {otpSent ? (
          <form className="mt-4 space-y-3" onSubmit={handleOtpVerify}>
            <label className="block">
              <span className="text-sm text-slate-300">Код из письма</span>
              <input
                type="text"
                inputMode="numeric"
                value={otpCode}
                onChange={(event) => setOtpCode(event.target.value)}
                className="mt-1 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none"
                placeholder="123456"
              />
            </label>

            <button
              type="submit"
              disabled={isAuthLoading || isOtpVerifying}
              className="w-full rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-200 hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isOtpVerifying ? "Проверяем..." : "Подтвердить код"}
            </button>
          </form>
        ) : null}

        {otpMessage ? <p className="mt-3 text-sm text-emerald-300">{otpMessage}</p> : null}
        {otpError ? <p className="mt-3 text-sm text-rose-300">{otpError}</p> : null}
      </div>

      {error ? <p className="mt-4 text-sm text-rose-300">{error}</p> : null}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-2 text-sm">
        <Link href="/guest/register" className="text-cyan-300 hover:text-cyan-200">
          Создать аккаунт гостя
        </Link>
        <Link href="/login" className="text-slate-300 hover:text-white">
          Вход для сотрудников
        </Link>
      </div>
    </section>
  );
}
