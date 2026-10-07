import type { NextConfig } from "next";

// The API's address, as seen from the Next.js server (never exposed to the browser).
const API_URL = (process.env.API_URL ?? "http://localhost:8000").trim(); // pasted values can carry spaces

const nextConfig: NextConfig = {
  // The browser calls /api/* on this site and Next forwards it to the API. Keeping the API on the
  // web app's own origin makes the refresh-token cookie first-party: browsers increasingly block
  // cookies sent to a different site, which would silently log everyone out.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/:path*` }];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" }, // no guessing file types
          { key: "X-Frame-Options", value: "DENY" }, // can't be embedded in someone else's page (clickjacking)
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Location only for RoadPal itself; nothing here needs the camera or microphone.
          { key: "Permissions-Policy", value: "geolocation=(self), camera=(), microphone=()" },
        ],
      },
      {
        // Always fetch the newest service worker, so a fix reaches everyone on their next visit.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
