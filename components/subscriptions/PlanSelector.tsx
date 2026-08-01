"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { plans, type PlanCode } from "@/lib/subscriptions/plans";

export default function PlanSelector({ currentPlan }: { currentPlan: PlanCode | null }) {
  const router = useRouter();
  const [selectedPlan, setSelectedPlan] = useState<PlanCode>(currentPlan ?? "starter");
  const [message, setMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function changePlan() {
    setMessage(null);
    setIsSaving(true);
    try {
      const response = await fetch("/api/billing/plan", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planCode: selectedPlan }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) { setMessage(data.error ?? "Не удалось изменить тариф."); return; }
      setMessage("Тариф сохранён. Статус пробного периода сохранён.");
      router.refresh();
    } catch { setMessage("Не удалось изменить тариф. Проверьте соединение и повторите."); } finally { setIsSaving(false); }
  }

  return <section className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-6"><h2 className="text-lg font-semibold text-white">Смена тарифа</h2><div className="mt-4 flex flex-wrap gap-3">{plans.map((plan) => <label key={plan.code} className={`cursor-pointer rounded-xl border px-4 py-3 text-sm ${selectedPlan === plan.code ? "border-cyan-300 bg-cyan-500/10 text-cyan-200" : "border-white/10 text-slate-300"}`}><input type="radio" name="plan" value={plan.code} checked={selectedPlan === plan.code} onChange={() => setSelectedPlan(plan.code)} className="sr-only" />{plan.name} · €{plan.monthlyPrice}</label>)}</div><button type="button" onClick={() => void changePlan()} disabled={isSaving || selectedPlan === currentPlan} className="mt-5 rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-200 disabled:cursor-not-allowed disabled:opacity-50">{isSaving ? "Сохраняем..." : "Сохранить тариф"}</button>{message ? <p className="mt-3 text-sm text-slate-300">{message}</p> : null}</section>;
}
