import type { NextConfig } from "next";

// The API's address, as seen from the Next.js server (never exposed to the browser).
const API_URL = process.env.API_URL ?? "http://localhost:3000";

const nextConfig: NextConfig = {
  // The browser calls /api/* on this site and Next forwards it to the API. Keeping the API on the
  // web app's own origin makes the refresh-token cookie first-party: browsers increasingly block
  // cookies sent to a different site, which would silently log everyone out.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/:path*` }];
  },
};

export default nextConfig;
