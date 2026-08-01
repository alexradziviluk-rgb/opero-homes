const PRODUCTION_SITE_URL = "https://operohq.netlify.app";

function isLocalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "0.0.0.0";
  } catch {
    return false;
  }
}

function normalizeOrigin(value: string | undefined): string | null {
  const normalized = value?.trim().replace(/\/$/, "");
  if (!normalized) return null;

  try {
    return new URL(normalized).origin;
  } catch {
    return null;
  }
}

export function resolveInvitationOrigin(): string {
  const configuredValues = [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.SITE_URL,
    process.env.URL,
    process.env.DEPLOY_PRIME_URL,
  ];
  const configuredOrigin = configuredValues.map(normalizeOrigin).find(Boolean) ?? null;
  const allowExplicitLocal = process.env.NODE_ENV !== "production" && process.env.ALLOW_LOCAL_REDIRECT === "true";

  if (allowExplicitLocal && configuredOrigin && isLocalUrl(configuredOrigin)) {
    return configuredOrigin;
  }

  return PRODUCTION_SITE_URL;
}

export function buildEmployeeInvitationUrl(token: string): string {
  const url = new URL("/auth/accept-invite", resolveInvitationOrigin());
  url.searchParams.set("invite", token);
  return url.toString();
}

export { PRODUCTION_SITE_URL };
