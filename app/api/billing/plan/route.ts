import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPlan } from "@/lib/subscriptions/plans";

export async function PATCH(request: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "supabase_not_configured" }, { status: 500 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json() as { planCode?: string };
  const plan = getPlan(body.planCode);
  if (!plan) return NextResponse.json({ error: "Выберите доступный тариф." }, { status: 400 });
  const { data: membership } = await supabase.from("organization_members").select("organization_id").eq("user_id", user.id).eq("role_code", "owner").eq("status", "active").limit(1).maybeSingle();
  if (!membership) return NextResponse.json({ error: "Только владелец может менять тариф." }, { status: 403 });
  const { data: subscription, error: readError } = await supabase.from("subscriptions").select("status").eq("organization_id", membership.organization_id).maybeSingle();
  if (readError) return NextResponse.json({ error: readError.message }, { status: 400 });
  if (!subscription) return NextResponse.json({ error: "Подписка не найдена." }, { status: 404 });
  const { error } = await supabase.from("subscriptions").update({ plan_code: plan.code, updated_at: new Date().toISOString() }).eq("organization_id", membership.organization_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, planCode: plan.code, status: subscription.status });
}
