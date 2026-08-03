"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useCurrentUser } from "@/components/auth/current-user-provider";

type ProfileForm = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
};

const emptyForm: ProfileForm = { firstName: "", lastName: "", email: "", phone: "", address: "" };

export default function GuestProfilePage() {
  const { currentUser, isAuthLoading } = useCurrentUser();
  const [form, setForm] = useState<ProfileForm>(emptyForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    async function loadProfile() {
      try {
        const response = await fetch("/api/guest/profile", { signal: controller.signal });
        const result = (await response.json()) as { ok?: boolean; data?: ProfileForm; error?: string };
        if (!response.ok || !result.ok || !result.data) throw new Error(result.error ?? "Не удалось загрузить профиль");
        setForm(result.data);
      } catch (loadError) {
        if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить профиль");
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }
    if (currentUser) void loadProfile();
    return () => controller.abort();
  }, [currentUser]);

  function update(field: keyof ProfileForm, value: string) {
    setForm((previous) => ({ ...previous, [field]: value }));
    setError("");
    setMessage("");
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setIsSaving(true);
    try {
      const response = await fetch("/api/guest/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = (await response.json()) as { ok?: boolean; data?: ProfileForm; error?: string; emailConfirmationRequired?: boolean };
      if (!response.ok || !result.ok) throw new Error(result.error ?? "Не удалось сохранить профиль");
      if (result.data) setForm(result.data);
      setMessage(result.emailConfirmationRequired ? "Профиль сохранён. Подтвердите новый email по ссылке из письма." : "Профиль сохранён.");
      if (result.emailConfirmationRequired) window.setTimeout(() => window.location.reload(), 1200);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось сохранить профиль");
    } finally {
      setIsSaving(false);
    }
  }

  if (isAuthLoading || isLoading) return <div className="p-6 text-slate-300">Загрузка профиля...</div>;
  if (!currentUser) return null;

  return (
    <section className="mx-auto max-w-2xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-[0.25em] text-cyan-300">Личный кабинет</p>
          <h1 className="mt-2 text-3xl font-semibold text-white">Мой профиль</h1>
          <p className="mt-2 text-sm text-slate-400">Обновите контакты, чтобы владелец мог быстро связаться с вами.</p>
        </div>
        <Link href="/guest" className="text-sm text-cyan-300 hover:text-cyan-200">В кабинет</Link>
      </div>

      <form onSubmit={save} className="space-y-5 rounded-2xl border border-white/10 bg-slate-900/80 p-5 shadow-xl shadow-cyan-950/20 sm:p-7">
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="text-sm text-slate-300">Имя<input value={form.firstName} onChange={(event) => update("firstName", event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none focus:border-cyan-300" required /></label>
          <label className="text-sm text-slate-300">Фамилия<input value={form.lastName} onChange={(event) => update("lastName", event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none focus:border-cyan-300" required /></label>
        </div>
        <label className="block text-sm text-slate-300">Email<input type="email" value={form.email} onChange={(event) => update("email", event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none focus:border-cyan-300" required /></label>
        <label className="block text-sm text-slate-300">Телефон<input type="tel" value={form.phone} onChange={(event) => update("phone", event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none focus:border-cyan-300" placeholder="+357 ..." /></label>
        <label className="block text-sm text-slate-300">Адрес проживания<textarea value={form.address} onChange={(event) => update("address", event.target.value)} className="mt-2 min-h-28 w-full resize-y rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none focus:border-cyan-300" placeholder="Город, улица, дом, квартира" /></label>

        {error ? <p className="text-sm text-rose-400">{error}</p> : null}
        {message ? <p className="text-sm text-emerald-300">{message}</p> : null}
        <button type="submit" disabled={isSaving} className="w-full rounded-xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60">{isSaving ? "Сохраняем..." : "Сохранить изменения"}</button>
      </form>
    </section>
  );
}
