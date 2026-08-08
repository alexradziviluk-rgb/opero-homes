export type AddressResolution = {
  title: string;
  country: string;
  city: string;
  district: string;
  address: string;
  latitude: string;
  longitude: string;
};

function isGoogleMapsLink(value: string) {
  try {
    const url = new URL(value.trim());
    return ["google.com", "www.google.com", "maps.google.com", "maps.app.goo.gl", "goo.gl"].includes(url.hostname)
      && (url.hostname === "maps.google.com" || url.hostname === "maps.app.goo.gl" || url.hostname === "goo.gl" || url.pathname.startsWith("/maps"));
  } catch {
    return false;
  }
}

export async function resolveGoogleMapsAddress(url: string): Promise<AddressResolution> {
  if (!isGoogleMapsLink(url)) {
    throw new Error("invalid");
  }

  const response = await fetch("/api/maps/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: url.trim() }),
  });
  const payload = (await response.json().catch(() => null)) as { ok?: boolean; data?: AddressResolution; error?: string } | null;

  if (!response.ok || !payload?.ok || !payload.data) {
    throw new Error(payload?.error || "Unable to resolve address");
  }

  return payload.data;
}