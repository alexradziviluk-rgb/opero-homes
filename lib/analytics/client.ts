"use client";

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;
const ATTRIBUTION_KEY = "opero-utm-attribution";
const ATTRIBUTION_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const AD_CONSENT_KEY = "opero-advertising-consent";
const ANALYTICS_CONSENT_KEY = "opero-analytics-consent";

export type AnalyticsEventName =
  | "property_view"
  | "availability_search"
  | "booking_started"
  | "booking_completed"
  | "contact_started"
  | "manager_requested"
  | "owner_lead_started";

type SafeEventParams = Record<string, string | number | boolean | undefined>;
type TrackingOptions = { dedupeKey?: string };

export type Attribution = Record<typeof UTM_KEYS[number] | "landing_page" | "referrer", string>;

function getAttribution(): Partial<Attribution> {
  try {
    const value = window.sessionStorage.getItem(ATTRIBUTION_KEY);
    if (!value) return {};
    const parsed = JSON.parse(value) as Partial<Attribution> & { capturedAt?: number };
    if (parsed.capturedAt && Date.now() - parsed.capturedAt > ATTRIBUTION_TTL_MS) {
      window.sessionStorage.removeItem(ATTRIBUTION_KEY);
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
}

export function captureUtmAttribution(): void {
  const params = new URLSearchParams(window.location.search);
  const current = getAttribution();
  const next = { ...current };
  let changed = false;

  if (!current.landing_page) {
    next.landing_page = `${window.location.pathname}${window.location.search}`.slice(0, 500);
    changed = true;
  }
  if (!current.referrer && document.referrer) {
    try {
      const referrer = new URL(document.referrer);
      next.referrer = `${referrer.origin}${referrer.pathname}`.slice(0, 500);
      changed = true;
    } catch {
      // Ignore malformed referrers.
    }
  }

  for (const key of UTM_KEYS) {
    const value = params.get(key)?.trim();
    if (value && value !== current[key]) {
      next[key] = value.slice(0, 200);
      changed = true;
    }
  }

  if (changed) {
    try {
      window.sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify({ ...next, capturedAt: Date.now() }));
    } catch {
      // Analytics must never block the user flow.
    }
  }
}

export function hasAdvertisingConsent(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(AD_CONSENT_KEY) === "granted" || window.__operoConsent?.advertising === true;
  } catch {
    return window.__operoConsent?.advertising === true;
  }
}

export function hasAnalyticsConsent(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(ANALYTICS_CONSENT_KEY) === "granted" || window.__operoConsent?.analytics === true;
  } catch {
    return window.__operoConsent?.analytics === true;
  }
}

export function trackEvent(name: AnalyticsEventName, params: SafeEventParams = {}, options: TrackingOptions = {}): void {
  if (typeof window === "undefined") return;

  captureUtmAttribution();
  if (options.dedupeKey) {
    const dedupeKey = `opero-event:${name}:${options.dedupeKey}`;
    try {
      if (window.sessionStorage.getItem(dedupeKey) === "1") return;
      window.sessionStorage.setItem(dedupeKey, "1");
    } catch {
      // Tracking storage must never block a user action.
    }
  }

  const gtag = window.gtag;
  const attribution = getAttribution();
  if (typeof gtag === "function") {
    gtag("event", name, { ...params, ...attribution });
  }

  if (!hasAdvertisingConsent()) return;

  const adsId = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;
  const bookingLabel = process.env.NEXT_PUBLIC_GOOGLE_ADS_BOOKING_CONVERSION_LABEL;
  if (name === "booking_completed" && adsId && bookingLabel && /^AW-\d+$/i.test(adsId) && typeof gtag === "function") {
    gtag("event", "conversion", {
      send_to: `${adsId}/${bookingLabel}`,
      value: typeof params.value === "number" ? params.value : undefined,
      currency: typeof params.currency === "string" ? params.currency : undefined,
    });
  }

  if (typeof window.fbq !== "function") return;
  const metaEvents: Partial<Record<AnalyticsEventName, string>> = {
    property_view: "ViewContent",
    availability_search: "Search",
    booking_started: "InitiateCheckout",
    booking_completed: "Purchase",
    contact_started: "Contact",
  };
  const metaEvent = metaEvents[name];
  if (metaEvent) window.fbq("track", metaEvent, params);

}

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
    __operoConsent?: { advertising?: boolean; analytics?: boolean };
  }
}