---
name: JARVIS
description: >
  Iron-Man-HUD assistant UI. Dark, near-black canvas; a single arc-blue
  accent drives every interactive element; violet is the secondary accent;
  subtle glows, thin "arc reactor" motifs and bracket frames, never heavy
  chrome. Depth comes from layered surfaces and pointer-tracked 3D, not shadow.
colors:
  background:
    base:     "#050505"   # app canvas
    surface:  "#07111F"    # cards, panels
    elevated: "#0D1B30"    # modals, popovers, raised surfaces
  border:
    default:  "#0F2235"
    hover:    "#1A3A5C"
  text:
    primary:   "#FFFFFF"
    secondary: "#B0B8C8"
    muted:     "#6B7394"
  accent:
    blue:   "#4FC3F7"      # Arc Blue — PRIMARY brand, all primary CTAs/focus/active
    violet: "#7B5CF0"      # secondary accent, gradients only
    red:    "#EF4444"      # destructive
  status:
    success: "#10B981"
    warning: "#F59E0B"
typography:
  fontFamily:
    sans:    "Inter, system-ui, sans-serif"        # body + UI
    display: "Geist, Inter, system-ui, sans-serif" # headings, hero
    mono:    "Geist Mono, ui-monospace, monospace" # data, tokens, timestamps
  base: { fontSize: 14px, lineHeight: 1.6 }
rounded:
  card:  8px
  input: 6px
  badge: 3px
spacing: { xs: 4px, sm: 8px, md: 16px, lg: 24px, xl: 40px }  # 4px base grid
shadow:
  card:     "0 1px 3px rgba(0,0,0,0.4), 0 0 0 1px rgba(79,195,247,0.04)"
  elevated: "0 4px 16px rgba(0,0,0,0.6), 0 0 0 1px rgba(79,195,247,0.06)"
  glowCyan: "0 0 20px rgba(79,195,247,0.15), 0 0 60px rgba(79,195,247,0.05)"
  lift:     "0 24px 60px -20px rgba(0,0,0,0.85), 0 0 40px rgba(79,195,247,0.10)"
motion:
  easing:
    jarvis: "cubic-bezier(0, 0, 0.2, 1)"     # theme.transitionTimingFunction.jarvis
    depth:  "cubic-bezier(0.22, 1, 0.36, 1)" # 3D settle — theme….depth
  duration:  { interaction: 150ms, page: 250ms, depth: 420ms }
---

## Overview

JARVIS is a heads-up-display assistant, not a generic SaaS dashboard. The look
is **dark, precise, and quiet** with one loud thing: arc blue. Think Iron
Man's UI — near-black glass, hairline borders, faint blue glow on what matters,
and thin animated "arc reactor" rings as the signature motif. Everything else
stays out of the way so the accent and the content carry the screen.

## How to use the tokens

- **One accent rule.** Arc Blue (`accent.blue #4FC3F7`) is the only colour
  that signals "interactive/active/primary." Primary buttons, focused inputs,
  active nav, live indicators. Violet is for gradients and secondary flourish
  only — never a second primary button colour. Red is destructive only.
- **Depth by surface, not by shadow.** Stack `background.base` → `surface` →
  `elevated` to show layering; borders are hairline (`border.default`, 1px).
  Use `shadow.card`/`elevated` sparingly; reach for `shadow.glowCyan` only on
  genuinely primary/live elements, not every card.
- **Type.** Body and UI in Inter at the 14px/1.6 base. Headings/hero in Geist
  (`display`). Any number, token, timestamp, or code in Geist Mono — the mono
  face is part of the HUD identity, not just for code blocks.
- **Rounding is tight.** 8px cards, 6px inputs, 3px badges. Nothing pill-shaped;
  this is instrument-panel geometry.
- **Motion is fast and subtle.** 150ms for interactions, 250ms for page-level
  transitions, always the `jarvis` easing. Glows pulse slowly; nothing bounces.
- **4px spacing grid.** Compose padding/margins from the `spacing` scale.

## Palette: one set of values, expressed twice

`tailwind.config.ts` and `globals.css :root` now define **identical** values,
and this file's front matter matches both. Three layers previously disagreed —
Tailwind said `#00D4FF`, `:root` said `#4F8EF7`, and 259 hardcoded hexes across
64 files said `#4FC3F7` — which is why screens drifted apart. `#4FC3F7` won
because it is what the app already rendered almost everywhere, so unifying on
it changed the token layer rather than 64 files of markup.

**Rule:** a colour change lands in `tailwind.config.ts` *and* `globals.css
:root`, or in neither. Prefer `accent-blue` / `var(--color-accent-blue)` over a
new hardcoded hex; the remaining literals are legacy and should be swept to
tokens as files are touched.

## 3D and motion system

Depth is a first-class part of the identity, not decoration bolted on. Three
primitives in `src/components/hud/` cover it, and every one degrades to a flat,
static panel under `prefers-reduced-motion`.

- **`<HoloFrame>`** — the bracket frame. Pick which `corners` to draw, add a
  `rule` hairline and a mono `label`. Brackets extend and brighten on hover and
  on `focus-within`, so the frame reads as locking onto what you point at. It
  replaces the old `.hud-frame` utility, which could only ever draw two corners
  and had no focus affordance.
- **`<Card3D>`** — a panel that tilts toward the pointer. Children marked
  `.depth-1` / `.depth-2` / `.depth-3` separate from the surface as it tilts;
  that separation is what sells the depth, since tilt alone just reads as skew.
  Every ancestor between the child and `.card-3d` must preserve 3D or the
  stack silently collapses — `.card-3d .holo-frame` and `.card-3d .preserve-3d`
  are handled for you.
- **`<Reveal>`** — scroll-choreographed entrance. GSAP and ScrollTrigger are
  imported lazily so neither reaches the server bundle or the critical path.
  Grid children are grouped by row and revealed row-by-row rather than all at
  once. Content is visible by default and only hidden once the subtree arms
  itself before paint, so a failed chunk or disabled JS shows content rather
  than a blank section.

`<HeroCanvas>` is the WebGL set piece: four layers (particle nebula,
counter-rotating iris rings, faceted core, bloom) at genuinely different Z
depths, with damped pointer parallax. It parks its render loop when the tab is
hidden or the canvas scrolls off screen, caps pixel ratio at 2, renders a
single composed frame under reduced motion, and falls back to a CSS gradient
when WebGL is unavailable.

**Budget.** Reach for `Card3D` on genuinely interactive cards, not on every
panel — the tilt is a signal, and everything tilting means nothing does.
