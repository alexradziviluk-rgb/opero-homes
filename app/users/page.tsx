"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { getEffectivePermissions, hasPermissionInList } from "@/lib/permissions";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { useAdminText } from "@/lib/i18n/admin";
import type { ManagedEmployeeInvitation } from "@/types/invitation";
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
  const translate = useAdminText();
  const effectivePermissions = useMemo(() => (currentUser ? getEffectivePermissions(currentUser) : []), [currentUser]);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [users, setUsers] = useState<OrganizationUser[]>([]);
  const [invitations, setInvitations] = useState<ManagedEmployeeInvitation[]>([]);
  const [revokingInvitationId, setRevokingInvitationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadUsers() {
      setIsLoading(true);
      const [usersResponse, invitationsResponse] = await Promise.all([
        fetch("/api/users", { cache: "no-store" }),
        fetch("/api/users/invitations", { cache: "no-store" }),
      ]);
      const usersPayload = (await usersResponse.json().catch(() => null)) as { ok?: boolean; data?: OrganizationUser[]; error?: string } | null;
      const invitationsPayload = (await invitationsResponse.json().catch(() => null)) as { ok?: boolean; data?: ManagedEmployeeInvitation[]; error?: string } | null;

      if (cancelled) return;
      if (!usersResponse.ok || !usersPayload?.ok || !invitationsResponse.ok || !invitationsPayload?.ok) {
        setError(usersPayload?.error ?? invitationsPayload?.error ?? "Не удалось загрузить управление пользователями");
        setIsLoading(false);
        return;
      }

      setUsers(usersPayload.data ?? []);
      setInvitations(invitationsPayload.data ?? []);
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
      const roleMatch = roleFilter === "all" || user.roleCode === roleFilter || user.additionalRoleCodes.some((role) => role === roleFilter);
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

  async function revokeInvitation(invitation: ManagedEmployeeInvitation) {
    if (!confirm(`Отозвать приглашение для ${invitation.email}? После этого адрес можно будет пригласить заново.`)) return;

    setRevokingInvitationId(invitation.invitationId);
    setError("");
    try {
      const response = await fetch("/api/users/invitations", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invitationId: invitation.invitationId }),
      });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !payload?.ok) {
        setError(payload?.error ?? "Не удалось отозвать приглашение");
        return;
      }

      setInvitations((current) => current.filter((item) => item.invitationId !== invitation.invitationId));
    } catch {
      setError("Не удалось отозвать приглашение");
    } finally {
      setRevokingInvitationId(null);
    }
  }

  const canViewUsers = hasPermissionInList(effectivePermissions, "users.view");
  const canManageUsers = hasPermissionInList(effectivePermissions, "users.manage");
  const canInviteUsers = hasPermissionInList(effectivePermissions, "users.invite");

  if (isAuthLoading) {
    return <div className="p-6 text-slate-300">{translate("Загрузка...")}</div>;
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
              <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-6 text-slate-300">{translate("Недостаточно прав для просмотра пользователей.")}</div>
            ) : (
              <>
                <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h1 className="text-2xl font-semibold">{translate("Управление пользователями")}</h1>
                    <p className="mt-1 text-sm text-slate-400">{translate("Приглашения, роли, статусы active/paused и права доступа")}</p>
                  </div>
                  {canInviteUsers ? (
                    <Link href="/users/invite" className="rounded-2xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-500/20">
                      + {translate("Пригласить сотрудника")}
                    </Link>
                  ) : null}
                </div>

                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-y border-white/10 py-3 text-sm text-slate-300">
                  <span>{translate("Ежедневные назначения, задачи и загрузка команды находятся в разделе сотрудников.")}</span>
                  <Link href="/employees" className="text-cyan-300 hover:underline">{translate("Открыть сотрудников")}</Link>
                </div>

                <div className="mb-4 grid gap-3 sm:grid-cols-3">
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={translate("Поиск по имени, телефону, email")}
                    className="rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white outline-none sm:col-span-2"
                  />

                  <div className="grid grid-cols-2 gap-3">
                    <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} className="rounded-2xl border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-slate-200">
                      <option value="all">{translate("Все роли")}</option>
                      {Object.entries(roleLabels).map(([role, label]) => (
                        <option key={role} value={role}>{label}</option>
                      ))}
                    </select>

                    <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-2xl border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-slate-200">
                      <option value="all">{translate("Все статусы")}</option>
                      {Object.entries(statusLabels).map(([status, label]) => (
                        <option key={status} value={status}>{label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {error ? <div className="mb-4 rounded-xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}

                <section className="mb-6 border-y border-white/10 bg-slate-900/50 py-4">
                  <div className="mb-3 flex items-center justify-between gap-3 px-4">
                    <div>
                      <h2 className="font-semibold text-white">{translate("Активные приглашения")}</h2>
                      <p className="text-xs text-slate-400">{translate("Непринятое приглашение можно отозвать и отправить заново.")}</p>
                    </div>
                    <span className="text-sm text-slate-400">{invitations.length}</span>
                  </div>
                  {invitations.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-slate-400">{translate("Активных приглашений нет.")}</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead className="bg-white/5 text-left text-slate-300">
                          <tr>
                            <th className="px-4 py-3">Сотрудник</th>
                            <th className="px-4 py-3">Email</th>
                            <th className="px-4 py-3">Роль</th>
                            <th className="px-4 py-3">Действует до</th>
                            <th className="px-4 py-3">Действия</th>
                          </tr>
                        </thead>
                        <tbody>
                          {invitations.map((invitation) => (
                            <tr key={invitation.invitationId} className="border-t border-white/5">
                              <td className="px-4 py-3 text-white">{`${invitation.firstName ?? ""} ${invitation.lastName ?? ""}`.trim() || "Без имени"}</td>
                              <td className="px-4 py-3 text-slate-300">{invitation.email}</td>
                              <td className="px-4 py-3 text-slate-300">{roleLabels[invitation.roleCode] ?? invitation.roleCode}</td>
                              <td className="px-4 py-3 text-slate-300">{formatDate(invitation.expiresAt)}</td>
                              <td className="px-4 py-3">
                                <button
                                  type="button"
                                  disabled={revokingInvitationId === invitation.invitationId}
                                  onClick={() => void revokeInvitation(invitation)}
                                  className="rounded-xl border border-rose-400/30 px-3 py-1 text-xs text-rose-300 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {revokingInvitationId === invitation.invitationId ? "Отзываем..." : "Отозвать"}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>

                <div className="overflow-x-auto rounded-2xl border border-white/10 bg-slate-900/80">
                  <table className="min-w-full text-sm">
                    <thead className="bg-white/5 text-left text-slate-300">
                      <tr>
                            <th className="px-4 py-3">{translate("Пользователь")}</th>
                        <th className="px-4 py-3">Email</th>
                        <th className="px-4 py-3">{translate("Телефон")}</th>
                        <th className="px-4 py-3">{translate("Роль")}</th>
                        <th className="px-4 py-3">{translate("Статус")}</th>
                        <th className="px-4 py-3">{translate("Создан")}</th>
                        <th className="px-4 py-3">{translate("Действия")}</th>
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
                          <td className="px-4 py-3 text-slate-300">{[user.roleCode, ...user.additionalRoleCodes].map((role) => roleLabels[role] ?? role).join(" + ")}</td>
                          <td className="px-4 py-3 text-slate-300">{statusLabels[user.status] ?? user.status}</td>
                          <td className="px-4 py-3 text-slate-300">{formatDate(user.createdAt)}</td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-2">
                              <Link href={`/users/${user.userId}`} className="rounded-xl border border-white/10 px-3 py-1 text-xs text-slate-300">{translate("Открыть")}</Link>
                              {canManageUsers && user.roleCode !== "owner" ? <Link href={`/users/${user.userId}/edit`} className="rounded-xl border border-white/10 px-3 py-1 text-xs text-slate-300">{translate("Редактировать")}</Link> : null}
                              {canManageUsers && user.roleCode !== "owner" ? <button type="button" onClick={() => void toggleStatus(user)} className="rounded-xl border border-white/10 px-3 py-1 text-xs text-amber-300">{translate(user.status === "active" ? "Приостановить" : "Активировать")}</button> : null}
                            </div>
                          </td>
                        </tr>
                      ))}
                      {!isLoading && filteredUsers.length === 0 ? (
                        <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">{translate("Пользователи не найдены.")}</td></tr>
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
