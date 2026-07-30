"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getGuestNextPath } from "@/lib/auth/next-route";
import { createSupabaseClient } from "@/lib/supabase/client";

function normalizeSignUpError(message: string | undefined): string {
  if (!message) {
    return "Не удалось создать аккаунт. Попробуйте еще раз.";
  }

  if (message.toLowerCase().includes("already registered")) {
    return "Пользователь с таким email уже зарегистрирован.";
  }

  return message;
}

export default function GuestRegisterPage() {
  const router = useRouter();
  const [nextPath, setNextPath] = useState("/guest");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setNextPath(getGuestNextPath(params.get("next")));
    const invitedEmail = params.get("email");
    if (invitedEmail) {
      setEmail(invitedEmail);
    }
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!firstName.trim() || !lastName.trim() || !email.trim() || !password) {
      setError("Заполните имя, фамилию, email и пароль.");
      return;
    }

    const supabase = createSupabaseClient();
    if (!supabase) {
      setError("Регистрация недоступна: проверьте переменные окружения Supabase.");
      return;
    }

    setIsSubmitting(true);
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          emailRedirectTo: new URL(`/auth/callback?next=${encodeURIComponent(nextPath)}`, window.location.origin).toString(),
          data: {
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            phone: phone.trim(),
            role: "guest",
          },
        },
      });

      if (signUpError) {
        setError(normalizeSignUpError(signUpError.message));
        return;
      }

      if (data.session && data.user) {
        router.replace(nextPath);
        router.refresh();
        return;
      }

      setSuccess("Аккаунт создан. Подтвердите email по ссылке из письма и затем войдите.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="mx-auto w-full max-w-md rounded-3xl border border-white/10 bg-slate-900/80 p-8 shadow-2xl shadow-cyan-950/30">
      <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">Opero Homes</p>
      <h1 className="mt-3 text-3xl font-semibold text-white">Регистрация гостя</h1>
      <p className="mt-2 text-sm text-slate-300">Создайте аккаунт, чтобы управлять своими заявками и бронированиями.</p>

      <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
        <label className="block">
          <span className="text-sm text-slate-300">Имя</span>
          <input
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            className="mt-1 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none"
          />
        </label>

        <label className="block">
          <span className="text-sm text-slate-300">Фамилия</span>
          <input
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
            className="mt-1 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none"
          />
        </label>

        <label className="block">
          <span className="text-sm text-slate-300">Телефон</span>
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            className="mt-1 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none"
          />
        </label>

        <label className="block">
          <span className="text-sm text-slate-300">Email</span>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none"
          />
        </label>

        <label className="block">
          <span className="text-sm text-slate-300">Пароль</span>
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none"
          />
        </label>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-2xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-3 text-sm font-semibold text-cyan-200 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isSubmitting ? "Создаем аккаунт..." : "Зарегистрироваться"}
        </button>
      </form>

      {error ? <p className="mt-4 text-sm text-rose-300">{error}</p> : null}
      {success ? <p className="mt-4 text-sm text-emerald-300">{success}</p> : null}

      <div className="mt-6 text-sm">
        <Link href="/guest/login" className="text-cyan-300 hover:text-cyan-200">
          Уже есть аккаунт? Войти
        </Link>
      </div>
    </section>
  );
}
