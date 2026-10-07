import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { ServiceWorker } from "@/components/service-worker";
import "./globals.css";

// Self-hosted at build time (no request to Google at runtime). `subsets` only controls what is
// preloaded: the latin-ext part, which holds ₦, is still declared and fetched on demand when a
// page shows a price, instead of being preloaded on every page.
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  // Link previews need absolute image URLs; this is the public address they resolve against.
  metadataBase: new URL("https://roadpal.iykekelvins.dev"),
  authors: [{ name: "Kelvin Ochubili", url: "https://iykekelvins.dev" }],
  creator: "Kelvin Ochubili",
  // og:image / twitter:image come from opengraph-image.tsx; these fill in the rest of the card.
  openGraph: {
    siteName: "RoadPal",
    type: "website",
    locale: "en_NG",
    title: "RoadPal – Tyre help that comes to you",
    description: "Nearby vulcanizers send you a price. Pick one and watch them arrive on a live map.",
  },
  twitter: { card: "summary_large_image" },
  // Pages that set their own title get "<title> – RoadPal" from the template.
  title: {
    default: "RoadPal – Tyre help that comes to you",
    template: "%s – RoadPal",
  },
  description: "Get a vulcanizer to your car, fast. Offers from nearby providers, live tracking, cash on completion.",
  // iOS reads these instead of the manifest when installing to the home screen.
  appleWebApp: { capable: true, title: "RoadPal", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Browser chrome matches the page in light and dark.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f7f6" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1210" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${jakarta.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
