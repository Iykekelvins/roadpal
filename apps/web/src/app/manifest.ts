import type { MetadataRoute } from "next";

// Makes RoadPal installable ("Add to Home screen"). Served at /manifest.webmanifest and linked
// from every page automatically.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "RoadPal – Tyre help that comes to you",
    short_name: "RoadPal",
    description: "Get a vulcanizer to your car, fast. Offers from nearby providers, live tracking, cash on completion.",
    // Opens into the app, not the marketing page: /login sends a signed-in user to their home.
    start_url: "/login",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f5f7f6", // --ground (light): the splash screen while it starts
    theme_color: "#0b6b43", // --primary
    categories: ["travel", "utilities"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
