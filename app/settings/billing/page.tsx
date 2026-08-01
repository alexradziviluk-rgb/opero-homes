import { getServerAuthState } from "@/lib/supabase/server-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPlanForSubscription, getLimitWarning, type SubscriptionRecord } from "@/lib/subscriptions/subscription-access";
import { plans } from "@/lib/subscriptions/plans";
import Link from "next/link";
import PlanSelector from "@/components/subscriptions/PlanSelector";

export default async function BillingPage() {
  const auth = await getServerAuthState();
  const supabase = await createSupabaseServerClient();
  const organizationId = auth.context?.organization?.id;
  let subscription: SubscriptionRecord | null = null;
  let propertyCount = 0;
  let activeStaffCount = 0;
  if (supabase && organizationId) {
    const [subscriptionResult, propertyResult, staffResult] = await Promise.all([
      supabase.from("subscriptions").select("plan_code,status,trial_ends_at").eq("organization_id", organizationId).maybeSingle(),
      supabase.from("apartments").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
      supabase.from("organization_members").select("user_id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "active").neq("role_code", "owner"),
    ]);
    subscription = subscriptionResult.data as SubscriptionRecord | null;
    propertyCount = propertyResult.count ?? 0;
    activeStaffCount = staffResult.count ?? 0;
  }
  const plan = getPlanForSubscription(subscription);
  const trialLabel = subscription?.trial_ends_at ? new Date(subscription.trial_ends_at).toLocaleDateString("ru-RU") : null;
  const propertyUsagePercent = plan ? Math.min(100, Math.round((propertyCount / plan.propertyLimit) * 100)) : 0;
  const staffUsagePercent = plan?.staffLimit ? Math.min(100, Math.round((activeStaffCount / plan.staffLimit) * 100)) : 0;
  return <main><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm text-cyan-300">BILLING</p><h1 className="mt-2 text-3xl font-semibold text-white">Тариф и использование</h1></div><Link href="/pricing" className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-200">Сравнить тарифы</Link></div><div className="mt-8 grid gap-5 lg:grid-cols-2"><section className="rounded-2xl border border-white/10 bg-white/5 p-6"><p className="text-sm text-slate-400">Текущий тариф</p><h2 className="mt-2 text-3xl font-semibold text-white">{plan?.name ?? "Выберите тариф"}</h2><p className="mt-4 text-slate-300">{subscription?.status === "trialing" ? `Пробный период до ${trialLabel}` : subscription ? `Статус: ${subscription.status}` : "Пробный период не активирован"}</p></section><section className="rounded-2xl border border-white/10 bg-white/5 p-6"><p className="text-sm text-slate-400">Использование</p><div className="mt-4 space-y-5 text-sm text-slate-200"><div><div className="flex justify-between"><span>Объекты: {propertyCount} / {plan?.propertyLimit ?? "—"}</span><span>{propertyUsagePercent}%</span></div><div className="mt-2 h-2 rounded-full bg-white/10"><div className="h-2 rounded-full bg-cyan-300" style={{ width: `${propertyUsagePercent}%` }} /></div>{getLimitWarning(propertyCount, plan?.propertyLimit ?? null, "Объекты") ? <p className="mt-2 text-amber-300">{getLimitWarning(propertyCount, plan?.propertyLimit ?? null, "Объекты")}</p> : null}</div><div><div className="flex justify-between"><span>Активные сотрудники: {activeStaffCount} / {plan?.staffLimit ?? "без лимита"}</span><span>{plan?.staffLimit ? `${staffUsagePercent}%` : "—"}</span></div>{plan?.staffLimit ? <div className="mt-2 h-2 rounded-full bg-white/10"><div className="h-2 rounded-full bg-emerald-300" style={{ width: `${staffUsagePercent}%` }} /></div> : null}{getLimitWarning(activeStaffCount, plan?.staffLimit ?? null, "Сотрудники") ? <p className="mt-2 text-amber-300">{getLimitWarning(activeStaffCount, plan?.staffLimit ?? null, "Сотрудники")}</p> : null}</div></div></section></div><PlanSelector currentPlan={plan?.code ?? null} /><section className="mt-5 rounded-2xl border border-dashed border-white/15 p-6 text-slate-400">Управление оплатой появится после подключения платежного провайдера. Сейчас смена тарифа сохраняет выбор приложения без реальных списаний.</section><div className="mt-8 grid gap-3 md:grid-cols-3">{plans.map((item) => <div key={item.code} className="rounded-xl border border-white/10 p-4 text-sm text-slate-300"><strong className="text-white">{item.name}</strong><p className="mt-1">€{item.monthlyPrice} / месяц</p></div>)}</div></main>;
}