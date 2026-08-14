"use client";

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;
const ATTRIBUTION_KEY = "opero-utm-attribution";

export type AnalyticsEventName =
  | "property_view"
  | "availability_search"
  | "booking_started"
  | "booking_completed"
  | "contact_started"
  | "manager_requested"
  | "owner_lead_started";

type SafeEventParams = Record<string, string | number | boolean | undefined>;

function getAttribution(): Record<string, string> {
  try {
    const value = window.sessionStorage.getItem(ATTRIBUTION_KEY);
    return value ? JSON.parse(value) as Record<string, string> : {};
  } catch {
    return {};
  }
}

export function captureUtmAttribution(): void {
  const params = new URLSearchParams(window.location.search);
  const current = getAttribution();
  const next = { ...current };
  let changed = false;

  for (const key of UTM_KEYS) {
    const value = params.get(key)?.trim();
    if (value && value !== current[key]) {
      next[key] = value.slice(0, 200);
      changed = true;
    }
  }

  if (changed) {
    try {
      window.sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(next));
    } catch {
      // Analytics must never block the user flow.
    }
  }
}

export function trackEvent(name: AnalyticsEventName, params: SafeEventParams = {}): void {
  if (typeof window === "undefined") return;

  const gtag = window.gtag;
  if (typeof gtag !== "function") return;

  gtag("event", name, {
    ...params,
    ...getAttribution(),
  });
}

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}