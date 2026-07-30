"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { deleteClient, getClients } from "@/lib/clients/client-repository";
import type { Client } from "@/types/client";

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("ru-RU");
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    setClients(getClients());
  }, []);

  const filteredClients = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return clients;

    return clients.filter((client) => {
      const name = `${client.firstName} ${client.lastName}`.toLowerCase();
      return (
        name.includes(normalized) ||
        client.phone.toLowerCase().includes(normalized) ||
        client.email.toLowerCase().includes(normalized)
      );
    });
  }, [clients, query]);

  function handleDelete(id: string) {
    if (!confirm("Удалить клиента?")) return;
    deleteClient(id);
    setClients(getClients());
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
                <h1 className="text-2xl font-semibold">Клиенты</h1>
                <p className="mt-1 text-sm text-slate-400">База гостей и арендаторов</p>
              </div>
              <Link href="/clients/new" className="rounded-2xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-500/20">
                + Новый клиент
              </Link>
            </div>

            <div className="mb-4">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Поиск: имя, телефон или email"
                className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white outline-none"
              />
            </div>

            <div className="overflow-x-auto rounded-2xl border border-white/10 bg-slate-900/80">
              <table className="min-w-full text-sm">
                <thead className="bg-white/5 text-left text-slate-300">
                  <tr>
                    <th className="px-4 py-3">Клиент</th>
                    <th className="px-4 py-3">Телефон</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Язык</th>
                    <th className="px-4 py-3">Создан</th>
                    <th className="px-4 py-3">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClients.map((client) => (
                    <tr key={client.id} className="border-t border-white/5">
                      <td className="px-4 py-3">
                        <div className="font-medium text-white">{client.firstName} {client.lastName}</div>
                        <div className="text-xs text-slate-400">{client.nationality || "—"}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-300">{client.phone || "—"}</td>
                      <td className="px-4 py-3 text-slate-300">{client.email || "—"}</td>
                      <td className="px-4 py-3 text-slate-300">{client.language || "—"}</td>
                      <td className="px-4 py-3 text-slate-300">{formatDate(client.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <Link href={`/clients/${client.id}`} className="rounded-xl border border-white/10 px-3 py-1 text-xs text-slate-300">Открыть</Link>
                          <Link href={`/clients/${client.id}/edit`} className="rounded-xl border border-white/10 px-3 py-1 text-xs text-slate-300">Редактировать</Link>
                          <button type="button" onClick={() => handleDelete(client.id)} className="rounded-xl border border-white/10 px-3 py-1 text-xs text-rose-300">Удалить</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
