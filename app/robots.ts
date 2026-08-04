import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/properties/", "/business"],
      disallow: ["/api/", "/admin/", "/account/", "/app/", "/settings/", "/staff/", "/users/", "/login", "/register", "/guest/"],
    },
    sitemap: "https://operohq.netlify.app/sitemap.xml",
  };
}