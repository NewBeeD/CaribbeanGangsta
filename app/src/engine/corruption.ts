/**
 * The corruption network — *buy-your-way-to-safety* (design/09 System B; GDD
 * §4.9). Two tiers, both a **sink for clean cash**:
 *
 *  1. **Port bribes** (per shipment): a NEGOTIATION, not a fixed toll. The asking
 *     price and the resulting seizure % are both shown before you commit, and the
 *     number shown is the number charged/rolled (the fairness law, design/09 B.1).
 *     A paid port drops container-stash seizure to ~3% (feeds Prompt 06 via
 *     `storage.isPortPaid`, which reads `state.corruption.paidPorts`).
 *  2. **Standing payroll** (recurring): put police/politicians/judges on a weekly
 *     retainer for deterministic benefits. The only uncertainty is a **telegraphed
 *     flip** — an official can be turned by underpayment, heat crossing their
 *     comfort threshold, a rival bid, or LE. The flip reuses the crew engine's
 *     betrayal arc (design/02 §4): it steps `warning → point-of-no-return →
 *     flipped` ONE readable stage at a time, and raising pay / cooling heat walks
 *     it back — never a silent random flip (design/09 B.2). A flipped official
 *     becomes a wire feeding heat (like a flipped crew member).
 *
 * Ethics (design/09 B.3): payroll is optional, deterministic power — not a loot
 * box, not pay-to-win. Missing a payment is an IN-FICTION consequence the player
 * controls; the menace is on the character, never guilt aimed at the human.
 *
 * Purity/determinism (prompts/README.md): pure functions, immutable state in →
 * new state out, no `Math.random`, no wall clock. Port price drift is a
 * deterministic function of in-game time; the ONLY randomness is `haggle`'s
 * readable gamble, which draws from the run's serialized `state.rngState` and
 * writes the advanced snapshot back. Retainer charging + flip arcs are the
 * active-only `corruption` tick step (`corruptionStep`) — offline never charges a
 * retainer or advances a flip (GDD §6; the offline-safe acceptance criterion).
 */

import { restoreRng } from './rng';
import { addHeat } from './heat';
import { HEAT_MAX } from './config/heat';
import {
  OFFICIAL_LOYALTY_MAX,
  OFFICIAL_LOYALTY_MIN,
  PORT_GREED_MAX,
  PORT_GREED_MIN,
  findOfficial,
  getOfficial,
  type OfficialId,
} from './config/corruption';
import type {
  BetrayalArc,
  BetrayalStage,
  Corruption,
  GameState,
  MemoryEntry,
  OfficialTie,
  PaidPort,
  PendingChoice,
  RaiseAsk,
} from './state';

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

/** A deterministic string hash → float in [0, 1) — for stable, RNG-free per-port greed. */
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

// --- Shared price drivers (design/09 B.1/B.2) --------------------------------

/**
 * A port official's greed (0.7–1.3), derived DETERMINISTICALLY from the port id
 * (design/09 B.1). Stable and RNG-free, so a quote is reproducible and the same
 * port always reads the same way — greed is a fact about the official, not a roll.
 */
export function portGreed(
  portId: string,
  greedMin: number = PORT_GREED_MIN,
  greedMax: number = PORT_GREED_MAX,
): number {
  return greedMin + hash01(`greed:${portId}`) * (greedMax - greedMin);
}

/**
 * Rival bidding pressure, 0..`RIVAL_PRESSURE_CAP` (design/09 B.1). The hotter your
 * rivalries, the more a bidding war inflates the ask. Zero at run start (no
 * tension yet), so an early quote is clean.
 */
export function rivalPressure(state: GameState): number {
  const cfg = state.config.corruption;
  const maxTension = state.rivals.reduce((m, r) => Math.max(m, r.tension), 0);
  return clamp(maxTension / cfg.RIVAL_TENSION_SCALE, 0, cfg.RIVAL_PRESSURE_CAP);
}

/**
 * The reputation discount multiplier (<= 1) applied to asks (design/09 B.1):
 * high Business/Political reputation buys cheaper protection. `1` at run start.
 */
export function repDiscount(state: GameState): number {
  const cfg = state.config.corruption;
  const rep = state.reputation.business + state.reputation.political;
  return 1 - clamp(rep / cfg.REP_DISCOUNT_SCALE, 0, cfg.MAX_REP_DISCOUNT);
}

/**
 * The port's per-cycle price drift multiplier around 1 (design/09 B.1). A pure,
 * reproducible oscillation in in-game time — never a hidden roll — so the ask the
 * UI shows is exactly what `payBribe` charges this instant. Phase is offset per
 * port so different ports peak at different times.
 */
export function portDriftFactor(state: GameState, portId: string): number {
  const cfg = state.config.corruption;
  const phaseOffset = hash01(`drift:${portId}`) * 2 * Math.PI;
  const phase =
    (state.clock.hours / cfg.PORT_DRIFT_PERIOD_HOURS) * 2 * Math.PI + phaseOffset;
  return 1 + cfg.PORT_PRICE_DRIFT * Math.sin(phase);
}

// --- Port bribes (design/09 B.1) ---------------------------------------------

/**
 * A port-bribe quote (design/09 B.1). `ask` and `resultingSeizurePct` are BOTH
 * shown before commit and are exactly what `payBribe` charges / the port then
 * rolls at (the fairness law). `baseSeizurePct` is the unpaid risk, for contrast.
 */
export interface BribeQuote {
  readonly portId: string;
  /** The asking price, $ — the documented formula, rounded. */
  readonly ask: number;
  /** Seizure % for shipments through this port once paid (~3%). */
  readonly resultingSeizurePct: number;
  /** Seizure % if you DON'T pay (design/09 B.1 base ~30%). */
  readonly baseSeizurePct: number;
}

/**
 * Quote a port bribe for a shipment worth `shipmentValue` (design/09 B.1):
 *
 * ```
 * ask = base_bribe × shipmentValue × (1+heat) × (1+rivalPressure) × greed × repDiscount × drift
 * ```
 *
 * `base_bribe` starts at 8% of shipment value (clamped to the 5–20% band). Pure
 * and RNG-free, so the shown number is the charged number (fairness law). The
 * resulting seizure % is the paid floor (~3%); the base is ~30% if you walk.
 */
export function quoteBribe(
  state: GameState,
  portId: string,
  shipmentValue: number,
): BribeQuote {
  const cfg = state.config.corruption;
  const value = Math.max(0, shipmentValue);
  const heat = clamp(state.heat / HEAT_MAX, 0, 1);
  const fraction = clamp(
    cfg.PORT_BRIBE_BASE_FRACTION,
    cfg.PORT_BRIBE_MIN_FRACTION,
    cfg.PORT_BRIBE_MAX_FRACTION,
  );
  const ask =
    fraction *
    value *
    (1 + heat) *
    (1 + rivalPressure(state)) *
    portGreed(portId, cfg.PORT_GREED_MIN, cfg.PORT_GREED_MAX) *
    repDiscount(state) *
    portDriftFactor(state, portId);

  return {
    portId,
    ask: Math.round(ask),
    resultingSeizurePct: cfg.PORT_PAID_SEIZURE,
    baseSeizurePct: state.corruption.paidPorts.some((p) => p.portId === portId)
      ? cfg.PORT_PAID_SEIZURE
      : cfg.PORT_BASE_SEIZURE,
  };
}

/**
 * The result of a haggle (design/09 B.1 — a readable gamble). `refuseChance` is
 * the SHOWN probability and is exactly what was rolled (`rolledValue < refuseChance
 * ⇒ refused`, the fairness law). On success the ask drops by `HAGGLE_DISCOUNT`; on
 * refusal the official won't deal THIS run (`ask` is the original, `refused` true).
 * `state` carries the advanced RNG snapshot either way.
 */
export interface HaggleResult {
  readonly state: GameState;
  readonly refuseChance: number;
  readonly rolledValue: number;
  readonly refused: boolean;
  /** The ask to pay if not refused (discounted); the original ask if refused. */
  readonly ask: number;
  readonly resultingSeizurePct: number;
}

/**
 * Haggle a port bribe down (design/09 B.1): push for a lower price at the risk the
 * official refuses this run. The odds are shown (`refuseChance`) and rolled from
 * the run's RNG — shown == rolled (fairness law). Consumes `state.rngState`.
 */
export function haggle(
  state: GameState,
  portId: string,
  shipmentValue: number,
): HaggleResult {
  const cfg = state.config.corruption;
  const quote = quoteBribe(state, portId, shipmentValue);
  const rng = restoreRng(state.rngState);
  const rolledValue = rng.next();
  const refused = rolledValue < cfg.HAGGLE_REFUSE_CHANCE;
  const advanced: GameState = { ...state, rngState: rng.getState() };
  return {
    state: advanced,
    refuseChance: cfg.HAGGLE_REFUSE_CHANCE,
    rolledValue,
    refused,
    ask: refused ? quote.ask : Math.round(quote.ask * (1 - cfg.HAGGLE_DISCOUNT)),
    resultingSeizurePct: quote.resultingSeizurePct,
  };
}

export type CorruptionRejectReason =
  | 'insufficient-funds'
  | 'invalid-amount'
  | 'no-official'
  | 'already-hired'
  | 'no-raise-pending';

/** The outcome of paying a port bribe (design/09 B.1). */
export interface PayBribeResult {
  readonly state: GameState;
  readonly ok: boolean;
  /** What was actually charged (== the shown ask). */
  readonly paid: number;
  readonly resultingSeizurePct: number;
  readonly rejected?: CorruptionRejectReason;
}

/**
 * Pay a port bribe from CLEAN cash (design/09 B.1 — the clean-cash sink). Charges
 * exactly the shown `ask` (pass `agreedAsk` from a successful `haggle`, else the
 * fresh quote), and marks the port paid so container stashes there drop to the
 * seizure floor for `PORT_PAID_DURATION_HOURS` (a one-off bribe drifts/expires —
 * design/09 B.1). Rejects without mutating on insufficient funds.
 */
export function payBribe(
  state: GameState,
  portId: string,
  shipmentValue: number,
  opts: { readonly agreedAsk?: number } = {},
): PayBribeResult {
  const quote = quoteBribe(state, portId, shipmentValue);
  const ask = opts.agreedAsk ?? quote.ask;
  if (state.cleanCash < ask) {
    return {
      state,
      ok: false,
      paid: 0,
      resultingSeizurePct: quote.resultingSeizurePct,
      rejected: 'insufficient-funds',
    };
  }

  const paidPort: PaidPort = {
    portId,
    seizurePct: state.config.corruption.PORT_PAID_SEIZURE,
    paidAtHours: state.clock.hours,
    paidUntilHours: state.clock.hours + state.config.corruption.PORT_PAID_DURATION_HOURS,
  };
  const next: GameState = {
    ...state,
    cleanCash: state.cleanCash - ask,
    corruption: { ...state.corruption, paidPorts: upsertPaidPort(state.corruption.paidPorts, paidPort) },
  };
  return { state: next, ok: true, paid: ask, resultingSeizurePct: quote.resultingSeizurePct };
}

/**
 * Walk away from the negotiation (design/09 B.1): ship at full risk or reroute.
 * A no-op on state — the shipment simply carries the unpaid seizure risk. Exists
 * so the UI has an explicit "don't pay" action symmetrical with `payBribe`.
 */
export function walk(state: GameState): GameState {
  return state;
}

/** Add or replace a paid-port entry for a port (latest payment wins). */
function upsertPaidPort(
  ports: readonly PaidPort[],
  port: PaidPort,
): readonly PaidPort[] {
  const rest = ports.filter((p) => p.portId !== port.portId);
  return [...rest, port];
}

// --- Standing payroll: hire / dismiss (design/09 B.2) ------------------------

function findTie(state: GameState, id: string): OfficialTie | null {
  return state.corruption.officials.find((o) => o.id === id) ?? null;
}

/** Recompute the derived weekly payroll total and return the updated corruption. */
function withOfficials(
  corruption: Corruption,
  officials: readonly OfficialTie[],
): Corruption {
  return {
    ...corruption,
    officials,
    payrollPerWeek: officials.reduce((sum, o) => sum + o.retainerPerWeek, 0),
  };
}

function withTie(state: GameState, next: OfficialTie): GameState {
  const officials = state.corruption.officials.map((o) => (o.id === next.id ? next : o));
  return { ...state, corruption: withOfficials(state.corruption, officials) };
}

/**
 * Rehydrate a legacy `{ id, loyalty }` official stub (schema < 6) into a full
 * `OfficialTie`. Only hit by the 5→6 save migration; pre-Prompt-09 runs never
 * bought officials, so this is usually unused. Unknown ids fall back to neutral
 * beat-cop-ish defaults so a migrated save never throws.
 */
export function hydrateLegacyOfficial(legacy: {
  readonly id: string;
  readonly loyalty: number;
}): OfficialTie {
  const cfg = findOfficial(legacy.id);
  return {
    id: legacy.id,
    officialId: cfg?.id ?? legacy.id,
    name: cfg?.name ?? legacy.id,
    retainerPerWeek: cfg?.retainerPerWeek ?? 1_500,
    loyalty: legacy.loyalty,
    greed: cfg?.greed ?? 1,
    comfortHeat: cfg?.comfortHeat ?? 50,
    hiredAtHours: 0,
    lastPaidWeek: 1,
    memoryLog: [],
  };
}

export interface HireResult {
  readonly state: GameState;
  readonly official: OfficialTie | null;
  readonly rejected?: CorruptionRejectReason;
}

/**
 * Put an official on the payroll (design/09 B.2). Their first week's retainer is
 * charged up front from CLEAN cash (the sink). Applies the standing benefit's
 * one-time effects: a customs chief instantly makes their `portId` a STANDING paid
 * port (permanent while hired — the B.1 benefit made permanent); a politician
 * lifts your political reputation. Rejects without mutating on a duplicate hire or
 * insufficient funds. One tie per archetype (a second hire is `already-hired`).
 */
export function hire(
  state: GameState,
  officialId: OfficialId,
  opts: { readonly portId?: string } = {},
): HireResult {
  const cfg = getOfficial(officialId);
  if (state.corruption.officials.some((o) => o.officialId === officialId)) {
    return { state, official: null, rejected: 'already-hired' };
  }
  if (state.cleanCash < cfg.retainerPerWeek) {
    return { state, official: null, rejected: 'insufficient-funds' };
  }

  const tie: OfficialTie = {
    id: `official-${officialId}`,
    officialId,
    name: cfg.name,
    retainerPerWeek: cfg.retainerPerWeek,
    loyalty: cfg.startingLoyalty,
    greed: cfg.greed,
    comfortHeat: cfg.comfortHeat,
    hiredAtHours: state.clock.hours,
    lastPaidWeek: state.clock.week,
    memoryLog: [],
  };

  let next: GameState = {
    ...state,
    cleanCash: state.cleanCash - cfg.retainerPerWeek,
    corruption: withOfficials(state.corruption, [...state.corruption.officials, tie]),
  };

  // Standing-benefit one-time effects (design/09 B.2).
  if (cfg.benefit === 'port-seizure-floor' && opts.portId !== undefined) {
    const standing: PaidPort = {
      portId: opts.portId,
      seizurePct: state.config.corruption.PORT_PAID_SEIZURE,
      paidAtHours: state.clock.hours,
      // No `paidUntilHours` — standing while the customs chief is on payroll.
    };
    next = {
      ...next,
      corruption: {
        ...next.corruption,
        paidPorts: upsertPaidPort(next.corruption.paidPorts, standing),
      },
    };
  }
  if (cfg.benefit === 'territory-protection') {
    next = {
      ...next,
      reputation: {
        ...next.reputation,
        political: next.reputation.political + state.config.corruption.POLITICIAN_REP_BONUS,
      },
    };
  }

  return { state: next, official: tie };
}

/**
 * Remove an official from the payroll — the violent/clean-break path (design/09
 * B.2 "remove them"). Drops any STANDING paid port they were maintaining (a
 * customs chief's port reverts to base seizure). No-op for an unknown id.
 */
export function dismissOfficial(state: GameState, officialId: string): GameState {
  const tie = findTie(state, officialId);
  if (!tie) return state;
  const officials = state.corruption.officials.filter((o) => o.id !== officialId);

  // A dismissed customs chief's standing port lapses (keep expiring one-off bribes).
  const cfg = findOfficial(tie.officialId);
  const paidPorts =
    cfg?.benefit === 'port-seizure-floor'
      ? state.corruption.paidPorts.filter((p) => p.paidUntilHours !== undefined)
      : state.corruption.paidPorts;

  return {
    ...state,
    corruption: { ...withOfficials(state.corruption, officials), paidPorts },
  };
}

// --- Payroll loyalty & memory (design/09 B.2; reuses the crew memory spine) ---

/** Apply a loyalty delta to an official and write a memory entry for it (design/02 §3). */
function applyOfficialLoyalty(
  state: GameState,
  officialId: string,
  delta: number,
  kind: string,
  note: string,
): GameState {
  const tie = findTie(state, officialId);
  if (!tie) return state;
  const loyalty = clamp(tie.loyalty + delta, OFFICIAL_LOYALTY_MIN, OFFICIAL_LOYALTY_MAX);
  const memory: MemoryEntry = {
    atHours: state.clock.hours,
    kind,
    note,
    delta: round1(delta),
  };
  return withTie(state, { ...tie, loyalty, memoryLog: [...tie.memoryLog, memory] });
}

// --- Raise asks (design/09 B.2 v1.1) -----------------------------------------

/** Business level 0..1 from Business reputation — the growth term of the raise ask. */
function businessLevel(state: GameState): number {
  return clamp(state.reputation.business / state.config.corruption.BUSINESS_LEVEL_SCALE, 0, 1);
}

/**
 * The retainer an official would ask for right now (design/09 B.2 v1.1):
 *
 * ```
 * new_ask = current × (1 + Δbusiness) × (1 + heat) × greed × (1 + rivalPressure)
 * ```
 *
 * Pure and RNG-free. The bigger and hotter your empire, the more they know they're
 * worth. Returns a rounded dollar amount; the caller decides whether it clears the
 * `RAISE_MIN_MARGIN` bar to actually be asked.
 */
export function computeRaiseAsk(state: GameState, official: OfficialTie): number {
  const heat = clamp(state.heat / HEAT_MAX, 0, 1);
  const ask =
    official.retainerPerWeek *
    (1 + businessLevel(state)) *
    (1 + heat) *
    official.greed *
    (1 + rivalPressure(state));
  return Math.round(ask);
}

export interface RaiseResult {
  readonly state: GameState;
  readonly official: OfficialTie | null;
  readonly ask?: RaiseAsk;
  readonly rejected?: CorruptionRejectReason;
}

/**
 * Have an official ask for a raise IF the computed ask clears the margin bar
 * (design/09 B.2 v1.1). Sets `pendingRaise` on the tie; a content official in a
 * calm, small empire won't bother (no ask set). No new ask overwrites an existing
 * pending one. Pure; the boundary check is what `corruptionStep` calls weekly.
 */
export function requestRaise(state: GameState, officialId: string): RaiseResult {
  const tie = findTie(state, officialId);
  if (!tie) return { state, official: null, rejected: 'no-official' };
  if (tie.pendingRaise) return { state, official: tie };

  const newRetainer = computeRaiseAsk(state, tie);
  if (newRetainer < tie.retainerPerWeek * (1 + state.config.corruption.RAISE_MIN_MARGIN)) {
    return { state, official: tie }; // not worth asking — stays quiet
  }

  const ask: RaiseAsk = {
    newRetainer,
    askedAtHours: state.clock.hours,
    reason: `${tie.name} wants a bigger cut — the empire's grown and so has the risk.`,
  };
  const next = withTie(state, { ...tie, pendingRaise: ask });
  return { state: next, official: findTie(next, officialId), ask };
}

/**
 * Respond to an official's pending raise (design/09 B.2 v1.1). `accept` raises the
 * retainer to the asked amount (a small loyalty reassurance) and clears the ask.
 * Refusing clears the ask but counts as an UNDERPAYMENT — a loyalty hit + a
 * remembered grievance that feeds the flip arc. Rejects if no raise is pending.
 */
export function respondToRaise(
  state: GameState,
  officialId: string,
  accept: boolean,
): RaiseResult {
  const tie = findTie(state, officialId);
  if (!tie) return { state, official: null, rejected: 'no-official' };
  if (!tie.pendingRaise) return { state, official: tie, rejected: 'no-raise-pending' };

  if (accept) {
    const { pendingRaise: _drop, ...rest } = tie;
    let next = withTie(state, { ...rest, retainerPerWeek: tie.pendingRaise.newRetainer });
    next = applyOfficialLoyalty(
      next,
      officialId,
      state.config.corruption.RAISE_ACCEPT_LOYALTY,
      'raise-accepted',
      `You met ${tie.name}'s number without a fuss.`,
    );
    return { state: next, official: findTie(next, officialId) };
  }

  // Refusing == underpayment (design/09 B.2 v1.1): clear the ask, take the hit.
  const { pendingRaise: _drop, ...rest } = tie;
  let next = withTie(state, rest);
  next = applyOfficialLoyalty(
    next,
    officialId,
    state.config.corruption.RETAINER_UNDERPAY_LOYALTY,
    'underpaid',
    `You turned down ${tie.name}'s ask for more.`,
  );
  return { state: next, official: findTie(next, officialId) };
}

// --- Weekly retainers (design/09 B.2; the weekly-boundary tick step) ---------

export interface ChargeResult {
  readonly state: GameState;
  /** Total clean cash charged this settlement. */
  readonly charged: number;
  /** Whole in-game weeks this settlement covered. */
  readonly weeks: number;
  /** Ids of officials that were missed/underpaid (flip pressure written). */
  readonly underpaidOfficialIds: readonly string[];
}

/**
 * Settle weekly retainers on the weekly boundary (design/09 B.2). Charges each
 * official `retainerPerWeek × weeksElapsed` from CLEAN cash, paying what's
 * affordable and NEVER going negative. Full payment builds a little trust; a
 * missed week (can't afford) or an ignored pending raise is an UNDERPAYMENT — a
 * loyalty hit + a remembered grievance that feeds the telegraphed flip arc
 * (design/09 B.2). Advances `lastPayrollWeek` so the same week is never charged
 * twice. Called only by `corruptionStep`, an active-only tick step, so retainers
 * never charge while the player is offline (GDD §6; the offline-safe criterion).
 */
export function chargeRetainers(state: GameState): ChargeResult {
  const weeks = state.clock.week - state.corruption.lastPayrollWeek;
  if (weeks <= 0 || state.corruption.officials.length === 0) {
    const corruption: Corruption = { ...state.corruption, lastPayrollWeek: state.clock.week };
    return { state: { ...state, corruption }, charged: 0, weeks: 0, underpaidOfficialIds: [] };
  }

  let next = state;
  let cleanCash = state.cleanCash;
  let charged = 0;
  const underpaidOfficialIds: string[] = [];

  // Snapshot ids up front — loyalty edits below re-map the officials array.
  for (const { id, retainerPerWeek, name, pendingRaise } of state.corruption.officials) {
    const owed = retainerPerWeek * weeks;
    if (cleanCash >= owed) {
      cleanCash -= owed;
      charged += owed;
      if (pendingRaise) {
        // Paid the OLD rate while they're asking for more = an underpayment.
        underpaidOfficialIds.push(id);
        next = applyOfficialLoyalty(
          next,
          id,
          state.config.corruption.RETAINER_UNDERPAY_LOYALTY,
          'underpaid',
          `You kept paying ${name} the old rate and ignored their ask.`,
        );
      } else {
        next = applyOfficialLoyalty(
          next,
          id,
          state.config.corruption.RETAINER_PAID_LOYALTY * weeks,
          'paid',
          `You kept ${name} paid and happy.`,
        );
      }
    } else {
      // Can't cover it — pay what's left, take the grievance (never go negative).
      charged += cleanCash;
      cleanCash = 0;
      underpaidOfficialIds.push(id);
      next = applyOfficialLoyalty(
        next,
        id,
        state.config.corruption.RETAINER_MISSED_LOYALTY,
        'missed',
        `You came up short on ${name}'s retainer.`,
      );
    }
  }

  const corruption: Corruption = { ...next.corruption, lastPayrollWeek: state.clock.week };
  return {
    state: { ...next, cleanCash, corruption },
    charged,
    weeks,
    underpaidOfficialIds,
  };
}

// --- Flip arc (design/09 B.2; reuses the crew betrayal machinery) ------------

const STAGE_LADDER: readonly (BetrayalStage | 'none')[] = [
  'none',
  'warning',
  'point-of-no-return',
  'flipped',
];

function stageIndex(stage: BetrayalStage | 'none'): number {
  return STAGE_LADDER.indexOf(stage);
}

/** A grievance = at least one remembered wrong (a negative memory) — design/09 B.2. */
function officialHasGrievance(o: OfficialTie): boolean {
  return o.memoryLog.some((m) => m.delta < 0);
}

/**
 * The flip stage an official's loyalty + situation POINT toward right now (a pure
 * query, design/09 B.2). A flip only opens once there's a real trigger — a
 * grievance (underpayment) OR heat above their comfort threshold (they distance
 * themselves to survive). So it's always a consequence, never a bolt from the
 * blue. Uses the SAME loyalty thresholds as the crew betrayal arc (reuse).
 */
export function officialFlipTarget(
  state: GameState,
  official: OfficialTie,
): BetrayalStage | 'none' {
  if (official.isWire) return 'flipped';
  const crew = state.config.crew;
  const heatOverComfort = state.heat > official.comfortHeat;
  if (!officialHasGrievance(official) && !heatOverComfort) return 'none';
  const L = official.loyalty;
  if (L < crew.BETRAYAL_FLIP_LOYALTY) return 'flipped';
  if (L < crew.BETRAYAL_PONR_LOYALTY) return 'point-of-no-return';
  if (L < crew.BETRAYAL_WARNING_LOYALTY) return 'warning';
  // Nervous-but-loyal (heat over comfort, loyalty still high): a warning at most.
  return heatOverComfort ? 'warning' : 'none';
}

/** The readable sign shown at each flip stage (design/09 B.2 — signs are legible). */
function signFor(official: OfficialTie, stage: BetrayalStage): string {
  const n = official.name;
  switch (stage) {
    case 'warning':
      return `${n} has gone quiet and keeps asking for more — they're getting nervous.`;
    case 'point-of-no-return':
      return `${n} has been seen meeting people they shouldn't. You're losing them.`;
    case 'flipped':
      return `${n} has flipped — a wire now, feeding the other side everything.`;
  }
}

/**
 * Step one official's flip arc AT MOST ONE stage toward its target (design/09 B.2
 * — the telegraphed flip, reusing the crew arc's staging). Advancing UP telegraphs
 * the crossing as a readable `PendingChoice` (the intervention window: raise pay /
 * cool heat / feed false intel / remove); reaching `flipped` marks them a wire.
 * Any positive treatment (which raises loyalty, lowering the target) walks the arc
 * back down on the next evaluation. Fully deterministic — NEVER a silent random flip.
 */
export function advanceOfficialFlipArc(state: GameState, officialId: string): GameState {
  const tie = findTie(state, officialId);
  if (!tie) return state;

  const current = tie.activeArc?.stage ?? 'none';
  const target = officialFlipTarget(state, tie);
  const ci = stageIndex(current);
  const ti = stageIndex(target);
  if (ti === ci) return state;

  const dir = ti > ci ? 1 : -1;
  const nextStage = STAGE_LADDER[ci + dir]!;

  let updated: OfficialTie;
  if (nextStage === 'none') {
    const { activeArc: _dropArc, ...rest } = tie;
    updated = rest;
  } else {
    const arc: BetrayalArc = {
      stage: nextStage,
      startedAtHours: tie.activeArc?.startedAtHours ?? state.clock.hours,
      advancedAtHours: state.clock.hours,
      sign: signFor(tie, nextStage),
    };
    updated = { ...tie, activeArc: arc };
    if (nextStage === 'flipped') updated = { ...updated, isWire: true };
  }

  let next = withTie(state, updated);
  if (dir > 0 && nextStage !== 'none') {
    const scene: PendingChoice = {
      id: `official-arc-${tie.id}-${nextStage}-${state.clock.hours}`,
      kind: 'official-flip',
      summary: signFor(tie, nextStage),
      createdAtHours: state.clock.hours,
    };
    next = { ...next, pendingChoices: [...next.pendingChoices, scene] };
  }
  return next;
}

/** Advance every official's flip arc one telegraphed stage (the tick-step body). */
export function advanceOfficialFlipArcs(state: GameState): GameState {
  let next = state;
  for (const id of state.corruption.officials.map((o) => o.id)) {
    next = advanceOfficialFlipArc(next, id);
  }
  return next;
}

// --- Flipped officials → heat (design/09 B.2; reuses the crew wire model) -----

/** Passive heat/hr from every flipped official acting as an embedded wire. */
export function officialWireHeatPerHour(state: GameState): number {
  return (
    state.corruption.officials.filter((o) => o.isWire).length *
    state.config.crew.WIRE_HEAT_PER_HOUR
  );
}

/**
 * Apply flipped-official wire heat over `dtHours` of ONLINE time (design/09 B.2).
 * Adds heat only; run only via `corruptionStep` (active-only), so a turned
 * official never raises heat while the player is away (GDD §6). No wires ⇒ no-op.
 */
export function applyOfficialWireHeat(state: GameState, dtHours: number): GameState {
  if (dtHours <= 0) return state;
  const heat = officialWireHeatPerHour(state) * dtHours;
  return heat > 0 ? addHeat(state, heat, 'corruption.wire') : state;
}

// --- The corruption tick step (registered active-only in clock.ts) -----------

/**
 * The `corruption` tick step (design/09 B.2). In order: settle any due weekly
 * retainers, let officials whose worth has grown ask for a raise, advance every
 * flip arc one telegraphed stage, then apply flipped-wire heat. Deterministic (no
 * RNG). Active-only — offline never charges a retainer or advances a flip, so
 * absence is safe (GDD §6; the offline-safe acceptance criterion).
 */
export function corruptionStep(state: GameState, dtHours: number): GameState {
  let next = chargeRetainers(state).state;
  for (const id of next.corruption.officials.map((o) => o.id)) {
    next = requestRaise(next, id).state;
  }
  next = advanceOfficialFlipArcs(next);
  return applyOfficialWireHeat(next, dtHours);
}

// --- Judge benefit — soften the prison end-state (design/09 B.2; Prompt 11) ---

/**
 * Whether a judge on the payroll can dismiss charges right now (design/09 B.2).
 * True only for a hired judge who hasn't flipped and still has enough loyalty to
 * stick their neck out. Prompt 11 (endgame) reads this to soften the imprisonment
 * end-state — a comeback instead of a run-ending prison term.
 */
export function judgeCanDismiss(state: GameState): boolean {
  return state.corruption.officials.some(
    (o) =>
      o.officialId === 'judge' &&
      !o.isWire &&
      o.loyalty >= state.config.crew.BETRAYAL_WARNING_LOYALTY,
  );
}

// --- Standing-benefit queries (read by heat/storage/UI; design/09 B.2) --------

/** Whether a beat cop on payroll (not flipped) is tipping you off on local raids. */
export function hasRaidTipoff(state: GameState): boolean {
  return state.corruption.officials.some(
    (o) =>
      o.officialId === 'beat-cop' &&
      !o.isWire &&
      o.loyalty >= state.config.crew.BETRAYAL_PONR_LOYALTY,
  );
}

/** Whether a DEA insider on payroll (not flipped) is warning you off task forces. */
export function hasTaskforceWarning(state: GameState): boolean {
  return state.corruption.officials.some(
    (o) =>
      o.officialId === 'detective' &&
      !o.isWire &&
      o.loyalty >= state.config.crew.BETRAYAL_PONR_LOYALTY,
  );
}

/** Whether a politician on payroll (not flipped) is providing standing protection. */
export function hasPoliticalProtection(state: GameState): boolean {
  return state.corruption.officials.some(
    (o) =>
      o.officialId === 'politician' &&
      !o.isWire &&
      o.loyalty >= state.config.crew.BETRAYAL_PONR_LOYALTY,
  );
}
