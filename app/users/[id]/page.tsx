"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { userRepository } from "@/lib/repositories/users";
import type { User } from "@/types/user";

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("ru-RU");
}

export default function UserDetailsPage() {
  const params = useParams();
  const userId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    if (!userId) return;
    setUser(userRepository.getById(userId));
  }, [userId]);

  function handleDelete() {
    if (!user) return;

    const baseConfirmed = confirm("Удалить пользователя?");
    if (!baseConfirmed) return;

    if (user.role === "Владелец") {
      const ownerConfirmed = confirm("Вы удаляете владельца. Подтвердите удаление еще раз.");
      if (!ownerConfirmed) return;
    }

    userRepository.remove(user.id);
    router.replace("/users");
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
              <div>
                <h1 className="text-2xl font-semibold">{user.firstName} {user.lastName}</h1>
                <p className="text-sm text-slate-400">Карточка пользователя</p>
              </div>
              <div className="flex gap-2">
                <Link href="/users" className="rounded-xl border border-white/10 px-3 py-2 text-sm">Назад</Link>
                <Link href={`/users/${user.id}/edit`} className="rounded-xl border border-white/10 px-3 py-2 text-sm">Редактировать</Link>
                <button type="button" onClick={handleDelete} className="rounded-xl border border-white/10 px-3 py-2 text-sm text-rose-300">Удалить</button>
              </div>
            </div>

            <section className="rounded-2xl border border-white/10 bg-slate-900/80 p-6">
              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <p><span className="text-slate-400">Имя:</span> {user.firstName}</p>
                <p><span className="text-slate-400">Фамилия:</span> {user.lastName}</p>
                <p><span className="text-slate-400">Email:</span> {user.email}</p>
                <p><span className="text-slate-400">Телефон:</span> {user.phone || "—"}</p>
                <p><span className="text-slate-400">Роль:</span> {user.role}</p>
                <p><span className="text-slate-400">Статус:</span> {user.status}</p>
                <p><span className="text-slate-400">Язык:</span> {user.language}</p>
                <p><span className="text-slate-400">Организация:</span> {user.organizationId}</p>
                <p><span className="text-slate-400">Создан:</span> {formatDate(user.createdAt)}</p>
                <p><span className="text-slate-400">Обновлен:</span> {formatDate(user.updatedAt)}</p>
                <p><span className="text-slate-400">Код приглашения:</span> {user.invitationCode ?? "—"}</p>
                <p><span className="text-slate-400">Пригласил:</span> {user.invitedByUserId ?? "—"}</p>
                <p><span className="text-slate-400">Подтвердил:</span> {user.approvedByUserId ?? "—"}</p>
              </div>
              {user.notes ? <p className="mt-4 rounded-xl bg-white/5 p-3 text-sm text-slate-300">{user.notes}</p> : null}
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}
