"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseClient } from "@/lib/supabase/client";
import { getPlan, type PlanCode } from "@/lib/subscriptions/plans";

export default function RegisterPage() {
  const router = useRouter();
  const [companyName, setCompanyName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [planCode, setPlanCode] = useState<PlanCode>(() => {
    if (typeof window === "undefined") return "starter";
    return getPlan(new URLSearchParams(window.location.search).get("plan"))?.code ?? "starter";
  });
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!companyName.trim() || !firstName.trim() || !lastName.trim() || !email.trim() || password.length < 8) {
      setError("Укажите компанию, имя, фамилию, email и пароль не короче 8 символов.");
      return;
    }
    const supabase = createSupabaseClient();
    if (!supabase) { setError("Регистрация недоступна: проверьте переменные Supabase."); return; }
    setIsSubmitting(true);
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: { emailRedirectTo: `${window.location.origin}/onboarding`, data: { first_name: firstName.trim(), last_name: lastName.trim(), role: "owner" } },
      });
      if (signUpError) { setError(signUpError.message); return; }
      if (!data.session) { setError("Аккаунт создан. Подтвердите email, затем войдите для продолжения onboarding."); return; }
      const response = await fetch("/api/onboarding/organization", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyName, planCode }) });
      if (!response.ok) { setError("Аккаунт создан, но организацию не удалось подготовить. Повторите onboarding после входа."); return; }
      const sessionContextResponse = await fetch("/api/auth/session-context", { cache: "no-store" });
      if (!sessionContextResponse.ok) { setError("Аккаунт создан, но server session не удалось подтвердить. Повторите вход для продолжения onboarding."); return; }
      router.replace("/onboarding");
      router.refresh();
    } finally { setIsSubmitting(false); }
  }

  return <main className="min-h-screen bg-[#173b32] px-5 py-10 text-[#f5f3ee]"><div className="mx-auto max-w-lg"><Link href="/" className="font-bold">opero<span className="text-[#e2b25c]">.</span></Link><div className="mt-16 rounded-3xl bg-[#f5f3ee] p-7 text-[#17251f] sm:p-10"><p className="text-sm font-semibold text-[#b27827]">START YOUR WORKSPACE</p><h1 className="mt-3 text-4xl font-semibold">Регистрация компании</h1><p className="mt-4 text-sm leading-6 text-[#68766d]">Создайте владельца, выберите тариф и начните 14-дневный пробный период.</p><form className="mt-8 space-y-4" onSubmit={submit}><label className="block text-sm font-medium">Название компании<input required value={companyName} onChange={(event) => setCompanyName(event.target.value)} className="mt-2 w-full rounded-xl border border-[#d9ded6] bg-white px-4 py-3 outline-none" placeholder="Opero Homes" /></label><label className="block text-sm font-medium">Ваше имя<input required value={firstName} onChange={(event) => setFirstName(event.target.value)} className="mt-2 w-full rounded-xl border border-[#d9ded6] bg-white px-4 py-3 outline-none" /></label><label className="block text-sm font-medium">Фамилия<input required value={lastName} onChange={(event) => setLastName(event.target.value)} className="mt-2 w-full rounded-xl border border-[#d9ded6] bg-white px-4 py-3 outline-none" /></label><label className="block text-sm font-medium">Рабочий email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 w-full rounded-xl border border-[#d9ded6] bg-white px-4 py-3 outline-none" /></label><label className="block text-sm font-medium">Пароль<input required minLength={8} type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 w-full rounded-xl border border-[#d9ded6] bg-white px-4 py-3 outline-none" /></label><label className="block text-sm font-medium">Тариф<select value={planCode} onChange={(event) => setPlanCode(event.target.value as PlanCode)} className="mt-2 w-full rounded-xl border border-[#d9ded6] bg-white px-4 py-3 outline-none">{["starter", "professional", "business"].map((code) => { const plan = getPlan(code); return <option key={code} value={code}>{plan?.name} — €{plan?.monthlyPrice}/месяц</option>; })}</select></label><button disabled={isSubmitting} className="w-full rounded-full bg-[#173b32] px-5 py-3 font-semibold text-white disabled:opacity-60">{isSubmitting ? "Создаём workspace..." : "Начать бесплатно"}</button></form>{error ? <p className="mt-4 text-sm text-rose-700">{error}</p> : null}<p className="mt-6 text-sm text-[#68766d]">Уже есть аккаунт? <Link href="/login" className="font-semibold text-[#286044]">Войти</Link></p></div></div></main>;
}
