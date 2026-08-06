"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import PhoneInput from "@/components/PhoneInput";
import { useLanguage } from "@/components/LanguageSwitcher";

type ProfileForm = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  registrationDate?: string | null;
  emailConfirmed?: boolean;
};

const emptyForm: ProfileForm = { firstName: "", lastName: "", email: "", phone: "", address: "" };

export default function GuestProfilePage() {
  const { currentUser, isAuthLoading } = useCurrentUser();
  const [language] = useLanguage();
  const [form, setForm] = useState<ProfileForm>(emptyForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [isChangingEmail, setIsChangingEmail] = useState(false);

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
      const result = (await response.json()) as { ok?: boolean; data?: ProfileForm; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error ?? "Не удалось сохранить профиль");
      if (result.data) setForm(result.data);
      setMessage("Профиль сохранён.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось сохранить профиль");
    } finally {
      setIsSaving(false);
    }
  }

  async function changeEmail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setIsChangingEmail(true);
    try {
      const response = await fetch("/api/guest/profile/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newEmail }),
      });
      const result = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error ?? "Не удалось изменить email");
      setMessage("Письмо для подтверждения нового email отправлено.");
      setNewEmail("");
    } catch (changeError) {
      setError(changeError instanceof Error ? changeError.message : "Не удалось изменить email");
    } finally {
      setIsChangingEmail(false);
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
        <label className="block text-sm text-slate-300">Email<input type="email" value={form.email} readOnly className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3 text-slate-400 outline-none" /></label>
        <label className="block text-sm text-slate-300">Телефон<PhoneInput value={form.phone} onChange={(nextValue) => update("phone", nextValue)} className="[&>select]:rounded-xl [&>input]:rounded-xl [&>select]:bg-slate-950/70 [&>input]:bg-slate-950/70" placeholder="Номер телефона" /></label>
        <label className="block text-sm text-slate-300">Адрес проживания<textarea value={form.address} onChange={(event) => update("address", event.target.value)} className="mt-2 min-h-28 w-full resize-y rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none focus:border-cyan-300" placeholder="Город, улица, дом, квартира" /></label>

        {error ? <p className="text-sm text-rose-400">{error}</p> : null}
        {message ? <p className="text-sm text-emerald-300">{message}</p> : null}
        <button type="submit" disabled={isSaving} className="w-full rounded-xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60">{isSaving ? "Сохраняем..." : "Сохранить изменения"}</button>
      </form>

      <form onSubmit={changeEmail} className="mt-5 space-y-3 rounded-2xl border border-white/10 bg-slate-900/80 p-5 shadow-xl shadow-cyan-950/20 sm:p-7">
        <div>
          <h2 className="text-lg font-semibold text-white">Изменить email</h2>
          <p className="mt-1 text-sm text-slate-400">Новый адрес станет активным после подтверждения письма.</p>
        </div>
        <input type="email" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} placeholder="Новый email" className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none focus:border-cyan-300" required />
        <button type="submit" disabled={isChangingEmail} className="rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-3 text-sm font-semibold text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-60">{isChangingEmail ? "Отправляем..." : "Отправить письмо"}</button>
      </form>

      <div className="mt-5 grid gap-3 text-sm text-slate-300 sm:grid-cols-3">
        <p>Язык: <span className="text-white">{language.toUpperCase()}</span></p>
        <p>Регистрация: <span className="text-white">{form.registrationDate ? new Date(form.registrationDate).toLocaleDateString("ru-RU") : "Не указана"}</span></p>
        <p>Email: <span className={form.emailConfirmed ? "text-emerald-300" : "text-amber-300"}>{form.emailConfirmed ? "подтверждён" : "не подтверждён"}</span></p>
      </div>
    </section>
  );
}
