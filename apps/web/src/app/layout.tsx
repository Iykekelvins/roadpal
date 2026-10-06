import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
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
  // Pages that set their own title get "<title> – RoadPal" from the template.
  title: {
    default: "RoadPal – Tyre help that comes to you",
    template: "%s – RoadPal",
  },
  description: "Get a vulcanizer to your car, fast. Offers from nearby providers, live tracking, cash on completion.",
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
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
