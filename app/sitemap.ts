import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://operohq.netlify.app";
  const routes = ["/", "/business", "/contact", "/pricing", "/privacy", "/terms"];

  return routes.map((route) => ({
    url: `${baseUrl}${route}`,
    changeFrequency: route === "/" ? "hourly" : "monthly",
    priority: route === "/" ? 1 : 0.6,
  }));
}