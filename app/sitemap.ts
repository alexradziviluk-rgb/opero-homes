import type { MetadataRoute } from "next";
import { loadApartmentsFromSupabase } from "@/lib/apartments/supabase-apartments";
import { resolvePublicSiteUrl } from "@/lib/auth/site-url";
import { getApartmentsForLocation, publicLocations } from "@/lib/seo/public-locations";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = resolvePublicSiteUrl();
  const routes = ["/", "/business", "/contact", "/pricing", "/privacy", "/terms"];
  const staticEntries = routes.map((route) => ({
    url: `${baseUrl}${route}`,
    changeFrequency: route === "/" ? "hourly" as const : "monthly" as const,
    priority: route === "/" ? 1 : 0.6,
  }));

  let apartments = [] as Awaited<ReturnType<typeof loadApartmentsFromSupabase>>;
  try {
    apartments = await loadApartmentsFromSupabase({ publicOnly: true });
  } catch {
    return staticEntries;
  }

  const propertyEntries = apartments.flatMap((row) => {
    if (typeof row.id !== "string" || !row.id) return [];
    return [{
      url: `${baseUrl}/properties/${row.id}`,
      lastModified: typeof row.updatedAt === "string" ? row.updatedAt : undefined,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }];
  });

  const locationEntries = publicLocations.flatMap((location) => {
    const matchingCount = getApartmentsForLocation(apartments, location).length;
    return matchingCount > 0 ? [{ url: `${baseUrl}/rent/${location.slug}`, changeFrequency: "hourly" as const, priority: 0.9 }] : [];
  });

  return [...staticEntries, ...locationEntries, ...propertyEntries];
}