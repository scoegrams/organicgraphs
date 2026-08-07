/**
 * Derive a calm shade ladder from the org's four design-pack colors.
 * Preview / site mode should never invent rainbow type colors.
 */

export const DEFAULT_DESIGN_COLORS = {
  colorPrimary: "#1f4d3a",
  colorSecondary: "#f3efe6",
  colorAccent: "#c45c26",
  colorNeutral: "#8a8178",
} as const;

function clamp(n: number) {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full =
    h.length === 3 ? h.split("").map((c) => c + c).join("") : h.padEnd(6, "0");
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function toHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((c) => clamp(c).toString(16).padStart(2, "0"))
      .join("")
  );
}

/** Mix two hex colors. t=0 → a, t=1 → b. */
export function mixHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = parseHex(a);
  const [br, bg, bb] = parseHex(b);
  return toHex(
    ar + (br - ar) * t,
    ag + (bg - ag) * t,
    ab + (bb - ab) * t,
  );
}

/**
 * Build 8 shades from the user's 4 colors for assigning to record types.
 * All stay in-family with the chosen palette.
 */
export function buildTypeShades(colors: {
  primary: string;
  secondary: string;
  accent: string;
  neutral: string;
}): string[] {
  const { primary, secondary, accent, neutral } = colors;
  return [
    primary,
    accent,
    neutral,
    mixHex(primary, secondary, 0.28),
    mixHex(accent, secondary, 0.3),
    mixHex(neutral, primary, 0.35),
    mixHex(primary, accent, 0.45),
    mixHex(accent, neutral, 0.4),
  ];
}

/** Stable shade for a type key from the design palette. */
export function shadeForType(
  typeKey: string,
  shades: string[],
): string {
  let h = 0;
  for (let i = 0; i < typeKey.length; i++) {
    h = (h * 31 + typeKey.charCodeAt(i)) >>> 0;
  }
  return shades[h % shades.length] ?? shades[0] ?? DEFAULT_DESIGN_COLORS.colorPrimary;
}

/** Relative luminance 0–1 (sRGB). */
export function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/**
 * Foreground that stays readable on `bg`.
 * Picks the darker of near-ink / a provided dark candidate, or white / a light candidate.
 */
export function inkOn(
  bg: string,
  opts?: { dark?: string; light?: string },
): string {
  const dark = opts?.dark ?? "#141414";
  const light = opts?.light ?? "#f9f7f3";
  // Bright surfaces need dark type; dark surfaces need light type.
  return luminance(bg) > 0.55 ? dark : light;
}

/** True when `fg` on `bg` is likely too weak — swap to inkOn(bg). */
export function ensureContrast(bg: string, fg: string): string {
  const ratio =
    (Math.max(luminance(bg), luminance(fg)) + 0.05) /
    (Math.min(luminance(bg), luminance(fg)) + 0.05);
  if (ratio >= 3.2) return fg;
  return inkOn(bg);
}
