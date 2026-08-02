import type { Metadata } from "next";
import "./globals.css";
import { brand } from "@/lib/brand";

export const metadata: Metadata = {
  title: `${brand.name} — ${brand.tagline}`,
  description: brand.description,
};

const PALETTE_HYDRATION_SCRIPT = `
(function () {
  try {
    var stored = JSON.parse(localStorage.getItem("orggraph-palette") || "{}");
    var root = document.documentElement.style;
    if (stored.main) root.setProperty("--main", stored.main);
    if (stored.accent) root.setProperty("--accent", stored.accent);
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        {/*
          THESIS: an org's structure is drawn, not decorated — construction
          drafting on paper, refusing the gradient-and-glass SaaS default.
          OWN-WORLD: warm paper ground, near-black ink for all structure and
          type, exactly two user-chosen roles (Main, Accent) carrying every
          signal; hairline rules with dimension ticks stand in for shadows.
          STORY: a visitor sees the org's own record graph drawn in their
          brand color and understands this models real structure, not a
          generic dashboard theme.
          FIRST VIEWPORT: paper ground, ink wordmark top-left, the palette
          picker top-right, a drawn node-graph glyph in Main leading the
          hero, headline and CTA in ink, a dimension-rule closing the fold.
          FORM: direction pinned by the user's four reference sheets
          (panda/yarn mark, red node-graph on paper, blueprint drafting in
          black+blue on paper, white node-graph on red); no roll needed.
          FINISH: unreviewed and undocumented is unfinished; this build ends
          with the finish review, the verdict, and DESIGN.md.
        */}
        <script
          dangerouslySetInnerHTML={{ __html: PALETTE_HYDRATION_SCRIPT }}
        />
        {children}
      </body>
    </html>
  );
}
