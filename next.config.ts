import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(api|admin|account|app|settings|staff|users|login|register|guest|owner|apartments|bookings|calendar|clients|customers|employees|maintenance|notifications|onboarding|operations|tasks|support|forgot-password|reset-password|invite|stay)/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
  async redirects() {
    return [
      { source: "/guest/pro", destination: "/", permanent: true },
      { source: "/stay", destination: "/", permanent: true },
      { source: "/guest/properties/:id", destination: "/properties/:id", permanent: true },
      { source: "/stay/:id", destination: "/properties/:id", permanent: true },
    ];
  },
};

export default nextConfig;
