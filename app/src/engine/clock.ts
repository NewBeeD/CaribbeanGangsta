/**
 * The injected-time clock. Online, the sim advances ONLY through
 * `tick(state, dtHours)` — never by reading a wall clock inside the engine
 * (prompts/README.md "Time is injected"). This is what keeps the sim
 * deterministic and lets the store compute elapsed real time and feed it in.
 *
 * Per-tick systems (heat decay, laundering accrual, debt interest, chaos rolls,
 * beat checks) are registered as small pure steps in `TICK_STEPS`, run in a
 * defined order. Later prompts fill the placeholder steps they own.
 *
 * Offline is frozen/safe (GDD §6; design/10 §4.2): the return-from-away payoff is
 * settled by `laundering.settleOffline` (Prompt 07), which only adds clean cash
 * and queues return hooks — it never advances heat, debt, or the death spiral,
 * never seizes, never kills. The active `TICK_STEPS` are all `'active'`-only for
 * anything that could punish absence; nothing runs on the frozen offline path.
 *
 * Incarcerated (design/13 B4, the served-sentence arrest outcome): `serveSentence`
 * fast-forwards the sim through the disclosed sentence at the moment of the
 * explicit choice — never wall-clock time, so the offline-freeze guarantee is
 * untouched. The mode rule is one sentence: everything that COSTS or THREATENS
 * keeps running (retainers, interest, raids, arcs, the world's markets);
 * everything that EARNS freezes (fronts, production, wash mules, street teams) —
 * nobody moves product while the boss is inside.
 */

import { ARREST_CHOICE_KIND, type GameState, type PendingChoice } from './state';
import { restoreRng } from './rng';
import { driftPrices, restockMarkets } from './deals';
import { armsMarketStep } from './arms';
import { applyHeatEscalation, decayHeat } from './heat';
import { heatSourcesStep } from './heatSources';
import { raidStep } from './storage';
import { travelStep } from './travel';
import { accrue } from './laundering';
import { productionStep } from './production';
import { washStep } from './wash';
import { streetStep } from './street';
import { crewStep } from './crew';
import { corruptionStep } from './corruption';
import { debtStep, enforcementStep } from './debt';
import { turfWarStep } from './turfWar';
import { chaosStep } from './chaos';
import { marketEventStep } from './marketEvents';
import { beatStep } from './beats';
import { bankPeaks } from './endgame';

const HOURS_PER_DAY = 24;
const DAYS_PER_WEEK = 7;

/**
 * Fixed in-game cadence for the two systems that update in discrete steps rather
 * than continuously (Ideas2): drug prices and loan interest refresh once every
 * 3 in-game hours (≈90 real seconds at the live-clock pacing). Under the live
 * clock, ticks land ~once a real second — far too fine to move a price on each —
 * so these two steps batch to a 3-hour grid. Every other system stays continuous.
 * Not a balance knob (totals are unchanged, only the delivery cadence), so it
 * lives here beside the other structural time anchors, not in GameConfig.
 */
const PRICE_INTEREST_PERIOD_HOURS = 3;

/**
 * The whole in-game hours to apply when advancing `oldHours → oldHours + dt`
 * crosses one or more `period`-length boundaries: `crossings × period`, or 0 when
 * the tick stays inside the current period. Passing the crossed-period total (not
 * the raw `dt`) keeps the daily drift/interest budget identical to per-tick
 * updates — the movement is merely delivered in discrete 3-hour steps. Stateless
 * and deterministic: a tick that crosses no boundary is a clean no-op (it never
 * touches the RNG stream), so no per-system "last updated" bookkeeping is needed.
 */
function periodHoursCrossed(oldHours: number, dt: number, period: number): number {
  const crossings = Math.floor((oldHours + dt) / period) - Math.floor(oldHours / period);
  return crossings > 0 ? crossings * period : 0;
}

export type TickMode = 'active' | 'offline' | 'incarcerated';

export interface TickStep {
  readonly id: string;
  /**
   * Advance this system by `dtHours`. Must be PURE: state in -> new state out,
   * no mutation, no wall-clock reads, randomness only via `state.rngState`.
   */
  readonly run: (state: GameState, dtHours: number, mode: TickMode) => GameState;
  /**
   * Which modes this step runs in. Anything that could punish real-world
   * absence (heat, debt interest, chaos, the spiral) omits `'offline'`.
   */
  readonly modes: readonly TickMode[];
}

/**
 * The ordered per-tick pipeline. Steps are placeholders owned by later prompts;
 * each returns state unchanged until its prompt implements it. Order matters:
 * decay before accrual before interest before events before beats.
 */
export const TICK_STEPS: readonly TickStep[] = [
  // Live market price walk (design/01 §2). Prompt 04. Active-only: prices are
  // frozen while away so absence is never punished (GDD §6). Draws from and
  // advances the run's RNG stream — but only on a 3-in-game-hour cadence (Ideas2):
  // the price refreshes in readable steps under the live clock, applying the whole
  // crossed period at once (same daily drift budget). A tick that crosses no
  // 3-hour boundary leaves prices and the RNG stream untouched.
  {
    id: 'price-drift',
    modes: ['active', 'incarcerated'],
    run: (s, dt) => {
      const hours = periodHoursCrossed(s.clock.hours - dt, dt, PRICE_INTEREST_PERIOD_HOURS);
      return hours > 0 ? driftPrices(s, restoreRng(s.rngState), hours) : s;
    },
  },
  // Market stock pools refill over PLAY time (design/12 Item 10; Prompt 32).
  // Active-only: the street never re-ups while the world is frozen offline
  // (GDD §6). Deterministic — no randomness, so it sits after the drift walk
  // without touching the RNG stream.
  { id: 'market-restock', modes: ['active', 'incarcerated'], run: (s, dt) => restockMarkets(s, dt) },
  // Arms markets drift + restock (design/12 Item 1; Prompt 35). Active-only: arms
  // are frozen while away (GDD §6). Draws from an INDEPENDENT run-seeded stream
  // (like chaos / market events), so it never perturbs the main deal/raid RNG.
  { id: 'arms-markets', modes: ['active', 'incarcerated'], run: (s, dt) => armsMarketStep(s, dt) },
  // The six-source model's passive heat terms — storage concentration + empire
  // size — plus the repeated-pattern counter decay (design/13 B5; Prompt 44).
  // Active-only: a fat stash doesn't hum while away, and a pattern doesn't cool
  // either (GDD §6). Deterministic — never touches the RNG stream. Runs BEFORE
  // decay so a tick's accrual and cool-down settle in a fixed order.
  { id: 'heat-sources', modes: ['active', 'incarcerated'], run: (s, dt) => heatSourcesStep(s, dt) },
  // Heat decays over online time (design/01 §4). Prompt 05. Active-only: offline
  // is frozen, so heat neither rises nor falls while away.
  { id: 'heat-decay', modes: ['active', 'incarcerated'], run: (s, dt) => decayHeat(s, dt) },
  // Telegraph an LE-tier crossing after decay/accrual shift heat (design/07 §5).
  // Prompt 05. Active-only, and fires each crossing exactly once.
  { id: 'heat-escalation', modes: ['active', 'incarcerated'], run: (s) => applyHeatEscalation(s) },
  // Roll for a raid on a single stash and resolve the seizure (design/01 §4;
  // design/09 A). Prompt 05 (`rollRaid`) decides whether/where; Prompt 06
  // (`raidStep` → `resolveRaid`) applies the seizure and queues the scene.
  // Active-only: offline is safe (GDD §6) — no raid fires while the player is away.
  // (Also runs while incarcerated — the empire sits exposed with the boss inside;
  // that raid window is the sentence's teeth, disclosed on the arrest card.)
  { id: 'raid-roll', modes: ['active', 'incarcerated'], run: (s, dt) => raidStep(s, dt) },
  // Shipments in flight resolve their arrivals/interdictions (design/11 §3;
  // Prompt 30). ACTIVE-only: in-flight cargo is frozen while the player is
  // away — never delivered, never seized offline (GDD §6). The roll compares
  // one RNG draw against the odds snapshotted at launch (fairness law).
  { id: 'travel', modes: ['active', 'incarcerated'], run: (s, dt) => travelStep(s, dt) },
  // Laundering fronts accrue clean cash + apply their passive heat footprint
  // (design/01 §3). Prompt 07. Active-only: the offline return payoff is settled
  // separately by `laundering.settleOffline` on its own piecewise curve. Frozen
  // while incarcerated too — income earns nothing inside (the B4 sentence rule).
  { id: 'laundering-accrual', modes: ['active'], run: (s, dt) => accrue(s, dt) },
  // Grow-ops & drug factories deposit product units into the home stash + apply
  // their passive heat footprint (Ideas2 item 3; Prompt 39). Active-only: the
  // offline path deposits nothing (frozen — GDD §6), so absence forgoes yield but
  // never seizes it. Runs AFTER laundering-accrual (both are idle-yield systems)
  // and is bounded by the same effectiveCapacity rule as every other producer.
  // Deterministic — no randomness — so it never touches the RNG stream. Frozen
  // while incarcerated (B4): nobody runs the ops with the boss inside.
  { id: 'production-yield', modes: ['active'], run: (s, dt, mode) => productionStep(s, dt, mode) },
  // Money-mule wash queue: deposit committed dirty cash in sub-$10k batches over
  // time, landing clean at 1−cut (the batched dirty→clean converter). Active-only:
  // a batch never clears while the player is away (GDD §6) — absence neither
  // launders nor loses. Deterministic (no randomness), so it sits beside the
  // accrual step without touching the RNG stream. Frozen while incarcerated (B4):
  // the mules sit on the cash until you're out — delayed, never lost.
  { id: 'wash-queue', modes: ['active'], run: (s, dt, mode) => washStep(s, dt, mode) },
  // Street teams drip cooked crack back as dirty cash + a little corner heat
  // (design/12 Item 5d; Prompt 34). Active-only: the crew's hustle freezes while
  // the player is away, so absence never earns or heats (GDD §6). Deterministic —
  // no randomness — so it sits beside laundering without touching the RNG stream.
  // Frozen while incarcerated too (B4) — the corners go quiet without the boss.
  { id: 'street-sales', modes: ['active'], run: (s, dt, mode) => streetStep(s, dt, mode) },
  // Crew: advance betrayal arcs one telegraphed stage, then apply any flipped-wire
  // heat (design/02 §4). Prompt 08. Active-only: offline never advances an arc or a
  // wire's heat (GDD §6). Deterministic — the arc uses no randomness.
  { id: 'crew', modes: ['active', 'incarcerated'], run: (s, dt) => crewStep(s, dt) },
  // Corruption: settle weekly retainers on the weekly boundary (from clean cash),
  // let officials ask for raises, advance flip arcs one telegraphed stage, then
  // apply flipped-official wire heat (design/09 B.2). Prompt 09. Active-only:
  // offline never charges a retainer or advances a flip, so absence is safe
  // (GDD §6). Deterministic — the flip arc uses no randomness.
  { id: 'corruption', modes: ['active', 'incarcerated'], run: (s, dt) => corruptionStep(s, dt) },
  // Debt interest + default ladder (design/10). Prompt 10. Active-only AND only
  // when debt.active: accrues interest per in-game day played, then advances the
  // telegraphed default ladder one rung past the soft due date. Offline never runs
  // it, so absence never grows what's owed or escalates (guarantee #2, §4.2). Like
  // price drift, it compounds on the 3-in-game-hour cadence (Ideas2) rather than
  // every tick — applying the whole crossed period, so the per-day interest total
  // is unchanged; it just lands in discrete steps under the live clock.
  {
    id: 'debt-interest',
    modes: ['active', 'incarcerated'],
    run: (s, dt) => {
      const hours = periodHoursCrossed(s.clock.hours - dt, dt, PRICE_INTEREST_PERIOD_HOURS);
      return hours > 0 ? debtStep(s, hours) : s;
    },
  },
  // Marked enforcement (design/13 B3; Prompt 44): while rung 5's flag is up,
  // collector pressure escalates one TELEGRAPHED hit at a time on a visible
  // clock — warning first, always. Active-only AND right after the debt ladder
  // that sets the mark: no collector moves while the player is away (the Prompt
  // 21 tested guardrail). Deterministic — no RNG.
  { id: 'marked-enforcement', modes: ['active', 'incarcerated'], run: (s, dt) => enforcementStep(s, dt) },
  // Turf wars — rivals contesting specific held countries (design "Turf Wars
  // Between Countries"). Grows active-war pressure, skims any tribute from clean
  // cash, and rolls at most one new ignition from an INDEPENDENT run-seeded stream
  // (so it never perturbs the deal/raid RNG). Active-only: absence never opens a
  // war, escalates one, or skims a dollar (GDD §6). Runs AFTER corruption/debt so a
  // war reads this tick's settled protection/heat, and before chaos so a fired war
  // and a fired event settle together before beats read the board.
  { id: 'turf-war', modes: ['active', 'incarcerated'], run: (s, dt) => turfWarStep(s, dt) },
  // Procedural world events — the variable-reward core (design/05 §2; design/01
  // §4.7). Prompt 12. Active-only: offline is frozen/safe, so absence never
  // triggers chaos (GDD §6). Draws from an INDEPENDENT run-seeded stream, so it
  // never perturbs the main deal/raid RNG. Runs after the economic systems so a
  // shock lands on this tick's settled prices/heat.
  { id: 'chaos-roll', modes: ['active', 'incarcerated'], run: (s, dt) => chaosStep(s, dt) },
  // World price events & the rumor ticker (design/12 Item 6; Prompt 33). ACTIVE-
  // only: the world is frozen offline, so no rumor posts, lands, or decays while
  // away (GDD §6). Draws from an INDEPENDENT run-seeded stream (like chaos), so
  // it never perturbs the main deal/raid RNG. Runs beside chaos so all the
  // world-event systems settle together before beats read the board.
  { id: 'market-events', modes: ['active', 'incarcerated'], run: (s, dt) => marketEventStep(s, dt) },
  // Narrative-beat checks — state → beats, not a script (design/05 §0). Prompt 12
  // (Prompt 13 renders them). Active-only (offline never fires a beat, GDD §6),
  // and AFTER chaos so beats can key off the flags a fired event just stamped.
  { id: 'beat-check', modes: ['active', 'incarcerated'], run: (s) => beatStep(s) },
  // Peak trackers: bank net-worth / clean-cash / empire-composite peaks after every
  // system above has settled (design/01 §7). Prompt 11. Active-only and LAST, so the
  // banked height reflects this tick's true max. Offline peak banking is handled by
  // `laundering.settleOffline` (clean cash only; empire size can't grow while away).
  { id: 'peak-tracking', modes: ['active', 'incarcerated'], run: (s) => bankPeaks(s) },
];

/** Recompute a clock advanced by `dtHours` (derives day/week from total hours). */
function advanceClock(hours: number, dtHours: number): GameState['clock'] {
  const total = hours + dtHours;
  const day = Math.floor(total / HOURS_PER_DAY) + 1;
  const week = Math.floor((day - 1) / DAYS_PER_WEEK) + 1;
  return { hours: total, day, week };
}

function runSteps(state: GameState, dtHours: number, mode: TickMode): GameState {
  let next = state;
  for (const step of TICK_STEPS) {
    if (step.modes.includes(mode)) next = step.run(next, dtHours, mode);
  }
  return next;
}

/**
 * Advance the sim by `dtHours` of in-game time with the player online: moves the
 * clock and runs the full active pipeline.
 */
export function tick(state: GameState, dtHours: number): GameState {
  if (dtHours < 0) throw new Error(`tick(): dtHours must be >= 0 (got ${dtHours})`);
  if (dtHours === 0) return state;
  const clock = advanceClock(state.clock.hours, dtHours);
  return runSteps({ ...state, clock }, dtHours, 'active');
}

// --- Serving the arrest sentence (design/13 B4, open decision 2 — settled) ------

export interface ServeSentenceResult {
  readonly state: GameState;
  readonly ok: boolean;
  /** In-game hours fast-forwarded (the disclosed sentence). 0 on rejection. */
  readonly servedHours: number;
  readonly rejected?: 'no-arrest';
}

/**
 * Serve the sentence on a pending arrest (design/13 B4): the alternative to
 * `travel.postBond` when the bond can't (or won't) be paid — the run RESUMES
 * instead of ending. Clears the arrest interrupt, then fast-forwards
 * `ARREST_SENTENCE_HOURS` of in-game time through the `'incarcerated'` pipeline
 * in one-hour steps (the live clock's event cadence: raids, arcs, and weekly
 * boundaries land as they would in lived time). Costs and threats run; income
 * freezes; heat decays — you did the time. Everything settles at the moment of
 * this explicit choice, so the offline-freeze guarantee is untouched, and no
 * step in the pipeline can end the run (GDD §8 — absence never kills). Queues a
 * release note for the Money feed and rejects without mutating when the choice
 * isn't a pending arrest.
 */
export function serveSentence(state: GameState, choiceId: string): ServeSentenceResult {
  const choice = state.pendingChoices.find((c) => c.id === choiceId);
  if (!choice || choice.kind !== ARREST_CHOICE_KIND) {
    return { state, ok: false, servedHours: 0, rejected: 'no-arrest' };
  }
  const sentence = state.config.transport.ARREST_SENTENCE_HOURS;
  let next: GameState = {
    ...state,
    pendingChoices: state.pendingChoices.filter((c) => c.id !== choiceId),
  };
  for (let remaining = sentence; remaining > 0; remaining -= 1) {
    const dt = Math.min(1, remaining);
    next = runSteps({ ...next, clock: advanceClock(next.clock.hours, dt) }, dt, 'incarcerated');
  }
  const days = Math.round(sentence / HOURS_PER_DAY);
  const release: PendingChoice = {
    id: `sentence-served-${choiceId}`,
    kind: 'sentence-served',
    summary: `You did your ${days} days. The street kept moving while nobody earned — settle up and get back to it.`,
    createdAtHours: next.clock.hours,
  };
  return {
    state: { ...next, pendingChoices: [...next.pendingChoices, release] },
    ok: true,
    servedHours: sentence,
  };
}

// Offline settlement (return-from-away payoff) lives in `laundering.ts` —
// `settleOffline(state, realHoursAway) → { state, report }` — the concrete
// implementation of Prompt 03's hook. It is frozen/safe by construction (adds
// only, never advances the clock or any punishing system).
