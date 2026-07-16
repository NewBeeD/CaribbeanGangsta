/**
 * The owned-vessel engine (design/13 E; Prompt 47) — buy a boat outright as the
 * late-game money sink that ALSO transports. This is the fronts/production idle
 * spine mirrored for logistics: a single clean-cash sink, single-buy per id, then
 * upgrade-only along the `×1.15` family curve (config/vessels.ts).
 *
 * An owned vessel OPERATES its charter `mode` (config/transport.ts) with **no
 * owner cut** and a steep per-leg discount, and its cargo cap grows with level —
 * `travel.ts` reads `ownedVesselForMode` at quote time and prices the leg cut-free.
 * The fleet's invested value counts in `netWorth` (state.ts), so buying a $50M
 * freighter moves capital into an asset rather than vanishing it.
 *
 * Purity/determinism (prompts/README.md): pure functions, immutable state in →
 * new state out, no `Math.random`, no wall clock. No randomness anywhere here — a
 * vessel's cap, discount, and value are deterministic functions of its level and
 * the injected config, so the numbers the fleet card and quote show are the numbers
 * the engine uses (fairness: shown = applied).
 *
 * Open access (Ideas.md — the tested guardrail): every vessel is buyable from
 * minute one; the $5M–$50M price is the ONLY gate. The vessel is a sink, never a
 * license — chartering the same mode stays available to everyone.
 */

import {
  getVessel,
  VESSEL_CARGO_GROWTH,
  VESSEL_COST_GROWTH,
  VESSEL_MAX_LEVEL,
  type VesselConfig,
  type VesselId,
} from './config/vessels';
import type { TransportId } from './config/transport';
import type { GameState, Vessel } from './state';

export type { VesselId, VesselConfig } from './config/vessels';

/** The injected vessel tuning shape (a subset of `VesselsTuning`). */
interface VesselTuning {
  readonly VESSELS?: readonly VesselConfig[];
  readonly VESSEL_COST_GROWTH?: number;
  readonly VESSEL_CARGO_GROWTH?: number;
}

/**
 * A vessel's current cargo cap: `baseCargoCap × 1.15^(level-1)` (design/13 E),
 * rounded to whole units. Level 1 is exactly the config `baseCargoCap`; each
 * upgrade raises the hold on the same family curve fronts/production use.
 */
export function vesselCargoCap(
  vessel: Vessel,
  tuning?: VesselTuning,
): number {
  const cfg = getVessel(vessel.type as VesselId, tuning?.VESSELS);
  const growth = tuning?.VESSEL_CARGO_GROWTH ?? VESSEL_CARGO_GROWTH;
  return Math.round(cfg.baseCargoCap * Math.pow(growth, vessel.level - 1));
}

/**
 * Cost to raise a vessel from `level` → `level + 1`: `buy_in × 1.15^level`
 * (mirrors `productionUpgradeCost`). `tuning` injects an alternate roster/growth
 * (`state.config.vessels`).
 */
export function vesselUpgradeCost(
  id: VesselId,
  level: number,
  tuning?: VesselTuning,
): number {
  const buyIn = getVessel(id, tuning?.VESSELS).buyIn;
  const growth = tuning?.VESSEL_COST_GROWTH ?? VESSEL_COST_GROWTH;
  return Math.round(buyIn * Math.pow(growth, level));
}

/**
 * The total clean cash invested in a vessel to reach its current level: the
 * Level-1 buy-in plus every upgrade paid since. This is what the vessel counts for
 * in `netWorth` (state.ts) — capital moved into an asset, not spent away.
 */
export function vesselValue(vessel: Vessel, tuning?: VesselTuning): number {
  const type = vessel.type as VesselId;
  const buyIn = getVessel(type, tuning?.VESSELS).buyIn;
  let total = buyIn;
  for (let level = 1; level < vessel.level; level++) {
    total += vesselUpgradeCost(type, level, tuning);
  }
  return total;
}

/** The fleet's total invested value — the sum counted in `netWorth`. */
export function vesselsValue(state: GameState): number {
  return state.vessels.reduce((sum, v) => sum + vesselValue(v, state.config.vessels), 0);
}

/**
 * The owned vessel that operates charter `mode`, or `null` if none is owned. A run
 * on that mode uses it automatically (cut-free, discounted, raised cap — travel.ts).
 * At most one vessel per mode exists (single-buy per id, one id per mode).
 */
export function ownedVesselForMode(state: GameState, mode: TransportId): Vessel | null {
  for (const v of state.vessels) {
    if (getVessel(v.type as VesselId, state.config.vessels.VESSELS).mode === mode) return v;
  }
  return null;
}

// --- Buy & upgrade ------------------------------------------------------------

export type VesselRejectReason =
  | 'already-owned'
  | 'insufficient-funds'
  | 'no-vessel'
  | 'max-level';

export interface VesselResult {
  readonly state: GameState;
  readonly vessel: Vessel | null;
  readonly rejected?: VesselRejectReason;
}

/**
 * Buy the Level-1 vessel of `id`, paid from CLEAN cash (the billionaire sink).
 * SINGLE-BUY (like the fixed front/production rosters — Ideas2 item 1): a second
 * buy of an owned vessel rejects `already-owned` **without mutating**. The id is
 * the stable `vessel-${id}` (one per vessel), so there is never a duplicate to
 * disambiguate. Also rejects without mutating on insufficient funds. Money is the
 * only gate (open access).
 */
export function buyVessel(state: GameState, id: VesselId): VesselResult {
  const existing = state.vessels.find((v) => v.type === id) ?? null;
  if (existing) return { state, vessel: existing, rejected: 'already-owned' };

  const cfg = getVessel(id, state.config.vessels.VESSELS);
  if (state.cleanCash < cfg.buyIn) {
    return { state, vessel: null, rejected: 'insufficient-funds' };
  }
  const vessel: Vessel = { id: `vessel-${id}`, type: id, level: 1 };
  return {
    state: {
      ...state,
      cleanCash: state.cleanCash - cfg.buyIn,
      vessels: [...state.vessels, vessel],
    },
    vessel,
  };
}

/**
 * Upgrade the vessel `vesselId` by one level, paid from CLEAN cash at
 * `buy_in × 1.15^level` (design/13 E). Raises its cargo cap on the family curve.
 * Rejects without mutating on an unknown vessel, a maxed level, or insufficient
 * funds.
 */
export function upgradeVessel(state: GameState, vesselId: string): VesselResult {
  const vessel = state.vessels.find((v) => v.id === vesselId) ?? null;
  if (!vessel) return { state, vessel: null, rejected: 'no-vessel' };
  if (vessel.level >= VESSEL_MAX_LEVEL) {
    return { state, vessel, rejected: 'max-level' };
  }
  const cost = vesselUpgradeCost(vessel.type as VesselId, vessel.level, state.config.vessels);
  if (state.cleanCash < cost) return { state, vessel, rejected: 'insufficient-funds' };

  const upgraded: Vessel = { ...vessel, level: vessel.level + 1 };
  return {
    state: {
      ...state,
      cleanCash: state.cleanCash - cost,
      vessels: state.vessels.map((v) => (v.id === vesselId ? upgraded : v)),
    },
    vessel: upgraded,
  };
}
