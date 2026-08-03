"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/components/auth/current-user-provider";

type Invitation = { organizationName: string; email: string; firstName: string; apartmentCount: number; expiresAt: string };

export default function PropertyOwnerInvitePage() {
  return <Suspense fallback={<main className="flex min-h-screen items-center justify-center bg-slate-950 px-5 py-10 text-slate-100"><p>Проверяем приглашение...</p></main>}><PropertyOwnerInviteContent /></Suspense>;
}

function PropertyOwnerInviteContent() {
  const router = useRouter();
  const token = useSearchParams().get("invite")?.trim() ?? "";
  const { currentUser, isAuthLoading } = useCurrentUser();
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [loading, setLoading] = useState(Boolean(token));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(token ? "" : "Токен приглашения отсутствует.");

  useEffect(() => {
    if (!token) return;
    fetch(`/api/owner/invitations/accept?invite=${encodeURIComponent(token)}`, { cache: "no-store" }).then(async (response) => {
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error ?? "Не удалось загрузить приглашение.");
      setInvitation(result.data);
    }).catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить приглашение.")).finally(() => setLoading(false));
  }, [token]);

  async function accept() {
    const supabase = createSupabaseClient();
    if (!supabase || !token || !invitation) { setError("Приглашение недоступно."); return; }
    if (!password) { setError("Введите пароль."); return; }
    setSubmitting(true); setError("");
    try {
      if (mode === "signup") {
        const { data, error: signUpError } = await supabase.auth.signUp({ email: invitation.email, password, options: { data: { first_name: invitation.firstName, role: "property_owner", status: "active" } } });
        if (signUpError) {
          if (signUpError.message.toLowerCase().includes("already registered")) { setMode("login"); throw new Error("Аккаунт уже существует. Переключитесь на вход."); }
          throw signUpError;
        }
        if (!data.session) throw new Error("Аккаунт создан. Подтвердите email или войдите, чтобы принять приглашение.");
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email: invitation.email, password });
        if (signInError) throw new Error("Неверный email или пароль.");
      }
      const response = await fetch("/api/owner/invitations/accept", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ invite: token }) });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error ?? "Не удалось принять приглашение.");
      router.replace("/owner"); router.refresh();
    } catch (acceptError) { setError(acceptError instanceof Error ? acceptError.message : "Не удалось принять приглашение."); }
    finally { setSubmitting(false); }
  }

  useEffect(() => { if (currentUser && invitation && !isAuthLoading) { void fetch("/api/owner/invitations/accept", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ invite: token }) }).then(async (response) => { if (response.ok) { router.replace("/owner"); router.refresh(); } }); } }, [currentUser, invitation, isAuthLoading, router, token]);

  return <main className="flex min-h-screen items-center justify-center bg-slate-950 px-5 py-10 text-slate-100"><section className="w-full max-w-xl rounded-2xl border border-white/10 bg-slate-900 p-7"><p className="text-sm uppercase tracking-[0.25em] text-cyan-300">Opero Homes</p><h1 className="mt-3 text-3xl font-semibold">Приглашение собственника</h1>{loading ? <p className="mt-6 text-slate-400">Проверяем приглашение...</p> : null}{error ? <p className="mt-6 text-rose-300">{error}</p> : null}{invitation ? <div className="mt-6 space-y-4"><p>Организация: <strong>{invitation.organizationName}</strong></p><p>Email: <strong>{invitation.email}</strong></p><p>Квартир: <strong>{invitation.apartmentCount}</strong></p><p className="text-sm text-slate-400">Ссылка действует до {new Date(invitation.expiresAt).toLocaleString("ru-RU")}.</p>{!currentUser ? <form onSubmit={(event) => { event.preventDefault(); void accept(); }} className="space-y-4"><label className="block text-sm">{mode === "signup" ? "Придумайте пароль" : "Пароль"}<input required type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2" /></label><button disabled={submitting} className="rounded-xl bg-cyan-400 px-4 py-2 font-semibold text-slate-950 disabled:opacity-50">{submitting ? "Обрабатываем..." : mode === "signup" ? "Создать аккаунт и принять" : "Войти и принять"}</button><button type="button" onClick={() => setMode(mode === "signup" ? "login" : "signup")} className="ml-3 text-sm text-cyan-300">{mode === "signup" ? "Уже есть аккаунт" : "Создать аккаунт"}</button></form> : <p className="text-emerald-300">Принимаем приглашение...</p>}</div> : null}</section></main>;
}
