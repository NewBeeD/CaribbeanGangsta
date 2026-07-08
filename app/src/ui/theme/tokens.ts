/**
 * Design tokens — the single source of truth for the "cinematic dossier" look
 * (see prompts/01_design_system.md; ported from prototype/style.css).
 *
 * These typed constants are mirrored to CSS custom properties by `GlobalStyles`
 * (via `rootCssText()`), so `global.css` and components reference `var(--cg-*)`
 * and never hard-code the palette. Change a value here and it propagates.
 *
 * UX law this serves: clarity of feedback over flash — tokens exist to make
 * competence legible, not to decorate (design/04 §0).
 */

/* ------------------------------------------------------------------ colors */
// Warm charcoal base (brown-black, never blue-black), aged-paper text, brass
// money accent, stamp-red alerts, absinthe-green for "clean / rising".
export const color = {
  ink900: '#100d0a', // app background
  ink850: '#16120d',
  ink800: '#1c1712', // panel
  ink750: '#241d16', // raised panel
  paper: '#ece2d0', // aged paper text
  paperDim: '#a89a83', // faded ink
  paperGhost: '#6b6152', // ghosted ink (least emphasis)
  brass: '#c9a24b', // money + primary accent
  brassHi: '#e7c877',
  brassLo: '#8f6d28',
  red: '#b2412f', // stamp red / alert / heat
  redHi: '#cf5b46',
  green: '#8a9a5b', // absinthe — "rising / clean", never candy-green
  greenHi: '#adbd78',
  line: '#372f24', // hairline
  lineSoft: '#2a231b',
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
  cashClean: color.greenHi, // laundered / legit money
  cashDirty: color.brass, // contraband proceeds
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
// Dossiers have crisp corners, not pill blobs.
export const radius = {
  sm: 3,
  md: 4,
  lg: 6,
  xl: 8,
  pill: 999,
} as const;

/* --------------------------------------------------------------- typography */
// Fraunces display + Special Elite typewriter stamp + Spectral serif body,
// each with a Georgia/Courier offline fallback so the app still reads offline.
export const font = {
  display: '"Fraunces", Georgia, serif',
  body: '"Spectral", Georgia, serif',
  stamp: '"Special Elite", "Courier New", monospace',
} as const;

export const fontSize = {
  stamp: '0.58rem', // typewriter labels / kickers
  micro: '0.62rem',
  small: '0.82rem',
  body: '1.02rem',
  bodyLg: '1.06rem',
  h3: '1.15rem',
  h2: '1.4rem',
  h1: '1.9rem',
} as const;

export const fontWeight = {
  regular: 400,
  medium: 600,
  bold: 700,
  black: 900,
} as const;

export const lineHeight = {
  tight: 1.02,
  snug: 1.2,
  body: 1.62,
} as const;

export const letterSpacing = {
  tight: '-0.01em',
  normal: '0',
  wide: '0.18em',
  wider: '0.24em',
  widest: '0.28em', // stamped kickers
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
  // colors
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
