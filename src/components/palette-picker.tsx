"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "orggraph-palette";

type Role = "main" | "accent";

function hexToChannels(hex: string): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
}

function channelsToHex(channels: string): string {
  const [r = 0, g = 0, b = 0] = channels.trim().split(/\s+/).map(Number);
  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function applyRole(role: Role, channels: string) {
  document.documentElement.style.setProperty(`--${role}`, channels);
}

/**
 * The whole palette surface: two roles, Main and Accent. Everything else in
 * the design language is paper or ink and does not move when these change.
 */
export function PalettePicker({ className }: { className?: string }) {
  const [main, setMain] = React.useState("#d52c1b");
  const [accent, setAccent] = React.useState("#1557e3");
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    const computed = getComputedStyle(document.documentElement);
    const mainChannels = computed.getPropertyValue("--main").trim();
    const accentChannels = computed.getPropertyValue("--accent").trim();
    if (mainChannels) setMain(channelsToHex(mainChannels));
    if (accentChannels) setAccent(channelsToHex(accentChannels));
    setMounted(true);
  }, []);

  const handleChange = (role: Role, hex: string) => {
    const channels = hexToChannels(hex);
    applyRole(role, channels);
    if (role === "main") setMain(hex);
    else setAccent(hex);
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ ...stored, [role]: channels }),
      );
    } catch {
      /* localStorage unavailable; palette still applies for this session */
    }
  };

  return (
    <div
      className={cn(
        "flex items-center gap-5 text-sm",
        mounted ? "opacity-100" : "opacity-0",
        "transition-opacity",
        className,
      )}
    >
      <Swatch label="Main" value={main} onChange={(v) => handleChange("main", v)} />
      <Swatch label="Accent" value={accent} onChange={(v) => handleChange("accent", v)} />
    </div>
  );
}

function Swatch({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  const id = React.useId();
  return (
    <label
      htmlFor={id}
      className="group flex cursor-pointer items-center gap-2"
    >
      <span className="relative h-8 w-8 shrink-0 border border-foreground/45">
        <span
          className="absolute inset-[2px]"
          style={{ backgroundColor: value }}
          aria-hidden="true"
        />
        <input
          id={id}
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          aria-label={`${label} color`}
        />
      </span>
      <span className="font-semibold uppercase tracking-[0.12em] text-foreground">
        {label}
      </span>
    </label>
  );
}
