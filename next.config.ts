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
};

export default nextConfig;
