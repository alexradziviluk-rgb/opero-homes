"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import type { OrganizationUser } from "@/types/organization-user";

const roleLabels: Record<string, string> = {
  owner: "Владелец",
  manager: "Менеджер",
  employee: "Сотрудник",
  cleaner: "Уборщик",
  maintenance: "Специалист по обслуживанию",
};

const statusLabels: Record<string, string> = {
  active: "Активен",
  paused: "Приостановлен",
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("ru-RU");
}

export default function UserDetailsPage() {
  const params = useParams();
  const userId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const [user, setUser] = useState<OrganizationUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

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

      setUser((payload.data ?? []).find((item) => item.userId === userId) ?? null);
      setIsLoading(false);
    }

    void loadUser();
  }, [userId]);

  if (isLoading || !user) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_32%),linear-gradient(135deg,_#020617_0%,_#0f172a_100%)] text-slate-100">
        <div className="mx-auto flex min-h-screen max-w-7xl flex-col lg:flex-row">
          <Sidebar />
          <div className="flex-1">
            <Header showSearch={false} showNewListing={false} />
            <main className="p-6">
              <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-6 text-slate-300">{isLoading ? "Загрузка..." : error || "Пользователь не найден."}</div>
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
              <div>
                <h1 className="text-2xl font-semibold">{user.firstName} {user.lastName}</h1>
                <p className="text-sm text-slate-400">Карточка пользователя</p>
              </div>
              <div className="flex gap-2">
                <Link href="/users" className="rounded-xl border border-white/10 px-3 py-2 text-sm">Назад</Link>
                {user.roleCode !== "owner" ? <Link href={`/users/${user.userId}/edit`} className="rounded-xl border border-white/10 px-3 py-2 text-sm">Редактировать</Link> : null}
              </div>
            </div>

            <section className="rounded-2xl border border-white/10 bg-slate-900/80 p-6">
              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <p><span className="text-slate-400">Имя:</span> {user.firstName}</p>
                <p><span className="text-slate-400">Фамилия:</span> {user.lastName}</p>
                <p><span className="text-slate-400">Email:</span> {user.email}</p>
                <p><span className="text-slate-400">Телефон:</span> {user.phone || "—"}</p>
                <p><span className="text-slate-400">Основная роль:</span> {roleLabels[user.roleCode] ?? user.roleCode}</p>
                <p><span className="text-slate-400">Дополнительные роли:</span> {user.additionalRoleCodes.length > 0 ? user.additionalRoleCodes.map((role) => roleLabels[role] ?? role).join(", ") : "—"}</p>
                <p><span className="text-slate-400">Статус:</span> {statusLabels[user.status] ?? user.status}</p>
                <p><span className="text-slate-400">Организация:</span> {user.organizationId}</p>
                <p><span className="text-slate-400">Создан:</span> {formatDate(user.createdAt)}</p>
                <p><span className="text-slate-400">Обновлен:</span> {formatDate(user.updatedAt)}</p>
                <p><span className="text-slate-400">Присоединился:</span> {formatDate(user.joinedAt)}</p>
              </div>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}
