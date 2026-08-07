---
name: JARVIS
description: >
  Iron-Man-HUD assistant UI. Dark, near-black canvas; a single electric-cyan
  accent drives every interactive element; violet is the secondary accent;
  subtle glows and thin "arc reactor" motifs, never heavy chrome.
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
    secondary: "#A0AEC0"
    muted:     "#4A6080"
  accent:
    blue:   "#00D4FF"      # Electric Cyan — PRIMARY brand, all primary CTAs/focus/active
    violet: "#7C5CEF"      # secondary accent, gradients only
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
  card:     "0 1px 3px rgba(0,0,0,0.4), 0 0 0 1px rgba(0,212,255,0.04)"
  elevated: "0 4px 16px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,212,255,0.06)"
  glowCyan: "0 0 20px rgba(0,212,255,0.15), 0 0 60px rgba(0,212,255,0.05)"
motion:
  easing:    "cubic-bezier(0, 0, 0.2, 1)"  # theme.transitionTimingFunction.jarvis
  duration:  { interaction: 150ms, page: 250ms }
---

## Overview

JARVIS is a heads-up-display assistant, not a generic SaaS dashboard. The look
is **dark, precise, and quiet** with one loud thing: electric cyan. Think Iron
Man's UI — near-black glass, hairline borders, faint cyan glow on what matters,
and thin animated "arc reactor" rings as the signature motif. Everything else
stays out of the way so the accent and the content carry the screen.

## How to use the tokens

- **One accent rule.** Electric Cyan (`accent.blue #00D4FF`) is the only colour
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

## ⚠️ Known inconsistency — reconcile before building new UI

There are currently **two divergent palettes** in the codebase, which is why
screens drift apart:

1. **`tailwind.config.ts`** — the Electric-Cyan HUD palette above. This file is
   the **canonical** source of truth (its `accent.blue` is explicitly labelled
   "primary brand," and the `gradient-text*` utilities hard-code `#00D4FF`).
2. **`src/app/globals.css :root`** — a *different*, violet-navy set
   (`--color-accent-blue #4F8EF7`, `--color-bg-base #07070F`,
   `--color-success #3DEFA0`, `--color-text-primary #E8E8FF`). Components that
   style via `var(--color-…)` therefore look different from ones using Tailwind
   classes.

**Target state:** migrate the `:root` variables to the token values in this
file so both layers render identically. That migration is a visible change to
the whole app's tone, so it's a deliberate decision, not an incidental edit —
do it as its own reviewed pass, then delete this note.

The split is even visible *within* `globals.css`: its `.gradient-text*` utilities
hard-code the canonical `#00D4FF` / `#7C5CEF` / `#10B981` while the `:root` block
in the same file defines the violet-navy set.

(The dangling `var(--glow-cyan)` reference — consumed by `.glow-cyan` and
`.card-glow-blue` but defined only as `--glow-blue` — has been aliased in
`globals.css` so those glows render again. It currently resolves to the `:root`
blue `#4F8EF7`, not the canonical cyan `#00D4FF`; it becomes true cyan once the
palette migration above lands.)
