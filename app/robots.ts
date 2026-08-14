import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/properties/", "/business"],
      disallow: [
        "/api/",
        "/admin/",
        "/account/",
        "/app/",
        "/settings/",
        "/staff/",
        "/users/",
        "/owner/",
        "/apartments/",
        "/bookings/",
        "/calendar/",
        "/clients/",
        "/customers/",
        "/employees/",
        "/maintenance/",
        "/notifications/",
        "/onboarding/",
        "/operations/",
        "/tasks/",
        "/support/",
        "/login",
        "/register",
        "/forgot-password",
        "/reset-password",
        "/invite",
        "/guest/",
        "/stay/",
      ],
    },
    sitemap: "https://operohq.netlify.app/sitemap.xml",
  };
}