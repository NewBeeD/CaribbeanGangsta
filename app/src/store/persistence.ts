/**
 * The save/load layer: local-first, cloud stubbed.
 *
 * `SaveStore` is the interface every caller (the game store) talks to, so a real
 * cloud backend can drop in later without touching them. `LocalSaveStore` is the
 * IndexedDB implementation (the source of truth on-device); `CloudSaveStore` is a
 * conforming stub for now.
 *
 * Saves are versioned envelopes: `{ schemaVersion, savedAt, state, … }`. On load
 * the envelope passes through `migrateEnvelope`, which upgrades older schemas via
 * the `MIGRATIONS` table or rejects (returns `null`) cleanly when it can't. The
 * whole `GameState` — including the serialized `rngState` — round-trips, so a
 * reloaded run produces the exact same next roll (Prompt 03 acceptance).
 *
 * NOTE: this is the store layer, not the engine — `Date.now()` is allowed here
 * (the engine stays wall-clock-free; the store stamps time and injects it).
 */

import {
  SCHEMA_VERSION,
  emptyArmory,
  emptyDebt,
  emptyInventory,
  emptyStreetStock,
  emptyWash,
  type Corruption,
  type CrewMember,
  type Debt,
  type GameState,
  type Inventory,
  type OfficialTie,
  type RunStatus,
  type Stash,
} from '@/engine/state';
import { createRng } from '@/engine/rng';
import { createInitialMarkets, type Markets } from '@/engine/deals';
import {
  ARMS_COUNTRY_IDS,
  createInitialArmsMarkets,
  type ArmsMarkets,
  type Armory,
} from '@/engine/arms';
import { COUNTRY_IDS } from '@/engine/config/countries';
import {
  hydrateLegacyWorld,
  hydrateWorldV11,
  type LegacyWorld,
  type WorldWithLegacyBoards,
} from '@/engine/world';
import { tierForHeat, type LeTier } from '@/engine/heat';
import { foldStashesOnePerSpot } from '@/engine/storage';
import { STARTING_STASH_TYPE } from '@/engine/config/stashes';
import { hydrateLegacyCrew } from '@/engine/crew';
import { hydrateLegacyOfficial } from '@/engine/corruption';
import { DEFAULT_GAME_CONFIG, type GameConfig } from '@/engine/config';

/** Lightweight listing of a saved slot (no full state payload). */
export interface SlotMeta {
  readonly slot: string;
  readonly schemaVersion: number;
  /** Epoch-ms when the slot was saved. */
  readonly savedAt: number;
  readonly seed: string;
  readonly runStatus: RunStatus;
  readonly day: number;
}

export interface SaveStore {
  save(slot: string, state: GameState): Promise<void>;
  load(slot: string): Promise<GameState | null>;
  list(): Promise<SlotMeta[]>;
  delete(slot: string): Promise<void>;
}

/** Thrown by the cloud stub until real sync is implemented. */
export class NotImplementedError extends Error {
  constructor(method: string) {
    super(`CloudSaveStore.${method}(): not implemented`);
    this.name = 'NotImplementedError';
  }
}

/** The on-disk record: slot metadata + the full state payload. */
interface SaveEnvelope extends SlotMeta {
  readonly state: GameState;
}

/**
 * Schema migrations. A migration for version N upgrades an envelope FROM N to
 * N+1. Add one whenever `SCHEMA_VERSION` bumps; a missing step makes the load
 * reject cleanly rather than hand back a malformed state.
 */
export type Migration = (env: SaveEnvelope) => SaveEnvelope;

export const MIGRATIONS: Readonly<Record<number, Migration>> = {
  // 1 → 2: seed live markets on saves written before the deal loop (Prompt 04).
  // (Seeded deterministically from the save's own seed; the 10→11 step below
  // re-seeds every pre-v11 save's markets again anyway.)
  1: (env) => {
    const legacy = env.state as GameState & { markets?: Markets };
    return {
      ...env,
      schemaVersion: 2,
      state: {
        ...legacy,
        markets:
          legacy.markets ?? createInitialMarkets(createRng(`${legacy.seed}::migrate-markets`)),
      },
    };
  },
  // 2 → 3: default the heat engine's fields on pre-Prompt-05 saves. Lie-low is
  // off; the acknowledged tier is derived from stored heat so a migrated run
  // never self-telegraphs an escalation it was already sitting inside.
  2: (env) => {
    const legacy = env.state as GameState & {
      lyingLow?: boolean;
      leTierAck?: LeTier;
    };
    return {
      ...env,
      schemaVersion: 3,
      state: {
        ...legacy,
        lyingLow: legacy.lyingLow ?? false,
        leTierAck: legacy.leTierAck ?? tierForHeat(legacy.heat),
      },
    };
  },
  // 3 → 4: give every pre-Prompt-06 stash a storage `type`. Legacy runs only ever
  // had the starting home stash, so default it to the floor archetype; a stash
  // that somehow already carries a type keeps it (idempotent). `guardCrewId` is
  // optional and simply stays absent (unguarded).
  3: (env) => {
    const legacy = env.state as GameState;
    return {
      ...env,
      schemaVersion: 4,
      state: {
        ...legacy,
        stashes: legacy.stashes.map((s) => {
          const stash = s as Stash & { type?: Stash['type'] };
          return stash.type ? stash : { ...stash, type: STARTING_STASH_TYPE };
        }),
      },
    };
  },
  // 4 → 5: expand each crew member from the old `{ id, name, loyalty }` stub to
  // the full relatedness model (traits/skills/agenda/memory/assignment — Prompt
  // 08). Pre-Prompt-08 runs never seeded crew, so this is usually an empty map;
  // any stub that exists is hydrated with neutral defaults preserving its loyalty.
  4: (env) => {
    const legacy = env.state as GameState & {
      crew?: readonly { id: string; name: string; loyalty: number }[];
    };
    return {
      ...env,
      schemaVersion: 5,
      state: {
        ...legacy,
        crew: (legacy.crew ?? []).map((c) => hydrateLegacyCrew(c) as CrewMember),
      },
    };
  },
  // 5 → 6: expand `corruption` to the full payroll model (Prompt 09). Pre-Prompt-09
  // runs never bought officials, so `officials` is usually empty; any legacy
  // `{ id, loyalty }` tie is hydrated to a full `OfficialTie`. `paidPorts` starts
  // empty and `lastPayrollWeek` is seeded from the stored clock so a migrated run
  // never back-charges retainers for weeks it was never on the payroll.
  5: (env) => {
    const legacy = env.state as GameState & {
      corruption?: {
        officials?: readonly { id: string; loyalty: number }[];
        payrollPerWeek?: number;
        paidPorts?: Corruption['paidPorts'];
        lastPayrollWeek?: number;
      };
    };
    const officials: readonly OfficialTie[] = (legacy.corruption?.officials ?? []).map(
      (o) => hydrateLegacyOfficial(o),
    );
    const corruption: Corruption = {
      officials,
      payrollPerWeek: officials.reduce((sum, o) => sum + o.retainerPerWeek, 0),
      paidPorts: legacy.corruption?.paidPorts ?? [],
      lastPayrollWeek: legacy.corruption?.lastPayrollWeek ?? legacy.clock.week,
    };
    return { ...env, schemaVersion: 6, state: { ...legacy, corruption } };
  },
  // 6 → 7: expand `debt` to the loan-shark ledger (Prompt 10). Pre-Prompt-10 runs
  // could never borrow (no `borrow` function existed), so any legacy debt is inert
  // — reset to a clean no-loan ledger with the soft due date seeded from the stored
  // clock so a migrated run is never mid-default. The old `interestRatePerHour`
  // stub field is dropped.
  6: (env) => {
    const legacy = env.state as GameState;
    const debt: Debt = { ...emptyDebt(), dueDay: legacy.clock.day };
    return { ...env, schemaVersion: 7, state: { ...legacy, debt } };
  },
  // 7 → 8: regional markets (design/11; Ideas2). The world grows the products/
  // suppliers/strain it never resolved (deterministically from the save's own
  // seed — `hydrateLegacyWorld`); every inventory gains the new product keys at
  // 0; `plugs` starts empty (no run could have bought one); and `markets` is
  // re-seeded fresh at base because the old shape was keyed by abstract route
  // legs, not countries — only transient drift factors are reset, never
  // holdings, cash, or the RNG stream.
  7: (env) => {
    const legacy = env.state as GameState & { plugs?: readonly string[] };
    const fill = (inv: Partial<Inventory> | undefined): Inventory => ({
      ...emptyInventory(),
      ...(inv ?? {}),
    });
    return {
      ...env,
      schemaVersion: 8,
      state: {
        ...legacy,
        world: hydrateLegacyWorld(legacy.world as unknown as LegacyWorld),
        markets: createInitialMarkets(createRng(`${legacy.seed}::migrate-markets`)),
        plugs: legacy.plugs ?? [],
        inventory: fill(legacy.inventory),
        stashes: legacy.stashes.map((s) => ({ ...s, inventory: fill(s.inventory) })),
      },
    };
  },
  // 8 → 9: the travel engine (Prompt 30). Pre-Prompt-30 runs could never launch
  // a shipment, so `shipments` simply starts empty — nothing in flight, nothing
  // owed, nothing to resolve.
  8: (env) => {
    const legacy = env.state as GameState & { shipments?: GameState['shipments'] };
    return {
      ...env,
      schemaVersion: 9,
      state: { ...legacy, shipments: legacy.shipments ?? [] },
    };
  },
  // 9 → 10: the injected balance config (Prompt 26). Every pre-v10 run was played
  // under the v1 numbers, so it simply carries the default `GameConfig` forward —
  // no in-run value changes.
  9: (env) => {
    const legacy = env.state as GameState & { config?: GameConfig };
    return {
      ...env,
      schemaVersion: 10,
      state: { ...legacy, config: legacy.config ?? DEFAULT_GAME_CONFIG },
    };
  },
  // 10 → 11: the ONE-PRICE economy + finite stock (design/12 Items 3/10; Prompt
  // 32). World price boards are re-resolved to the single-price shape and every
  // market re-seeded with a stock pool — both deterministically from the save's
  // own seed (migrating twice yields the same state). Boards/market factors are
  // transient WORLD data; holdings, cash, plugs, and the RNG stream are never
  // touched. The saved config's `products` table swaps to the v11 single-band
  // shape and gains the new `markets` group (any other saved tuning survives).
  10: (env) => {
    const legacy = env.state as GameState & {
      world: WorldWithLegacyBoards;
      config: GameConfig;
    };
    const config: GameConfig = {
      ...legacy.config,
      products: DEFAULT_GAME_CONFIG.products,
      markets: DEFAULT_GAME_CONFIG.markets,
    };
    return {
      ...env,
      schemaVersion: 11,
      state: {
        ...legacy,
        world: hydrateWorldV11(legacy.world),
        markets: createInitialMarkets(
          createRng(`${legacy.seed}::migrate-v11-stock`),
          config.markets,
        ),
        config,
      },
    };
  },
  // 11 → 12: the fixed 6-front roster + single-buy rule (Ideas2 item 1; Prompt
  // 37). Legacy fronts are remapped to the new technique ids by the table below
  // and given the stable per-type id `front-${type}`; if a save somehow holds
  // duplicates of a type (the old "infinite fronts" exploit), they FOLD to the
  // single highest-level survivor — migrations never seize, so nothing the player
  // earned is lost, and no refund is given for the folded copies. Levels are
  // preserved; cash and the RNG stream are untouched.
  11: (env) => {
    const legacy = env.state as GameState;
    const remap: Readonly<Record<string, string>> = {
      bar: 'cash-front',
      nightclub: 'shell-company',
      resort: 'real-estate',
      crypto: 'crypto',
    };
    const maxLevelByType = new Map<string, number>();
    for (const f of legacy.fronts) {
      const type = remap[f.type] ?? f.type;
      maxLevelByType.set(type, Math.max(maxLevelByType.get(type) ?? 0, f.level));
    }
    const fronts = [...maxLevelByType].map(([type, level]) => ({
      id: `front-${type}`,
      type,
      level,
    }));
    return { ...env, schemaVersion: 12, state: { ...legacy, fronts } };
  },
  // 12 → 13: the production layer — grow-ops, strains & drug factories (Ideas2
  // item 3; Prompt 39). A pre-v13 run never produced, so `productionOps` starts
  // empty and the saved config gains the `production` group from the default (any
  // other saved tuning survives). Nothing the player earned changes — no cash,
  // holdings, or RNG movement.
  12: (env) => {
    const legacy = env.state as GameState & { productionOps?: GameState['productionOps'] };
    const config: GameConfig = { ...legacy.config, production: DEFAULT_GAME_CONFIG.production };
    return {
      ...env,
      schemaVersion: 13,
      state: { ...legacy, productionOps: legacy.productionOps ?? [], config },
    };
  },
  // 13 → 14: integer inventory (design/13 A1; Prompt 43). Pre-v14 production
  // deposited fractional units straight into the home stash, which the deal
  // engine's integer-qty validation could never sell ("sell max" rejected). Every
  // fractional holding is rounded UP to the next whole unit — in the player's
  // favor, never a seizure (216.578 weed becomes 217). `ProductionOp.pendingYield`
  // starts absent (reads as 0). Cash, config, and the RNG stream are untouched.
  13: (env) => {
    const legacy = env.state as GameState;
    const ceilInventory = (inv: Inventory): Inventory => {
      const next = {} as Record<keyof Inventory, number>;
      for (const key of Object.keys(inv) as (keyof Inventory)[]) {
        next[key] = Math.ceil(inv[key]);
      }
      return next;
    };
    return {
      ...env,
      schemaVersion: 14,
      state: {
        ...legacy,
        inventory: ceilInventory(legacy.inventory),
        stashes: legacy.stashes.map((s) => ({ ...s, inventory: ceilInventory(s.inventory) })),
      },
    };
  },
  // 14 → 15: the heat & consequence rework (design/13 B; Prompt 44). New state
  // seeds empty (`recentUse` — no port has been run recently; no investigation,
  // no collector clock), and the saved config re-shapes: the transaction-heat
  // knobs are DROPPED (`deals.BUY_HEAT_FACTOR`, `arms.ARMS_BUY_HEAT_FACTOR`,
  // `arms.ARMS_CONFLICT_HEAT_MULT` — transacting is no longer hot) and the new
  // six-source / marked-enforcement / arrest knobs (and the `leanedOn` loyalty
  // base) backfill from the default — any other saved tuning survives. Nothing
  // the player holds changes: no cash, holdings, or RNG movement (and B2 only
  // NARROWS future seizures — a migration never takes anything).
  14: (env) => {
    const legacy = env.state as GameState & { recentUse?: GameState['recentUse'] };
    const savedDeals = legacy.config.deals as GameConfig['deals'] & {
      BUY_HEAT_FACTOR?: number;
    };
    const { BUY_HEAT_FACTOR: _buyHeat, ...deals } = savedDeals;
    const savedArms = legacy.config.arms as GameConfig['arms'] & {
      ARMS_BUY_HEAT_FACTOR?: number;
      ARMS_CONFLICT_HEAT_MULT?: number;
    };
    const { ARMS_BUY_HEAT_FACTOR: _armsBuy, ARMS_CONFLICT_HEAT_MULT: _conflict, ...arms } =
      savedArms;
    const config: GameConfig = {
      ...legacy.config,
      deals,
      arms,
      // Defaults FIRST so the new knobs land; the save's own tuning wins on top.
      heat: { ...DEFAULT_GAME_CONFIG.heat, ...legacy.config.heat },
      lenders: { ...DEFAULT_GAME_CONFIG.lenders, ...legacy.config.lenders },
      transport: { ...DEFAULT_GAME_CONFIG.transport, ...legacy.config.transport },
      crew: {
        ...DEFAULT_GAME_CONFIG.crew,
        ...legacy.config.crew,
        LOYALTY_EVENT_BASE: {
          ...DEFAULT_GAME_CONFIG.crew.LOYALTY_EVENT_BASE,
          ...legacy.config.crew.LOYALTY_EVENT_BASE,
        },
      },
    };
    return {
      ...env,
      schemaVersion: 15,
      state: { ...legacy, config, recentUse: legacy.recentUse ?? {} },
    };
  },
  // 15 → 16: crew expansion + lieutenant span-of-control (design/13 D; Prompt 46).
  // The single `assignment.kind === 'production'` slot becomes `productionOpIds`
  // (up to 2 ops per lieutenant): a legacy production assignment MOVES into the new
  // list and its `assignment` idles — so a legacy lieutenant keeps their one op and
  // gains a free second slot. Every other member gets an empty list. Weekly crew
  // wages (`chargeWages`) get `lastCrewPayrollWeek` seeded from the stored clock so a
  // migrated run never back-charges, and the config gains `crew.LIEUTENANT_MAX_
  // PRODUCTION_OPS` from the default (any other saved crew tuning survives). The
  // bigger archetype roster is pure config CONTENT — new candidates just appear as
  // hireable. Nothing owned changes: no cash, holdings, or RNG movement.
  15: (env) => {
    const legacy = env.state as GameState;
    const crew: readonly CrewMember[] = legacy.crew.map((c) => {
      const existing = (c as CrewMember & { productionOpIds?: readonly string[] })
        .productionOpIds;
      if (c.assignment.kind === 'production') {
        const opId = c.assignment.targetId;
        return {
          ...c,
          assignment: { kind: 'idle' as const },
          productionOpIds: opId ? [opId] : (existing ?? []),
        };
      }
      return { ...c, productionOpIds: existing ?? [] };
    });
    const config: GameConfig = {
      ...legacy.config,
      crew: { ...DEFAULT_GAME_CONFIG.crew, ...legacy.config.crew },
    };
    return {
      ...env,
      schemaVersion: 16,
      state: {
        ...legacy,
        crew,
        config,
        lastCrewPayrollWeek: legacy.clock.week,
      },
    };
  },
  // 16 → 17: owned vessels — the late-game logistics money sink (design/13 E;
  // Prompt 47). A pre-v17 run could never buy a vessel, so `vessels` starts empty
  // and the saved config gains the `vessels` group from the default. The two new
  // CHARTER modes (`container-ship`, `semi-sub`) are open-access CONTENT — every
  // mode is offered from minute one — so the `TRANSPORTS` table swaps to the
  // default (which carries them and the retuned go-fast owner cut), and the courier
  // cut retune lands too; every other transport scalar the save carried is
  // preserved. Nothing the player earned changes — no cash, holdings, or RNG.
  16: (env) => {
    const legacy = env.state as GameState & { vessels?: GameState['vessels'] };
    const config: GameConfig = {
      ...legacy.config,
      vessels: DEFAULT_GAME_CONFIG.vessels,
      transport: {
        ...legacy.config.transport,
        TRANSPORTS: DEFAULT_GAME_CONFIG.transport.TRANSPORTS,
        COURIER_CUT_PCT: DEFAULT_GAME_CONFIG.transport.COURIER_CUT_PCT,
      },
    };
    return {
      ...env,
      schemaVersion: 17,
      state: { ...legacy, vessels: legacy.vessels ?? [], config },
    };
  },
  // 17 → 18: corruption v2 — raise caps, ports everywhere, interventions
  // (design/13 F; Prompt 48). The saved `config.corruption` gains the raise
  // cap/ceiling/cooldown, major-port tiering, favor, and massive-shipment surcharge
  // knobs from the default (any other saved corruption tuning survives). The new
  // per-tie `lastRaiseWeek` and per-shipment `favorPending` are absent-is-safe
  // optionals — nothing to seed. Nothing the player earned changes: no cash,
  // holdings, officials, or RNG movement.
  17: (env) => {
    const legacy = env.state as GameState;
    const config: GameConfig = {
      ...legacy.config,
      corruption: { ...DEFAULT_GAME_CONFIG.corruption, ...legacy.config.corruption },
    };
    return { ...env, schemaVersion: 18, state: { ...legacy, config } };
  },
  // 18 → 19: the stash upgrade model — one stash per spot, LEVELS for space
  // (design/13 G; Prompt 49). The saved `config.stashes` gains the level knobs
  // (`STASH_MAX_LEVEL`, `STASH_CAPACITY_GROWTH`) from the default FIRST (any other
  // saved stash tuning wins on top), then `foldStashesOnePerSpot` collapses every
  // legacy stacked (country, type) spot into a single stash: inventories and dirty
  // cash merged unit-for-unit and dollar-for-dollar, the survivor's level rounded UP
  // so its capacity holds at least the folded stashes' combined capacity, and
  // production/guard/collateral references re-pointed to the survivor id. The fold
  // rounds EVERY quantity in the player's favor — units, dirty cash, and total
  // capacity never decrease (property-tested). No cash created or destroyed, no RNG
  // movement; a save already holding one stash per spot folds to itself (idempotent).
  18: (env) => {
    const legacy = env.state as GameState;
    const config: GameConfig = {
      ...legacy.config,
      stashes: { ...DEFAULT_GAME_CONFIG.stashes, ...legacy.config.stashes },
    };
    const folded = foldStashesOnePerSpot({ ...legacy, config });
    return { ...env, schemaVersion: 19, state: folded };
  },
  // 19 → 20: crew back-wages accrual (design/13 D). A weekly payroll settled short now
  // carries its unpaid remainder as `crewBackWages` instead of forgiving it. A pre-v20
  // run never tracked this, so it starts SQUARE — seed `crewBackWages: 0`. Nothing owned
  // changes: no cash, holdings, config, or RNG movement (a pure additive liability field).
  19: (env) => {
    const legacy = env.state as GameState & { crewBackWages?: number };
    return {
      ...env,
      schemaVersion: 20,
      state: { ...legacy, crewBackWages: legacy.crewBackWages ?? 0 },
    };
  },
  // 20 → 21: escalating TERRITORY gates (user request — expansion gets harder as the
  // empire grows). The saved `config.territory` gains five knobs from the default
  // FIRST (any other saved territory tuning wins on top): the scaling crew requirement
  // (`TERRITORY_COUNTRIES_PER_LIEUTENANT`), the expansion cooldown
  // (`TERRITORY_EXPANSION_COOLDOWN_HOURS`), the heat ceiling
  // (`TERRITORY_MAX_HEAT_TO_EXPAND`), and the cross-region net-worth floor
  // (`TERRITORY_CAPITAL_FLOOR_BASE` + `_PER_DISTANCE`). Every gate applies only to
  // OPENING a new country and is derived from existing state (no new state field).
  // Nothing the player earned changes: no cash, holdings, or RNG movement.
  20: (env) => {
    const legacy = env.state as GameState;
    const config: GameConfig = {
      ...legacy.config,
      territory: { ...DEFAULT_GAME_CONFIG.territory, ...legacy.config.territory },
    };
    return { ...env, schemaVersion: 21, state: { ...legacy, config } };
  },
};

/**
 * Fill fields ADDED to v11 IN PLACE after Prompt 32 (design/12 workstreams B–D
 * extend the v11 shape without bumping the schema — state.ts SCHEMA_VERSION note).
 * A save written at v11 by an earlier build lacks them, so a same-version load
 * skips the migration chain entirely; default the transient world data to empty
 * here so nothing lands on `undefined`. Never touches player holdings.
 *  - Prompt 33: `marketEvents`, `rumors` (world price events & the rumor ticker).
 *  - Prompt 34: `streetStock` (crack the crew is holding for the corners).
 *  - Prompt 35: `armsBroker`, `armsMarkets`, `armory` (the arms trade — Item 1).
 *    Arms markets re-seed deterministically from the save's own seed (transient
 *    world data); the broker stays locked and the arsenal empty (never money).
 *  - design/12 Item 9 (more countries): a save written before the roster grew
 *    lacks `markets`/`armsMarkets` entries for the new countries, which would
 *    throw at pricing time. Missing countries are seeded fresh (deterministically
 *    from the save's own seed) and MERGED UNDER the existing ones, so the save's
 *    live drift/stock for countries it already knew is preserved untouched.
 *  - Prompt 40 (Ideas2 item 4): `loansTaken` — the run's loan counter. A pre-P40
 *    save that carried an active loan is treated as being on its first loan (`1`);
 *    otherwise it starts at `0`. Never touches cash, the ledger, or the RNG.
 *  - Money-mule wash queue: `wash` — the batched dirty→clean converter's queue. A
 *    save written before it lacks the field; default it to an empty queue (no cash
 *    in flight), never touching player holdings.
 */
function normalizeState(state: GameState): GameState {
  const s = state as GameState & {
    marketEvents?: GameState['marketEvents'];
    rumors?: GameState['rumors'];
    streetStock?: GameState['streetStock'];
    armsBroker?: boolean;
    armsMarkets?: ArmsMarkets;
    armory?: Armory;
    loansTaken?: number;
    wash?: GameState['wash'];
    productionOps?: GameState['productionOps'];
    vessels?: GameState['vessels'];
  };
  // A v11 save written before Prompt 35 carries a `config` without the `arms`
  // group; the arms engine reads `config.arms`, so patch it in from the default
  // (any other saved tuning survives). A prior build with the group is untouched.
  // Prompt 38 (Ideas2 item 2) added `heat.PAYROLLED_COP_DECAY_MULTIPLIER` (and
  // dropped the two bribe knobs); a save written before it lacks the new knob,
  // which `decayHeat` reads — patch it in from the default so decay never reads
  // `undefined` (the dropped knobs are harmless extra data, left untouched).
  // Prompt 41 (Ideas2 item 5) added the `territory` config group (reach cost,
  // vulnerability window, consolidation hold, crew gate). A save written before it
  // lacks the group, which the territory engine reads — patch it in from the
  // default so nothing reads `undefined` (an in-place v12 extension, no schema bump).
  // The B4 sentence rework added `transport.ARREST_SENTENCE_HOURS`, which
  // `serveSentence` reads — a v15 save written before it gets the default
  // patched in the same way (an in-place v15 extension, no schema bump).
  const legacyConfig = s.config as GameConfig & {
    arms?: unknown;
    territory?: unknown;
    production?: unknown;
    vessels?: unknown;
    heat?: { PAYROLLED_COP_DECAY_MULTIPLIER?: number };
    transport?: { ARREST_SENTENCE_HOURS?: number };
  };
  const needsArms = legacyConfig.arms === undefined;
  const needsTerritory = legacyConfig.territory === undefined;
  const needsProduction = legacyConfig.production === undefined;
  const needsVessels = legacyConfig.vessels === undefined;
  const needsCopDecay = legacyConfig.heat?.PAYROLLED_COP_DECAY_MULTIPLIER === undefined;
  const needsSentence = legacyConfig.transport?.ARREST_SENTENCE_HOURS === undefined;
  const config: GameConfig =
    needsArms || needsTerritory || needsProduction || needsVessels || needsCopDecay || needsSentence
      ? {
          ...s.config,
          ...(needsArms ? { arms: DEFAULT_GAME_CONFIG.arms } : {}),
          ...(needsTerritory ? { territory: DEFAULT_GAME_CONFIG.territory } : {}),
          ...(needsProduction ? { production: DEFAULT_GAME_CONFIG.production } : {}),
          ...(needsVessels ? { vessels: DEFAULT_GAME_CONFIG.vessels } : {}),
          ...(needsCopDecay
            ? {
                heat: {
                  ...s.config.heat,
                  PAYROLLED_COP_DECAY_MULTIPLIER:
                    DEFAULT_GAME_CONFIG.heat.PAYROLLED_COP_DECAY_MULTIPLIER,
                },
              }
            : {}),
          ...(needsSentence
            ? {
                transport: {
                  ...s.config.transport,
                  ARREST_SENTENCE_HOURS:
                    DEFAULT_GAME_CONFIG.transport.ARREST_SENTENCE_HOURS,
                },
              }
            : {}),
        }
      : s.config;

  // Backfill drug/arms markets for any country the roster has since gained (Item 9).
  const missingMarkets = COUNTRY_IDS.some((id) => s.markets?.[id] === undefined);
  const missingArms =
    s.armsMarkets !== undefined &&
    ARMS_COUNTRY_IDS.some((id) => s.armsMarkets?.[id] === undefined);

  if (
    s.marketEvents &&
    s.rumors &&
    s.streetStock &&
    s.armsMarkets &&
    s.armory &&
    s.armsBroker !== undefined &&
    s.loansTaken !== undefined &&
    s.wash !== undefined &&
    s.productionOps !== undefined &&
    s.vessels !== undefined &&
    config === s.config &&
    !missingMarkets &&
    !missingArms
  ) {
    return state; // already current-shaped
  }

  // Seed FULL fresh tables, then let the save's own entries win the merge —
  // new countries get a fresh pool; known countries keep their live drift/stock.
  const markets: Markets = missingMarkets
    ? {
        ...createInitialMarkets(createRng(`${state.seed}::backfill-markets`), config.markets),
        ...(s.markets ?? {}),
      }
    : state.markets;
  const armsMarkets: ArmsMarkets =
    s.armsMarkets === undefined
      ? createInitialArmsMarkets(createRng(`${state.seed}::backfill-arms`), config.arms)
      : missingArms
        ? {
            ...createInitialArmsMarkets(
              createRng(`${state.seed}::backfill-arms-countries`),
              config.arms,
            ),
            ...s.armsMarkets,
          }
        : s.armsMarkets;

  return {
    ...state,
    config,
    markets,
    marketEvents: s.marketEvents ?? [],
    rumors: s.rumors ?? [],
    streetStock: s.streetStock ?? emptyStreetStock(),
    armsBroker: s.armsBroker ?? false,
    armsMarkets,
    armory: s.armory ?? emptyArmory(),
    loansTaken: s.loansTaken ?? (state.debt.active ? 1 : 0),
    wash: s.wash ?? emptyWash(),
    productionOps: s.productionOps ?? [],
    vessels: s.vessels ?? [],
  };
}

/**
 * Bring a stored envelope up to the current schema, or return `null` if it
 * can't be (unknown future version, or a missing migration step).
 */
export function migrateEnvelope(env: SaveEnvelope): GameState | null {
  if (env.schemaVersion > SCHEMA_VERSION) return null; // can't downgrade a newer save
  let current = env;
  while (current.schemaVersion < SCHEMA_VERSION) {
    const step = MIGRATIONS[current.schemaVersion];
    if (!step) return null; // gap in the migration chain — reject cleanly
    const next = step(current);
    if (next.schemaVersion <= current.schemaVersion) {
      throw new Error(`migration ${current.schemaVersion} did not advance schemaVersion`);
    }
    current = next;
  }
  // Backfill any fields added to the CURRENT schema in place (no version bump).
  return normalizeState(current.state);
}

// --- IndexedDB LocalSaveStore ------------------------------------------------

const DB_NAME = 'caribbean-gangsta';
const DB_VERSION = 1;
const STORE_NAME = 'saves';

export interface LocalSaveStoreOptions {
  /** Injectable IndexedDB factory (tests pass a fake). Defaults to global. */
  readonly factory?: IDBFactory;
  /** Injectable clock for `savedAt`. Defaults to `Date.now`. */
  readonly now?: () => number;
}

/** Local-first, on-device save store backed by IndexedDB. */
export class LocalSaveStore implements SaveStore {
  private readonly factory: IDBFactory;
  private readonly now: () => number;
  private dbPromise: Promise<IDBDatabase> | null = null;

  constructor(options: LocalSaveStoreOptions = {}) {
    const factory = options.factory ?? globalThis.indexedDB;
    if (!factory) {
      throw new Error('LocalSaveStore: no IndexedDB available (pass options.factory)');
    }
    this.factory = factory;
    this.now = options.now ?? Date.now;
  }

  private openDb(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const req = this.factory.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'slot' });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return this.dbPromise;
  }

  private async tx<T>(
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode);
      const req = run(transaction.objectStore(STORE_NAME));
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async save(slot: string, state: GameState): Promise<void> {
    const envelope: SaveEnvelope = {
      slot,
      schemaVersion: state.schemaVersion,
      savedAt: this.now(),
      seed: state.seed,
      runStatus: state.runStatus,
      day: state.clock.day,
      state,
    };
    await this.tx('readwrite', (store) => store.put(envelope));
  }

  async load(slot: string): Promise<GameState | null> {
    const env = await this.tx<SaveEnvelope | undefined>('readonly', (store) =>
      store.get(slot),
    );
    if (!env) return null;
    return migrateEnvelope(env);
  }

  async list(): Promise<SlotMeta[]> {
    const envs = await this.tx<SaveEnvelope[]>('readonly', (store) => store.getAll());
    return envs
      .map(({ slot, schemaVersion, savedAt, seed, runStatus, day }) => ({
        slot,
        schemaVersion,
        savedAt,
        seed,
        runStatus,
        day,
      }))
      .sort((a, b) => b.savedAt - a.savedAt);
  }

  async delete(slot: string): Promise<void> {
    await this.tx('readwrite', (store) => store.delete(slot));
  }
}

// --- CloudSaveStore stub ------------------------------------------------------

/**
 * Conforming placeholder for future cloud sync. Reads no-op (nothing in the
 * cloud yet); writes throw so a miswired caller fails loudly rather than
 * silently believing it synced.
 */
export class CloudSaveStore implements SaveStore {
  save(_slot: string, _state: GameState): Promise<void> {
    return Promise.reject(new NotImplementedError('save'));
  }
  load(_slot: string): Promise<GameState | null> {
    return Promise.resolve(null);
  }
  list(): Promise<SlotMeta[]> {
    return Promise.resolve([]);
  }
  delete(_slot: string): Promise<void> {
    return Promise.reject(new NotImplementedError('delete'));
  }
}
