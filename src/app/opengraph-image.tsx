import { ImageResponse } from "next/og";

// The preview card when a HackMate link is shared: the "H" sticker, the name and what it does.
export const alt = "HackMate: find hackathons, understand the rules, track every entry";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Space Grotesk, the site's display font, from Google Fonts; the image falls back to the built-in font without it. */
async function spaceGrotesk(weight: number): Promise<ArrayBuffer | null> {
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@${weight}`)).text();
    const url = css.match(/src: url\((.+?)\) format\('(?:truetype|opentype)'\)/)?.[1];
    return url ? await (await fetch(url)).arrayBuffer() : null;
  } catch {
    return null;
  }
}

export default async function OpengraphImage() {
  const [bold, regular] = await Promise.all([spaceGrotesk(700), spaceGrotesk(500)]);
  const fonts = [
    ...(bold ? [{ name: "Space Grotesk", data: bold, weight: 700 as const }] : []),
    ...(regular ? [{ name: "Space Grotesk", data: regular, weight: 500 as const }] : []),
  ];
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 90, background: "#fff4d6", color: "#111111", fontFamily: fonts.length ? "Space Grotesk" : "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
          <div style={{ display: "flex", transform: "rotate(-6deg)" }}>
            <div
              style={{
                width: 150, height: 150, display: "flex", alignItems: "center", justifyContent: "center",
                background: "#ffe17a", border: "8px solid #111111", borderRadius: 32, boxShadow: "12px 12px 0 #111111",
                fontSize: 104, fontWeight: 700,
              }}
            >
              H
            </div>
          </div>
          <div style={{ fontSize: 120, fontWeight: 700, letterSpacing: -4 }}>HackMate</div>
        </div>
        <div style={{ display: "flex", marginTop: 56, fontSize: 40, fontWeight: 500, lineHeight: 1.35, maxWidth: 1020 }}>
          Find hackathons from 10 sites, understand the rules with AI, and track every entry to the finish.
        </div>
        <div style={{ display: "flex", gap: 20, marginTop: 56 }}>
          {["Discover", "Ask AI", "Tracker", "Pitch", "Results"].map((t) => (
            <div key={t} style={{ display: "flex", padding: "10px 22px", border: "4px solid #111111", borderRadius: 14, background: "#ffffff", fontSize: 30, fontWeight: 700, boxShadow: "5px 5px 0 #111111" }}>
              {t}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
