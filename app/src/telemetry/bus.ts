/**
 * The telemetry event bus (Prompt 25; design/06) — a typed `track(event, props)`
 * with pluggable sinks. Every retention claim in the GDD becomes a measured,
 * falsifiable metric flowing through here.
 *
 * Boundary rules:
 * - The ENGINE stays pure — it never imports this module. All emission happens
 *   at the store/UI layer (instrument.ts), either directly around store actions
 *   or by diffing engine state across a tick (derive.ts).
 * - LOCAL-FIRST, NO PII (design/06; GDD §8): props are game numbers only —
 *   seeds, dollars, odds, in-game clocks. No account, device, or contact data
 *   exists anywhere in the pipeline. `RemoteSink` is a drop-in STUB that queues
 *   and discards; nothing depends on it, and remote is opt-in later.
 * - Telemetry serves tuning and the ETHICAL AUDIT (fairness law, offline
 *   freeze), never dark-pattern optimization (design/10 §4 watch item, GDD §15).
 *
 * Wall-clock note: unlike the engine, telemetry MAY read real time (session
 * length is a real-world funnel metric). The clock is injectable for tests.
 */

import type { ProductId } from '@/engine/config/countries';
import type { DealOutcome } from '@/engine/deals';
import type { RunEndCause, SpiralStage } from '@/engine/endgame';

/** Which risk surface an `odds_audit` row measured (the fairness law's scope). */
export type OddsSurface = 'deal' | 'shipment' | 'raid';

/**
 * The full event catalog — design/06 funnel + the per-system telemetry rows
 * (design/01 §8, design/09, design/10). One entry per named metric; aggregate
 * metrics (rates, distributions, correlations) are derived from these rows.
 */
export interface TelemetryEventMap {
  // --- Funnel health (design/06 §1) ---
  /** An app session began: a fresh run, a continue, or a resume after away. */
  session_start: {
    readonly source: 'new-run' | 'continue';
    readonly seed: string;
    readonly day: number;
    /** Borrower-cohort tag (design/10 — borrower retention vs non-borrowers). */
    readonly everBorrowed: boolean;
  };
  /** A new run's world was generated (design/01 §0a — the starting hand). */
  run_started: {
    readonly seed: string;
    readonly countryId: string;
    readonly startingCash: number;
  };
  /** Every deal commit — the funnel's core action (deals, busts, fairness). */
  deal_resolved: {
    readonly kind: 'buy' | 'sell';
    readonly outcome: DealOutcome;
    readonly product: ProductId;
    readonly qty: number;
    readonly displayedBustProb: number;
    readonly rolledValue: number;
    readonly cashDelta: number;
    readonly secondsIntoSession: number;
  };
  /** First successful sale of the session (time-to-first-sale ≤ 2 min target). */
  first_sale: { readonly secondsIntoSession: number; readonly day: number };
  /** The idle engine started (design/06 — first-front funnel step). */
  first_front_opened: {
    readonly frontType: string;
    readonly secondsIntoSession: number;
  };
  /** The session-end open loop was queued (design/06 — open-loop rate > 80%). */
  session_end_reached: { readonly cardId: string };
  /** A return from real-world absence (D1-return proxy; second-session return). */
  offline_return: {
    readonly hoursAway: number;
    /** True when the gap looks like a next-day return (8–48h away). */
    readonly d1Proxy: boolean;
  };
  /** The return hook led to the Money screen (return-to-allocate rate). */
  return_to_allocate: { readonly hoursAway: number };

  // --- Economy (design/06 §4) ---
  front_opened: {
    readonly frontType: string;
    readonly level: number;
    readonly cost: number;
    /** Idle clean-cash rate AFTER the purchase, $/h (idle-rate metric). */
    readonly idleRatePerHour: number;
  };
  front_upgraded: {
    readonly frontType: string;
    readonly level: number;
    readonly cost: number;
    readonly idleRatePerHour: number;
  };
  /** Offline settlement — earned, capped where, and the FREEZE AUDIT verdict. */
  offline_settled: {
    readonly hoursAway: number;
    readonly cleanEarned: number;
    readonly cappedAt: number;
    readonly goldenHour: boolean;
    /** Guarantee audit (design/10 §6): owed/assets moved against the player. */
    readonly freezeViolation: boolean;
    readonly owedDelta: number;
    readonly heatDelta: number;
  };

  // --- Death spiral (design/01 §8.5 — the top tuning priority) ---
  spiral_stage: {
    readonly stage: SpiralStage;
    readonly prevStage: SpiralStage;
  };
  run_ended: {
    readonly cause: RunEndCause;
    readonly score: number;
    readonly day: number;
    readonly week: number;
    /** Was the end telegraphed (spiral rungs walked / chosen), not a cheap death? */
    readonly readable: boolean;
    readonly everBorrowed: boolean;
  };

  // --- Debt (design/10) ---
  loan_borrowed: {
    readonly lenderId: string;
    readonly amount: number;
    readonly cap: number;
    /** Borrowed ÷ net worth at the moment of borrowing (average-leverage row). */
    readonly leverage: number;
  };
  loan_repaid: {
    readonly paid: number;
    readonly remaining: number;
    readonly clearedInFull: boolean;
    /** True when this clears a loan that HAD defaulted (dig-out-rate row). */
    readonly dugOut: boolean;
  };
  debt_ladder_advanced: {
    readonly rung: number;
    /** True once the shark marked the player (spiral trigger, design/10 §5). */
    readonly marked: boolean;
  };

  // --- Drug fronts / consignment (v23 — the plug's short-fuse credit) ---
  consignment_taken: {
    readonly countryId: string;
    readonly product: string;
    readonly qty: number;
    readonly principal: number;
    readonly cap: number;
    /** Fronted value ÷ net worth at the moment of taking (leverage row). */
    readonly leverage: number;
  };
  consignment_repaid: {
    readonly paid: number;
    readonly fromDirty: number;
    readonly fromClean: number;
    readonly remaining: number;
    readonly clearedInFull: boolean;
    /** True when this clears a front that HAD gone overdue (dig-out-rate row). */
    readonly dugOut: boolean;
  };

  // --- Corruption / storage (design/09) ---
  raid_resolved: {
    readonly stashId: string;
    readonly seized: boolean;
    readonly unitsLost: number;
    readonly cashLost: number;
    /** Fraction of ALL held product lost to this one raid (target < ~40%). */
    readonly lossPct: number;
    /** Diversification index at the moment the raid hit (0..1). */
    readonly diversification: number;
    /** True when the raid zeroed operating capital (raid-induced wipe rate). */
    readonly wiped: boolean;
  };
  bribe_paid: {
    readonly portId: string;
    readonly amount: number;
    readonly shipmentValue: number;
  };
  payroll_charged: {
    readonly payrollPerWeek: number;
    readonly idleRatePerHour: number;
    /** Payroll as a fraction of a week of clean income (sink-health row). */
    readonly pctOfCleanIncome: number;
  };
  official_hired: {
    readonly officialId: string;
    readonly retainerPerWeek: number;
  };
  official_flipped: { readonly officialId: string };
  crew_flipped: { readonly crewId: string };

  // --- Shipments (design/11 §3) ---
  shipment_launched: {
    readonly mode: string;
    readonly product: ProductId;
    readonly qty: number;
    readonly interdictionChance: number;
    readonly totalCost: number;
  };
  shipment_resolved: {
    readonly mode: string;
    readonly seized: boolean;
    readonly displayedOdds: number;
  };

  // --- Fairness audit (design/01 §0.3; GDD §8 — continuously verifiable) ---
  /** One risk roll: the DISPLAYED odds and whether the bad outcome happened. */
  odds_audit: {
    readonly surface: OddsSurface;
    readonly displayed: number;
    readonly hit: boolean;
  };

  // --- Narrative reach (design/06 §5; design/08 — cards fire their flag) ---
  beat_fired: { readonly beatId: string };
  story_flag: { readonly flag: string; readonly cardId: string };
  story_card_choice: { readonly cardId: string; readonly choiceIndex: number };
  chaos_event: { readonly flag: string };
}

export type TelemetryEventName = keyof TelemetryEventMap;

/** One tracked row: name + typed props + wall-clock stamp + monotonic seq. */
export interface TelemetryEvent<K extends TelemetryEventName = TelemetryEventName> {
  readonly name: K;
  readonly props: TelemetryEventMap[K];
  /** Wall-clock ms (telemetry may read real time — the engine never does). */
  readonly at: number;
  readonly seq: number;
}

/** The union of every concrete event shape (what sinks receive). */
export type AnyTelemetryEvent = {
  [K in TelemetryEventName]: TelemetryEvent<K>;
}[TelemetryEventName];

/** Where events land. Sinks must never throw back into game code. */
export interface TelemetrySink {
  handle(event: AnyTelemetryEvent): void;
}

/**
 * The typed bus: `track(name, props)` fans out to every attached sink. A sink
 * that throws is isolated (telemetry must never break play). The clock is
 * injectable so tests are deterministic.
 */
export class TelemetryBus {
  private sinks: TelemetrySink[] = [];
  private seq = 0;
  private readonly clock: () => number;

  constructor(options?: { readonly now?: () => number }) {
    this.clock = options?.now ?? (() => Date.now());
  }

  /** The bus's wall clock (instrumentation derives session timings from it). */
  now(): number {
    return this.clock();
  }

  addSink(sink: TelemetrySink): void {
    this.sinks.push(sink);
  }

  removeSink(sink: TelemetrySink): void {
    this.sinks = this.sinks.filter((s) => s !== sink);
  }

  track<K extends TelemetryEventName>(name: K, props: TelemetryEventMap[K]): void {
    const event = { name, props, at: this.now(), seq: this.seq++ } as AnyTelemetryEvent;
    for (const sink of this.sinks) {
      try {
        sink.handle(event);
      } catch {
        // A broken sink must never break the game.
      }
    }
  }
}

// --- Sinks --------------------------------------------------------------------

/** Console sink — dev-time visibility while playing with the console open. */
export class ConsoleSink implements TelemetrySink {
  handle(event: AnyTelemetryEvent): void {
    // eslint-disable-next-line no-console
    console.debug(`[telemetry] ${event.name}`, event.props);
  }
}

/**
 * On-device sink: a bounded in-memory ring buffer with change subscription —
 * what the live overlay reads — plus derived-metric helpers (`derive.ts`
 * aggregates over `events()`). Local-first: nothing leaves the device.
 */
export class LocalSink implements TelemetrySink {
  private buffer: AnyTelemetryEvent[] = [];
  private listeners = new Set<() => void>();

  constructor(private readonly capacity: number = 500) {}

  handle(event: AnyTelemetryEvent): void {
    this.buffer = [...this.buffer, event].slice(-this.capacity);
    for (const fn of this.listeners) fn();
  }

  /** Immutable snapshot of the retained events, oldest first. */
  events(): readonly AnyTelemetryEvent[] {
    return this.buffer;
  }

  /** Subscribe to changes (returns the unsubscribe). Overlay uses this. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  clear(): void {
    this.buffer = [];
    for (const fn of this.listeners) fn();
  }
}

/**
 * Remote sink STUB (Prompt 25 acceptance: a drop-in, nothing depends on it).
 * Queues locally and `flush()` discards — no network call exists here. When a
 * real backend lands it replaces `flush()` only, behind an explicit opt-in
 * (design/06 §7: remote is opt-in; local-first, no PII).
 */
export class RemoteSink implements TelemetrySink {
  private queue: AnyTelemetryEvent[] = [];

  handle(event: AnyTelemetryEvent): void {
    this.queue.push(event);
  }

  /** How many events are waiting for a (future, opt-in) upload. */
  pending(): number {
    return this.queue.length;
  }

  /** Stub: drops the queue. The real implementation would POST it, opt-in only. */
  flush(): void {
    this.queue = [];
  }
}
