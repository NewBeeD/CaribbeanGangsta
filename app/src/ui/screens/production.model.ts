/**
 * The Production screen's view-model (Prompt 39; Ideas2 item 3). PURE read
 * selectors that turn `GameState` into the "become a supplier" surface: the
 * grow-ops and factories you own, each op's live product yield and its
 * dollar-equivalent at the home market, the priced next upgrade, the crew
 * lieutenant running it, and the buyable-once roster. The screen composes these
 * and dispatches through the store — it authors NO yield/cost/price math (README
 * UI rule; the units/hr shown is the number the engine deposits — fairness law).
 *
 * Production mirrors fronts (moneyScreen.model.ts): every op is offered from
 * minute one (open access — Ideas.md), each is single-buy then upgrade-only, and
 * the buy-in (money) is the only gate. Strains differ in BOTH yield and profit —
 * the premium strain grows the high-value `exotic` line, so "more profit" reads
 * straight off the one-price economy, all disclosed.
 */

import {
  PRODUCTION_MAX_LEVEL,
  PRODUCT_PRICE_BANDS,
  getMarketPrice,
  getProductionOp,
  productionUpgradeCost,
  productionYieldRate,
  type GameState,
  type ProductionOp,
  type ProductionOpId,
  type ProductionKind,
} from '@/engine';

const PRODUCT_NAME: Readonly<Record<string, string>> = Object.fromEntries(
  PRODUCT_PRICE_BANDS.map((p) => [p.id, p.name]),
);

/** The country the home stash sits in — where produced units price for the $/h read. */
export function homeCountryId(state: GameState): string {
  return state.stashes[0]?.countryId ?? state.world.startingCountry.id;
}

/** The crew member (a lieutenant) currently running op `opId`, or `null`. */
export function opManager(state: GameState, opId: string): { readonly id: string; readonly name: string } | null {
  const npc = state.crew.find(
    (c) => c.assignment.kind === 'production' && c.assignment.targetId === opId,
  );
  return npc ? { id: npc.id, name: npc.name } : null;
}

/** Non-wire lieutenants who can be transferred to run an op (design/02 §5 delegation). */
export function availableManagers(state: GameState): readonly { readonly id: string; readonly name: string }[] {
  return state.crew
    .filter((c) => c.role === 'lieutenant' && !c.isWire)
    .map((c) => ({ id: c.id, name: c.name }));
}

/** One owned production op, priced for its next level and valued at the home market. */
export interface OpRow {
  readonly id: string;
  readonly type: ProductionOpId;
  readonly name: string;
  readonly kind: ProductionKind;
  readonly product: string;
  readonly productName: string;
  readonly level: number;
  readonly maxLevel: number;
  readonly maxed: boolean;
  /** Product units per real hour at the current level (delegation folded in). */
  readonly unitsPerHour: number;
  /** Dollar value of an hour's yield at the home market price (disclosed, not banked). */
  readonly valuePerHour: number;
  /** Passive heat per online hour while the op runs. */
  readonly heatPerHour: number;
  /** Cost to reach the next level, `buy_in × 1.15^level` (0 when maxed). */
  readonly upgradeCost: number;
  readonly affordable: boolean;
  /** The lieutenant running it (delegation bonus applied), or `null`. */
  readonly manager: { readonly id: string; readonly name: string } | null;
  /** The disclosed delegation bonus a lieutenant adds (0 when none is on it). */
  readonly managerBonus: number;
}

export function opRows(state: GameState): readonly OpRow[] {
  const country = homeCountryId(state);
  const tuning = state.config.production;
  return state.productionOps.map((op) => {
    const type = op.type as ProductionOpId;
    const cfg = getProductionOp(type, tuning.PRODUCTION_OPS);
    const maxed = op.level >= tuning.PRODUCTION_MAX_LEVEL;
    const upgradeCost = maxed ? 0 : productionUpgradeCost(type, op.level, tuning);
    const unitsPerHour = productionYieldRate(state, op);
    const price = getMarketPrice(state, cfg.product, country).price;
    const manager = opManager(state, op.id);
    return {
      id: op.id,
      type,
      name: cfg.name,
      kind: cfg.kind,
      product: cfg.product,
      productName: PRODUCT_NAME[cfg.product] ?? cfg.product,
      level: op.level,
      maxLevel: tuning.PRODUCTION_MAX_LEVEL,
      maxed,
      unitsPerHour,
      valuePerHour: unitsPerHour * price,
      heatPerHour: cfg.heatPerHour,
      upgradeCost,
      affordable: !maxed && state.cleanCash >= upgradeCost,
      manager,
      managerBonus: manager ? state.config.crew.LIEUTENANT_FRONT_BONUS : 0,
    };
  });
}

/**
 * The op whose next upgrade to affordable-highlight — the cheapest upgrade the
 * player can actually pay for. `null` when nothing is upgradable-and-affordable.
 */
export function nextAffordableOpUpgradeId(state: GameState): string | null {
  const affordable = opRows(state).filter((r) => !r.maxed && r.affordable);
  if (affordable.length === 0) return null;
  return [...affordable].sort((a, b) => a.upgradeCost - b.upgradeCost)[0]!.id;
}

/** A production op the player can open from clean cash — always offered (open access). */
export interface BuyOpOption {
  readonly type: ProductionOpId;
  readonly name: string;
  readonly kind: ProductionKind;
  readonly product: string;
  readonly productName: string;
  readonly buyIn: number;
  readonly unitsPerHourPerLevel: number;
  readonly heatPerHour: number;
  readonly blurb: string;
  readonly affordable: boolean;
}

/**
 * The buyable-once production roster (Ideas2 item 3). Every op is offered from
 * minute one (money is the only gate), but each is single-buy: once owned it moves
 * to the owned list (`opRows`) and drops out here. When all are owned this is empty.
 */
export function buyOpOptions(state: GameState): readonly BuyOpOption[] {
  const owned = new Set(state.productionOps.map((o) => o.type));
  return state.config.production.PRODUCTION_OPS.filter((cfg) => !owned.has(cfg.id)).map((cfg) => ({
    type: cfg.id,
    name: cfg.name,
    kind: cfg.kind,
    product: cfg.product,
    productName: PRODUCT_NAME[cfg.product] ?? cfg.product,
    buyIn: cfg.buyIn,
    unitsPerHourPerLevel: cfg.unitsPerHourPerLevel,
    heatPerHour: cfg.heatPerHour,
    blurb: cfg.blurb,
    affordable: state.cleanCash >= cfg.buyIn,
  }));
}

/** Maxed-out level constant surfaced for the UI (kept in sync with the engine). */
export { PRODUCTION_MAX_LEVEL };

/** Cast helper so the screen can hand a raw id back to the engine action. */
export function opTypeOf(op: ProductionOp): ProductionOpId {
  return op.type as ProductionOpId;
}
