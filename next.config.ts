import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/guest/pro", destination: "/", permanent: true },
      { source: "/guest/properties", destination: "/", permanent: true },
      { source: "/stay", destination: "/", permanent: true },
      { source: "/guest/properties/:id", destination: "/properties/:id", permanent: true },
      { source: "/stay/:id", destination: "/properties/:id", permanent: true },
    ];
  },
};

export default nextConfig;
