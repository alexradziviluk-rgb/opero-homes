"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import {
  ADDITIONAL_ORGANIZATION_ROLE_CODES,
  MANAGEABLE_ORGANIZATION_ROLE_CODES,
  type AdditionalOrganizationRoleCode,
  type ManageableMemberStatus,
  type ManageableOrganizationRoleCode,
  type OrganizationUser,
} from "@/types/organization-user";

const roleLabels: Record<ManageableOrganizationRoleCode, string> = {
  manager: "Менеджер",
  employee: "Сотрудник",
  cleaner: "Уборщик",
  maintenance: "Специалист по обслуживанию",
};

type EditForm = {
  firstName: string;
  lastName: string;
  phone: string;
  roleCode: ManageableOrganizationRoleCode;
  additionalRoleCodes: AdditionalOrganizationRoleCode[];
  status: ManageableMemberStatus;
};

function isManageableRoleCode(value: string): value is ManageableOrganizationRoleCode {
  return MANAGEABLE_ORGANIZATION_ROLE_CODES.some((role) => role === value);
}

export default function EditUserPage() {
  const params = useParams();
  const userId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const router = useRouter();
  const [user, setUser] = useState<OrganizationUser | null>(null);
  const [form, setForm] = useState<EditForm | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!userId) return;

    async function loadUser() {
      const response = await fetch("/api/users", { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; data?: OrganizationUser[]; error?: string } | null;
      if (!response.ok || !payload?.ok) {
        setError(payload?.error ?? "Не удалось загрузить пользователя");
        setIsLoading(false);
        return;
      }

      const found = (payload.data ?? []).find((item) => item.userId === userId) ?? null;
      if (!found || found.roleCode === "owner" || !isManageableRoleCode(found.roleCode)) {
        setError(found?.roleCode === "owner" ? "Владелец не может быть изменен." : "Пользователь не найден.");
        setIsLoading(false);
        return;
      }

      setUser(found);
      setForm({
        firstName: found.firstName,
        lastName: found.lastName,
        phone: found.phone,
        roleCode: found.roleCode,
        additionalRoleCodes: found.additionalRoleCodes,
        status: found.status === "active" ? "active" : "paused",
      });
      setIsLoading(false);
    }

    void loadUser();
  }, [userId]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !form || !form.firstName.trim() || !form.lastName.trim()) return;

    setIsSaving(true);
    setError("");
    const response = await fetch("/api/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: user.userId,
        ...form,
        additionalPermissions: user.additionalPermissions,
        deniedPermissions: user.deniedPermissions,
      }),
    });
    const payload = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;

    if (!response.ok || !payload?.ok) {
      setError(payload?.error ?? "Не удалось обновить пользователя");
      setIsSaving(false);
      return;
    }

    router.replace(`/users/${user.userId}`);
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
              <Link href={user ? `/users/${user.userId}` : "/users"} className="text-sm text-cyan-300">К карточке пользователя</Link>
            </div>

            {isLoading || !user || !form ? (
              <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-6 text-slate-300">{isLoading ? "Загрузка..." : error}</div>
            ) : (
              <form onSubmit={handleSubmit} className="rounded-2xl border border-white/10 bg-slate-900/80 p-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label><span className="text-sm text-slate-300">Имя</span><input required value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none" /></label>
                  <label><span className="text-sm text-slate-300">Фамилия</span><input required value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none" /></label>
                  <label><span className="text-sm text-slate-300">Email</span><input readOnly value={user.email} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-400 outline-none" /></label>
                  <label><span className="text-sm text-slate-300">Телефон</span><input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none" /></label>
                  <label><span className="text-sm text-slate-300">Основная роль</span><select value={form.roleCode} onChange={(event) => { const roleCode = event.target.value as ManageableOrganizationRoleCode; setForm({ ...form, roleCode, additionalRoleCodes: form.additionalRoleCodes.filter((role) => role !== roleCode) }); }} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm outline-none">{MANAGEABLE_ORGANIZATION_ROLE_CODES.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}</select></label>
                  <label><span className="text-sm text-slate-300">Статус</span><select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as ManageableMemberStatus })} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm outline-none"><option value="active">Активен</option><option value="paused">Приостановлен</option></select></label>
                  <fieldset className="sm:col-span-2">
                    <legend className="text-sm text-slate-300">Дополнительные роли</legend>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {ADDITIONAL_ORGANIZATION_ROLE_CODES.filter((role) => role !== form.roleCode).map((role) => (
                        <label key={role} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm">
                          <input
                            type="checkbox"
                            checked={form.additionalRoleCodes.includes(role)}
                            onChange={(event) => setForm({
                              ...form,
                              additionalRoleCodes: event.target.checked
                                ? [...form.additionalRoleCodes, role]
                                : form.additionalRoleCodes.filter((item) => item !== role),
                            })}
                          />
                          {roleLabels[role]}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                </div>

                {error ? <p className="mt-4 text-sm text-rose-400">{error}</p> : null}
                <div className="mt-6 flex gap-2">
                  <button type="submit" disabled={isSaving} className="rounded-2xl bg-cyan-500/20 px-4 py-2 font-semibold text-cyan-200 disabled:opacity-50">{isSaving ? "Сохранение..." : "Сохранить"}</button>
                  <Link href={`/users/${user.userId}`} className="rounded-2xl bg-white/5 px-4 py-2">Отмена</Link>
                </div>
              </form>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
