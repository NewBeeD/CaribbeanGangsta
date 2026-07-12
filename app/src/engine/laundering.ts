/**
 * The empire's idle engine (design/01 §3 & §3a; GDD §6, §4.2). Laundering fronts
 * turn time into **clean cash**, and the return from an absence is rewarded with
 * *decisions to allocate*, never with loss. This is the ethical core of the game:
 *
 *   **Absence forgoes gains but never risks progress.**
 *
 * Offline settlement (`settleOffline`) accrues clean cash on a piecewise curve
 * (full rate to a soft cap, then a reduced rate — never zero) and queues 1–3
 * return hooks; it *only adds* clean cash and *only queues* choices. Any code path
 * here that could reduce an asset, advance debt/heat, or end the run is a bug
 * (GDD §6, §8) — the closing invariants assert exactly that.
 *
 * Purity/determinism (prompts/README.md): no `Math.random`, no wall clock. The
 * crypto rate's "live swing" is a deterministic function of in-game time; the
 * return-hook and golden-hour rolls draw from the run's serialized `state.rngState`
 * and write the advanced snapshot back, so a save/load round-trip reproduces every
 * roll. Active accrual is registered as the `laundering-accrual` tick step in
 * `clock.ts`; `settleOffline` is the concrete implementation of Prompt 03's hook.
 */

import type { Rng } from './rng';
import { restoreRng } from './rng';
import { addHeat } from './heat';
import { frontLieutenantBonus } from './crew';
import {
  OFFLINE_REDUCED_RATE,
  OFFLINE_SOFT_CAP_HOURS,
  frontUpgradeCost,
  getFrontType,
  type FrontType,
} from './config/fronts';
import type { Front, GameState, PendingChoice } from './state';

export type { FrontType } from './config/fronts';

// --- Clean-cash rate ---------------------------------------------------------

/**
 * Crypto's live swing multiplier around 1 (design/01 §3a: ±40%). A deterministic
 * oscillation in in-game time — pure and reproducible, never a hidden roll — so
 * the rate the UI shows is exactly the rate the engine accrues at this instant.
 * While offline the clock is frozen, so the swing holds at its last online value.
 */
export function cryptoSwingFactor(state: GameState): number {
  const cfg = state.config.fronts;
  const phase = (state.clock.hours / cfg.CRYPTO_SWING_PERIOD_HOURS) * 2 * Math.PI;
  return 1 + cfg.CRYPTO_SWING * Math.sin(phase);
}

/**
 * The clean $/hr a single front generates right now (`ratePerLevel × level`),
 * with the crypto front's live swing and any promoted-lieutenant delegation bonus
 * (design/02 §5 — a lieutenant running the front autonomously). With no crew the
 * bonus is 0, so a crew-less run's rates are unchanged.
 */
function frontRate(state: GameState, front: Front): number {
  const cfg = getFrontType(front.type as FrontType, state.config.fronts.FRONT_TYPES);
  const base = cfg.ratePerLevel * front.level;
  const swung = cfg.swing > 0 ? base * cryptoSwingFactor(state) : base;
  return swung * (1 + frontLieutenantBonus(state, front.id));
}

/**
 * Total clean cash per real hour across every front: `Σ(ratePerLevel_i × level_i)`
 * (design/01 §3), with the crypto front applying its live swing. This is the
 * number the Money screen shows and the rate accrual uses.
 */
export function cleanCashRate(state: GameState): number {
  return state.fronts.reduce((sum, f) => sum + frontRate(state, f), 0);
}

/** Rate after the lying-low income slowdown (design/07 §5): lower heat, lower income. */
function effectiveRate(state: GameState): number {
  const mult = state.lyingLow ? state.config.heat.LIE_LOW_INCOME_MULTIPLIER : 1;
  return cleanCashRate(state) * mult;
}

/** Passive heat/hr summed across all operating fronts (active-only footprint). */
function frontHeatPerHour(state: GameState): number {
  return state.fronts.reduce(
    (sum, f) =>
      sum + getFrontType(f.type as FrontType, state.config.fronts.FRONT_TYPES).heatPerHour,
    0,
  );
}

// --- Peak banking ------------------------------------------------------------

/** Bank the clean-cash / net-worth peaks after clean cash grows (design/01 §7). */
function bankCleanPeaks(state: GameState): GameState {
  const dirty = state.stashes.reduce((sum, s) => sum + s.dirtyCash, 0);
  const { highScore } = state;
  const peakCleanCash = Math.max(highScore.peakCleanCash, state.cleanCash);
  const peakNetWorth = Math.max(highScore.peakNetWorth, dirty + state.cleanCash);
  if (peakCleanCash === highScore.peakCleanCash && peakNetWorth === highScore.peakNetWorth) {
    return state;
  }
  return { ...state, highScore: { ...highScore, peakCleanCash, peakNetWorth } };
}

// --- Active accrual (the `laundering-accrual` tick step) ----------------------

/**
 * Accrue clean cash over `dtHours` of ONLINE time and apply each front's passive
 * heat footprint (design/01 §3, §3a). Registered active-only in `clock.ts` — the
 * offline path uses `settleOffline`, which never adds heat. Adds only; a run with
 * no fronts is a no-op.
 */
export function accrue(state: GameState, dtHours: number): GameState {
  if (dtHours <= 0 || state.fronts.length === 0) return state;

  const earned = effectiveRate(state) * dtHours;
  let next = state;
  if (earned > 0) {
    next = bankCleanPeaks({ ...state, cleanCash: state.cleanCash + earned });
  }
  const heat = frontHeatPerHour(state) * dtHours;
  return heat > 0 ? addHeat(next, heat, 'front.passive') : next;
}

// --- Offline settlement (the return payoff) ----------------------------------

/** A one-time bonus opportunity waiting on return — bonus-only, never a penalty. */
export interface GoldenHourEvent {
  readonly id: string;
  readonly kind: string;
  readonly summary: string;
  /** One-time clean-cash bonus if the player acts before it expires. */
  readonly bonusCash: number;
  /** Minutes the opportunity stays open (design/01 §3a: 5–15). */
  readonly expiresInMinutes: number;
}

/**
 * What awaited the player while they were away (design/01 §3): the clean cash that
 * accrued, PLUS a queue of return hooks and an optional golden-hour bonus. The
 * return is *interesting choices*, not just a number.
 */
export interface OfflineReport {
  readonly hoursAway: number;
  /** The soft cap used for the full-rate portion (`OFFLINE_SOFT_CAP_HOURS`). */
  readonly cappedAt: number;
  readonly cleanEarned: number;
  readonly pendingChoices: readonly PendingChoice[];
  readonly goldenHour?: GoldenHourEvent;
}

/**
 * Offline clean-cash earnings on the piecewise curve (design/01 §3): full rate up
 * to the soft cap, then `OFFLINE_REDUCED_RATE` beyond — never zero, so a long
 * absence idles instead of being punished.
 */
export function offlineEarnings(
  rate: number,
  hoursAway: number,
  tuning?: {
    readonly OFFLINE_SOFT_CAP_HOURS?: number;
    readonly OFFLINE_REDUCED_RATE?: number;
  },
): number {
  if (rate <= 0 || hoursAway <= 0) return 0;
  const softCap = tuning?.OFFLINE_SOFT_CAP_HOURS ?? OFFLINE_SOFT_CAP_HOURS;
  const reduced = tuning?.OFFLINE_REDUCED_RATE ?? OFFLINE_REDUCED_RATE;
  const full = Math.min(hoursAway, softCap);
  const overflow = Math.max(0, hoursAway - softCap);
  return rate * full + rate * reduced * overflow;
}

/** Return-hook templates surfaced on return — "decisions to allocate" (design/01 §3). */
const RETURN_HOOKS: readonly { readonly kind: string; readonly summary: string }[] = [
  { kind: 'buyer', summary: 'A buyer has been waiting on a shipment.' },
  { kind: 'crew', summary: 'One of your crew has a situation that needs a call.' },
  { kind: 'rival', summary: 'A rival made a move while you were dark.' },
];

/**
 * How many return hooks to queue: at least one, more the longer you were away —
 * honoring "the longer you're away, the more options await" (design/07 §4) —
 * capped at the number of distinct hook templates (≤3). Deterministic in hours.
 */
function returnHookCount(hoursAway: number, softCapHours: number): number {
  const byTime = 1 + Math.floor(hoursAway / (softCapHours / 2));
  return Math.min(RETURN_HOOKS.length, Math.max(1, byTime));
}

/**
 * Roll a golden-hour opportunity over `dtHours` of online-equivalent exposure
 * (design/01 §3a): a Poisson-style spawn (~1 per `GOLDEN_HOUR_MEAN_HOURS`), a
 * 5–15 min lifetime, and a **bonus-only** payoff. Returns `null` when none
 * spawns. Consumes `rng`; the caller writes the advanced snapshot back. Never a
 * penalty branch — missing it costs a bonus you never had.
 */
export function rollGoldenHour(
  state: GameState,
  rng: Rng,
  dtHours = 1,
): GoldenHourEvent | null {
  if (dtHours <= 0) return null;
  const cfg = state.config.fronts;
  const perHour = 1 / cfg.GOLDEN_HOUR_MEAN_HOURS;
  const chance = 1 - Math.pow(1 - perHour, Math.min(dtHours, cfg.OFFLINE_SOFT_CAP_HOURS));
  if (rng.next() >= chance) return null;

  const bonusBase = cleanCashRate(state) * cfg.GOLDEN_HOUR_BONUS_HOURS;
  const bonusCash = Math.round(Math.max(cfg.GOLDEN_HOUR_MIN_BONUS, bonusBase));
  // Flavor split only (buyer vs. bent cop) — both pay the same disclosed bonus,
  // so this is texture, not a balance knob.
  const buyer = rng.chance(0.5);
  const expiresInMinutes = rng.int(cfg.GOLDEN_HOUR_MIN_MINUTES, cfg.GOLDEN_HOUR_MAX_MINUTES);
  return {
    id: `golden-${state.clock.hours}-${Math.round(rng.next() * 1e6)}`,
    kind: buyer ? 'buyer' : 'bent-cop',
    summary: buyer
      ? 'A high-paying buyer is in town — but only for the next few minutes.'
      : 'A bent cop is offering a one-time favor, if you move now.',
    bonusCash,
    expiresInMinutes,
  };
}

function emptyReport(hoursAway: number, softCapHours: number): OfflineReport {
  return {
    hoursAway,
    cappedAt: softCapHours,
    cleanEarned: 0,
    pendingChoices: [],
  };
}

/**
 * Settle `realHoursAway` of offline absence — the return payoff (design/01 §3;
 * Prompt 03's `settleOffline` hook, made concrete). Accrues clean cash on the
 * piecewise curve, queues 1–3 return hooks, and may surface a bonus-only
 * golden-hour opportunity. The in-game clock does NOT advance (the world is
 * frozen while away) and nothing here may seize, kill, imprison, or advance
 * debt/heat/the spiral. **Adds only; never seizes.** (GDD §6, §8)
 */
export function settleOffline(
  state: GameState,
  realHoursAway: number,
): { readonly state: GameState; readonly report: OfflineReport } {
  if (realHoursAway < 0) {
    throw new Error(`settleOffline(): realHoursAway must be >= 0 (got ${realHoursAway})`);
  }
  const cfg = state.config.fronts;
  if (realHoursAway === 0) {
    return { state, report: emptyReport(0, cfg.OFFLINE_SOFT_CAP_HOURS) };
  }

  const cleanEarned = offlineEarnings(effectiveRate(state), realHoursAway, cfg);

  const rng = restoreRng(state.rngState);
  const count = returnHookCount(realHoursAway, cfg.OFFLINE_SOFT_CAP_HOURS);
  const pendingChoices: PendingChoice[] = [];
  for (let i = 0; i < count; i++) {
    const hook = RETURN_HOOKS[i]!;
    pendingChoices.push({
      id: `return-${hook.kind}-${state.clock.hours}-${i}`,
      kind: hook.kind,
      summary: hook.summary,
      createdAtHours: state.clock.hours,
    });
  }
  const goldenHour = rollGoldenHour(state, rng, realHoursAway);

  const next: GameState = bankCleanPeaks({
    ...state,
    cleanCash: state.cleanCash + cleanEarned,
    pendingChoices: [...state.pendingChoices, ...pendingChoices],
    rngState: rng.getState(),
  });

  assertOfflineGuardrails(state, next);

  const report: OfflineReport = {
    hoursAway: realHoursAway,
    cappedAt: cfg.OFFLINE_SOFT_CAP_HOURS,
    cleanEarned,
    pendingChoices,
    ...(goldenHour ? { goldenHour } : {}),
  };
  return { state: next, report };
}

/**
 * The single hardest line in the game (GDD §6, §8): offline may only add clean
 * cash and queue choices. These defensive checks turn any future regression that
 * seizes, ends the run, or advances debt/heat/the clock while away into a loud
 * error instead of a silent punishment for absence.
 */
function assertOfflineGuardrails(before: GameState, after: GameState): void {
  if (after.cleanCash < before.cleanCash) {
    throw new Error('settleOffline(): clean cash decreased while offline (guardrail)');
  }
  if (totalDirty(after) < totalDirty(before)) {
    throw new Error('settleOffline(): dirty cash decreased while offline (guardrail)');
  }
  if (after.heat > before.heat) {
    throw new Error('settleOffline(): heat rose while offline (guardrail)');
  }
  if (owed(after) > owed(before)) {
    throw new Error('settleOffline(): debt owed increased while offline (guardrail)');
  }
  if (after.debt.ladderRung > before.debt.ladderRung) {
    throw new Error('settleOffline(): debt ladder advanced while offline (guardrail)');
  }
  if (after.runStatus === 'dead' || after.runStatus === 'prison') {
    throw new Error('settleOffline(): run ended while offline (guardrail)');
  }
  if (after.clock.hours !== before.clock.hours) {
    throw new Error('settleOffline(): in-game clock advanced while offline (guardrail)');
  }
}

function totalDirty(state: GameState): number {
  return state.stashes.reduce((sum, s) => sum + s.dirtyCash, 0);
}

/** Total loan-shark debt owed (principal + accrued interest) — the offline-freeze check. */
function owed(state: GameState): number {
  return state.debt.principal + state.debt.accruedInterest;
}

// --- Front operations --------------------------------------------------------

export type LaunderRejectReason =
  | 'insufficient-funds'
  | 'invalid-amount'
  | 'no-front'
  | 'no-stash'
  | 'max-level';

/** Result of buying/upgrading a front: the new state + the front, or a rejection. */
export interface FrontResult {
  readonly state: GameState;
  readonly front: Front | null;
  readonly rejected?: LaunderRejectReason;
}

/**
 * Buy a new Level-1 front of `type`, paid from CLEAN cash (fronts are a clean-cash
 * sink — design/01 §1). Rejects without mutating on insufficient funds.
 */
export function buyFront(state: GameState, type: FrontType): FrontResult {
  const cfg = getFrontType(type, state.config.fronts.FRONT_TYPES);
  if (state.cleanCash < cfg.buyIn) {
    return { state, front: null, rejected: 'insufficient-funds' };
  }
  const nOwned = state.fronts.filter((f) => f.type === type).length;
  const front: Front = { id: `front-${type}-${nOwned + 1}`, type, level: 1 };
  return {
    state: { ...state, cleanCash: state.cleanCash - cfg.buyIn, fronts: [...state.fronts, front] },
    front,
  };
}

/**
 * Upgrade the front `frontId` by one level, paid from CLEAN cash at
 * `buy_in × 1.15^level` (design/01 §3). Rejects without mutating on an unknown
 * front, a maxed level, or insufficient funds.
 */
export function upgradeFront(state: GameState, frontId: string): FrontResult {
  const front = state.fronts.find((f) => f.id === frontId) ?? null;
  if (!front) return { state, front: null, rejected: 'no-front' };
  if (front.level >= state.config.fronts.FRONT_MAX_LEVEL) {
    return { state, front, rejected: 'max-level' };
  }

  const cost = frontUpgradeCost(front.type as FrontType, front.level, state.config.fronts);
  if (state.cleanCash < cost) return { state, front, rejected: 'insufficient-funds' };

  const upgraded: Front = { ...front, level: front.level + 1 };
  return {
    state: {
      ...state,
      cleanCash: state.cleanCash - cost,
      fronts: state.fronts.map((f) => (f.id === frontId ? upgraded : f)),
    },
    front: upgraded,
  };
}

// The Black Market Peso Exchange (a bulk dirty→clean converter) was REMOVED in
// design/12 Item 12 — a lump-sum haircut made fronts pointless. Fronts
// (`buyFront`/`upgradeFront`/`accrue`) are now the ONLY dirty→clean route. Any
// historical peso field on an old save is simply ignored (hydrate keeps it
// harmlessly).
