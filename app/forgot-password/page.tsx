"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { createSupabaseClient } from "@/lib/supabase/client";
import { buildPasswordResetUrl } from "@/lib/auth/site-url";

function ForgotPasswordContent() {
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("invite")?.trim() ?? "";
  const [email, setEmail] = useState(() => searchParams.get("email")?.trim() ?? "");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    const supabase = createSupabaseClient();
    if (!supabase) {
      setError("Supabase не настроен.");
      setLoading(false);
      return;
    }

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: buildPasswordResetUrl(inviteToken),
    });
    if (resetError) {
      setError(resetError.message);
      setLoading(false);
      return;
    }

    setMessage("Письмо для восстановления отправлено.");
    setLoading(false);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_32%),linear-gradient(135deg,_#020617_0%,_#0f172a_100%)] px-6 py-16 text-slate-100">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900/80 p-8 shadow-2xl shadow-cyan-950/30">
        <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">Opero Homes</p>
        <h1 className="mt-3 text-3xl font-semibold text-white">Восстановление пароля</h1>
        <p className="mt-2 text-sm text-slate-400">Введите email, чтобы получить ссылку для сброса.</p>

        <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
          <label className="block text-sm text-slate-300">
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none"
            />
          </label>

          {error ? <p className="text-sm text-rose-300">{error}</p> : null}
          {message ? <p className="text-sm text-emerald-300">{message}</p> : null}

          <button type="submit" disabled={loading} className="w-full rounded-2xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-white transition disabled:opacity-60">
            {loading ? "Отправляем..." : "Отправить ссылку"}
          </button>
        </form>

        <div className="mt-6 text-sm text-slate-400">
          <Link href="/login" className="hover:text-cyan-300">Вернуться к входу</Link>
        </div>
      </div>
    </main>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-slate-950" />}>
      <ForgotPasswordContent />
    </Suspense>
  );
}
