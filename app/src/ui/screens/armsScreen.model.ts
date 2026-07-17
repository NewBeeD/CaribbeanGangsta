/**
 * The Arms page's view-model (Prompt 35; design/12 Item 1). PURE read selectors
 * that turn `GameState` into what the screen renders — the broker intro (a money
 * gate), the weapon-tier board (one price per tier, the heaviest heat in the
 * game), the armory you hold, clamped quantities, and the fairness bust % on a
 * sale — by calling `arms.ts` engine functions.
 *
 * The screen composes these and dispatches through the store; it authors NO
 * economic/heat/odds math (README UI rule). Most importantly `armsSellBust`,
 * which is `armsBustProbability` verbatim: the odds shown are the odds rolled.
 */

import {
  ARMS_COUNTRY_IDS,
  WEAPON_TIERS,
  armsBrokerQuote,
  armsBustProbability,
  armsTraded,
  getArmsPrice,
  getCountry,
  hasCustomsProtection,
  spendableAt,
  type ArmsBrokerQuote,
  type ArmsPriceTrend,
  type GameState,
  type Stash,
  type WeaponTierId,
} from '@/engine';

const money = (n: number): string => `$${Math.round(n).toLocaleString('en-US')}`;

/** The run's home stash — where arms cash is drawn from and proceeds land. */
export function homeStash(state: GameState): Stash {
  return state.stashes[0]!;
}

/** One arms market the player can trade in: a country they stand in that trades arms. */
export interface ArmsMarketChoice {
  readonly countryId: string;
  readonly name: string;
}

/**
 * Every country the player has a foothold in AND arms trade (design/11 §1 —
 * regional culture; deals execute where you stand). Deduped by country. The
 * Caribbean home island always trades arms, so this is never empty for a live run.
 */
export function armsMarketChoices(state: GameState): readonly ArmsMarketChoice[] {
  const seen = new Set<string>();
  const choices: ArmsMarketChoice[] = [];
  for (const stash of state.stashes) {
    if (seen.has(stash.countryId) || !armsTraded(stash.countryId)) continue;
    seen.add(stash.countryId);
    choices.push({ countryId: stash.countryId, name: getCountry(stash.countryId).name });
  }
  return choices;
}

/** The default market the page opens on (the home country, else the first available). */
export function defaultArmsCountry(state: GameState): string {
  const choices = armsMarketChoices(state);
  const home = homeStash(state).countryId;
  return choices.some((c) => c.countryId === home) ? home : (choices[0]?.countryId ?? home);
}

/** The broker-intro quote (always visible — the gate is priced, never hidden). */
export function brokerQuote(state: GameState): ArmsBrokerQuote {
  return armsBrokerQuote(state);
}

/** The broker intro as PROSE (the plug-gate pattern) — the price of getting in. */
export function brokerIntroProse(state: GameState): string {
  const q = armsBrokerQuote(state);
  return `The broker takes meetings at two and a half. ${money(
    q.cost,
  )} clean buys the introduction — after that, the price list opens.`;
}

/** One weapon tier as a board row: THE price, trend, stock, and what you hold. */
export interface ArmsTierRow {
  readonly id: WeaponTierId;
  readonly name: string;
  readonly blurb: string;
  readonly price: number;
  readonly trend: ArmsPriceTrend;
  /** Whole units the broker's line can supply right now (finite stock). */
  readonly stock: number;
  /** Units of this tier in your armory. */
  readonly held: number;
  /** Heat generated per unit moved — the heaviest in the game. */
  readonly heatPerUnit: number;
  /** True while a conflict event is spiking this market (the money window). */
  readonly conflict: boolean;
}

/** The tier board for a market: every weapon tier with its live price + your holdings. */
export function armsTierRows(state: GameState, countryId: string): readonly ArmsTierRow[] {
  return WEAPON_TIERS.map((tier) => {
    const price = getArmsPrice(state, tier.id, countryId);
    return {
      id: tier.id,
      name: tier.name,
      blurb: tier.blurb,
      price: price.price,
      trend: price.trend,
      stock: price.stock,
      held: state.armory[tier.id] ?? 0,
      heatPerUnit: tier.heatPerUnit,
      conflict: price.conflict,
    };
  });
}

// --- The arms price book (Prompt 50; design/13 §H) ----------------------------
// The gap round-4 named: "arms do not show well… it does not show the prices of
// the different types… probably a separate arms market." The fix mirrors the
// World-Market price board (Prompt 42): every tier's price in every arms-trading
// country, visible FROM MINUTE ONE (open access — before the broker, before a
// foothold), each number `getArmsPrice` VERBATIM so what's shown is what a
// sale/purchase there executes at. No engine math here.

export type ArmsHeatClass = 'High' | 'Severe' | 'Extreme' | 'Maximum';

/**
 * A tier's heat CLASS — a plain-language label over its per-unit heat (the
 * heaviest in the game, design/12 Item 1: 2.5 → 6.0). Pure read; drives the
 * "heat class" column the price book discloses.
 */
export function armsHeatClass(heatPerUnit: number): ArmsHeatClass {
  if (heatPerUnit >= 6) return 'Maximum';
  if (heatPerUnit >= 4.5) return 'Extreme';
  if (heatPerUnit >= 3.5) return 'Severe';
  return 'High';
}

/** One arms-trading country, for the book's country picker (open access — every
 * country arms move through, not just the ones you have a foothold in). */
export interface ArmsBookCountry {
  readonly id: string;
  readonly name: string;
}

export function armsBookCountries(): readonly ArmsBookCountry[] {
  return ARMS_COUNTRY_IDS.map((id) => ({ id, name: getCountry(id).name }));
}

/**
 * ONE (tier, country) price cell — the single price path every book view shares
 * (`armsTierBoard`, `armsCountrySheet`, `armsPriceBook` all funnel through here),
 * so a number is `getArmsPrice` verbatim no matter which way the book is read.
 * This is the fairness anchor the cross-check test pins.
 */
export interface ArmsPriceCell {
  readonly countryId: string;
  readonly countryName: string;
  readonly tierId: WeaponTierId;
  readonly tierName: string;
  /** THE price — a buy/sale here executes at exactly this (getArmsPrice.price). */
  readonly price: number;
  readonly trend: ArmsPriceTrend;
  /** Whole units the broker's line can supply here right now (finite stock). */
  readonly stock: number;
  /** True while a conflict event is spiking this market (the money window). */
  readonly conflict: boolean;
  /** A one-word demand read: conflict spike, else the drift trend. */
  readonly demandNote: string;
  /** Heat per unit moved (the tier's, country-independent). */
  readonly heatPerUnit: number;
  readonly heatClass: ArmsHeatClass;
  /** Stashes the player holds here — presence is where a deal can execute. */
  readonly presence: number;
}

function armsDemandNote(trend: ArmsPriceTrend, conflict: boolean): string {
  if (conflict) return 'Conflict spike';
  return trend === 'up' ? 'Demand rising' : trend === 'down' ? 'Softening' : 'Quiet';
}

function armsCell(state: GameState, tier: WeaponTierId, countryId: string): ArmsPriceCell {
  const cfg = WEAPON_TIERS.find((t) => t.id === tier)!;
  const price = getArmsPrice(state, tier, countryId);
  return {
    countryId,
    countryName: getCountry(countryId).name,
    tierId: tier,
    tierName: cfg.name,
    price: price.price,
    trend: price.trend,
    stock: price.stock,
    conflict: price.conflict,
    demandNote: armsDemandNote(price.trend, price.conflict),
    heatPerUnit: cfg.heatPerUnit,
    heatClass: armsHeatClass(cfg.heatPerUnit),
    presence: state.stashes.filter((s) => s.countryId === countryId).length,
  };
}

/** By-tier: pick a weapon tier, read its price in EVERY arms-trading country
 * (the geography read — where a conflict is spiking demand). */
export function armsTierBoard(state: GameState, tier: WeaponTierId): readonly ArmsPriceCell[] {
  return ARMS_COUNTRY_IDS.map((id) => armsCell(state, tier, id));
}

/** By-country: stand in a country, read EVERY tier's price at once (the whole
 * catalogue for one market — the location-centric mirror of `armsTierBoard`). */
export function armsCountrySheet(state: GameState, countryId: string): readonly ArmsPriceCell[] {
  return WEAPON_TIERS.map((t) => armsCell(state, t.id, countryId));
}

/** The whole book at a glance — a tiers × countries matrix (every price, always). */
export interface ArmsPriceBook {
  readonly tiers: readonly { id: WeaponTierId; name: string }[];
  readonly countries: readonly ArmsBookCountry[];
  /** Row-major: `rows[tierIndex][countryIndex]`, aligned to `tiers`/`countries`. */
  readonly rows: readonly (readonly ArmsPriceCell[])[];
}

export function armsPriceBook(state: GameState): ArmsPriceBook {
  const tiers = WEAPON_TIERS.map((t) => ({ id: t.id, name: t.name }));
  return {
    tiers,
    countries: armsBookCountries(),
    rows: tiers.map((t) => armsTierBoard(state, t.id)),
  };
}

export type ArmsMode = 'buy' | 'sell';

/** Most units of `tier` a buy can take here: affordable AND supply-bounded.
 * Affordability spans the home stash's dirty cash PLUS clean cash. */
export function maxBuyArms(state: GameState, tier: WeaponTierId, countryId: string): number {
  const price = getArmsPrice(state, tier, countryId);
  const affordable =
    price.price > 0 ? Math.floor(spendableAt(state, homeStash(state)) / price.price) : 0;
  return Math.max(0, Math.min(affordable, price.stock));
}

/** Most units of `tier` a sell can move: exactly what the armory holds. */
export function maxSellArms(state: GameState, tier: WeaponTierId): number {
  return state.armory[tier] ?? 0;
}

/** Ceiling on the stepper for the current mode. */
export function maxArmsQty(
  mode: ArmsMode,
  state: GameState,
  tier: WeaponTierId,
  countryId: string,
): number {
  return mode === 'buy' ? maxBuyArms(state, tier, countryId) : maxSellArms(state, tier);
}

/** Clamp a requested quantity into `[1, max]` (0 when nothing is possible). */
export function clampArmsQty(qty: number, max: number): number {
  if (max <= 0) return 0;
  return Math.min(Math.max(1, Math.round(qty)), max);
}

/**
 * The bust probability for an arms sale — `armsBustProbability` verbatim. The
 * SAME number `resolveArmsDeal` rolls against; the RiskMeter renders it directly
 * (fairness law). Buys don't roll a bust.
 */
export function armsSellBust(
  state: GameState,
  tier: WeaponTierId,
  qty: number,
  countryId: string,
): number {
  return armsBustProbability(state, tier, qty, countryId);
}

/** Whether the Customs Chief's EUC paper is cutting the seizure odds (Item 1). */
export function hasCustomsPaper(state: GameState): boolean {
  return hasCustomsProtection(state);
}

/** Outcome-scene copy keyed by the engine's arms scene keys (failure is a scene). */
export interface ArmsScene {
  readonly tone: 'default' | 'win' | 'bust';
  readonly who?: string;
  readonly text: string;
}

export const ARMS_SCENES: Readonly<Record<string, ArmsScene>> = {
  'arms.broker.opened': {
    tone: 'win',
    who: 'The broker',
    text: 'slides a card across the table. "You’re on the list now. Try not to end up on another one."',
  },
  'arms.buy.success': {
    tone: 'default',
    text: 'The crate is loaded in the dark, serial numbers already gone. Yours now — and so is the weight.',
  },
  'arms.sell.success': {
    tone: 'win',
    who: 'The buyer',
    text: 'checks the action, pays in banded cash, and is gone before the engine cools.',
  },
  'arms.sell.bust': {
    tone: 'bust',
    text: 'A federal task force had the buy wired. You made the treeline; the hardware — and the cash — did not.',
  },
};

/** Resolve arms outcome prose for a scene key, with a neutral fallback. */
export function armsSceneFor(sceneKey: string): ArmsScene {
  return ARMS_SCENES[sceneKey] ?? { tone: 'default', text: 'The deal is done.' };
}
