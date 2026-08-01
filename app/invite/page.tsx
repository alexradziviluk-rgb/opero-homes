"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { createSupabaseClient } from "@/lib/supabase/client";
import { buildInvitationNextPath, mapInviteRoleCodeToUserRoleLabel } from "@/lib/users/invitations";
import type { EmployeeInvitationLookup } from "@/types/invitation";

type InvitationResponse =
  | { ok: true; data: EmployeeInvitationLookup }
  | { ok: false; errorCode: string; error: string };

function isExistingUserSignUpError(message: string | undefined): boolean {
  const normalized = (message ?? "").toLowerCase();
  return normalized.includes("already registered") || normalized.includes("user already registered");
}

function normalizeSignInError(message: string | undefined): string {
  const normalized = (message ?? "").toLowerCase();
  if (normalized.includes("invalid login credentials")) {
    return "Неверный email или пароль.";
  }

  if (normalized.includes("email not confirmed")) {
    return "Подтверждение email не требуется. Попробуйте войти снова через несколько секунд.";
  }

  return message ?? "Не удалось выполнить вход.";
}

export function InvitationPage() {
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
  const hasInviteToken = inviteToken.length > 0;
  const [loading, setLoading] = useState(hasInviteToken);
  const [accepting, setAccepting] = useState(false);
  const [invitation, setInvitation] = useState<EmployeeInvitationLookup | null>(null);
  const [error, setError] = useState<string | null>(hasInviteToken ? null : "Токен приглашения отсутствует.");
  const [accepted, setAccepted] = useState(false);
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);
  const [authMode, setAuthMode] = useState<"signup" | "login">("signup");
  const [password, setPassword] = useState("");
  const autoAcceptTriggeredRef = useRef(false);

  useEffect(() => {
    if (!inviteToken) {
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

  const acceptInvitation = useCallback(async () => {
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
  }, [inviteToken, router]);

  useEffect(() => {
    if (loading || !invitation || isAuthLoading || !currentUser || accepted || accepting || autoAcceptTriggeredRef.current) {
      return;
    }

    autoAcceptTriggeredRef.current = true;
    void acceptInvitation();
  }, [loading, invitation, isAuthLoading, currentUser, accepted, accepting, acceptInvitation]);

  async function signUpAndAccept() {
    if (!invitation) {
      return;
    }

    if (!password) {
      setError("Введите пароль.");
      return;
    }

    const supabase = createSupabaseClient();
    if (!supabase) {
      setError("Регистрация недоступна: проверьте переменные окружения Supabase.");
      return;
    }

    setIsSubmittingAuth(true);
    setError(null);

    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: invitation.email,
        password,
        options: {
          data: {
            first_name: invitation.firstName ?? "",
            last_name: invitation.lastName ?? "",
            phone: invitation.phone ?? "",
            role: invitation.roleCode,
            status: "active",
          },
        },
      });

      if (signUpError) {
        if (isExistingUserSignUpError(signUpError.message)) {
          setAuthMode("login");
          setError("Аккаунт с этим email уже существует. Войдите, чтобы принять приглашение.");
          return;
        }

        setError(signUpError.message || "Не удалось создать аккаунт.");
        return;
      }

      if (!data.session || !data.user) {
        setAuthMode("login");
        setError("Аккаунт создан, но автоматический вход не выполнен. Войдите, чтобы принять приглашение.");
        return;
      }

      await acceptInvitation();
    } finally {
      setIsSubmittingAuth(false);
    }
  }

  async function signInAndAccept() {
    if (!invitation) {
      return;
    }

    if (!password) {
      setError("Введите пароль.");
      return;
    }

    const supabase = createSupabaseClient();
    if (!supabase) {
      setError("Вход недоступен: проверьте переменные окружения Supabase.");
      return;
    }

    setIsSubmittingAuth(true);
    setError(null);

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: invitation.email,
        password,
      });

      if (signInError || !data.user || !data.session) {
        setError(normalizeSignInError(signInError?.message));
        return;
      }

      await acceptInvitation();
    } finally {
      setIsSubmittingAuth(false);
    }
  }

  async function handleAuthSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (authMode === "signup") {
      await signUpAndAccept();
      return;
    }

    await signInAndAccept();
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
              <form className="space-y-3 rounded-2xl border border-white/10 bg-slate-950/60 p-4" onSubmit={(event) => void handleAuthSubmit(event)}>
                <p className="text-slate-200">
                  {authMode === "signup"
                    ? "Создайте пароль для этого email. После регистрации приглашение будет принято автоматически."
                    : "Войдите, чтобы принять приглашение автоматически."}
                </p>

                <label className="block">
                  <span className="text-xs text-slate-300">Email из приглашения</span>
                  <input
                    type="email"
                    readOnly
                    value={invitation.email}
                    className="mt-1 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 outline-none"
                  />
                </label>

                <label className="block">
                  <span className="text-xs text-slate-300">{authMode === "signup" ? "Новый пароль" : "Пароль"}</span>
                  <input
                    type="password"
                    autoComplete={authMode === "signup" ? "new-password" : "current-password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="mt-1 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white outline-none"
                  />
                </label>

                <button
                  type="submit"
                  disabled={isSubmittingAuth || accepting}
                  className="rounded-2xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmittingAuth || accepting
                    ? authMode === "signup"
                      ? "Создаем аккаунт..."
                      : "Входим..."
                    : authMode === "signup"
                      ? "Создать аккаунт и принять приглашение"
                      : "Войти и принять приглашение"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setAuthMode((mode) => (mode === "signup" ? "login" : "signup"));
                  }}
                  className="text-left text-xs text-cyan-300 hover:text-cyan-200"
                >
                  {authMode === "signup" ? "Уже есть аккаунт? Переключиться на вход" : "Нет аккаунта? Переключиться на регистрацию"}
                </button>

                <div className="flex flex-wrap gap-2 text-xs">
                  <Link href={`/guest/login?next=${encodeURIComponent(nextPath)}`} className="text-slate-300 hover:text-white">Открыть страницу входа</Link>
                  <Link href={`/guest/register?next=${encodeURIComponent(nextPath)}&email=${encodeURIComponent(invitation.email)}`} className="text-slate-300 hover:text-white">Открыть страницу регистрации</Link>
                </div>
              </form>
            ) : null}

            {currentUser ? (
              <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                <p>Вы вошли как <span className="text-white">{currentUser.email}</span>. Приглашение будет принято автоматически.</p>
                <button type="button" onClick={() => void acceptInvitation()} disabled={accepting} className="rounded-2xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-60">{accepting ? "Подтверждаем..." : "Принять сейчас"}</button>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
    </main>
  );
}

export default InvitationPage;