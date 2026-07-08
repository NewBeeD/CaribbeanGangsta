# Prompt 01 — Design system & visual language

**Phase:** 0 — Foundation
**Depends on:** 00
**Design refs:** `design/04_UX_and_UI.md` §5; `design/07_Wireframes.md` §8; `prototype/README.md`
("Cinematic dossier" direction); `prototype/style.css` (existing token reference)

## Goal
Establish the Caribbean-noir "cinematic dossier" look as a reusable theme + primitive
component kit, so every screen prompt (15–23) composes from consistent tokens instead
of inventing styling. UX law: **clarity of feedback over flash** — the design system's
job is to make competence *legible*, not to decorate. (design/04 §0)

## Build
- `src/ui/theme/tokens.ts` — design tokens as typed constants: colors (warm charcoal
  base, brass-foil accent, alert/heat reds, "clean/dirty cash" hues), spacing scale,
  radii, type scale, z-index. Port the palette/fonts from `prototype/style.css`
  (Fraunces display, Special Elite stamp, Spectral body) with the same
  Georgia/Courier offline fallback.
- `src/ui/theme/GlobalStyles` (CSS or CSS-in-TS): film-grain + vignette overlays, base
  reset, font-face/`@import` with fallback, mobile-first/portrait layout defaults.
- Primitive components in `src/ui/components/` (presentational, prop-driven, no game
  logic):
  - `Button` (primary/secondary variants; **one primary per screen state** — see UX §3)
  - `Stat` / `DottedRow` (label · dotted leader · value — the dossier row)
  - `RiskMeter` — renders a probability as dots/bar **plus the exact % text**
    (fairness: the number shown must be the number passed in)
  - `TrendArrow` — up/down/flat price trend glyph
  - `HeatDots` — heat as filled/empty dots, not a raw number (wireframe §1)
  - `SceneText` — prose block styling for story/failure scenes (never a toast)
  - `Card`, `Panel`, `StampBadge` (`CONFIDENTIAL`/`FILED` motifs), `BottomNav`
- `src/ui/theme/index.ts` — barrel export.
- A `theme` route or Storybook-lite gallery page (`src/ui/screens/StyleGallery.tsx`)
  rendering every primitive in all states — a manual visual check surface.

## Acceptance criteria
- `npm run typecheck`/`lint` pass; fonts load online and fall back offline.
- The gallery page shows every primitive; `RiskMeter` given `0.7` renders "70%".
- Components are **pure presentational** — no imports from `engine/` or `store/`.
- Colorblind-safe risk cues (not red/green alone — pair with shape/text). (design/04 §6)

## Guardrails
- Numbers stay light; prefer dots/arrows/prose over raw figures where a glyph conveys
  it (design/07 §8). But **risk/odds always keep an exact % label** (fairness).
- Don't over-invest in flash: clean feedback *lets* need-satisfaction hook players; it
  isn't itself the hook. (design/04 §0, GDD §5.1)
