const PRODUCTION_SITE_URL = "https://operohq.netlify.app";

function isLocalUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0";
  } catch {
    return false;
  }
}

export function resolvePublicSiteUrl(configuredUrl = process.env.NEXT_PUBLIC_SITE_URL): string {
  const normalized = configuredUrl?.trim().replace(/\/$/, "");
  if (!normalized || isLocalUrl(normalized)) return PRODUCTION_SITE_URL;

  try {
    return new URL(normalized).origin;
  } catch {
    return PRODUCTION_SITE_URL;
  }
}

export function buildPasswordResetUrl(inviteToken?: string): string {
  const resetUrl = new URL(`${resolvePublicSiteUrl()}/reset-password`);
  if (inviteToken?.trim()) {
    resetUrl.searchParams.set("invite", inviteToken.trim());
  }

  return resetUrl.toString();
}

export { PRODUCTION_SITE_URL };