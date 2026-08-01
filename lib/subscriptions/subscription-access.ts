import { getPlan, type Plan } from "@/lib/subscriptions/plans";

export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled" | "paused";
export type SubscriptionRecord = { plan_code: string; status: SubscriptionStatus; trial_ends_at: string | null };

export function getPlanForSubscription(subscription: SubscriptionRecord | null): Plan | null {
  return getPlan(subscription?.plan_code);
}

export function getLimitWarning(current: number, limit: number | null, label: string): string | null {
  if (limit === null || current < limit * 0.8) return null;
  if (current >= limit) return `${label}: достигнут информационный лимит ${limit}. Данные не заблокированы.`;
  return `${label}: осталось мало места до лимита ${limit}.`;
}