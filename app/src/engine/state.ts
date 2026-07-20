/**
 * The single `GameState` shape — the whole truth of one run — plus the pure,
 * immutable reducer entry point (`applyIntent`) and the deterministic run
 * constructor (`createInitialState`).
 *
 * Everything the sim needs lives here so a run round-trips through save/load as
 * plain JSON-cloneable data (no functions, no class instances): the serialized
 * `rngState` is what lets randomness resume EXACTLY where it left off (design/01
 * §0.3 fairness; Prompt 03 acceptance).
 *
 * Purity/determinism rules (prompts/README.md): no `Math.random`, no
 * `Date.now()` here — time is injected via `clock.ts`. Reducers take state in
 * and return NEW immutable state; they never mutate their input.
 *
 * Many sub-shapes below (fronts, crew, corruption, debt, stashes) are minimal
 * stubs owned/fleshed-out by later prompts. They exist now so the state shape is
 * stable and every field round-trips from day one.
 */

import { createRng, restoreRng, type Rng, type RngState } from './rng';
import { generateWorld, type World } from './world';
import { PRODUCT_IDS, type ProductId } from './config/countries';
import type {
  MarketEventScope,
  MarketEventMagnitude,
  MarketEventDirection,
} from './config/events';
import { DEFAULT_GAME_CONFIG, type GameConfig } from './config';
import type { TurfWarKind } from './config/turfWar';
import {
  createInitialMarkets,
  resolveDeal,
  type BuyIntent,
  type Markets,
  type SellIntent,
} from './deals';
import {
  createInitialArmsMarkets,
  resolveArmsDeal,
  unlockArmsBroker,
  type ArmsIntent,
  type ArmsMarkets,
  type Armory,
  type UnlockArmsBrokerIntent,
} from './arms';
import { WEAPON_TIER_IDS, type WeaponTierId } from './config/arms';
import { setLieLow, tierForHeat, type LeTier, type LieLowIntent } from './heat';
import { convert, type ConvertIntent } from './conversions';
import { buyPlug, type BuyPlugIntent } from './plugs';
import { ship, type ShipIntent, type Shipment } from './travel';
import { vesselsValue } from './vessels';
import { STARTING_STASH_TYPE, type StashType } from './config/stashes';
import type {
  CrewAgenda,
  CrewRole,
  CrewSkills,
  CrewTrait,
} from './config/crew';

/**
 * Bump when the persisted `GameState` shape changes; add a matching entry to the
 * migration table in `store/persistence.ts`. Older saves migrate or reject
 * cleanly (Prompt 03 acceptance).
 *
 * v2: added `markets` (live per-location price drift, Prompt 04).
 * v3: added `lyingLow` + `leTierAck` (heat/law-enforcement engine, Prompt 05).
 * v4: added `type` + `guardCrewId` to `Stash` (contraband storage, Prompt 06).
 * v5: expanded `CrewMember` to the full relatedness model — traits/skills/agenda/
 *     memory/betrayal arcs (crew engine, Prompt 08).
 * v6: expanded `Corruption` — full `OfficialTie` payroll model (retainer/greed/
 *     memory/flip arc/pending raise), `paidPorts`, and weekly-payroll bookkeeping
 *     (the corruption network, Prompt 09).
 * v7: expanded `Debt` — the loan-shark ledger (`lenderId`/`rate`/`accruedInterest`/
 *     `dueDay`/`collateralRef`/`ladderRung`) replacing the `interestRatePerHour`
 *     stub (debt & loan sharks, Prompt 10).
 * v8: regional markets (design/11; Ideas2) — `markets` re-keyed by countryId,
 *     `plugs` (true-source connections), the expanded product roster in every
 *     inventory, and `world` gains `exoticStrain` + supplier `demandFactor`.
 * v9: added `shipments` (in-flight cross-country cargo, travel engine, Prompt
 *     30) and the `courier` crew-assignment kind.
 * v10: added `config` — the injected `GameConfig` tuning the run was started
 *     under (Prompt 26). Saved with the run so a load resumes under the exact
 *     numbers it was played with; old saves migrate to the v1 default.
 * v11: the ONE-PRICE economy + finite stock (design/12 Items 3/10; Prompt 32) —
 *     `world.priceBoards` carry a single `price` (no buy/sell pair), every
 *     `MarketState` gains a `stock` pool, and `config` gains the `markets`
 *     group (its `products` table swaps to the single-band shape). Migration
 *     rebuilds boards/markets deterministically from the save's own seed;
 *     holdings, cash, plugs, and the RNG stream are untouched.
 *
 *     v11 is EXTENDED IN PLACE by prompts 33–35 (design/12 workstreams B–D — no
 *     further schema bump): Prompt 33 adds `marketEvents` + `rumors` (world price
 *     events & the rumor ticker); Prompt 34 adds `streetStock` (crack cooked to
 *     the crew's corner queue — design/12 Item 5); Prompt 35 adds `armsBroker`
 *     (the paid arms intro), `armsMarkets` (per-country weapon-tier price/stock),
 *     and `armory` (units held per weapon tier — design/12 Item 1). Missing on an
 *     older v11 save they default to empty/false (`normalizeState` in
 *     store/persistence.ts) — transient world data + a fresh-empty arsenal, never
 *     player cash or drug holdings.
 * v12: the fixed 6-front laundering roster + single-buy rule (Ideas2 item 1;
 *     Prompt 37). `Front.type` moves to the new 6-id union and each front is
 *     buyable once with the stable id `front-${type}`. Migration remaps legacy
 *     front ids (`bar → cash-front`, `nightclub → shell-company`, `resort →
 *     real-estate`, `crypto → crypto`) and FOLDS any duplicate of a type to the
 *     single highest-level survivor (migrations never seize — no cash/RNG change).
 *
 *     v12 is EXTENDED IN PLACE by Prompt 41 (Ideas2 item 5 — meaningful territory)
 *     with NO further schema bump: `Stash.openedAtHours` (optional — absent = an
 *     established, fully-controlled stash) and the `config.territory` group. Both
 *     are absent-is-safe on an older v12/v11 save: legacy stashes read as
 *     long-since consolidated, and `normalizeState` backfills the config group
 *     from the default (store/persistence.ts) — never player cash or holdings.
 * v13: the production layer — grow-ops, strains & drug factories (Ideas2 item 3;
 *     Prompt 39). `productionOps` (shape mirrors `Front`) and the `config.production`
 *     group are added; the `CrewAssignment` kind union gains `'production'` (crew
 *     delegation reuses the front-lieutenant path). Migration seeds an empty
 *     `productionOps` array and backfills `config.production` from the default —
 *     never player cash, holdings, or the RNG stream (a pre-v13 run simply had no
 *     production).
 * v14: integer inventory (design/13 A1; Prompt 43) — product units are whole
 *     numbers everywhere. `ProductionOp.pendingYield` carries each op's sub-unit
 *     fractional accrual so `productionStep` deposits only whole units (nothing
 *     fractional ever lands in an inventory, nothing produced is lost). Migration
 *     rounds any existing fractional holding UP to the next whole unit — in the
 *     player's favor, never a seizure. Shared with Prompt 45, which extends the
 *     op shape in place.
 * v15: the heat & consequence rework (design/13 B; Prompt 44) — `recentUse`
 *     (per-port repeated-pattern counters, decaying over active hours),
 *     `investigationUntilHours` (the post-major-bust investigation window), and
 *     `enforcement` (the marked-debt collector clock). Migration seeds them
 *     empty/absent and re-shapes the saved config: the transaction-heat knobs
 *     (`BUY_HEAT_FACTOR`, `ARMS_BUY_HEAT_FACTOR`, `ARMS_CONFLICT_HEAT_MULT`) are
 *     DROPPED and the six-source/enforcement/arrest knobs backfilled from the
 *     default. Never player cash, holdings, or the RNG stream.
 *
 *     v15 is EXTENDED IN PLACE by Prompt 45 (design/13 C — production v2) with NO
 *     further schema bump: `ProductionOp.stashId` (optional — absent = home stash
 *     `stashes[0]`, the legacy behavior) and `ProductionOp.paused` (optional —
 *     absent = running). Both are absent-is-safe on an older save: a legacy op
 *     deposits into home and always runs, exactly as before. The live-clock pacing
 *     retune is config-only (`config/production.ts`), no shape change.
 * v16: crew expansion + lieutenant span-of-control (design/13 D; Prompt 46).
 *     `CrewMember.productionOpIds` (the up-to-2 production ops a member personally
 *     runs) replaces the single `assignment.kind === 'production'` slot, so one
 *     lieutenant can run two grows; the migration MOVES a legacy production
 *     assignment into `productionOpIds` and idles the `assignment`. `GameState.
 *     lastCrewPayrollWeek` bookkeeps the weekly crew-wage settle (`chargeWages` —
 *     wages are config CONTENT on the archetype, not a tuning knob), seeded from the
 *     stored clock so a migrated run never back-charges. `config.crew.
 *     LIEUTENANT_MAX_PRODUCTION_OPS` is backfilled from the default. The bigger
 *     archetype roster is pure config CONTENT (no schema impact — new candidates
 *     just appear as hireable). Never touches player cash, holdings, or the RNG.
 * v17: owned vessels — the late-game logistics money sink (design/13 E; Prompt 47).
 *     `GameState.vessels` (shape mirrors `Front`/`ProductionOp`: a stable per-id
 *     `vessel-${type}`, single-buy, 1–5 `level`) holds boats bought outright from
 *     clean cash; each operates a charter mode cut-free with a per-leg discount and a
 *     level-scaled cargo cap (engine/vessels.ts), and the fleet's invested value
 *     counts in `netWorth`. The `config.vessels` group is backfilled from the default.
 *     Migration seeds an empty fleet on old saves — never player cash, holdings, or
 *     the RNG. The two new CHARTER modes (`container-ship`, `semi-sub`) and the cut
 *     retune are pure config CONTENT (no schema impact; migrated saves get them via
 *     the config backfill).
 * v18: corruption v2 — raise caps, ports everywhere, interventions (design/13 F;
 *     Prompt 48). `OfficialTie.lastRaiseWeek` gates the per-official raise cooldown;
 *     `Shipment.favorPending` holds an interdicted load off the dock while the
 *     "call in a favor" choice is open. The `config.corruption` group gains the raise
 *     cap/ceiling/cooldown, major-port tiering, favor, and massive-shipment surcharge
 *     knobs (backfilled from the default). Migration seeds nothing owned — no player
 *     cash, holdings, or the RNG move (the new fields are absent-is-safe optionals).
 * v19: the stash upgrade model — ONE stash per spot, LEVELS for space (design/13 G;
 *     Prompt 49). `Stash.level` (optional, absent = 1) replaces stacking a second
 *     stash on a (country, type) spot with `upgradeStash` levels that scale
 *     `effectiveCapacity` up the `STASH_CAPACITY_GROWTH` curve; `config.stashes`
 *     gains `STASH_MAX_LEVEL` + `STASH_CAPACITY_GROWTH`. The migration FOLDS every
 *     legacy spot's stacked stashes into a single survivor — inventories and dirty
 *     cash merged unit-for-unit and dollar-for-dollar, the level rounded UP to hold
 *     at least the folded stashes' combined capacity, and production destinations /
 *     guard / collateral references re-pointed to the survivor id. The fold rounds
 *     EVERY quantity in the player's favor: units, dirty cash, and total capacity
 *     never decrease (property-tested — `foldStashesOnePerSpot`). Territory footholds
 *     (new districts, countries, ports) are untouched — money-gated as ever.
 * v20: crew back-wages accrual (design/13 D). `GameState.crewBackWages` carries the
 *     unpaid remainder of any weekly payroll settled short — a real liability, not a
 *     forgiven shortfall. `chargeWages` now owes `carried arrears + this week's wages`
 *     and pays it down first from clean cash (floored at zero), carrying whatever's
 *     still unpaid forward. Migration seeds `crewBackWages: 0` (a migrated run starts
 *     square) — never player cash, holdings, or the RNG stream.
 * v21: escalating TERRITORY gates (user request — make expansion harder as the empire
 *     grows). `config.territory` gains five knobs: the crew requirement now SCALES
 *     (`TERRITORY_COUNTRIES_PER_LIEUTENANT`), plus an expansion cooldown
 *     (`TERRITORY_EXPANSION_COOLDOWN_HOURS`), a heat ceiling
 *     (`TERRITORY_MAX_HEAT_TO_EXPAND`), and a cross-region net-worth floor
 *     (`TERRITORY_CAPITAL_FLOOR_BASE` + `_PER_DISTANCE`). Migration merges the group
 *     from the default (any saved territory tuning wins on top) — no player cash,
 *     holdings, or RNG movement, and every gate applies only to OPENING a new country.
 * v22: turf wars (design "Turf Wars Between Countries"). `GameState.turfWars` carries the
 *     stateful conflicts of rivals contesting specific held countries; `config.turfWar`
 *     holds their tuning. Migration seeds `turfWars: []` (a migrated run starts at peace)
 *     and merges the `turfWar` config group from the default — no player cash, holdings,
 *     or RNG movement. Ignition/escalation/resolution run on ACTIVE ticks only (GDD §6).
 * v23: drug fronts / consignment (user request — drugs on loan, shorter due date, quicker
 *     death). `GameState.consignment` is a second, independent ledger beside `debt`: the
 *     country's PLUG fronts product into a stash and is owed its marked-up contract value
 *     on a 3-day clock, repayable from dirty OR clean cash (`engine/consignment.ts`);
 *     `config.consignment` holds the tuning. Migration seeds `consignment:
 *     emptyConsignment()` (a migrated run owes nothing) and merges the config group from
 *     the default — no player cash, holdings, or RNG movement. Interest/ladder/hits run
 *     on ACTIVE ticks only (design/10 §4.2 verbatim).
 * v24: semi-sub charter sourcing (user request — the user-signed open-access exception).
 *     A chartered semi-sub launches only from `config.transport.SEMI_SUB_CHARTER_ORIGINS`
 *     (Colombia/Mexico — the yards); an OWNED semi-sub launches from anywhere
 *     (`travel.modeAvailableFrom`). Migration merges the transport config group from the
 *     default so the new knob lands (any saved transport tuning wins on top) — no player
 *     cash, holdings, or RNG movement; in-flight shipments are untouched (the gate
 *     applies only to LAUNCHING a new leg).
 * v25: turf-war rewards (design/15 Workstream A — winning has to PAY). `TurfWar` gains
 *     `repEarned`, the street rep a war has already paid on won battles (clamped at
 *     `config.turfWar.WIN_REP_CAP_PER_WAR`). Won battles now capture rival arms
 *     (`CAPTURE_UNITS_BY_KIND` × aggression, deterministic) and a topple seizes dirty
 *     spoils into the contested country's stash (`TOPPLE_SPOILS_BASE` + trait weights).
 *     Migration seeds `repEarned: 0` on any in-flight war and merges the turfWar config
 *     group from the default — no player cash, holdings, or RNG movement; rewards apply
 *     only inside `resolveBattle` (a player action — offline stays frozen).
 * v26: protection turf (design/15 Workstream B — held, defended turf PAYS).
 *     `GameState.turfClaims` lists the countries whose wars ended in the player's favor
 *     (a defensive war fought off, or an offensive topple — never a bought truce); each
 *     claim drips weekly DIRTY protection income into the country's stash via the
 *     ACTIVE-only `turf-income` tick step (`PROTECTION_PCT × wealthIndex ×
 *     PROTECTION_BASE_PER_WEEK`, static wealth — never the player's stake there). A new
 *     war over claimed turf suspends the drip; losing the last stash there lapses the
 *     claim. Migration seeds `turfClaims: []` and merges the turfWar config group from
 *     the default — no player cash, holdings, or RNG movement (offline stays frozen).
 * v27: heat-escalation telegraph cleanup (user request — the feed was a wall of "opened
 *     a file" alerts). `applyHeatEscalation` now fires each tier's telegraph once per RUN
 *     (keyed on `beatsFired`), so a save can no longer accumulate duplicates; migration
 *     drops the duplicates older saves already queued, keeping only the newest one — a
 *     pure notification prune, never player cash, holdings, or RNG movement.
 * v28: the expanded drug roster (user request) — `shrooms` (island-grown psychedelics,
 *     a second starter crop), `lsd` (North-American lab sheets), and `ketamine` (the
 *     Asia dissociative, plug-gated at the Golden Crescent) join the product table.
 *     Migration backfills deterministically from the save's own seed, mirroring v8:
 *     every inventory gains the new keys at 0, every market gains a seeded book for
 *     the new products (existing books untouched), the world price board gains the
 *     new source prices, and the saved config's products table gains the new rows
 *     (saved tuning of existing products wins). No cash, holdings, or RNG movement.
 */
export const SCHEMA_VERSION = 28 as const;

export type RunStatus = 'active' | 'dead' | 'prison' | 'retired';

/** In-game time. `hours` is the accumulated total; day/week are derived from it. */
export interface Clock {
  /** Accumulated in-game hours since the run began (fractional allowed). */
  readonly hours: number;
  /** 1-based in-game day. */
  readonly day: number;
  /** 1-based in-game week. */
  readonly week: number;
}

/** Three separate reputation tracks = three viable paths (design/01 §1). */
export interface Reputation {
  readonly street: number;
  readonly business: number;
  readonly political: number;
}

/** Units held per product. Every product id is always present (0 if none). */
export type Inventory = Readonly<Record<ProductId, number>>;

/**
 * A location holding DIRTY cash and product (design/01 §1 — dirty cash is located
 * and seizable). `type` selects the archetype (capacity, base seizure %, travel
 * delay, cost — config/stashes.ts); `guardCrewId`, when set, ties a crew member's
 * loyalty into the effective seizure % (an inside job — design/09 A.3a). Prompt 06
 * (`storage.ts`) owns capacity enforcement and raid resolution.
 */
export interface Stash {
  readonly id: string;
  readonly name: string;
  readonly countryId: string;
  readonly type: StashType;
  readonly dirtyCash: number;
  readonly inventory: Inventory;
  /**
   * Upgrade level 1–`STASH_MAX_LEVEL` (design/13 G; Prompt 49). A spot holds ONE
   * stash whose capacity grows by LEVEL — `effectiveCapacity` scales the archetype
   * base by `STASH_CAPACITY_GROWTH^(level-1)` (storage.ts). Level 1 is the base
   * capacity; ABSENT reads as 1 (a fresh build, or a pre-v19 stash before the fold).
   * A migrated save that folded stacked stashes into one can carry a level ABOVE the
   * cap — the fold never shrinks capacity (`foldStashesOnePerSpot`).
   */
  readonly level?: number;
  /** Crew member guarding this stash (design/09 A.3a). Absent = unguarded. */
  readonly guardCrewId?: string;
  /**
   * In-game hours at which this foothold was OPENED as new territory (Ideas2 item
   * 5; Prompt 41). Stamped only when `addStash` opens a stash in a country the run
   * didn't already hold — it drives the raid-risk VULNERABILITY window and the
   * CONSOLIDATION hold (engine/territory.ts). ABSENT means an ESTABLISHED stash —
   * the home stash, a reinforcement in a country already held, or a legacy save —
   * which is fully controlled and not exposed. Not a schema bump: absent-is-safe
   * (a legacy stash simply reads as long-since consolidated).
   */
  readonly openedAtHours?: number;
}

/** A laundering front (idle engine). Prompt 07 owns rates and accrual. */
export interface Front {
  readonly id: string;
  readonly type: string;
  readonly level: number;
}

/**
 * A production op — a grow-op or drug factory (Ideas2 item 3; Prompt 39). Shape
 * mirrors `Front`: a stable per-type `id` (`prod-${type}`, single-buy), the config
 * `type` (`ProductionOpId`), and a 1–5 `level`. It turns ACTIVE time into product
 * units in the home stash (`production.ts`). Crew delegation is NOT stored here —
 * it reuses the front-lieutenant path (`crew.assignment.kind === 'production'`), so
 * the assigned crew is the single source of truth and an op never holds a dangling
 * crew ref. A single array covers BOTH kinds; `kind` lives on the config, not the
 * saved op (config/production.ts).
 *
 * `stashId` and `paused` (design/13 C; Prompt 45) extend the shape IN PLACE on
 * schema v15 — both optional and absent-is-safe, so no schema bump: a legacy op
 * with neither field reads exactly as before (deposits into the home stash,
 * always running). See the v15 note above.
 */
export interface ProductionOp {
  readonly id: string;
  readonly type: string;
  readonly level: number;
  /**
   * Sub-unit yield accrued but not yet deposited (design/13 A1; always `0 ≤ x < 1`).
   * `productionStep` deposits only WHOLE units into inventories and carries the
   * remainder here, so total yield over time equals the shown rate while nothing
   * fractional ever lands in a stash. Absent (legacy save) reads as 0.
   */
  readonly pendingYield?: number;
  /**
   * Destination stash for this op's yield (design/13 C; Prompt 45). Production is
   * PHYSICAL — the destination must be a stash in the op's own country, so yield
   * never teleports (`setProductionStash` enforces it). ABSENT (default, and every
   * legacy op) deposits into the home stash `stashes[0]`, exactly as before. A full
   * destination idles the op just like a full home stash always has.
   */
  readonly stashId?: string;
  /**
   * When true the op is PAUSED — a cold lab: it yields nothing and emits no heat
   * over any tick (design/13 C; Prompt 45). Pausing is free and instant both ways
   * and never touches the `pendingYield` carry, so unpausing resumes at the same
   * accumulator. ABSENT (default, and every legacy op) reads as running.
   */
  readonly paused?: boolean;
}

/**
 * An owned vessel — a boat bought outright as the late-game logistics money sink
 * (design/13 E; Prompt 47). Shape mirrors `Front`/`ProductionOp`: a stable per-type
 * `id` (`vessel-${type}`, single-buy), the config `type` (`VesselId`), and a 1–5
 * `level`. It operates its charter mode (config/vessels.ts → config/transport.ts)
 * cut-free with a per-leg discount and a level-scaled cargo cap (engine/vessels.ts),
 * and its invested value counts in `netWorth`. Empty fleet on a fresh run and on a
 * migrated pre-v17 save.
 */
export interface Vessel {
  readonly id: string;
  readonly type: string;
  readonly level: number;
}

/**
 * One thing a crew member REMEMBERS you did (design/02 §3 — the world remembers).
 * Every loyalty shift writes one; later dialogue/loyalty checks read the log, so a
 * betrayed character never acts as if the wrong didn't happen (§3 consistency law).
 */
export interface MemoryEntry {
  /** In-game hours when it happened (ordering; consistency across save/load). */
  readonly atHours: number;
  /** The loyalty-event kind that wrote it (`LoyaltyEventKind`), free-form here. */
  readonly kind: string;
  /** Prose, from the NPC's side ("You left Deon to take the fall in Kingston."). */
  readonly note: string;
  /** The loyalty delta this event applied (signed). */
  readonly delta: number;
}

/**
 * The betrayal arc — a TELEGRAPHED story beat, never a dice roll (design/02 §4).
 * It steps `warning → point-of-no-return → flipped`, one stage at a time, driven
 * purely by loyalty + agenda + how you treated them; each stage carries a readable
 * `sign`, and raising loyalty (pay/promote/confront) walks it back down. When it
 * reaches `flipped` the crew member becomes a wire (`CrewMember.isWire`).
 */
export type BetrayalStage = 'warning' | 'point-of-no-return' | 'flipped';

export interface BetrayalArc {
  readonly stage: BetrayalStage;
  readonly startedAtHours: number;
  readonly advancedAtHours: number;
  /** The readable sign for the current stage (shown to the player as prose). */
  readonly sign: string;
}

/**
 * What a crew member is currently doing in their ONE non-production duty (design/02
 * §5). `targetId` names the asset. Production is NO LONGER expressed here — a member
 * can run up to two ops via `CrewMember.productionOpIds` (design/13 D; Prompt 46),
 * independent of this slot. The `'production'` kind is retained ONLY so a legacy
 * save deserializes; the v16 migration moves it into `productionOpIds` and idles
 * this slot, and no new code sets `assignment.kind === 'production'`.
 */
export interface CrewAssignment {
  readonly kind:
    | 'idle'
    | 'guard'
    | 'front'
    | 'territory'
    | 'deal-crew'
    | 'courier'
    /** LEGACY only — a pre-v16 grow-op assignment, migrated into `productionOpIds`. */
    | 'production';
  /** The stash/front/territory/shipment/production-op id this references, when applicable. */
  readonly targetId?: string;
}

/**
 * A crew member as a PERSON, not a stat line (design/02 §1). `loyalty` is hidden
 * (0–100) and surfaced only through prose (`describeLoyalty`) — the UI never shows
 * the number. Prompt 08 (`crew.ts`) owns loyalty shifts, memory, and betrayal arcs.
 */
export interface CrewMember {
  readonly id: string;
  /** The config archetype this crew was spawned from (design/02 §7). */
  readonly archetypeId: string;
  readonly name: string;
  readonly role: CrewRole;
  readonly traits: readonly CrewTrait[];
  readonly skills: CrewSkills;
  /** Hidden 0–100; surfaced via prose/behavior, NEVER as a bar (design/02 §1). */
  readonly loyalty: number;
  /** Shared history with the player — the perspective-taking hook (design/02 §2). */
  readonly bond: string;
  /** Hidden goal — the emergent-conflict seed the player infers (design/02 §6). */
  readonly agenda: CrewAgenda;
  readonly memoryLog: readonly MemoryEntry[];
  readonly assignment: CrewAssignment;
  /**
   * The production ops this member personally runs (design/13 D; Prompt 46). A
   * promoted lieutenant may hold up to `LIEUTENANT_MAX_PRODUCTION_OPS` at once, each
   * earning the full disclosed `LIEUTENANT_FRONT_BONUS` (no dilution). Independent of
   * `assignment`, so a lieutenant can also hold a single non-production duty. Empty
   * on a fresh spawn; a migrated legacy save carries its one prior op here.
   */
  readonly productionOpIds: readonly string[];
  /** Present once a betrayal arc has begun (design/02 §4). Absent = no arc. */
  readonly activeArc?: BetrayalArc;
  /** True once flipped: an embedded wire feeding heat/LE (design/02 §4; Prompt 05/09). */
  readonly isWire?: boolean;
  /** The single family/personal high-stakes relationship (design/02 §7). */
  readonly isFamily?: boolean;
}

/**
 * A standing raise the official is asking for (design/09 B.2 v1.1). Present on an
 * `OfficialTie` once they've asked for more; the player accepts / negotiates /
 * refuses. Ignoring or refusing it counts as an underpayment (feeds the flip arc).
 */
export interface RaiseAsk {
  /** The new weekly retainer they want (computed from the documented formula). */
  readonly newRetainer: number;
  readonly askedAtHours: number;
  /** Readable reason surfaced as prose ("business is booming and so is the risk"). */
  readonly reason: string;
}

/**
 * A bought official on standing payroll (design/09 B.2). Reuses the crew
 * relatedness spine: hidden `loyalty` (0–100), a `memoryLog` of how you've treated
 * them, and a TELEGRAPHED `activeArc` (the same `BetrayalArc` staging the crew
 * engine uses) that ends in `isWire` when LE turns them. `greed` (0.7–1.3) scales
 * their asks; `retainerPerWeek` is the CURRENT retainer (raised over time via
 * `pendingRaise`). Prompt 09 (`corruption.ts`) owns all of it.
 */
export interface OfficialTie {
  /** Unique instance id (stable across repeat hires of the same archetype). */
  readonly id: string;
  /** The config archetype this tie was hired from (`OfficialId`). */
  readonly officialId: string;
  readonly name: string;
  /** Current weekly retainer, $ (raised over time — design/09 B.2 v1.1). */
  readonly retainerPerWeek: number;
  /** Hidden 0–100; surfaced via prose/behavior, never as a bar (design/02 §1). */
  readonly loyalty: number;
  /** Greed trait 0.7–1.3 — scales bribe/raise asks (design/09 B.1/B.2). */
  readonly greed: number;
  /** Heat (0–100) above which they get nervous and distance themselves (B.2). */
  readonly comfortHeat: number;
  readonly hiredAtHours: number;
  /** The last in-game week their retainer was charged (weekly-boundary bookkeeping). */
  readonly lastPaidWeek: number;
  readonly memoryLog: readonly MemoryEntry[];
  /** Present once a flip arc has begun (design/09 B.2; reuses the crew arc). */
  readonly activeArc?: BetrayalArc;
  /** True once flipped: LE turned them into a wire feeding heat (design/09 B.2). */
  readonly isWire?: boolean;
  /** A standing raise they're currently asking for (design/09 B.2 v1.1). */
  readonly pendingRaise?: RaiseAsk;
  /**
   * The last in-game week this official asked for a raise (design/13 F; Prompt 48).
   * `requestRaise` won't set a new ask within `RAISE_MIN_WEEKS_BETWEEN` weeks of it,
   * so an official can't nag every settlement. Absent = never asked (no cooldown).
   */
  readonly lastRaiseWeek?: number;
}

/**
 * A port whose official has been paid (design/09 B.1/A.3) — container stashes at
 * this port get the reduced seizure floor. `portId` matches a container stash's
 * `countryId`. `paidUntilHours` bounds a one-off port bribe (drifts/expires); a
 * standing customs chief leaves it absent (paid while they're on the payroll).
 */
export interface PaidPort {
  readonly portId: string;
  /** The reduced seizure % locked in for container stashes here, 0..1. */
  readonly seizurePct: number;
  readonly paidAtHours: number;
  /** In-game hours the payment lapses at; absent = standing (never expires). */
  readonly paidUntilHours?: number;
}

export interface Corruption {
  readonly officials: readonly OfficialTie[];
  /** Sum of current retainers across officials, $/wk (derived, kept in sync). */
  readonly payrollPerWeek: number;
  readonly paidPorts: readonly PaidPort[];
  /** Last in-game week the weekly payroll was settled (boundary bookkeeping). */
  readonly lastPayrollWeek: number;
}

/**
 * The loan-shark ledger — a capital SOURCE and the game's main early-game pressure
 * engine (design/10; Prompt 10 owns the interest curve and default ladder). MVP is
 * one loan at a time (design/10 §7): `lenderId === null` means no active loan.
 *
 * Invariant (guarantee #2, design/10 §4.2): offline settlement NEVER increases what
 * is owed and NEVER advances the ladder. Interest accrues only per in-game day
 * ACTUALLY PLAYED — the `debt-interest` tick step is active-only.
 */
export interface Debt {
  /** The lender this loan is from (`LenderId`), or `null` when there is no loan. */
  readonly lenderId: string | null;
  /** Principal borrowed, $ — fixed once borrowed; growth lands in `accruedInterest`. */
  readonly principal: number;
  /** Current weekly interest rate as a fraction (the vig raises it — design/10 §5). */
  readonly rate: number;
  /** Interest accrued to date, $ (kept separate so `principal` is a clean floor). */
  readonly accruedInterest: number;
  /** In-game day the soft due date falls on — consequences BEGIN here (design/10 §3). */
  readonly dueDay: number;
  /** A pledged stash/front id put up as collateral (design/10 §3). Absent = none. */
  readonly collateralRef?: string;
  /** Current default-ladder rung 0–5 (design/10 §5). 0 = in good standing. */
  readonly ladderRung: number;
  /** Interest accrues only while `active` AND the player is online (design/10 §4.2). */
  readonly active: boolean;
}

/**
 * A drug front on the books — product consigned by a country's PLUG (v23;
 * extends design/10's borrowing economy). A second, independent ledger beside
 * `Debt`: the package is already in a stash; what's owed is its marked-up
 * contract value in cash (dirty or clean — the plug takes street money), due on
 * a much shorter clock with a much shorter walk to the lethal end
 * (`engine/consignment.ts`). One front at a time; `countryId === null` means
 * none. The design/10 §4 guarantees hold verbatim: opt-in, offline-frozen,
 * telegraphed, terms shown in full.
 */
export interface Consignment {
  /** The plug country fronting the package, or `null` when there is no front. */
  readonly countryId: string | null;
  /** What was fronted (for prose/repossession; the units live in the stash). */
  readonly product: ProductId | null;
  readonly qty: number;
  /** $ owed at the fronted contract value × markup — fixed once taken. */
  readonly principal: number;
  /** Weekly interest rate as a fraction (compounds at `rate/7` per active day). */
  readonly rate: number;
  /** Interest accrued to date, $ (kept separate so `principal` is a clean floor). */
  readonly accruedInterest: number;
  /** In-game day the soft due date falls on — consequences BEGIN here. */
  readonly dueDay: number;
  /** The compressed ladder: 0 = good standing, 1 = warned, 2 = marked. */
  readonly ladderRung: number;
  /** Collector pressure clock while marked (mirrors `MarkedEnforcement`).
   * Cleared with the ledger the instant the balance hits zero. */
  readonly enforcement?: MarkedEnforcement;
  /** Interest accrues only while `active` AND the player is online (§4.2). */
  readonly active: boolean;
}

/** Per-run relationship layer over `world.rivals`. Prompt 08/12 flesh this out. */
export interface RivalState {
  /** Matches the `id` of a `world.rivals` entry. */
  readonly id: string;
  readonly tension: number;
  readonly toppled: boolean;
}

/**
 * A stateful turf war — a rival contesting a SPECIFIC country the player holds
 * (design "Turf Wars Between Countries"). Bound to a `(countryId, rivalId)` pair;
 * one war per country at a time. Escalates over ACTIVE play and is answered with
 * muscle + weapons + corruption + money (`engine/turfWar.ts`). Offline-frozen.
 */
export interface TurfWar {
  readonly id: string;
  /** The contested country — always one the player holds a stash in. */
  readonly countryId: string;
  /** The `world.rivals` id prosecuting the war. */
  readonly rivalId: string;
  /** How the rival fights it, flavored by archetype (config/turfWar.ts). */
  readonly kind: TurfWarKind;
  /** Who opened it — a rival raid, or the player going on the offensive. */
  readonly initiatedBy: 'rival' | 'player';
  /** In-game hour the war opened (for telegraph/age readouts). */
  readonly startedAtHours: number;
  /** 0–100 conflict pressure — grows unanswered, drops on won battles. At the
   * seize threshold a loss can push the player out of the country. */
  readonly pressure: number;
  /** Distinct battles lost in this war — the second guard on the terminal rung. */
  readonly lossCount: number;
  /** Whether the rival currently skims tribute from the country's income (set
   * after a lost battle, cleared on a win or a bought truce). */
  readonly tributeActive: boolean;
  /** Street rep this war has already paid out on won battles — clamps the total
   * at `WIN_REP_CAP_PER_WAR` (design/15 A3; v25). */
  readonly repEarned: number;
}

/**
 * A protection-turf claim (design/15 Workstream B; v26) — a country whose war
 * ended in the player's favor, now paying weekly DIRTY protection income into
 * its stash (`turf-income` tick step, ACTIVE-only). Created only by a won
 * resolution in `resolveBattle` — a bought truce never claims turf. Suspended
 * (not lost) while a new war contests the country; lapses for good if the last
 * stash there is sold or lost (the drip needs somewhere to land).
 */
export interface TurfClaim {
  /** The claimed country — held a stash when the war was won. */
  readonly countryId: string;
  /** In-game hour the claiming war was won (for age readouts). */
  readonly wonAtHours: number;
  /** How the turf was won: a defensive war fought off, or an offensive topple. */
  readonly source: 'defense' | 'topple';
}

/**
 * A queued return-hook: an event/choice waiting to be presented to the player
 * (e.g. on return from offline). Prompts 12/13 give these real payloads.
 */
export interface PendingChoice {
  readonly id: string;
  readonly kind: string;
  readonly summary: string;
  /** In-game hours at which it was queued (for ordering/expiry). */
  readonly createdAtHours: number;
  /**
   * The beat that queued this choice (Prompt 22). Lets the story-card presenter
   * resolve the scene via `cardForBeat` without parsing the id. Absent on plain
   * return-hooks (offline `settleOffline` allocations) that carry no card.
   */
  readonly beatId?: string;
  /**
   * A chained story card queued directly (a choice's `firesCard`; Prompt 22). The
   * presenter resolves it via `getCard`. Absent on beat-sourced / return-hook choices.
   */
  readonly cardId?: string;
}

/**
 * A live world price event (design/12 Item 6; Prompt 33): a temporary multiplier
 * laid over the drift board for one product across a `scope` of countries. It
 * lands at `peakMultiplier` (>1 shortage, <1 glut) and decays linearly back to 1
 * by `endHours`. Read at pricing time (`marketEventMultiplier`), so no per-tick
 * factor mutation is needed — the overlay is a pure function of the clock.
 */
export interface MarketEvent {
  readonly id: string;
  readonly product: ProductId;
  readonly scope: MarketEventScope;
  /** Region id (`Region`) or country id when `scope` isn't `world`; absent for world. */
  readonly scopeId?: string;
  readonly direction: MarketEventDirection;
  readonly magnitude: MarketEventMagnitude;
  /** Peak price multiplier at landing (>1 up, <1 down); decays to 1 by `endHours`. */
  readonly peakMultiplier: number;
  readonly startHours: number;
  readonly endHours: number;
}

/**
 * A news-ticker rumor heralding a possible MarketEvent (design/12 Item 6). Every
 * event is preceded by one, but only a `credible` rumor actually lands its event
 * (`RUMOR_TRUTH_RATE`) — the rest are fake intel pointing at nothing. `credible`
 * is engine bookkeeping the ticker NEVER reveals: telling truth from bluff is the
 * gamble. The line stays visible until `expiresAtHours` (outliving its landing).
 */
export interface Rumor {
  readonly id: string;
  readonly product: ProductId;
  readonly scope: MarketEventScope;
  readonly scopeId?: string;
  readonly direction: MarketEventDirection;
  readonly magnitude: MarketEventMagnitude;
  /** Whether the heralded event actually lands. Hidden from the UI (the bluff). */
  readonly credible: boolean;
  /** The ticker prose (built at post time so the UI stays pure text). */
  readonly headline: string;
  readonly postedAtHours: number;
  /** When the real event begins (credible only; ignored for a fake). */
  readonly landsAtHours: number;
  /** When the news line drops off the ticker. */
  readonly expiresAtHours: number;
}

/**
 * The crack the crew is holding to sell on the corners (design/12 Item 5;
 * Prompt 34). Cooking crack books its rocks here at the LOCAL crack price of the
 * moment (`bookedUnitPrice`, a units-weighted average across cooks), and the
 * street-sales tick (`street.ts`) drips them back as dirty cash over time. A
 * single global pool — the crew hustles wherever they are; proceeds land in the
 * home stash. Empty is `{ units: 0, bookedUnitPrice: 0 }`.
 */
export interface StreetStock {
  /** Rocks queued for the corners (fractional internally; floored where shown). */
  readonly units: number;
  /** Units-weighted booked crack price the drip sells each rock at, $. */
  readonly bookedUnitPrice: number;
}

/**
 * The money-mule wash queue — the batched dirty→clean converter (the money mules
 * who go bank to bank depositing under the $10k reporting threshold). Dirty cash
 * the player commits to laundering is pulled OUT of stashes and held here "with
 * the mules", who deposit it in sub-$10k batches over ONLINE time: the `wash-queue`
 * tick (`wash.ts`) drains `queuedDirty` at the mule throughput and lands clean cash
 * at `1 − WASH_CUT` (the mules/banks skim the rest). A bigger sum takes
 * proportionally longer — more money, more time. Empty is `{ queuedDirty: 0 }`.
 *
 * Frozen while offline, like every other tick system: a batch never clears while
 * the player is away, so absence neither launders nor loses (GDD §6). Queued cash
 * is counted at FACE VALUE in `netWorth` (it hasn't been skimmed yet), so
 * committing to the queue never reads as a loss — the cut is realized only as each
 * batch lands. NOT a replacement for fronts: fronts still mint clean passively;
 * the mules are the separate, dirty-consuming channel (they eat a cut for it).
 */
export interface WashQueue {
  /** Dirty cash pulled from stashes and mid-deposit with the mules, $. */
  readonly queuedDirty: number;
}

/**
 * The marked-debt collector clock (design/13 B3; Prompt 44). Present only while
 * rung 5's `DEBT_MARKED_FLAG` is up: `stage` counts collector hits already landed
 * (0 = the warning is out, nothing hit yet) and `nextAtHours` is the VISIBLE
 * in-game hour the next move lands at. Every hit is preceded by its warning;
 * repaying the loan to zero removes this whole record instantly. ACTIVE-only —
 * the clock only advances on online ticks, so absence freezes the collectors.
 */
export interface MarkedEnforcement {
  /** Collector hits already landed this mark (0 = warned, none landed). */
  readonly stage: number;
  /** In-game hours the next collector move lands at (the visible clock). */
  readonly nextAtHours: number;
}

/**
 * Peak trackers. Score banks from PEAK values the instant a run ends, so a
 * late-game wipe still records the height climbed to (design/01 §7). Lives on
 * state but is what `endgame.ts` (Prompt 11) banks to the persistent leaderboard.
 */
export interface HighScore {
  readonly peakNetWorth: number;
  readonly peakCleanCash: number;
  readonly peakEmpireSize: number;
}

export interface GameState {
  readonly schemaVersion: number;
  /** The seed this run was generated from (for display / replay). */
  readonly seed: string;
  /** Serialized RNG stream — restored on load so rolls resume byte-identically. */
  readonly rngState: RngState;
  /**
   * The balance tuning this run plays under (Prompt 26) — plain data, injected
   * at `createInitialState` (default = the v1 `DEFAULT_GAME_CONFIG`) and read
   * by every reducer/tick step, so alternate tunings need no code changes and a
   * save round-trips with its exact numbers.
   */
  readonly config: GameConfig;
  readonly world: World;
  readonly clock: Clock;
  /** Live per-location price drift for the deal loop (Prompt 04). */
  readonly markets: Markets;
  /**
   * Live world price events overlaying the drift board (design/12 Item 6; Prompt
   * 33) — temporary shortage/glut multipliers that decay back to baseline.
   */
  readonly marketEvents: readonly MarketEvent[];
  /** The news-ticker feed of rumors heralding events (some true, some fake). */
  readonly rumors: readonly Rumor[];
  /** Crack the crew is holding to move on the corners (design/12 Item 5; Prompt 34). */
  readonly streetStock: StreetStock;
  /**
   * Whether the arms broker intro has been paid — the arms trade's ONE gate, and
   * a pure money gate (design/12 Item 1; Prompt 35). `false` until bought.
   */
  readonly armsBroker: boolean;
  /** Live weapon-tier price/stock per arms-trading country (design/12 Item 1). */
  readonly armsMarkets: ArmsMarkets;
  /** Units held per weapon tier — the off-book arsenal (design/12 Item 1). */
  readonly armory: Armory;
  /** Safe, launderable money (design/01 §1). Dirty cash lives in `stashes`. */
  readonly cleanCash: number;
  /**
   * The money-mule wash queue (the batched dirty→clean converter). Dirty cash
   * committed to laundering, draining to clean over ONLINE time (wash.ts). Empty
   * on a fresh run and after a full wash. Frozen while away (GDD §6).
   */
  readonly wash: WashQueue;
  /**
   * Countries whose TRUE-SOURCE plug has been bought (Ideas2 §2; plugs.ts).
   * A pure money gate — never a time lock or progression flag (Ideas.md).
   */
  readonly plugs: readonly string[];
  readonly reputation: Reputation;
  readonly heat: number;
  /**
   * Repeated-pattern counters (design/13 B5.3; Prompt 44): `port:<countryId>` →
   * how recently/often that origin port has been run. Bumped on every shipment
   * launch, decayed over ACTIVE hours (`heatSources.ts`); a reuse inside the
   * window adds a DISCLOSED heat + interdiction-odds surcharge. Empty = no
   * recent pattern anywhere.
   */
  readonly recentUse: Readonly<Record<string, number>>;
  /**
   * The investigation window (design/13 B5.5; Prompt 44): present after a MAJOR
   * bust until this in-game hour. While open, heat decays slower and raid chance
   * runs a config'd multiplier — both disclosed when the window opens and on the
   * Heat screen. The clock only advances online, so the window burns ACTIVE
   * hours only (absent = no investigation).
   */
  readonly investigationUntilHours?: number;
  /**
   * The marked-debt collector clock (design/13 B3; Prompt 44). Present only
   * while `DEBT_MARKED_FLAG` is up; cleared instantly when the loan is repaid.
   */
  readonly enforcement?: MarkedEnforcement;
  /** "Lie low" mode: heat decays faster, laundering income slows (Prompt 05/07). */
  readonly lyingLow: boolean;
  /**
   * Highest LE tier already TELEGRAPHED to the player. Escalation fires only when
   * the live tier climbs above this, then advances it — so a crossing telegraphs
   * exactly once (design/07 §5). Drops back down as heat cools, re-arming.
   */
  readonly leTierAck: LeTier;
  /** Loose aggregate inventory; Prompt 06 locates units into `stashes`. */
  readonly inventory: Inventory;
  readonly stashes: readonly Stash[];
  /**
   * Cross-country cargo currently in flight (travel.ts, design/11 §3).
   * Resolved on ONLINE ticks only — frozen, never seized, while away (GDD §6).
   */
  readonly shipments: readonly Shipment[];
  readonly fronts: readonly Front[];
  /**
   * Grow-ops and drug factories — the production layer (Ideas2 item 3; Prompt 39).
   * Each turns ACTIVE time into product units in the home stash (`production.ts`).
   * A single array covers both kinds (the `kind` is on the config). Empty on a
   * fresh run and on a migrated pre-v13 save.
   */
  readonly productionOps: readonly ProductionOp[];
  /**
   * Owned vessels — boats bought outright as the late-game logistics money sink
   * (design/13 E; Prompt 47). Each operates a charter mode cut-free, discounts its
   * legs, and counts (its invested value) in `netWorth`. Empty on a fresh run and
   * on a migrated pre-v17 save.
   */
  readonly vessels: readonly Vessel[];
  readonly crew: readonly CrewMember[];
  /**
   * Last in-game week the crew payroll was settled (design/13 D; Prompt 46 — the
   * weekly-boundary bookkeeping, mirroring `Corruption.lastPayrollWeek`). `chargeWages`
   * charges `wagePerWeek × weeksElapsed` from clean cash on the weekly boundary and
   * advances this so the same week is never charged twice. Active-only, so wages
   * never draw while the player is away (GDD §6).
   */
  readonly lastCrewPayrollWeek: number;
  /**
   * Unpaid crew wages carried as ARREARS, $ (design/13 D; v20). When a weekly payroll
   * settles short (clean cash floors at zero), the remainder accrues here instead of
   * being forgiven — a real liability. The next settlement owes `crewBackWages +
   * this week's wages` and pays it down first. `0` on a fresh run and on a migrated
   * pre-v20 save (which starts square). No interest: the debt is the unpaid principal,
   * and loyalty consequences stay with the explicit pay/short-treatment levers.
   */
  readonly crewBackWages: number;
  readonly corruption: Corruption;
  readonly debt: Debt;
  /**
   * The drug-front ledger (v23) — product consigned by a plug, owed in cash on
   * a short clock (`engine/consignment.ts`). Independent of `debt`: a front can
   * run alongside a cash loan. Advanced on ACTIVE ticks only (GDD §6).
   */
  readonly consignment: Consignment;
  /**
   * How many loans this RUN has taken (design/10; Ideas2 item 4; Prompt 40). A
   * monotonic counter bumped by `borrow`, so the FIRST loan is the one live while
   * `loansTaken === 1` — used to bite the opening loan sooner (`FIRST_LOAN_VIG_DAYS`)
   * without a progression flag. Survives repayment (unlike `debt`, which resets),
   * so a second loan escalates on the normal, slower schedule.
   */
  readonly loansTaken: number;
  readonly rivals: readonly RivalState[];
  /**
   * Active turf wars — rivals contesting specific held countries (design "Turf
   * Wars Between Countries"). Empty on a fresh run and on a migrated pre-v22 save.
   * Ignited/escalated/resolved only on ACTIVE ticks (`turf-war` step), so absence
   * never opens a war or seizes a country (GDD §6).
   */
  readonly turfWars: readonly TurfWar[];
  /**
   * Protection-turf claims — countries won in a turf war, paying weekly dirty
   * income (design/15 B; v26). Empty on a fresh run and on a migrated pre-v26
   * save. The drip runs on ACTIVE ticks only (`turf-income` step), so absence
   * never earns (GDD §6).
   */
  readonly turfClaims: readonly TurfClaim[];
  /** Progression / onboarding gates, keyed by name. */
  readonly flags: Readonly<Record<string, boolean>>;
  /** Ids of narrative beats already fired (design/05 — fire-once bookkeeping). */
  readonly beatsFired: readonly string[];
  /** The return-hook queue (events/choices awaiting presentation). */
  readonly pendingChoices: readonly PendingChoice[];
  readonly highScore: HighScore;
  readonly runStatus: RunStatus;
  /**
   * Epoch-ms wall-clock stamp of the last active session, written by the store
   * (never by the engine). Lets the store compute `realHoursAway` for
   * `settleOffline` on the next load. `null` until first persisted.
   */
  readonly lastPlayedRealTime: number | null;
}

/** An inventory with every product present at zero. */
export function emptyInventory(): Inventory {
  const inv = {} as Record<ProductId, number>;
  for (const id of PRODUCT_IDS) inv[id] = 0;
  return inv;
}

/** No rocks on the corners — the run's starting (and fully-sold-through) street pool. */
export function emptyStreetStock(): StreetStock {
  return { units: 0, bookedUnitPrice: 0 };
}

/** An idle wash queue — the run's starting (and fully-cleared) mule queue. */
export function emptyWash(): WashQueue {
  return { queuedDirty: 0 };
}

/** An empty arsenal — the run's starting (and fully-sold-through) armory. */
export function emptyArmory(): Armory {
  const armory = {} as Record<WeaponTierId, number>;
  for (const id of WEAPON_TIER_IDS) armory[id] = 0;
  return armory;
}

/** A ledger with no active loan — the run's starting (and post-repayment) debt. */
export function emptyDebt(): Debt {
  return {
    lenderId: null,
    principal: 0,
    rate: 0,
    accruedInterest: 0,
    dueDay: 0,
    ladderRung: 0,
    active: false,
  };
}

/** Total owed = principal + accrued interest (what a full repayment must cover). */
export function debtOwed(debt: Debt): number {
  return debt.principal + debt.accruedInterest;
}

/** A ledger with no active front — the run's starting (and post-payoff) consignment. */
export function emptyConsignment(): Consignment {
  return {
    countryId: null,
    product: null,
    qty: 0,
    principal: 0,
    rate: 0,
    accruedInterest: 0,
    dueDay: 0,
    ladderRung: 0,
    active: false,
  };
}

/** Total owed on the drug front = principal + accrued interest. */
export function consignmentOwed(consignment: Consignment): number {
  return consignment.principal + consignment.accruedInterest;
}

/** Sum of dirty cash across all stashes (dirty cash is located — design/01 §1). */
export function totalDirtyCash(state: GameState): number {
  return state.stashes.reduce((sum, s) => sum + s.dirtyCash, 0);
}

/**
 * What a purchase AT a stash can draw on in total: the stash's dirty cash plus
 * the run's clean cash. Clean cash is spendable ANYWHERE money is a gate —
 * critically, a borrowed principal (which lands in clean cash, design/10) can
 * fund the shipment it was taken out for, not just fronts (the come-up hook).
 */
export function spendableAt(state: GameState, stash: Stash): number {
  return stash.dirtyCash + state.cleanCash;
}

/** How a charge at a stash splits across the two pools: located dirty cash
 * first, clean cash covering the shortfall. `null` when both together can't
 * cover it (the caller rejects without mutating). */
export interface ChargeSplit {
  readonly fromDirty: number;
  readonly fromClean: number;
}

/** Split a charge of `cost` at `stash` across dirty-then-clean cash, or `null`
 * if the combined pool falls short. Pure — appliers subtract each side. */
export function splitCharge(
  state: GameState,
  stash: Stash,
  cost: number,
): ChargeSplit | null {
  if (spendableAt(state, stash) < cost) return null;
  const fromDirty = Math.min(stash.dirtyCash, cost);
  return { fromDirty, fromClean: cost - fromDirty };
}

/**
 * Net worth = assets minus liabilities. Assets are all dirty cash (in stashes) +
 * clean cash + dirty in the wash queue + the fleet's invested value; the one
 * liability netted out is any OUTSTANDING LOAN balance (principal + accrued
 * interest). Basis of the peak high score, so a borrowed stake can't inflate the
 * banked score — the loan lands in clean cash but is cancelled by the debt it
 * creates, and net worth only climbs when you turn that stake into real value
 * (design/10). Queued cash counts at FACE VALUE — it's committed but not yet
 * skimmed — so sending the mules never dents net worth on its own; the `WASH_CUT`
 * is realized only as each batch lands (wash.ts). Owned vessels (design/13 E;
 * Prompt 47) count their invested value, so buying a boat moves capital into an
 * asset rather than reading as a loss (`vesselsValue`). Crew back-wages are a
 * liability too but are deliberately NOT netted here (design/13 D; they're a
 * settlement claim, not a debt against the score).
 */
export function netWorth(state: GameState): number {
  const loanBalance = state.debt.active ? debtOwed(state.debt) : 0;
  // The drug front nets out the same way (v23): the fronted product raised the
  // asset side, so the balance owed cancels it until the flip realizes a margin.
  const frontBalance = state.consignment.active ? consignmentOwed(state.consignment) : 0;
  return (
    totalDirtyCash(state) +
    state.cleanCash +
    state.wash.queuedDirty +
    vesselsValue(state) -
    loanBalance -
    frontBalance
  );
}

/** A rough empire-size composite (design/01 §7). Expanded in Prompt 11. */
export function empireSize(state: GameState): number {
  return state.stashes.length + state.fronts.length + state.crew.length;
}

/**
 * The `kind` of the self-run arrest interrupt (design/13 B4; Prompt 44), queued
 * by `travel.ts` when a shipment YOU helmed is interdicted. It presents as a
 * bond-or-sentence choice in the death-spiral style — consequential by nature:
 * post the disclosed bond (`travel.postBond`) or serve the disclosed sentence
 * (`clock.serveSentence`); either way the run continues.
 */
export const ARREST_CHOICE_KIND = 'arrest';

/**
 * The `kind` of the "call in a favor" interrupt (design/13 F; Prompt 48), queued
 * by `travel.ts` when an interdicted shipment could be pulled back by a payrolled
 * official. It presents as a call-them-or-let-it-go choice: pay the disclosed
 * favor fee + spend loyalty and the load survives (`travel.callFavor`), or decline
 * and take today's seizure (`travel.declineFavor`). Consequential by nature — the
 * held load must resolve through the explicit choice, never a silent dismissal.
 */
export const FAVOR_CHOICE_KIND = 'favor-offer';

/**
 * Whether dismissing this pending choice is CONSEQUENTIAL — it carries a story
 * card with real branches (`beatId`/`cardId`), or it is the arrest interrupt
 * (bond or sentence — design/13 B4) or the favor interrupt (call or let it go —
 * design/13 F), so clearing it would silently pick one. These present as interrupt
 * scenes (Prompt 22), are excluded from the Money feed, and survive
 * `dismissAllPendingChoices` (design/13 A5 guardrail: Clear all never silently
 * picks a consequential branch).
 */
export function isConsequentialChoice(choice: PendingChoice): boolean {
  return (
    choice.beatId !== undefined ||
    choice.cardId !== undefined ||
    choice.kind === ARREST_CHOICE_KIND ||
    choice.kind === FAVOR_CHOICE_KIND
  );
}

/**
 * Dismiss every SAFELY-dismissible pending choice at once (design/13 A5 — the
 * Money feed's "Clear all"). Pure; mirrors the single-dismiss default path exactly
 * (dismissal = the no-action default, a plain removal from the queue). Choices
 * whose dismissal is consequential (`isConsequentialChoice`) are kept untouched —
 * they resolve only through the story-card presenter's explicit choice.
 */
export function dismissAllPendingChoices(state: GameState): GameState {
  const kept = state.pendingChoices.filter(isConsequentialChoice);
  if (kept.length === state.pendingChoices.length) return state;
  return { ...state, pendingChoices: kept };
}

/**
 * Deterministically build the opening state for a run from `seed`.
 *
 * The run's RNG stream continues from where world generation left off, and its
 * snapshot is stored in `rngState` — so a save taken now and reloaded later
 * yields the exact same next deal roll (Prompt 03 acceptance).
 *
 * `config` injects the balance tuning (Prompt 26): the same seed under two
 * different tunings yields two different runs; the same seed under the same
 * tuning is byte-identical.
 */
export function createInitialState(
  seed: number | string,
  config: GameConfig = DEFAULT_GAME_CONFIG,
): GameState {
  const rng = createRng(seed);
  const world = generateWorld(rng, config);
  const country = world.startingCountry;

  const homeStash: Stash = {
    id: 'stash-home',
    name: 'Home Stash',
    countryId: country.id,
    type: STARTING_STASH_TYPE,
    level: 1,
    dirtyCash: country.startingCash,
    inventory: emptyInventory(),
  };

  const rivals: readonly RivalState[] = world.rivals.map((r) => ({
    id: r.id,
    tension: 0,
    toppled: false,
  }));

  const state: GameState = {
    schemaVersion: SCHEMA_VERSION,
    seed: world.seed,
    rngState: rng.getState(),
    config,
    world,
    clock: { hours: 0, day: 1, week: 1 },
    // Stock seeds draw from a dedicated fork — forking never consumes the main
    // stream, so pre-v11 saves' RNG snapshots stay byte-identical.
    markets: createInitialMarkets(rng.fork('market-stock'), config.markets),
    marketEvents: [],
    rumors: [],
    streetStock: emptyStreetStock(),
    armsBroker: false,
    // Arms stock seeds draw from a dedicated fork — forking never consumes the
    // main stream, so pre-Prompt-35 saves' RNG snapshots stay byte-identical.
    armsMarkets: createInitialArmsMarkets(rng.fork('arms-markets'), config.arms),
    armory: emptyArmory(),
    cleanCash: 0,
    wash: emptyWash(),
    plugs: [],
    reputation: { street: 0, business: 0, political: 0 },
    heat: country.heatBaseline,
    recentUse: {},
    lyingLow: false,
    // Acknowledge the opening tier so the baseline never self-telegraphs on tick 1.
    leTierAck: tierForHeat(country.heatBaseline, config.heat.HEAT_TIERS),
    inventory: emptyInventory(),
    stashes: [homeStash],
    shipments: [],
    fronts: [],
    productionOps: [],
    vessels: [],
    crew: [],
    lastCrewPayrollWeek: 1,
    crewBackWages: 0,
    corruption: { officials: [], payrollPerWeek: 0, paidPorts: [], lastPayrollWeek: 1 },
    debt: emptyDebt(),
    consignment: emptyConsignment(),
    loansTaken: 0,
    rivals,
    turfWars: [],
    turfClaims: [],
    flags: {},
    beatsFired: [],
    pendingChoices: [],
    highScore: {
      peakNetWorth: country.startingCash,
      peakCleanCash: 0,
      peakEmpireSize: 1,
    },
    runStatus: 'active',
    lastPlayedRealTime: null,
  };

  return state;
}

/**
 * Restore the run's live RNG from the persisted snapshot. Callers that consume
 * randomness must write the RNG's new state back with `withRngState` so the
 * stream never rewinds. (Reserved for later deal/heat/chaos prompts.)
 */
export function rngFor(state: GameState): Rng {
  return restoreRng(state.rngState);
}

/** Return a copy of `state` with the RNG snapshot advanced to `rng`. */
export function withRngState(state: GameState, rng: Rng): GameState {
  return { ...state, rngState: rng.getState() };
}

/**
 * The intent union — every player action the store can dispatch. The deal
 * variants (Prompt 04) are the first real actions; later prompts add bribe,
 * launder, borrow, … and their handler cases.
 */
export type Intent =
  | { readonly type: 'noop' }
  | BuyIntent
  | SellIntent
  | ConvertIntent
  | BuyPlugIntent
  | ShipIntent
  | LieLowIntent
  | ArmsIntent
  | UnlockArmsBrokerIntent;

/**
 * Pure reducer entry point: intent in -> new immutable state out. Never mutates
 * `state`. Deal intents delegate to `resolveDeal`, keeping only the new state;
 * callers that need the deal's scene key / fairness numbers call `resolveDeal`
 * directly (see `deals.ts`).
 */
export function applyIntent(state: GameState, intent: Intent): GameState {
  switch (intent.type) {
    case 'noop':
      return state;
    case 'buy':
    case 'sell':
      return resolveDeal(state, intent).state;
    case 'convert':
      return convert(state, intent).state;
    case 'buyPlug':
      return buyPlug(state, intent.countryId).state;
    case 'ship':
      return ship(state, intent).state;
    case 'lieLow':
      return setLieLow(state, intent.enabled);
    case 'buyArms':
    case 'sellArms':
      return resolveArmsDeal(state, intent).state;
    case 'unlockArmsBroker':
      return unlockArmsBroker(state).state;
  }
}
