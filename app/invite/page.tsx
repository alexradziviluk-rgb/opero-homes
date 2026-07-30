"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { buildInvitationNextPath, mapInviteRoleCodeToUserRoleLabel } from "@/lib/users/invitations";
import type { EmployeeInvitationLookup } from "@/types/invitation";

type InvitationResponse =
  | { ok: true; data: EmployeeInvitationLookup }
  | { ok: false; errorCode: string; error: string };

export default function InvitationPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_32%),linear-gradient(135deg,_#020617_0%,_#0f172a_100%)] px-6 py-16 text-slate-100">
          <section className="w-full max-w-xl rounded-3xl border border-white/10 bg-slate-900/80 p-8 shadow-2xl shadow-cyan-950/30">
            <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">Opero Homes</p>
            <h1 className="mt-3 text-3xl font-semibold text-white">Приглашение сотрудника</h1>
            <p className="mt-6 text-sm text-slate-300">Проверяем приглашение...</p>
          </section>
        </main>
      }
    >
      <InvitationPageContent />
    </Suspense>
  );
}

function InvitationPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentUser, isAuthLoading } = useCurrentUser();
  const inviteToken = searchParams.get("invite")?.trim() ?? "";
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [invitation, setInvitation] = useState<EmployeeInvitationLookup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    if (!inviteToken) {
      setError("Токен приглашения отсутствует.");
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadInvitation() {
      try {
        const response = await fetch(`/api/invitations?invite=${encodeURIComponent(inviteToken)}`, { cache: "no-store" });
        const payload = (await response.json()) as InvitationResponse;
        if (cancelled) {
          return;
        }

        if (!response.ok || !payload.ok) {
          setError(payload.ok ? "Не удалось загрузить приглашение." : payload.error);
          setInvitation(null);
          return;
        }

        setInvitation(payload.data);
      } catch {
        if (!cancelled) {
          setError("Не удалось загрузить приглашение.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadInvitation();

    return () => {
      cancelled = true;
    };
  }, [inviteToken]);

  const nextPath = useMemo(() => (inviteToken ? buildInvitationNextPath(inviteToken) : "/invite"), [inviteToken]);

  async function acceptInvitation() {
    if (!inviteToken) {
      setError("Токен приглашения отсутствует.");
      return;
    }

    setAccepting(true);
    setError(null);

    try {
      const response = await fetch("/api/invitations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ invite: inviteToken }),
      });

      const payload = (await response.json()) as InvitationResponse | { ok: true };
      if (!response.ok || !payload.ok) {
        setError("error" in payload ? payload.error : "Не удалось принять приглашение.");
        return;
      }

      setAccepted(true);
      router.replace("/admin");
      router.refresh();
    } catch {
      setError("Не удалось принять приглашение.");
    } finally {
      setAccepting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_32%),linear-gradient(135deg,_#020617_0%,_#0f172a_100%)] px-6 py-16 text-slate-100">
      <section className="w-full max-w-xl rounded-3xl border border-white/10 bg-slate-900/80 p-8 shadow-2xl shadow-cyan-950/30">
        <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">Opero Homes</p>
        <h1 className="mt-3 text-3xl font-semibold text-white">Приглашение сотрудника</h1>

        {loading ? <p className="mt-6 text-sm text-slate-300">Проверяем приглашение...</p> : null}
        {!loading && error ? <p className="mt-6 text-sm text-rose-300">{error}</p> : null}

        {!loading && invitation ? (
          <div className="mt-6 space-y-4 text-sm text-slate-300">
            <p>Организация: <span className="text-white">{invitation.organizationName}</span></p>
            <p>Email: <span className="text-white">{invitation.email}</span></p>
            <p>Роль: <span className="text-white">{mapInviteRoleCodeToUserRoleLabel(invitation.roleCode)}</span></p>
            <p>Срок действия: <span className="text-white">{new Date(invitation.expiresAt).toLocaleString("ru-RU")}</span></p>

            {accepted ? <p className="text-emerald-300">Приглашение принято. Перенаправляем в панель управления...</p> : null}

            {!currentUser && !isAuthLoading ? (
              <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                <p className="text-slate-200">Для принятия приглашения нужно войти или создать аккаунт с этим email.</p>
                <div className="flex flex-wrap gap-2">
                  <Link href={`/guest/register?next=${encodeURIComponent(nextPath)}&email=${encodeURIComponent(invitation.email)}`} className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/20">Создать аккаунт</Link>
                  <Link href={`/guest/login?next=${encodeURIComponent(nextPath)}`} className="rounded-2xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-500/20">Войти как новый пользователь</Link>
                  <Link href={`/login?next=${encodeURIComponent(nextPath)}`} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 hover:bg-white/10">Войти как существующий сотрудник</Link>
                </div>
              </div>
            ) : null}

            {currentUser ? (
              <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                <p>Вы вошли как <span className="text-white">{currentUser.email}</span>.</p>
                <button type="button" onClick={() => void acceptInvitation()} disabled={accepting} className="rounded-2xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-60">{accepting ? "Подтверждаем..." : "Принять приглашение"}</button>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
    </main>
  );
}