"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import ClientForm from "@/app/clients/client-form";
import { getClientById, updateClient } from "@/lib/clients/client-repository";
import { initialClientDraft, type Client, type ClientDraft } from "@/types/client";

export default function EditClientPage() {
  const params = useParams();
  const clientId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const router = useRouter();

  const [client, setClient] = useState<Client | null>(null);
  const [form, setForm] = useState<ClientDraft>(initialClientDraft);
  const [errors, setErrors] = useState<Partial<Record<keyof ClientDraft, string>>>({});

  useEffect(() => {
    if (!clientId) return;
    const found = getClientById(clientId);
    if (!found) return;
    setClient(found);
    setForm({
      firstName: found.firstName,
      lastName: found.lastName,
      phone: found.phone,
      email: found.email,
      nationality: found.nationality,
      documentType: found.documentType,
      documentNumber: found.documentNumber,
      dateOfBirth: found.dateOfBirth,
      language: found.language,
      notes: found.notes,
    });
  }, [clientId]);

  function update<K extends keyof ClientDraft>(key: K, value: ClientDraft[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => ({ ...previous, [key]: undefined }));
  }

  function validate(): boolean {
    const nextErrors: Partial<Record<keyof ClientDraft, string>> = {};
    if (!form.firstName.trim()) nextErrors.firstName = "Введите имя";
    if (!form.lastName.trim()) nextErrors.lastName = "Введите фамилию";
    if (!form.phone.trim()) nextErrors.phone = "Введите телефон";
    if (!form.email.trim()) nextErrors.email = "Введите email";
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client || !validate()) return;

    const updated = updateClient({
      ...client,
      ...form,
    });

    router.replace(`/clients/${updated.id}`);
  }

  if (!client) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_32%),linear-gradient(135deg,_#020617_0%,_#0f172a_100%)] text-slate-100">
        <div className="mx-auto flex min-h-screen max-w-7xl flex-col lg:flex-row">
          <Sidebar />
          <div className="flex-1">
            <Header showSearch={false} showNewListing={false} />
            <main className="p-6">
              <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-6 text-slate-300">Клиент не найден.</div>
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
            <div className="mb-6 flex items-center justify-between">
              <h1 className="text-2xl font-semibold">Редактирование клиента</h1>
              <Link href={`/clients/${client.id}`} className="text-sm text-cyan-300">К карточке клиента</Link>
            </div>

            <form onSubmit={handleSubmit} className="rounded-2xl border border-white/10 bg-slate-900/80 p-6">
              <ClientForm value={form} errors={errors} onChange={update} />

              <div className="mt-6 flex gap-2">
                <button type="submit" className="rounded-2xl bg-cyan-500/20 px-4 py-2 font-semibold text-cyan-200">Сохранить</button>
                <Link href={`/clients/${client.id}`} className="rounded-2xl bg-white/5 px-4 py-2">Отмена</Link>
              </div>
            </form>
          </main>
        </div>
      </div>
    </div>
  );
}
