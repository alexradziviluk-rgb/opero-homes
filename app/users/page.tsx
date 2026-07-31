"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { getEffectivePermissions, hasPermissionInList } from "@/lib/permissions";
import { useCurrentUser } from "@/components/auth/current-user-provider";
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
  blocked: "Заблокирован",
  inactive: "Неактивен",
  invited: "Приглашен",
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("ru-RU");
}

export default function UsersPage() {
  const { currentUser, isAuthLoading } = useCurrentUser();
  const effectivePermissions = useMemo(() => (currentUser ? getEffectivePermissions(currentUser) : []), [currentUser]);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [users, setUsers] = useState<OrganizationUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadUsers() {
      setIsLoading(true);
      const response = await fetch("/api/users", { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; data?: OrganizationUser[]; error?: string } | null;

      if (cancelled) return;
      if (!response.ok || !payload?.ok) {
        setError(payload?.error ?? "Не удалось загрузить пользователей");
        setIsLoading(false);
        return;
      }

      setUsers(payload.data ?? []);
      setError("");
      setIsLoading(false);
    }

    void loadUsers();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredUsers = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return users.filter((user) => {
      const roleMatch = roleFilter === "all" || user.roleCode === roleFilter;
      const statusMatch = statusFilter === "all" || user.status === statusFilter;

      if (!normalized) return roleMatch && statusMatch;

      const fullName = `${user.firstName} ${user.lastName}`.toLowerCase();
      const queryMatch =
        fullName.includes(normalized) ||
        user.email.toLowerCase().includes(normalized) ||
        user.phone.toLowerCase().includes(normalized);

      return roleMatch && statusMatch && queryMatch;
    });
  }, [users, query, roleFilter, statusFilter]);

  async function toggleStatus(user: OrganizationUser) {
    if (user.roleCode === "owner") return;

    const nextStatus = user.status === "active" ? "paused" : "active";
    const response = await fetch("/api/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...user, status: nextStatus }),
    });
    const payload = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;

    if (!response.ok || !payload?.ok) {
      setError(payload?.error ?? "Не удалось изменить статус пользователя");
      return;
    }

    setUsers((current) => current.map((item) => (item.userId === user.userId ? { ...item, status: nextStatus } : item)));
    setError("");
  }

  const canViewUsers = hasPermissionInList(effectivePermissions, "users.view");
  const canManageUsers = hasPermissionInList(effectivePermissions, "users.manage");
  const canInviteUsers = hasPermissionInList(effectivePermissions, "users.invite");

  if (isAuthLoading) {
    return <div className="p-6 text-slate-300">Загрузка...</div>;
  }

  if (!currentUser) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_32%),linear-gradient(135deg,_#020617_0%,_#0f172a_100%)] text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col lg:flex-row">
        <Sidebar />
        <div className="flex-1">
          <Header showSearch={false} showNewListing={false} />
          <main className="p-6">
            {!canViewUsers ? (
              <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-6 text-slate-300">Недостаточно прав для просмотра пользователей.</div>
            ) : (
              <>
                <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h1 className="text-2xl font-semibold">Пользователи</h1>
                    <p className="mt-1 text-sm text-slate-400">Управление сотрудниками организации</p>
                  </div>
                  {canInviteUsers ? (
                    <Link href="/users/invite" className="rounded-2xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-500/20">
                      + Пригласить сотрудника
                    </Link>
                  ) : null}
                </div>

                <div className="mb-4 grid gap-3 sm:grid-cols-3">
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Поиск по имени, телефону, email"
                    className="rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white outline-none sm:col-span-2"
                  />

                  <div className="grid grid-cols-2 gap-3">
                    <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} className="rounded-2xl border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-slate-200">
                      <option value="all">Все роли</option>
                      {Object.entries(roleLabels).map(([role, label]) => (
                        <option key={role} value={role}>{label}</option>
                      ))}
                    </select>

                    <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-2xl border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-slate-200">
                      <option value="all">Все статусы</option>
                      {Object.entries(statusLabels).map(([status, label]) => (
                        <option key={status} value={status}>{label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {error ? <div className="mb-4 rounded-xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}

                <div className="overflow-x-auto rounded-2xl border border-white/10 bg-slate-900/80">
                  <table className="min-w-full text-sm">
                    <thead className="bg-white/5 text-left text-slate-300">
                      <tr>
                        <th className="px-4 py-3">Пользователь</th>
                        <th className="px-4 py-3">Email</th>
                        <th className="px-4 py-3">Телефон</th>
                        <th className="px-4 py-3">Роль</th>
                        <th className="px-4 py-3">Статус</th>
                        <th className="px-4 py-3">Создан</th>
                        <th className="px-4 py-3">Действия</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.map((user) => (
                        <tr key={user.userId} className="border-t border-white/5">
                          <td className="px-4 py-3">
                            <div className="font-medium text-white">{user.firstName} {user.lastName}</div>
                          </td>
                          <td className="px-4 py-3 text-slate-300">{user.email}</td>
                          <td className="px-4 py-3 text-slate-300">{user.phone || "—"}</td>
                          <td className="px-4 py-3 text-slate-300">{roleLabels[user.roleCode] ?? user.roleCode}</td>
                          <td className="px-4 py-3 text-slate-300">{statusLabels[user.status] ?? user.status}</td>
                          <td className="px-4 py-3 text-slate-300">{formatDate(user.createdAt)}</td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-2">
                              <Link href={`/users/${user.userId}`} className="rounded-xl border border-white/10 px-3 py-1 text-xs text-slate-300">Открыть</Link>
                              {canManageUsers && user.roleCode !== "owner" ? <Link href={`/users/${user.userId}/edit`} className="rounded-xl border border-white/10 px-3 py-1 text-xs text-slate-300">Редактировать</Link> : null}
                              {canManageUsers && user.roleCode !== "owner" ? <button type="button" onClick={() => void toggleStatus(user)} className="rounded-xl border border-white/10 px-3 py-1 text-xs text-amber-300">{user.status === "active" ? "Приостановить" : "Активировать"}</button> : null}
                            </div>
                          </td>
                        </tr>
                      ))}
                      {!isLoading && filteredUsers.length === 0 ? (
                        <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">Пользователи не найдены.</td></tr>
                      ) : null}
                      {isLoading ? (
                        <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">Загрузка...</td></tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
