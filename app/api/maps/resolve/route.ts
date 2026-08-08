import { NextResponse } from "next/server";
import { requireStaffApiAuth } from "@/lib/supabase/api-auth";
import { isGoogleMapsLink, normalizeGoogleMapsUrl } from "@/lib/maps/google-maps";

export const runtime = "nodejs";

type NominatimAddress = {
  road?: string;
  house_number?: string;
  neighbourhood?: string;
  suburb?: string;
  village?: string;
  quarter?: string;
  city_district?: string;
  county?: string;
  town?: string;
  city?: string;
  municipality?: string;
  state?: string;
  country?: string;
};

type NominatimResult = {
  lat: string;
  lon: string;
  display_name: string;
  name?: string;
  address?: NominatimAddress;
};

function isAllowedMapsUrl(value: string) {
  return isGoogleMapsLink(value);
}

function coordinatesFromText(value: string) {
  const patterns = [
    /!3d(-?\d{1,3}(?:\.\d+)?)!4d(-?\d{1,3}(?:\.\d+)?)/,
    /@(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/,
    /[?&](?:q|query|ll)=(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/,
  ];

  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match) {
      const latitude = Number(match[1]);
      const longitude = Number(match[2]);
      if (latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180) {
        return { latitude, longitude };
      }
    }
  }

  return null;
}

function queryFromGoogleUrl(value: string) {
  const url = new URL(value);
  const query = url.searchParams.get("q") || url.searchParams.get("query") || url.searchParams.get("destination");
  if (query && !/^[-\d.]+,[-\d.]+$/.test(query)) return query;

  const placeMatch = decodeURIComponent(url.pathname).match(/\/place\/([^/]+)/);
  return placeMatch ? placeMatch[1].replace(/\+/g, " ") : "";
}

function titleFromGoogleUrl(value: string) {
  const url = new URL(value);
  const placeMatch = decodeURIComponent(url.pathname).match(/\/place\/([^/]+)/);
  return placeMatch ? placeMatch[1].replace(/\+/g, " ").trim() : "";
}

function labelCity(value: string) {
  return value.toLowerCase() === "alanya" ? "Аланья" : value;
}

function labelCountry(value: string) {
  return value.toLowerCase() === "türkiye" || value.toLowerCase() === "turkey" ? "Турция" : value;
}

async function nominatimRequest(endpoint: "search" | "reverse", params: Record<string, string>) {
  const search = new URLSearchParams({ format: "jsonv2", addressdetails: "1", ...params });
  const response = await fetch(`https://nominatim.openstreetmap.org/${endpoint}?${search.toString()}`, {
    headers: { "User-Agent": "OperoHomes/1.0 address resolver" },
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Geocoding service unavailable");
  return await response.json() as NominatimResult | NominatimResult[];
}

async function resolveAddress(value: string) {
  const normalizedUrl = normalizeGoogleMapsUrl(value);
  let resolvedUrl = normalizedUrl;
  const parsed = new URL(normalizedUrl);
  if (parsed.hostname === "maps.app.goo.gl" || parsed.hostname === "goo.gl") {
    const response = await fetch(normalizedUrl, { redirect: "follow", signal: AbortSignal.timeout(10_000) });
    resolvedUrl = response.url || normalizedUrl;
    if (!isAllowedMapsUrl(resolvedUrl)) {
      throw new Error("Invalid Google Maps redirect");
    }
  }

  const coordinates = coordinatesFromText(resolvedUrl);
  const geocoded = coordinates
    ? await nominatimRequest("reverse", { lat: String(coordinates.latitude), lon: String(coordinates.longitude) })
    : await nominatimRequest("search", { q: queryFromGoogleUrl(resolvedUrl) });
  const result = Array.isArray(geocoded) ? geocoded[0] : geocoded;
  if (!result) throw new Error("Address not found");

  const address = result.address ?? {};
  const city = address.city || address.town || address.municipality || address.state || "";
  const district = address.suburb || address.neighbourhood || address.village || address.quarter || address.city_district || address.county || "";
  const street = [address.road, address.house_number].filter(Boolean).join(" ");

  return {
    title: titleFromGoogleUrl(resolvedUrl) || result.name || "",
    country: labelCountry(address.country || ""),
    city: labelCity(city),
    district,
    address: street || result.display_name,
    latitude: coordinates ? String(coordinates.latitude) : result.lat,
    longitude: coordinates ? String(coordinates.longitude) : result.lon,
  };
}

export async function POST(request: Request) {
  const auth = await requireStaffApiAuth();
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => null)) as { url?: unknown } | null;
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  if (!url || !isAllowedMapsUrl(url)) {
    return NextResponse.json({ ok: false, error: "Invalid Google Maps URL" }, { status: 400 });
  }

  try {
    return NextResponse.json({ ok: true, data: await resolveAddress(url) });
  } catch (error) {
    console.error("Failed to resolve Google Maps address:", error);
    return NextResponse.json({ ok: false, error: "Address could not be resolved" }, { status: 422 });
  }
}