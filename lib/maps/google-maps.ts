export type AddressResolution = {
  title: string;
  country: string;
  city: string;
  district: string;
  address: string;
  latitude: string;
  longitude: string;
};

export function normalizeGoogleMapsUrl(value: string) {
  const trimmed = value.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function isGoogleMapsLink(value: string) {
  try {
    const url = new URL(normalizeGoogleMapsUrl(value));
    const hostname = url.hostname.toLowerCase();
    const isShortLink = hostname === "maps.app.goo.gl" || hostname === "goo.gl";
    const isMapsHost = /^maps\.google\.[a-z]{2,}(?:\.[a-z]{2})?$/.test(hostname);
    const isGoogleWebHost = /^(?:www\.)?google\.[a-z]{2,}(?:\.[a-z]{2})?$/.test(hostname);
    return isShortLink || isMapsHost || (isGoogleWebHost && url.pathname.startsWith("/maps"));
  } catch {
    return false;
  }
}

export async function resolveGoogleMapsAddress(url: string): Promise<AddressResolution> {
  const normalizedUrl = normalizeGoogleMapsUrl(url);
  if (!isGoogleMapsLink(normalizedUrl)) {
    throw new Error("invalid");
  }

  const response = await fetch("/api/maps/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: normalizedUrl }),
  });
  const payload = (await response.json().catch(() => null)) as { ok?: boolean; data?: AddressResolution; error?: string } | null;

  if (!response.ok || !payload?.ok || !payload.data) {
    throw new Error(payload?.error || "Unable to resolve address");
  }

  return payload.data;
}