"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { userRepository } from "@/lib/repositories/users";
import { getEffectivePermissions, hasPermissionInList } from "@/lib/permissions";
import { canApproveUser } from "@/lib/permissions/access-control";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import type { User, UserRole, UserStatus } from "@/types/user";

const roleOptions: UserRole[] = [
  "Владелец",
  "Администратор",
  "Менеджер",
  "Сотрудник",
  "Уборщик",
  "Технический специалист",
  "Гость",
];

const statusOptions: UserStatus[] = [
  "Приглашен",
  "Ожидает подтверждения",
  "Активен",
  "Заблокирован",
  "Приглашение истекло",
];

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("ru-RU");
}

export default function UsersPage() {
  const { currentUser, isAuthLoading } = useCurrentUser();
  const effectivePermissions = useMemo(() => (currentUser ? getEffectivePermissions(currentUser) : []), [currentUser]);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<UserRole | "all">("all");
  const [statusFilter, setStatusFilter] = useState<UserStatus | "all">("all");
  const [version, setVersion] = useState(0);

  const users = useMemo(() => userRepository.getAll(), [version]);

  const filteredUsers = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return users.filter((user) => {
      const roleMatch = roleFilter === "all" || user.role === roleFilter;
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

  function handleDelete(user: User) {
    const baseConfirm = confirm("Удалить пользователя?");
    if (!baseConfirm) return;

    if (user.role === "Владелец") {
      const ownerConfirm = confirm("Вы удаляете владельца. Подтвердите удаление еще раз.");
      if (!ownerConfirm) return;
    }

    userRepository.remove(user.id);
    setVersion((current) => current + 1);
  }

  function handleApprove(user: User) {
    if (!currentUser) {
      return;
    }

    userRepository.approve(user.id, currentUser.id);
    setVersion((current) => current + 1);
  }

  function handleBlock(user: User) {
    if (!currentUser) {
      return;
    }

    userRepository.block(user.id, currentUser.id);
    setVersion((current) => current + 1);
  }

  const canViewUsers = hasPermissionInList(effectivePermissions, "users.view");
  const canManageUsers = hasPermissionInList(effectivePermissions, "users.manage");
  const canInviteUsers = hasPermissionInList(effectivePermissions, "users.invite");
  const canApproveUsers = currentUser ? canApproveUser(currentUser) : false;
  const canBlockUsers = hasPermissionInList(effectivePermissions, "users.block");

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
                    <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as UserRole | "all")} className="rounded-2xl border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-slate-200">
                      <option value="all">Все роли</option>
                      {roleOptions.map((role) => (
                        <option key={role} value={role}>{role}</option>
                      ))}
                    </select>

                    <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as UserStatus | "all")} className="rounded-2xl border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-slate-200">
                      <option value="all">Все статусы</option>
                      {statusOptions.map((status) => (
                        <option key={status} value={status}>{status}</option>
                      ))}
                    </select>
                  </div>
                </div>

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
                        <tr key={user.id} className="border-t border-white/5">
                          <td className="px-4 py-3">
                            <div className="font-medium text-white">{user.firstName} {user.lastName}</div>
                          </td>
                          <td className="px-4 py-3 text-slate-300">{user.email}</td>
                          <td className="px-4 py-3 text-slate-300">{user.phone || "—"}</td>
                          <td className="px-4 py-3 text-slate-300">{user.role}</td>
                          <td className="px-4 py-3 text-slate-300">{user.status}</td>
                          <td className="px-4 py-3 text-slate-300">{formatDate(user.createdAt)}</td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-2">
                              <Link href={`/users/${user.id}`} className="rounded-xl border border-white/10 px-3 py-1 text-xs text-slate-300">Открыть</Link>
                              {canManageUsers ? <Link href={`/users/${user.id}/edit`} className="rounded-xl border border-white/10 px-3 py-1 text-xs text-slate-300">Редактировать</Link> : null}
                              {canApproveUsers && user.status === "Ожидает подтверждения" ? <button type="button" onClick={() => handleApprove(user)} className="rounded-xl border border-white/10 px-3 py-1 text-xs text-emerald-300">Подтвердить</button> : null}
                              {canBlockUsers && user.status !== "Заблокирован" ? <button type="button" onClick={() => handleBlock(user)} className="rounded-xl border border-white/10 px-3 py-1 text-xs text-amber-300">Блокировать</button> : null}
                              {canManageUsers ? <button type="button" onClick={() => handleDelete(user)} className="rounded-xl border border-white/10 px-3 py-1 text-xs text-rose-300">Удалить</button> : null}
                            </div>
                          </td>
                        </tr>
                      ))}
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
