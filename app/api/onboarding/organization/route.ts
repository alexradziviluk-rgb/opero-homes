import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPlan } from "@/lib/subscriptions/plans";
import { countries, currencies, timezones } from "@/lib/subscriptions/onboarding-options";

type OrganizationSettingsInput = {
  country?: string;
  currency?: string;
  timezone?: string;
  planCode?: string;
};

function validateSettings(input: OrganizationSettingsInput) {
  if (!input.country || !countries.some((country) => country.code === input.country)) return "Выберите страну.";
  if (!input.currency || !currencies.some((currency) => currency.code === input.currency)) return "Выберите валюту.";
  if (!input.timezone || !timezones.includes(input.timezone)) return "Выберите часовой пояс.";
  if (input.planCode && !getPlan(input.planCode)) return "Выберите доступный тариф.";
  return null;
}

async function getOwnerContext() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { supabase: null, organizationId: null, error: "supabase_not_configured" as const };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, organizationId: null, error: "unauthorized" as const };
  const { data: membership } = await supabase.from("organization_members").select("organization_id,role_code,status").eq("user_id", user.id).eq("role_code", "owner").eq("status", "active").limit(1).maybeSingle();
  if (!membership) return { supabase, organizationId: null, error: "owner_required" as const };
  return { supabase, organizationId: membership.organization_id, error: null };
}

export async function GET() {
  const context = await getOwnerContext();
  if (!context.supabase) return NextResponse.json({ error: context.error }, { status: 500 });
  if (!context.organizationId) return NextResponse.json({ error: context.error }, { status: 401 });
  const [{ data: settings, error: settingsError }, { data: subscription, error: subscriptionError }] = await Promise.all([
    context.supabase.from("organization_settings").select("country,currency,timezone").eq("organization_id", context.organizationId).maybeSingle(),
    context.supabase.from("subscriptions").select("plan_code,status,trial_ends_at").eq("organization_id", context.organizationId).maybeSingle(),
  ]);
  if (settingsError || subscriptionError) return NextResponse.json({ error: settingsError?.message ?? subscriptionError?.message }, { status: 400 });
  return NextResponse.json({ settings, subscription });
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "supabase_not_configured" }, { status: 500 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json() as { companyName?: string; planCode?: string; country?: string; currency?: string; timezone?: string };
  const plan = getPlan(body.planCode);
  if (!body.companyName?.trim() || !plan) return NextResponse.json({ error: "Укажите компанию и доступный тариф." }, { status: 400 });
  const hasSettings = body.country !== undefined || body.currency !== undefined || body.timezone !== undefined;
  if (hasSettings) {
    const validationError = validateSettings({ country: body.country, currency: body.currency, timezone: body.timezone, planCode: body.planCode });
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
  }
  const slug = `${body.companyName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "workspace"}-${user.id.slice(0, 8)}`;
  const now = new Date();
  const trialEnds = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const { data, error } = await supabase.rpc("create_organization_onboarding", { organization_name: body.companyName.trim(), organization_slug: slug, selected_plan_code: plan.code, selected_country: body.country ?? "", selected_currency: body.currency ?? "EUR", selected_timezone: body.timezone ?? "Europe/Helsinki", trial_started: now.toISOString(), trial_ends: trialEnds.toISOString() });
  if (error || !data) return NextResponse.json({ error: error?.message ?? "organization_failed" }, { status: 400 });
  return NextResponse.json({ ok: true, organizationId: data, planCode: plan.code });
}

export async function PATCH(request: Request) {
  const context = await getOwnerContext();
  if (!context.supabase) return NextResponse.json({ error: context.error }, { status: 500 });
  if (!context.organizationId) return NextResponse.json({ error: context.error }, { status: 403 });
  const body = await request.json() as OrganizationSettingsInput;
  const validationError = validateSettings(body);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  const { error: settingsError } = await context.supabase.from("organization_settings").update({ country: body.country, currency: body.currency, timezone: body.timezone, updated_at: new Date().toISOString() }).eq("organization_id", context.organizationId);
  if (settingsError) return NextResponse.json({ error: settingsError.message }, { status: 400 });
  if (body.planCode) {
    const { error: planError } = await context.supabase.from("subscriptions").update({ plan_code: body.planCode, updated_at: new Date().toISOString() }).eq("organization_id", context.organizationId);
    if (planError) return NextResponse.json({ error: planError.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}