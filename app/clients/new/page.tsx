"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import ClientForm from "@/app/clients/client-form";
import { createClient } from "@/lib/clients/client-repository";
import { initialClientDraft, type ClientDraft } from "@/types/client";

export default function NewClientPage() {
  const router = useRouter();
  const [form, setForm] = useState<ClientDraft>(initialClientDraft);
  const [errors, setErrors] = useState<Partial<Record<keyof ClientDraft, string>>>({});

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
    if (!validate()) return;

    const client = createClient(form);
    router.replace(`/clients/${client.id}`);
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_32%),linear-gradient(135deg,_#020617_0%,_#0f172a_100%)] text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col lg:flex-row">
        <Sidebar />
        <div className="flex-1">
          <Header showSearch={false} showNewListing={false} />
          <main className="p-6">
            <div className="mb-6 flex items-center justify-between">
              <h1 className="text-2xl font-semibold">Новый клиент</h1>
              <Link href="/clients" className="text-sm text-cyan-300">К списку клиентов</Link>
            </div>

            <form onSubmit={handleSubmit} className="rounded-2xl border border-white/10 bg-slate-900/80 p-6">
              <ClientForm value={form} errors={errors} onChange={update} />

              <div className="mt-6 flex gap-2">
                <button type="submit" className="rounded-2xl bg-cyan-500/20 px-4 py-2 font-semibold text-cyan-200">Сохранить</button>
                <Link href="/clients" className="rounded-2xl bg-white/5 px-4 py-2">Отмена</Link>
              </div>
            </form>
          </main>
        </div>
      </div>
    </div>
  );
}
