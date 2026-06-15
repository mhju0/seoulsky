import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // /diagnostics merged into the single Descent page — keep the URL working as a
  // real HTTP redirect (deep link into the ground-station band), independent of JS.
  async redirects() {
    return [
      {
        source: "/diagnostics",
        destination: "/atmosphere#ground",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
