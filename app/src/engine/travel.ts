/**
 * Travel, transports & couriers — moving product between countries as a
 * PRICED, RISKY, READABLE decision (design/11 §3; Ideas2 §1/§3; Prompt 30).
 *
 * The shape of the decision: pick a mode (config/transport.ts — all buyable
 * from minute one, cash is the only gate, Ideas.md), pay the leg's cost, see
 * the EXACT interdiction odds before committing, and choose between making the
 * run yourself or consigning it to crew for a cut — extra escorts buy the odds
 * down. This supersedes the free/instant `storage.moveProduct` path for
 * cross-country moves; same-country moves stay instant and free.
 *
 * The fairness law (design/01 §0.3; GDD §8): `interdictionChance` produces the
 * number shown on the quote, it is snapshotted onto the launched shipment, and
 * `travelStep` rolls ONE draw against exactly that number on arrival. No
 * hidden modifier is ever applied after the odds are displayed.
 *
 * Solo vs consigned (Ideas2 §1): with no couriers you make the run — no cuts,
 * but an interdiction lands the full bust-heat spike on YOU. With couriers,
 * each takes a disclosed % of the cargo's sell value; each ADDITIONAL escort
 * strictly lowers the displayed odds. A courier mid-betrayal-arc (design/02 §4
 * — always telegraphed, never a hidden roll) skims a DISCLOSED number of units
 * on arrival; the quote shows it before you hand them the load.
 *
 * Offline-frozen (GDD §6): `travelStep` is registered ACTIVE-only in clock.ts.
 * Shipments never resolve, arrive, or get seized while the player is away —
 * in-flight cargo is frozen, never lost offline.
 *
 * Purity/determinism (prompts/README.md): pure functions, immutable state in →
 * new state out, no `Math.random`, no wall clock. The only randomness is the
 * arrival interdiction roll, drawn from the run's serialized `state.rngState`.
 */

import { restoreRng } from './rng';
import {
  REGION_DISTANCE,
  findCountry,
  type CountryConfig,
  type ProductId,
} from './config/countries';
import { getProduct } from './config/products';
import { getTransport, type TransportId } from './config/transport';
import { getMarketPrice } from './deals';
import { effectiveCapacity } from './storage';
import { addHeat } from './heat';
import {
  bumpRecentUse,
  maybeOpenInvestigation,
  portUseKey,
  recentUseOf,
} from './heatSources';
import {
  ARREST_CHOICE_KIND,
  netWorth,
  splitCharge,
  type CrewMember,
  type GameState,
  type Inventory,
  type PendingChoice,
  type Stash,
} from './state';

// --- The shipment record (lives on state; schema v9) ---------------------------

/** An in-flight consignment. Frozen while offline; resolved on ONLINE ticks. */
export interface Shipment {
  readonly id: string;
  readonly product: ProductId;
  readonly qty: number;
  readonly fromStashId: string;
  readonly toStashId: string;
  readonly mode: TransportId;
  /** Crew riding along (empty = a solo run — you carried it yourself). */
  readonly courierIds: readonly string[];
  readonly departedAtHours: number;
  /** In-game hours the leg completes at (resolves on the first ONLINE tick past it). */
  readonly arrivesAtHours: number;
  /**
   * The interdiction odds DISPLAYED at launch — snapshotted so the number
   * `travelStep` rolls against is byte-identical to the one quoted (fairness).
   */
  readonly interdictionChance: number;
  /** Disclosed units skimmed on arrival by arc-active couriers (telegraphed). */
  readonly skimUnits: number;
  /**
   * True once the interdiction roll has been SURVIVED but delivery is deferred
   * (the destination is full — the load waits offshore). The displayed odds
   * are rolled exactly once; a waiting load is never re-rolled (fairness law).
   */
  readonly cleared?: boolean;
}

export interface ShipIntent {
  readonly type: 'ship';
  readonly product: ProductId;
  readonly qty: number;
  readonly fromStashId: string;
  readonly toStashId: string;
  readonly mode: TransportId;
  /** Crew consignment (Ideas2 §1): who rides along / sells on arrival. */
  readonly courierIds?: readonly string[];
}

export type ShipRejectReason =
  | 'invalid-qty'
  | 'no-stash'
  /** Same-country moves stay on the instant/free `storage.moveProduct` path. */
  | 'same-country'
  | 'over-cargo-cap'
  | 'insufficient-inventory'
  | 'insufficient-funds'
  /** A courier id that names nobody on the crew. */
  | 'no-courier'
  | 'courier-not-idle';

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function findStash(state: GameState, id: string): Stash | null {
  return state.stashes.find((s) => s.id === id) ?? null;
}

function withStash(state: GameState, next: Stash): GameState {
  return {
    ...state,
    stashes: state.stashes.map((s) => (s.id === next.id ? next : s)),
  };
}

function adjustInventory(inv: Inventory, product: ProductId, delta: number): Inventory {
  return { ...inv, [product]: (inv[product] ?? 0) + delta };
}

function stashUnits(stash: Stash): number {
  return Object.values(stash.inventory).reduce((sum, n) => sum + n, 0);
}

/** The leg's REGION_DISTANCE, floored so cross-country hops are never free. */
function legDistance(from: CountryConfig, to: CountryConfig, minLeg: number): number {
  return Math.max(REGION_DISTANCE[from.region][to.region], minLeg);
}

/** Whether a country's port is currently paid (design/09 A.3; corruption.ts). */
function isPortPaid(state: GameState, countryId: string): boolean {
  return state.corruption.paidPorts.some(
    (p) =>
      p.portId === countryId &&
      (p.paidUntilHours === undefined || p.paidUntilHours > state.clock.hours),
  );
}

function couriersOf(state: GameState, intent: ShipIntent): readonly CrewMember[] {
  return (intent.courierIds ?? []).flatMap((id) => {
    const npc = state.crew.find((c) => c.id === id);
    return npc ? [npc] : [];
  });
}

// --- The displayed odds (THE number rolled — fairness law) ---------------------

/**
 * The interdiction probability for this shipment: `f(mode baseRisk, leg
 * distance, cargo heat, destination country risk, port protection, paid
 * ports)` clamped into the interdiction window, then reduced multiplicatively
 * per ESCORT (each courier beyond the first) so added security ALWAYS shows in
 * the number (design/11 §3). This is exactly the number `quoteShipment`
 * displays and `travelStep` rolls against. Returns 0 for unknown stashes or
 * countries (`ship` rejects those without rolling anything).
 */
export function interdictionChance(state: GameState, intent: ShipIntent): number {
  const from = findStash(state, intent.fromStashId);
  const to = findStash(state, intent.toStashId);
  if (!from || !to) return 0;
  const fromCountry = findCountry(from.countryId);
  const toCountry = findCountry(to.countryId);
  if (!fromCountry || !toCountry) return 0;

  const T = state.config.transport;
  const mode = getTransport(intent.mode, T.TRANSPORTS);
  const dist = legDistance(fromCountry, toCountry, T.MIN_LEG_DISTANCE);
  const cargoHeat =
    getProduct(intent.product, state.config.products.PRODUCTS).heatPerUnit * intent.qty;
  const cargoHeatN = clamp(cargoHeat / T.CARGO_HEAT_FULL_RISK, 0, 1);
  const paid = isPortPaid(state, to.countryId) || isPortPaid(state, from.countryId);

  const raw =
    T.INTERDICTION_BASE +
    mode.baseRisk * T.MODE_RISK_WEIGHT +
    dist * T.DISTANCE_RISK_WEIGHT +
    cargoHeatN * T.CARGO_HEAT_WEIGHT +
    toCountry.risk * T.DEST_RISK_WEIGHT -
    toCountry.portProtectionBaseline * T.PORT_PROTECTION_WEIGHT -
    (paid ? T.PAID_PORT_RELIEF : 0) +
    // Repeated patterns (design/13 B5.3): re-running the same origin port inside
    // the decay window adds a DISCLOSED odds surcharge — it lands here, INSIDE
    // the number the quote shows and arrival rolls (shown = rolled).
    patternOddsSurcharge(state, intent);

  const clamped = clamp(raw, T.INTERDICTION_MIN, T.INTERDICTION_MAX);
  const escorts = Math.max(0, (intent.courierIds?.length ?? 0) - 1);
  return clamped * Math.pow(1 - T.ESCORT_ODDS_REDUCTION, escorts);
}

// --- Shipment heat & pattern surcharges (design/13 B5.1/B5.3; Prompt 44) -------

/** The extra interdiction odds from recent reuse of the origin port (disclosed). */
export function patternOddsSurcharge(state: GameState, intent: ShipIntent): number {
  const from = findStash(state, intent.fromStashId);
  if (!from) return 0;
  return (
    recentUseOf(state, portUseKey(from.countryId)) * state.config.heat.PATTERN_ODDS_PER_USE
  );
}

/** The extra launch heat from recent reuse of the origin port (disclosed). */
export function patternHeatSurcharge(state: GameState, intent: ShipIntent): number {
  const from = findStash(state, intent.fromStashId);
  if (!from) return 0;
  return (
    recentUseOf(state, portUseKey(from.countryId)) * state.config.heat.PATTERN_HEAT_PER_USE
  );
}

/**
 * The heat one LEG END adds (design/13 B5.1): `cargo heat class × qty ×
 * displayed odds × factor` — the interdiction quote's own inputs, so big moves
 * on hot corridors run hot even when they succeed. `factor` is the launch or
 * landing knob; the launch side also carries the pattern surcharge.
 */
function shipmentLegHeat(
  state: GameState,
  product: ProductId,
  qty: number,
  odds: number,
  factor: number,
): number {
  const cargoHeat = getProduct(product, state.config.products.PRODUCTS).heatPerUnit * qty;
  return cargoHeat * odds * factor;
}

/** The full heat a LAUNCH applies (disclosed on the quote before commit). */
export function launchHeat(state: GameState, intent: ShipIntent): number {
  const odds = interdictionChance(state, intent);
  return (
    shipmentLegHeat(
      state,
      intent.product,
      intent.qty,
      odds,
      state.config.heat.SHIPMENT_LAUNCH_HEAT_FACTOR,
    ) + patternHeatSurcharge(state, intent)
  );
}

// --- Self-run arrest (design/13 B4; Prompt 44) ----------------------------------

/**
 * The bond price an arrest demands right now: `max(net worth × fraction, floor)`,
 * payable from CLEAN cash. Shown BEFORE the player chooses (and disclosed on the
 * launch quote as the risk of driving yourself) — never a surprise number.
 */
export function arrestBond(state: GameState): number {
  const T = state.config.transport;
  return Math.round(Math.max(netWorth(state) * T.ARREST_BOND_FRACTION, T.ARREST_BOND_MIN));
}

export interface PostBondResult {
  readonly state: GameState;
  readonly ok: boolean;
  /** What was charged (the disclosed bond). 0 on rejection. */
  readonly paid: number;
  readonly rejected?: 'no-arrest' | 'insufficient-funds';
}

/**
 * Post bond on a pending arrest (design/13 B4): pay `arrestBond` from CLEAN
 * cash, take the disclosed heat spike, and clear the arrest interrupt — the run
 * continues, and you skip the time. Rejects without mutating when the choice
 * isn't a pending arrest or clean cash can't cover the bond (the other exit is
 * `clock.serveSentence` — the run resumes after the served week; nothing here
 * ever ends a run).
 */
export function postBond(state: GameState, choiceId: string): PostBondResult {
  const choice = state.pendingChoices.find((c) => c.id === choiceId);
  if (!choice || choice.kind !== ARREST_CHOICE_KIND) {
    return { state, ok: false, paid: 0, rejected: 'no-arrest' };
  }
  const bond = arrestBond(state);
  if (state.cleanCash < bond) {
    return { state, ok: false, paid: 0, rejected: 'insufficient-funds' };
  }
  let next: GameState = {
    ...state,
    cleanCash: state.cleanCash - bond,
    pendingChoices: state.pendingChoices.filter((c) => c.id !== choiceId),
  };
  next = addHeat(next, state.config.transport.ARREST_BOND_HEAT, 'arrest.bond');
  return { state: next, ok: true, paid: bond };
}

// --- The quote (everything disclosed before commit) ---------------------------

/** Every number the player sees before committing — and exactly what `ship` charges. */
export interface ShipmentQuote {
  /** Whether `ship` would accept this intent as-is. */
  readonly ok: boolean;
  readonly rejected?: ShipRejectReason;
  /** The floored REGION_DISTANCE leg the pricing/eta/odds derive from. */
  readonly distance: number;
  /** $ for the transport itself (`costPerDistance × distance`). */
  readonly transportCost: number;
  /** $ owed to the boat's owner — go-fast only (`ownerCutPct × cargo sell value`). */
  readonly ownerCut: number;
  /** $ across ALL couriers (`COURIER_CUT_PCT × cargo sell value` each). */
  readonly courierCut: number;
  /** The full launch charge: transport + owner cut + courier cuts. */
  readonly totalCost: number;
  /** In-game hours the leg takes (resolves on ONLINE ticks only). */
  readonly etaHours: number;
  /** THE number rolled on arrival (fairness law — shown = rolled). */
  readonly interdictionChance: number;
  /** The cargo's sell value at the destination (the basis of the cuts). */
  readonly cargoValue: number;
  /** Disclosed units arc-active couriers will skim on arrival (telegraphed). */
  readonly skimUnits: number;
  /** Names of couriers currently mid-betrayal-arc (the readable warning). */
  readonly courierWarnings: readonly string[];
  /** Heat the LAUNCH applies — volume × route risk + any pattern surcharge
   * (design/13 B5.1/B5.3; disclosed before commit, shown = applied). */
  readonly launchHeat: number;
  /** The odds surcharge from recent reuse of this origin port (design/13 B5.3
   * — already inside `interdictionChance`; broken out so the quote can say WHY). */
  readonly patternOddsSurcharge: number;
  /** True when no courier is consigned — YOU are driving, and an interdiction
   * means arrest: post bond or serve the sentence (design/13 B4; disclosed here). */
  readonly soloRun: boolean;
  /** The bond an arrest would demand right now (the disclosed downside). */
  readonly arrestBond: number;
  /** The sentence served if no bond is posted (the disclosed other downside). */
  readonly arrestSentenceHours: number;
}

function validate(state: GameState, intent: ShipIntent): ShipRejectReason | null {
  if (!Number.isInteger(intent.qty) || intent.qty <= 0) return 'invalid-qty';
  const from = findStash(state, intent.fromStashId);
  const to = findStash(state, intent.toStashId);
  if (!from || !to || !findCountry(from.countryId) || !findCountry(to.countryId)) {
    return 'no-stash';
  }
  if (from.countryId === to.countryId) return 'same-country';
  if (intent.qty > getTransport(intent.mode, state.config.transport.TRANSPORTS).cargoCap) {
    return 'over-cargo-cap';
  }
  if ((from.inventory[intent.product] ?? 0) < intent.qty) return 'insufficient-inventory';

  const ids = intent.courierIds ?? [];
  if (new Set(ids).size !== ids.length) return 'no-courier'; // one body per seat
  for (const id of ids) {
    const npc = state.crew.find((c) => c.id === id);
    if (!npc) return 'no-courier';
    if (npc.assignment.kind !== 'idle') return 'courier-not-idle';
  }
  return null;
}

/**
 * Quote a shipment in full (design/11 §3 — a priced, risky, READABLE
 * decision): leg cost, the go-fast owner's cut, every courier's cut, the eta,
 * the telegraphed skim, and the exact interdiction odds `travelStep` will roll
 * against. Pure — `ship` charges exactly these numbers or rejects. On an
 * invalid intent, `ok` is false with the same `rejected` reason `ship` returns
 * (numbers are computed best-effort for display).
 */
export function quoteShipment(state: GameState, intent: ShipIntent): ShipmentQuote {
  const rejected = validate(state, intent);
  const from = findStash(state, intent.fromStashId);
  const to = findStash(state, intent.toStashId);
  const fromCountry = from ? findCountry(from.countryId) : undefined;
  const toCountry = to ? findCountry(to.countryId) : undefined;
  const couriers = couriersOf(state, intent);

  if (!fromCountry || !toCountry) {
    return {
      ok: false,
      rejected: rejected ?? 'no-stash',
      distance: 0,
      transportCost: 0,
      ownerCut: 0,
      courierCut: 0,
      totalCost: 0,
      etaHours: 0,
      interdictionChance: 0,
      cargoValue: 0,
      skimUnits: 0,
      courierWarnings: [],
      launchHeat: 0,
      patternOddsSurcharge: 0,
      soloRun: (intent.courierIds ?? []).length === 0,
      arrestBond: arrestBond(state),
      arrestSentenceHours: state.config.transport.ARREST_SENTENCE_HOURS,
    };
  }

  const T = state.config.transport;
  const mode = getTransport(intent.mode, T.TRANSPORTS);
  const dist = legDistance(fromCountry, toCountry, T.MIN_LEG_DISTANCE);
  const cargoValue = getMarketPrice(state, intent.product, toCountry.id).price * intent.qty;
  const transportCost = Math.round(mode.costPerDistance * dist);
  const ownerCut = Math.round(cargoValue * (mode.ownerCutPct ?? 0));
  const courierCut = Math.round(cargoValue * T.COURIER_CUT_PCT) * couriers.length;
  const warned = couriers.filter((c) => c.activeArc !== undefined);
  const skimPerCourier = Math.floor(intent.qty * T.COURIER_SKIM_PCT);
  const skimUnits = Math.min(intent.qty, warned.length * skimPerCourier);

  // Affordability is part of the quote: cross-country without the funds is a
  // rejection `ship` will return, so `ok` is the whole truth.
  const totalCost = transportCost + ownerCut + courierCut;
  const funded = from !== null && splitCharge(state, from, totalCost) !== null;
  const finalRejected = rejected ?? (funded ? null : 'insufficient-funds');

  return {
    ok: finalRejected === null,
    ...(finalRejected !== null ? { rejected: finalRejected } : {}),
    distance: dist,
    transportCost,
    ownerCut,
    courierCut,
    totalCost,
    etaHours: mode.hoursPerDistance * dist,
    interdictionChance: interdictionChance(state, intent),
    cargoValue,
    skimUnits,
    courierWarnings: warned.map((c) => c.name),
    launchHeat: launchHeat(state, intent),
    patternOddsSurcharge: patternOddsSurcharge(state, intent),
    soloRun: couriers.length === 0 && (intent.courierIds ?? []).length === 0,
    arrestBond: arrestBond(state),
    arrestSentenceHours: T.ARREST_SENTENCE_HOURS,
  };
}

// --- Launch --------------------------------------------------------------------

export interface ShipResult {
  readonly state: GameState;
  readonly ok: boolean;
  /** The terms committed to (or those that would have applied on rejection). */
  readonly quote: ShipmentQuote;
  /** The launched shipment (null on rejection). */
  readonly shipment: Shipment | null;
  readonly rejected?: ShipRejectReason;
}

/**
 * Validate & launch a shipment: remove the cargo from the origin stash, charge
 * the quoted total (dirty cash at the origin first, clean cash covering the
 * shortfall — one capital pool, design/10), mark every courier as riding, and
 * put the consignment in flight. Rejections NEVER mutate state. The quote's
 * odds are snapshotted onto the shipment — the number rolled on arrival is the
 * number that was shown (fairness law).
 */
export function ship(state: GameState, intent: ShipIntent): ShipResult {
  const quote = quoteShipment(state, intent);
  if (!quote.ok) {
    return { state, ok: false, quote, shipment: null, rejected: quote.rejected ?? 'no-stash' };
  }

  const from = findStash(state, intent.fromStashId)!;
  const charge = splitCharge(state, from, quote.totalCost)!; // quote.ok covers funding

  const courierIds = intent.courierIds ?? [];
  const shipment: Shipment = {
    id: `shipment-${state.clock.hours}-${state.shipments.length}`,
    product: intent.product,
    qty: intent.qty,
    fromStashId: intent.fromStashId,
    toStashId: intent.toStashId,
    mode: intent.mode,
    courierIds,
    departedAtHours: state.clock.hours,
    arrivesAtHours: state.clock.hours + quote.etaHours,
    interdictionChance: quote.interdictionChance,
    skimUnits: quote.skimUnits,
  };

  const nextFrom: Stash = {
    ...from,
    dirtyCash: from.dirtyCash - charge.fromDirty,
    inventory: adjustInventory(from.inventory, intent.product, -intent.qty),
  };
  let next = withStash(state, nextFrom);
  next = {
    ...next,
    cleanCash: next.cleanCash - charge.fromClean,
    shipments: [...next.shipments, shipment],
    crew: next.crew.map((c) =>
      courierIds.includes(c.id)
        ? { ...c, assignment: { kind: 'courier' as const, targetId: shipment.id } }
        : c,
    ),
  };
  // Shipment volume & route risk (design/13 B5.1): the launch heat the quote
  // disclosed lands now — big moves on hot corridors run hot even when they
  // succeed. Then the origin port's pattern counter bumps (B5.3), so the NEXT
  // run from here quotes the surcharge this one just previewed.
  if (quote.launchHeat > 0) next = addHeat(next, quote.launchHeat, 'shipment.launch');
  next = bumpRecentUse(next, portUseKey(from.countryId));

  return { state: next, ok: true, quote, shipment };
}

// --- Arrival resolution (the active-only tick step) -----------------------------

/** Return every courier on `shipment` to idle (the run is over, either way). */
function freeCouriers(state: GameState, shipment: Shipment): GameState {
  if (shipment.courierIds.length === 0) return state;
  return {
    ...state,
    crew: state.crew.map((c) =>
      shipment.courierIds.includes(c.id)
        ? { ...c, assignment: { kind: 'idle' as const } }
        : c,
    ),
  };
}

function queueScene(state: GameState, id: string, kind: string, summary: string): GameState {
  const scene: PendingChoice = {
    id,
    kind,
    summary,
    createdAtHours: state.clock.hours,
  };
  return { ...state, pendingChoices: [...state.pendingChoices, scene] };
}

/**
 * Deliver a shipment that SURVIVED its roll. If the destination can't hold it
 * right now, the load waits offshore: it stays in flight marked `cleared`, is
 * never re-rolled, and nothing is lost — delivery retries on later ONLINE ticks.
 */
function deliverShipment(state: GameState, shipment: Shipment): GameState {
  const to = findStash(state, shipment.toStashId);
  const destName = to ? findCountry(to.countryId)?.name : undefined;
  const delivered = shipment.qty - shipment.skimUnits;
  // Effective (crew-scaled) capacity bounds the arrival (design/12 Item 4).
  const capacity = to ? effectiveCapacity(state, to) : 0;

  if (!to || stashUnits(to) + delivered > capacity) {
    if (shipment.cleared) return state; // already waiting — nothing to update
    return {
      ...state,
      shipments: state.shipments.map((s) =>
        s.id === shipment.id ? { ...s, cleared: true } : s,
      ),
    };
  }

  const nextTo: Stash = {
    ...to,
    inventory: adjustInventory(to.inventory, shipment.product, delivered),
  };
  let next = withStash(state, nextTo);
  next = { ...next, shipments: next.shipments.filter((s) => s.id !== shipment.id) };
  next = freeCouriers(next, shipment);
  // Landing heat (design/13 B5.1): the other half of the shipment's footprint,
  // scaled by the SAME snapshotted odds the quote showed — success still hums.
  const landing = shipmentLegHeat(
    next,
    shipment.product,
    shipment.qty,
    shipment.interdictionChance,
    next.config.heat.SHIPMENT_LANDING_HEAT_FACTOR,
  );
  if (landing > 0) next = addHeat(next, landing, 'shipment.landed');
  const skimNote =
    shipment.skimUnits > 0 ? ` The count came up ${shipment.skimUnits} short.` : '';
  return queueScene(
    next,
    `shipment-arrived-${shipment.id}`,
    'shipment-arrived',
    `The load made it${destName ? ` to ${destName}` : ''}. ${delivered} units in the ${to.name}.${skimNote}`,
  );
}

/** Resolve one due shipment: roll the snapshotted odds, then seize or deliver. */
function resolveShipment(
  state: GameState,
  shipment: Shipment,
  roll: number,
): GameState {
  const product = getProduct(shipment.product, state.config.products.PRODUCTS);
  const modeName = getTransport(shipment.mode, state.config.transport.TRANSPORTS)
    .name.toLowerCase();
  const destName = findCountry(
    findStash(state, shipment.toStashId)?.countryId ?? '',
  )?.name;

  if (roll < shipment.interdictionChance) {
    // Interdicted: ONLY this cargo is seized (never a wipe of other stashes —
    // design/11 §3), heat spikes (the full spike solo; a fraction consigned —
    // the courier took the fall), and the loss renders as a scene.
    const solo = shipment.courierIds.length === 0;
    const spike =
      product.heatPerUnit *
      shipment.qty *
      product.bustHeatMultiplier *
      (solo ? 1 : state.config.transport.CONSIGNED_BUST_HEAT_FACTOR);
    let next: GameState = {
      ...state,
      shipments: state.shipments.filter((s) => s.id !== shipment.id),
    };
    next = freeCouriers(next, shipment);
    next = addHeat(next, spike, 'shipment.seized');
    // A MAJOR seizure opens the disclosed investigation window (design/13 B5.5).
    next = maybeOpenInvestigation(next, spike);
    if (solo) {
      // YOU were driving (design/13 B4) — the launch quote said what this means.
      // The arrest presents as a consequential interrupt: post the disclosed
      // bond (travel.postBond) or serve the disclosed sentence
      // (clock.serveSentence) — either way the run continues; this tick step
      // never ends a run (GDD §8).
      const arrest: PendingChoice = {
        id: `arrest-${shipment.id}`,
        kind: ARREST_CHOICE_KIND,
        summary: `They boarded the ${modeName} with you at the helm. You're in the cuffs — post bond or do the time.`,
        createdAtHours: next.clock.hours,
      };
      return { ...next, pendingChoices: [...next.pendingChoices, arrest] };
    }
    const summary = `The ${modeName} got boarded en route${destName ? ` to ${destName}` : ''}. Your people walked, but the load is gone.`;
    return queueScene(next, `shipment-seized-${shipment.id}`, 'shipment-seized', summary);
  }

  return deliverShipment(state, shipment);
}

/**
 * The `travel` tick step (registered ACTIVE-only in clock.ts): resolve every
 * shipment whose leg has completed. One RNG draw per due shipment — compared
 * against the odds SNAPSHOTTED at launch, byte-identical to the quote
 * (fairness law) — and never more than one: a load that survived its roll but
 * found the destination full waits offshore `cleared` and only retries
 * DELIVERY. Offline never runs this step, so in-flight cargo is frozen, never
 * seized, while the player is away (GDD §6).
 */
export function travelStep(state: GameState, dtHours: number): GameState {
  if (dtHours <= 0 || state.shipments.length === 0) return state;
  const due = state.shipments.filter((s) => s.arrivesAtHours <= state.clock.hours);
  if (due.length === 0) return state;

  let rngUsed = false;
  const rng = restoreRng(state.rngState);
  let next = state;
  for (const shipment of due) {
    if (shipment.cleared) {
      next = deliverShipment(next, shipment);
    } else {
      rngUsed = true;
      next = resolveShipment(next, shipment, rng.next());
    }
  }
  return rngUsed ? { ...next, rngState: rng.getState() } : next;
}

/** The shipments currently in flight (a read selector for the UI/beats). */
export function shipmentsInFlight(state: GameState): readonly Shipment[] {
  return state.shipments;
}

/** Readable route label for a shipment (origin → destination country names). */
export function shipmentRoute(state: GameState, shipment: Shipment): string {
  const from = findStash(state, shipment.fromStashId);
  const to = findStash(state, shipment.toStashId);
  const name = (s: Stash | null): string =>
    s ? (findCountry(s.countryId)?.name ?? s.countryId) : '?';
  return `${name(from)} → ${name(to)}`;
}
