import type { NextConfig } from "next";
const config: NextConfig = {
  poweredByHeader: false,
  distDir: process.env.NEXT_TEST_DIST || ".next",
  async rewrites() {
    return [{ source: "/s/:token", destination: "/" }];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
      {
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache" }],
      },
    ];
  },
};
export default config;
