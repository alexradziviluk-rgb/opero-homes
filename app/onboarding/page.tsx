import { createSupabaseServerClient, requireServerUserContext } from "@/lib/supabase/server";
import type { PlanCode } from "@/lib/subscriptions/plans";
import OnboardingClient from "./onboarding-client";

type OnboardingPageData = {
  country: string;
  currency: string;
  timezone: string;
  planCode: PlanCode;
};

async function loadOnboardingData(): Promise<OnboardingPageData> {
  const currentUserContext = await requireServerUserContext();
  const organizationId = currentUserContext.organization?.id;

  if (!organizationId) {
    return {
      country: "",
      currency: "EUR",
      timezone: "Europe/Helsinki",
      planCode: "starter",
    };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return {
      country: "",
      currency: "EUR",
      timezone: "Europe/Helsinki",
      planCode: "starter",
    };
  }

  const [{ data: settings }, { data: subscription }] = await Promise.all([
    supabase.from("organization_settings").select("country,currency,timezone").eq("organization_id", organizationId).maybeSingle(),
    supabase.from("subscriptions").select("plan_code").eq("organization_id", organizationId).maybeSingle(),
  ]);

  return {
    country: settings?.country ?? "",
    currency: settings?.currency ?? "EUR",
    timezone: settings?.timezone ?? "Europe/Helsinki",
    planCode: (subscription?.plan_code as PlanCode | undefined) ?? "starter",
  };
}

export default async function OnboardingPage() {
  const initialData = await loadOnboardingData();
  return <OnboardingClient initialData={initialData} />;
}