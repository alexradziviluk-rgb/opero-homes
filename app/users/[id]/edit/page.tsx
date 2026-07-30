"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { getEffectivePermissions, hasPermissionInList } from "@/lib/permissions";
import UserForm from "@/app/users/user-form";
import { userRepository } from "@/lib/repositories/users";
import type { User, UserCreateInput, UserRole, UserStatus } from "@/types/user";

type UserFormValues = Omit<UserCreateInput, "organizationId">;

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export default function EditUserPage() {
  const params = useParams();
  const userId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const router = useRouter();
  const { currentUser, isAuthLoading } = useCurrentUser();
  const effectivePermissions = currentUser ? getEffectivePermissions(currentUser) : [];

  const [user, setUser] = useState<User | null>(null);
  const [form, setForm] = useState<UserFormValues>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    role: "Сотрудник" as UserRole,
    status: "Активен" as UserStatus,
    avatarUrl: null,
    language: "ru",
    notes: "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof UserFormValues, string>>>({});
  const [submitError, setSubmitError] = useState("");
  const canManageUsers = hasPermissionInList(effectivePermissions, "users.manage");

  if (isAuthLoading) {
    return <div className="p-6 text-slate-300">Загрузка...</div>;
  }

  if (!currentUser) {
    return null;
  }

  useEffect(() => {
    if (!userId) return;
    const found = userRepository.getById(userId);
    if (!found) return;

    setUser(found);
    setForm({
      firstName: found.firstName,
      lastName: found.lastName,
      email: found.email,
      phone: found.phone,
      role: found.role,
      status: found.status,
      avatarUrl: found.avatarUrl,
      language: found.language,
      notes: found.notes,
    });
  }, [userId]);

  function update<K extends keyof UserFormValues>(key: K, value: UserFormValues[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => ({ ...previous, [key]: undefined }));
  }

  function validate() {
    const nextErrors: Partial<Record<keyof UserFormValues, string>> = {};

    if (!form.firstName.trim()) nextErrors.firstName = "Имя обязательно";
    if (!form.lastName.trim()) nextErrors.lastName = "Фамилия обязательна";
    if (!form.email.trim()) nextErrors.email = "Email обязателен";
    else if (!isValidEmail(form.email)) nextErrors.email = "Введите корректный email";
    if (!form.role) nextErrors.role = "Роль обязательна";

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError("");

    if (!user || !validate()) return;

    try {
      const updated = userRepository.update(user.id, form);
      router.replace(`/users/${updated.id}`);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Не удалось обновить пользователя");
    }
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_32%),linear-gradient(135deg,_#020617_0%,_#0f172a_100%)] text-slate-100">
        <div className="mx-auto flex min-h-screen max-w-7xl flex-col lg:flex-row">
          <Sidebar />
          <div className="flex-1">
            <Header showSearch={false} showNewListing={false} />
            <main className="p-6">
              <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-6 text-slate-300">Пользователь не найден.</div>
            </main>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_32%),linear-gradient(135deg,_#020617_0%,_#0f172a_100%)] text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col lg:flex-row">
        <Sidebar />
        <div className="flex-1">
          <Header showSearch={false} showNewListing={false} />
          <main className="p-6">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <h1 className="text-2xl font-semibold">Редактирование пользователя</h1>
              <Link href={`/users/${user.id}`} className="text-sm text-cyan-300">К карточке пользователя</Link>
            </div>

            {!canManageUsers ? (
              <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-6 text-slate-300">Недостаточно прав для редактирования пользователей.</div>
            ) : (
              <form onSubmit={handleSubmit} className="rounded-2xl border border-white/10 bg-slate-900/80 p-6">
                <UserForm value={form} errors={errors} onChange={update} />
                {submitError ? <p className="mt-4 text-sm text-rose-400">{submitError}</p> : null}

                <div className="mt-6 flex gap-2">
                  <button type="submit" className="rounded-2xl bg-cyan-500/20 px-4 py-2 font-semibold text-cyan-200">Сохранить</button>
                  <Link href={`/users/${user.id}`} className="rounded-2xl bg-white/5 px-4 py-2">Отмена</Link>
                </div>
              </form>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
