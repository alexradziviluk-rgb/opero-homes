"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { getEffectivePermissions, hasPermissionInList } from "@/lib/permissions";
import type { UserRole } from "@/types/user";
import { EMPLOYEE_INVITE_ROLE_LABELS, EMPLOYEE_INVITE_ROLE_CODES, mapInviteRoleCodeToUserRoleLabel } from "@/lib/users/invitations";

const roleOptions = EMPLOYEE_INVITE_ROLE_CODES.map((roleCode) => ({
  value: mapInviteRoleCodeToUserRoleLabel(roleCode) as UserRole,
  label: EMPLOYEE_INVITE_ROLE_LABELS[roleCode],
}));

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export default function InviteUserPage() {
  const router = useRouter();
  const { currentUser, isAuthLoading } = useCurrentUser();
  const effectivePermissions = currentUser ? getEffectivePermissions(currentUser) : [];

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<UserRole>("Менеджер");
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canInvite = hasPermissionInList(effectivePermissions, "users.invite");

  if (isAuthLoading) {
    return <div className="p-6 text-slate-300">Загрузка...</div>;
  }

  if (!currentUser) {
    return null;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError("");
    setSubmitSuccess("");

    if (!currentUser) {
      setSubmitError("Сессия не найдена. Выполните вход снова.");
      return;
    }

    if (!canInvite) {
      setSubmitError("Недостаточно прав для отправки приглашений");
      return;
    }

    if (!firstName.trim() || !lastName.trim()) {
      setSubmitError("Имя и фамилия обязательны");
      return;
    }

    if (!isValidEmail(email)) {
      setSubmitError("Введите корректный email");
      return;
    }

    if (!["Менеджер", "Сотрудник", "Уборщик", "Технический специалист"].includes(role)) {
      setSubmitError("Выберите рабочую роль для приглашения");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/users/invite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
        firstName,
        lastName,
        email,
        phone,
          role,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { ok: true; data: { message?: string } }
        | { ok: false; error?: string }
        | null;

      if (!response.ok || !payload || !payload.ok) {
        setSubmitError(payload && !payload.ok ? payload.error ?? "Не удалось отправить приглашение" : "Не удалось отправить приглашение");
        return;
      }

      setSubmitSuccess(payload.data.message ?? "Приглашение отправлено.");
      setFirstName("");
      setLastName("");
      setEmail("");
      setPhone("");
      setRole("Менеджер");
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Не удалось создать приглашение");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_32%),linear-gradient(135deg,_#020617_0%,_#0f172a_100%)] text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col lg:flex-row">
        <Sidebar />
        <div className="flex-1">
          <Header showSearch={false} showNewListing={false} />
          <main className="p-6">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-semibold">Приглашение сотрудника</h1>
                <p className="text-sm text-slate-400">После принятия приглашения сотрудник перейдет в статус "Ожидает подтверждения".</p>
                <p className="mt-1 text-xs text-amber-300">SMS-приглашения сейчас недоступны. Приглашение отправляется только по email.</p>
              </div>
              <Link href="/users" className="text-sm text-cyan-300">К списку пользователей</Link>
            </div>

            {!canInvite ? (
              <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-6 text-slate-300">Недостаточно прав для отправки приглашений.</div>
            ) : (
              <form className="rounded-2xl border border-white/10 bg-slate-900/80 p-6" onSubmit={handleSubmit}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label>
                    <div className="text-sm text-slate-300">Имя</div>
                    <input value={firstName} onChange={(event) => setFirstName(event.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none" />
                  </label>
                  <label>
                    <div className="text-sm text-slate-300">Фамилия</div>
                    <input value={lastName} onChange={(event) => setLastName(event.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none" />
                  </label>
                  <label>
                    <div className="text-sm text-slate-300">Email</div>
                    <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none" />
                  </label>
                  <label>
                    <div className="text-sm text-slate-300">Телефон</div>
                    <input value={phone} onChange={(event) => setPhone(event.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none" />
                  </label>
                  <label className="sm:col-span-2">
                    <div className="text-sm text-slate-300">Роль</div>
                    <select value={role} onChange={(event) => setRole(event.target.value as UserRole)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none">
                      {roleOptions.map((option) => (
                        <option key={option.value} value={option.value} className="bg-slate-900">
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {submitError ? <p className="mt-4 text-sm text-rose-400">{submitError}</p> : null}
                {submitSuccess ? <p className="mt-4 text-sm text-emerald-300">{submitSuccess}</p> : null}

                <div className="mt-6 flex gap-2">
                  <button type="submit" disabled={isSubmitting} className="rounded-2xl bg-cyan-500/20 px-4 py-2 font-semibold text-cyan-200 disabled:cursor-not-allowed disabled:opacity-60">{isSubmitting ? "Отправляем..." : "Отправить приглашение"}</button>
                  <Link href="/users" className="rounded-2xl bg-white/5 px-4 py-2">Отмена</Link>
                </div>
              </form>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
