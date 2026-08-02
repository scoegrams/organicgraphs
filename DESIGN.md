# Design

<!-- impeccable:design-schema 1 -->

## World

Construction drafting on paper. The product's real subject — an organization's record graph — is drawn the way a technical drafter draws structure: hairline rules, dimension ticks, and crosshair registration marks on a paper ground, never gradients, glass, or soft drop shadows. Pinned by the user from four reference sheets: a hand-inked panda/yarn mark, an app screen showing a red node graph on paper, a blueprint-style construction drawing in black + blue on paper, and a white node graph on red. No concept roll was run — the brief was already pinned.

## Color

Two fixed neutrals carry all structure:

- **Paper** (`--background` / `--card`, `38 30% 95%`) — the ground. Warm off-white, not pure white.
- **Ink** (`--foreground`, `20 9% 11%`) — all type, hairlines, and construction marks. Never gray; secondary text is `--muted-foreground`, a lighter tint of ink, not a cool gray.

Exactly two roles are user-chosen and stored as raw `R G B` channel strings (not HSL) in `--main` and `--accent`, so a native color input can read/write them directly:

- **Main** (`--main`, defaults to `213 44 27` / `#d52c1b`) — the primary signal: graph nodes, primary buttons, focus rings. Feeds Tailwind's `primary`/`ring` colors via `rgb(var(--main) / <alpha-value>)`.
- **Accent** (`--accent`, defaults to `21 87 227` / `#1557e3`) — the secondary signal: secondary emphasis, the `accent` badge variant. Feeds Tailwind's `accent` color the same way.

`--destructive` stays a fixed semantic red, independent of Main, so a user who picks red as their brand color doesn't turn every error state into their brand.

Color strategy: **Restrained**, with the one live-configurable exception the brief asked for. No other element may carry brand color; changing Main/Accent must never touch paper, ink, or structure.

## Marks (`src/components/construction-marks.tsx`)

- `CornerTicks` — four small crosshair registration marks at the corners of a `relative`-positioned panel, ink at 45% opacity. The one "drafting plate" ornament in the system; use it to frame a single hero panel, not on every card.
- `NodeGraphGlyph` — the literal product primitive (records as filled circles, relationships as ruled edges), colored via `currentColor` so it always paints in whichever role wraps it (typically `text-primary`).
- `DimensionRule` — a 1px ink rule with short perpendicular ticks at each end; the system's only divider. Never a shadow, never a gradient fade.
- `.construction-tick` / `.dimension-rule` utility classes in `globals.css` back these components.

## Type

System sans stack only (`ui-sans-serif, system-ui, sans-serif`), no custom display face. The brief asked for "highly simple" and "minimal" — a workhorse sans keeps the personality in the palette and the construction marks, not in lettering. (Previously `--font-sans` was referenced but never defined, which silently invalidated the whole `font-family` declaration per CSS's `var()` fallback rules and rendered every heading in the browser's default serif; removed the dangling reference.)

## Components

`src/components/ui/*` are unchanged in structure; only token values moved. `card.tsx` dropped `shadow-sm` (flat, bordered plates, no elevation) and reduced radius to `rounded-md`. `badge.tsx`'s `accent` variant now reads `bg-accent/10 text-accent` instead of a hardcoded sky color, so it tracks the user's chosen Accent. `success`/`warning`/`destructive` badge variants stay fixed semantic colors on purpose.

## Palette control (`src/components/palette-picker.tsx`)

Two labeled swatches, Main and Accent, each a bordered square wrapping a visually-hidden native `<input type="color">`. Changing one writes the `R G B` channels straight to the matching CSS custom property on `<html>` and to `localStorage` (`orggraph-palette`). `src/app/layout.tsx` inlines a small blocking script as the first child of `<body>` that re-applies any stored palette before the rest of the page paints, so a returning visitor's choice survives a reload without a flash back to the defaults.

## Where this lives today

Committed on the marketing home page (`src/app/page.tsx`): ink wordmark + palette picker in a bordered header, a dimension-rule below it, the headline/CTA pair on the left, the `NodeGraphGlyph` inside a `CornerTicks`-framed plate on the right, and a dimension-rule-topped footnote. Every other screen (sign-in, wizard, recommendation review, workspace) inherits the system automatically through the same shared tokens and `src/components/ui/*` primitives — none of them were redesigned individually in this pass.

## Open for a follow-up pass

- The in-app screens (wizard, recommendation review, org chart, graph explorer) inherit tokens but haven't been composed in the construction grammar the way the home page was — extending `CornerTicks`/`DimensionRule` into those surfaces is the natural next step.
- No dark-mode toggle exists yet; `.dark` token values were updated for consistency but nothing switches the class.
- No accessibility-specific requirement was confirmed with the user; verify contrast if Main/Accent are changed to a low-contrast pair (e.g. a pale yellow) since nothing currently clamps the picker's range.
