/**
 * Design tokens — the single source of truth for the "SUNNY TROPICAL" look.
 *
 * These typed constants are mirrored to CSS custom properties by `GlobalStyles`
 * (via `rootCssText()`), so `global.css` and components reference `var(--cg-*)`
 * and never hard-code the palette. Change a value here and it propagates.
 *
 * UX law this serves: clarity of feedback over flash. The palette is bright,
 * warm and HIGH-CONTRAST (dark ink on light surfaces) so competence is legible
 * at a glance — readability first, personality close behind.
 */

/* ------------------------------------------------------------------ colors */
// Light, sunny Caribbean palette: warm sand base, white cards, deep teal ink,
// with mango, turquoise, palm-green and coral as the playful accents.
//
// NOTE: the token *names* are inherited from the old dossier theme (ink/paper/
// brass) and are kept so every `var(--cg-*)` reference keeps working. Read them
// semantically now: `ink-*` = surfaces (light→lighter), `paper*` = ink/text,
// `brass*` = the mango/amber money-accent.
export const color = {
  ink900: '#fdf4e9', // app background base (warm sand)
  ink850: '#fbf0e1', // inset panel (soft beige)
  ink800: '#ffffff', // card surface (white)
  ink750: '#f2e2cc', // raised / track surface (peach)
  paper: '#233a47', // primary ink (deep teal-charcoal)
  paperDim: '#5e7683', // secondary ink (muted teal-grey)
  paperGhost: '#9bb0b9', // least-emphasis ink
  brass: '#f59e0b', // mango — money + primary accent
  brassHi: '#fcc33f', // bright mango (gradients / glows)
  brassLo: '#b4720b', // deep amber (readable "gold" ink + borders)
  red: '#f0483b', // coral — heat / alert
  redHi: '#e23a2e', // readable coral ink
  green: '#12b981', // palm/emerald — "clean / rising"
  greenHi: '#0e9e62', // readable emerald ink
  teal: '#0ea5b7', // turquoise — secondary brand accent (nav / links)
  tealHi: '#1ec0d2',
  goldInk: '#b26a00', // readable deep-amber text for "gold" tone
  line: '#eedfc9', // hairline border
  lineSoft: '#f5eadb',
} as const;

/**
 * Semantic aliases. Components should prefer these so intent survives a palette
 * change. "clean" vs "dirty" cash get distinct hues (design/04 §5, GDD §5.1).
 */
export const semantic = {
  bg: color.ink900,
  panel: color.ink800,
  panelRaised: color.ink750,
  text: color.paper,
  textDim: color.paperDim,
  textGhost: color.paperGhost,
  accent: color.brass,
  brand: color.teal,
  cashClean: color.greenHi, // laundered / legit money
  cashDirty: color.brassLo, // contraband proceeds
  alert: color.redHi, // heat / bust / danger
  rising: color.greenHi,
  falling: color.redHi,
} as const;

/* ----------------------------------------------------------------- spacing */
export const space = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 26,
  xxxl: 34,
} as const;

/* ------------------------------------------------------------------- radii */
// Friendly, rounded — soft cards, pill chips. Fun, not clinical.
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

/* --------------------------------------------------------------- typography */
// Baloo 2 (rounded, chunky display) + Nunito (rounded, highly-readable body).
// System sans fallbacks so the app still reads offline.
export const font = {
  display: '"Baloo 2", "Trebuchet MS", system-ui, sans-serif',
  body: '"Nunito", "Segoe UI", system-ui, sans-serif',
  stamp: '"Nunito", "Segoe UI", system-ui, sans-serif',
} as const;

export const fontSize = {
  stamp: '0.72rem', // labels / kickers (bumped up for legibility)
  micro: '0.74rem',
  small: '0.86rem',
  body: '1rem',
  bodyLg: '1.05rem',
  h3: '1.2rem',
  h2: '1.5rem',
  h1: '2rem',
} as const;

export const fontWeight = {
  regular: 400,
  medium: 600,
  bold: 700,
  black: 800,
} as const;

export const lineHeight = {
  tight: 1.05,
  snug: 1.25,
  body: 1.6,
} as const;

export const letterSpacing = {
  tight: '-0.01em',
  normal: '0',
  wide: '0.06em',
  wider: '0.1em',
  widest: '0.12em', // tracked kickers (was 0.28em — unreadably wide)
} as const;

/* ----------------------------------------------------------------- z-index */
export const z = {
  base: 0,
  content: 2,
  nav: 3,
  vignette: 9997,
  grain: 9998,
  modal: 9999,
} as const;

/**
 * Flat map of CSS custom properties generated from the tokens above. Consumed
 * by `GlobalStyles` to emit `:root { ... }`. Keep names `--cg-*` namespaced.
 */
export const cssVarMap: Record<string, string> = {
  // colors / surfaces
  '--cg-ink-900': color.ink900,
  '--cg-ink-850': color.ink850,
  '--cg-ink-800': color.ink800,
  '--cg-ink-750': color.ink750,
  '--cg-paper': color.paper,
  '--cg-paper-dim': color.paperDim,
  '--cg-paper-ghost': color.paperGhost,
  '--cg-brass': color.brass,
  '--cg-brass-hi': color.brassHi,
  '--cg-brass-lo': color.brassLo,
  '--cg-red': color.red,
  '--cg-red-hi': color.redHi,
  '--cg-green': color.green,
  '--cg-green-hi': color.greenHi,
  '--cg-teal': color.teal,
  '--cg-teal-hi': color.tealHi,
  '--cg-gold-ink': color.goldInk,
  '--cg-line': color.line,
  '--cg-line-soft': color.lineSoft,
  // semantic
  '--cg-cash-clean': semantic.cashClean,
  '--cg-cash-dirty': semantic.cashDirty,
  // spacing
  '--cg-space-xxs': `${space.xxs}px`,
  '--cg-space-xs': `${space.xs}px`,
  '--cg-space-sm': `${space.sm}px`,
  '--cg-space-md': `${space.md}px`,
  '--cg-space-lg': `${space.lg}px`,
  '--cg-space-xl': `${space.xl}px`,
  '--cg-space-xxl': `${space.xxl}px`,
  // radii
  '--cg-radius-sm': `${radius.sm}px`,
  '--cg-radius-md': `${radius.md}px`,
  '--cg-radius-lg': `${radius.lg}px`,
  '--cg-radius-xl': `${radius.xl}px`,
  // typography
  '--cg-font-display': font.display,
  '--cg-font-body': font.body,
  '--cg-font-stamp': font.stamp,
  // z-index
  '--cg-z-content': String(z.content),
  '--cg-z-nav': String(z.nav),
  '--cg-z-vignette': String(z.vignette),
  '--cg-z-grain': String(z.grain),
};

/** Serialize the token map into a `:root { ... }` CSS block. */
export function rootCssText(): string {
  const body = Object.entries(cssVarMap)
    .map(([name, value]) => `  ${name}: ${value};`)
    .join('\n');
  return `:root {\n${body}\n}`;
}
