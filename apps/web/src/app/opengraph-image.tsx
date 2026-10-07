import { ImageResponse } from "next/og";

// The preview card shown when a RoadPal link is shared (WhatsApp, LinkedIn, X…). Rendered once at
// build time, so it costs nothing per request.
export const alt = "RoadPal: tyre help that comes to you. Nearby vulcanizers send a price, you watch them arrive.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const COLORS = {
  ground: "#0d1210",
  surface: "#161d1a",
  border: "#2a3530",
  text: "#eef3f0",
  muted: "#a3b1a9",
  primary: "#3ccb8e",
  onPrimary: "#04231a",
  signal: "#ffb020",
};

const HEADLINE = "Tyre help that comes to you";
const SUBLINE = "Nearby vulcanizers send a price. Pick one, watch them arrive.";
const OFFERS = [
  { name: "Emeka Tyres", eta: "~8 min · 1.1 km", price: "₦3,000" },
  { name: "Tunde Fix", eta: "~15 min · 2.8 km", price: "₦3,500" },
];

// Plus Jakarta Sans, subset to just the characters drawn here (Google Fonts' `text=` parameter).
// If the fetch fails the card still renders, in the built-in font.
async function loadFont(weight: number): Promise<ArrayBuffer | null> {
  const text = ["RoadPal", HEADLINE, SUBLINE, ...OFFERS.flatMap((o) => [o.name, o.eta, o.price]), "Accept"].join("");
  try {
    const css = await (
      await fetch(`https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@${weight}&text=${encodeURIComponent(text)}`)
    ).text();
    const url = css.match(/src: url\((.+?)\) format/)?.[1];
    return url ? await (await fetch(url)).arrayBuffer() : null;
  } catch {
    return null;
  }
}

export default async function OpengraphImage() {
  const [bold, extraBold] = await Promise.all([loadFont(600), loadFont(800)]);
  const fonts = [
    bold && { name: "Jakarta", data: bold, weight: 600 as const },
    extraBold && { name: "Jakarta", data: extraBold, weight: 800 as const },
  ].filter((f) => !!f);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          padding: "0 80px",
          gap: 64,
          background: COLORS.ground,
          color: COLORS.text,
          fontFamily: "Jakarta",
        }}
      >
        {/* Left: brand and pitch */}
        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 72,
                height: 72,
                borderRadius: 20,
                background: COLORS.primary,
                color: COLORS.onPrimary,
              }}
            >
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" />
                <circle cx="12" cy="12" r="3" />
                <path d="M12 3v6M12 15v6M3 12h6M15 12h6" />
              </svg>
            </div>
            <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: -1 }}>RoadPal</div>
          </div>
          <div style={{ marginTop: 48, fontSize: 68, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2 }}>{HEADLINE}</div>
          <div style={{ marginTop: 24, fontSize: 30, fontWeight: 600, lineHeight: 1.35, color: COLORS.muted }}>{SUBLINE}</div>
        </div>

        {/* Right: two offer cards, like the driver sees them */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20, width: 400 }}>
          {OFFERS.map((offer, i) => (
            <div
              key={offer.name}
              style={{
                display: "flex",
                flexDirection: "column",
                padding: 28,
                borderRadius: 24,
                background: COLORS.surface,
                border: `2px solid ${i === 0 ? COLORS.primary : COLORS.border}`,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 28, fontWeight: 800 }}>{offer.name}</div>
                <div style={{ fontSize: 34, fontWeight: 800, color: i === 0 ? COLORS.signal : COLORS.text }}>{offer.price}</div>
              </div>
              <div style={{ marginTop: 8, fontSize: 22, fontWeight: 600, color: COLORS.muted }}>{offer.eta}</div>
              {i === 0 && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    marginTop: 20,
                    padding: "14px 0",
                    borderRadius: 16,
                    background: COLORS.primary,
                    color: COLORS.onPrimary,
                    fontSize: 24,
                    fontWeight: 800,
                  }}
                >
                  {`Accept ${offer.price}`}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
