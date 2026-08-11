"use client";

import Link from "next/link";
import { useState } from "react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import ClientForm from "@/app/clients/client-form";
import { createClient } from "@/lib/clients/client-repository";
import { initialClientDraft, type ClientDraft } from "@/types/client";

export default function NewClientPage() {
  const [form, setForm] = useState<ClientDraft>(initialClientDraft);
  const [emailConfirmation, setEmailConfirmation] = useState("");
  const [errors, setErrors] = useState<Partial<Record<keyof ClientDraft, string>>>({});
  const [emailConfirmationError, setEmailConfirmationError] = useState("");
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(null);
  const [isResending, setIsResending] = useState(false);
  const [resendMessage, setResendMessage] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");
  const [changeEmailMessage, setChangeEmailMessage] = useState("");

  function update<K extends keyof ClientDraft>(key: K, value: ClientDraft[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => ({ ...previous, [key]: undefined }));
    if (key === "email") setEmailConfirmationError("");
  }

  function validate(): boolean {
    const nextErrors: Partial<Record<keyof ClientDraft, string>> = {};
    if (!form.firstName.trim()) nextErrors.firstName = "Введите имя";
    if (!form.lastName.trim()) nextErrors.lastName = "Введите фамилию";
    if (!form.phone.trim()) nextErrors.phone = "Введите телефон";
    if (!form.email.trim()) nextErrors.email = "Введите email";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) nextErrors.email = "Введите корректный email";
    if (!form.dateOfBirth) nextErrors.dateOfBirth = "Укажите дату рождения";
    const emailsMatch = form.email.trim().toLowerCase() === emailConfirmation.trim().toLowerCase();
    setEmailConfirmationError(emailConfirmation.trim() && !emailsMatch ? "Email не совпадает" : emailConfirmation.trim() ? "" : "Подтвердите email");
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0 && emailsMatch;
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validate()) return;

    void (async () => {
      const response = await fetch("/api/clients/registration", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const result = await response.json().catch(() => null) as { ok?: boolean; error?: string; data?: { email?: string; notificationSent?: boolean } } | null;
      if (!response.ok || !result?.ok) {
        setErrors((previous) => ({ ...previous, email: result?.error ?? "Не удалось зарегистрировать клиента" }));
        return;
      }
      createClient(form);
      setConfirmationEmail(result.data?.email ?? form.email.trim().toLowerCase());
      setPendingEmail(result.data?.email ?? form.email.trim().toLowerCase());
      if (result.data?.notificationSent === false) setResendMessage("Клиент создан и добавлен в список, но письмо не отправилось. Проверьте настройки email или отправьте письмо повторно.");
    })();
  }

  async function changePendingEmail() {
    if (!confirmationEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(pendingEmail.trim())) {
      setChangeEmailMessage("Введите корректный новый email.");
      return;
    }
    const response = await fetch("/api/clients/verification/change-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentEmail: confirmationEmail, newEmail: pendingEmail }) });
    const result = await response.json().catch(() => null) as { message?: string; changed?: boolean } | null;
    setChangeEmailMessage(result?.message ?? "Если адрес доступен, письмо отправлено.");
    if (result?.changed) setConfirmationEmail(pendingEmail.trim().toLowerCase());
  }

  async function resendVerification() {
    if (!confirmationEmail || isResending) return;
    setIsResending(true); setResendMessage("");
    try {
      const response = await fetch("/api/clients/verification/resend", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: confirmationEmail }) });
      const result = await response.json().catch(() => null) as { message?: string } | null;
      setResendMessage(result?.message ?? "Если адрес существует, письмо отправлено.");
    } finally { setIsResending(false); }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_32%),linear-gradient(135deg,_#020617_0%,_#0f172a_100%)] text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col lg:flex-row">
        <Sidebar />
        <div className="flex-1">
          <Header showSearch={false} showNewListing={false} />
          <main className="p-6">
            <div className="mb-6 flex items-center justify-between">
              <h1 className="text-2xl font-semibold">Новый клиент</h1>
              <Link href="/clients" className="text-sm text-cyan-300">К списку клиентов</Link>
            </div>

            {confirmationEmail ? <section className="rounded-2xl border border-emerald-300/20 bg-slate-900/80 p-6"><h2 className="text-xl font-semibold text-emerald-300">Мы отправили письмо на ваш email</h2><p className="mt-3 text-slate-300">Подтвердите адрес, чтобы завершить регистрацию клиента.</p><p className="mt-2 text-sm text-slate-400">Проверьте также папку «Спам».</p><div className="mt-5 flex flex-col gap-2"><label htmlFor="pending-email" className="text-sm text-slate-300">Изменить email до подтверждения</label><input id="pending-email" type="email" value={pendingEmail} onChange={(event) => setPendingEmail(event.target.value)} className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-slate-100" /><button type="button" onClick={() => void changePendingEmail()} className="self-start rounded-xl border border-cyan-300/40 px-4 py-2 text-sm text-cyan-200">Отправить на новый email</button></div>{changeEmailMessage ? <p className="mt-3 text-sm text-slate-300">{changeEmailMessage}</p> : null}<button type="button" onClick={() => void resendVerification()} disabled={isResending} className="mt-5 rounded-xl border border-cyan-300/40 px-4 py-2 text-sm text-cyan-200 disabled:opacity-60">{isResending ? "Отправляем..." : "Отправить письмо повторно"}</button>{resendMessage ? <p className="mt-3 text-sm text-slate-300">{resendMessage}</p> : null}<div className="mt-5"><Link href="/clients" className="text-sm text-cyan-300">К списку клиентов</Link></div></section> : <form onSubmit={handleSubmit} className="rounded-2xl border border-white/10 bg-slate-900/80 p-6"><ClientForm value={form} errors={errors} onChange={update} emailConfirmation={emailConfirmation} emailConfirmationError={emailConfirmationError} onEmailConfirmationChange={(value) => { setEmailConfirmation(value); setEmailConfirmationError(""); }} /><div className="mt-6 flex gap-2"><button type="submit" className="rounded-2xl bg-cyan-500/20 px-4 py-2 font-semibold text-cyan-200">Сохранить</button><Link href="/clients" className="rounded-2xl bg-white/5 px-4 py-2">Отмена</Link></div></form>}
          </main>
        </div>
      </div>
    </div>
  );
}
