import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The whole experience now lives at /sky (one scroll, no in-page nav). The
  // retired plane home (/) redirects via app/page.tsx; the old weather routes
  // redirect here as real HTTP redirects, independent of JS.
  async redirects() {
    return [
      { source: "/atmosphere", destination: "/sky", permanent: false },
      { source: "/diagnostics", destination: "/sky", permanent: false },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
