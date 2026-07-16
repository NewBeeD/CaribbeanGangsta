/**
 * The shipment desk's view-model (Prompt 31; design/11 §3; Ideas2 §1/§3). PURE
 * read selectors for the Empire Map's dispatch form and in-flight tracker. The
 * component composes these and dispatches ONE intent through the store — it
 * authors no cost/odds math (README UI rule). The interdiction % it surfaces is
 * `quoteShipment`'s number verbatim, which the engine snapshots and rolls
 * unchanged on arrival (the fairness law, design/01 §0.3).
 */

import {
  TRANSPORTS,
  VESSELS,
  findCountry,
  getTransport,
  productDisplayName,
  quoteShipment,
  shipmentRoute,
  effectiveCargoCap,
  ownedVesselForMode,
  peopleAvailable,
  peopleOut,
  peopleTotal,
  vesselCargoCap,
  vesselUpgradeCost,
  VESSEL_MAX_LEVEL,
  type GameState,
  type ProductId,
  type ShipIntent,
  type ShipmentQuote,
  type Stash,
  type TransportId,
  type VesselId,
} from '@/engine';

/** A held product at the origin stash — what there is to ship. */
export interface CargoOption {
  readonly id: ProductId;
  readonly name: string;
  readonly held: number;
}

/** An origin choice: a stash with something in it. */
export interface OriginOption {
  readonly id: string;
  readonly name: string;
  readonly countryName: string;
  readonly cargo: readonly CargoOption[];
}

/** A destination choice: one of YOUR stashes in another country. */
export interface DestinationOption {
  readonly id: string;
  readonly name: string;
  readonly countryName: string;
}

/** A transport mode row for the picker — the config table verbatim. */
export interface ModeOption {
  readonly id: TransportId;
  readonly name: string;
  /** Effective hold: an owned vessel's raised cap if one flies this mode, else the charter's. */
  readonly cargoCap: number;
  /** The go-fast owner's % of cargo value, 0 for the others (Ideas2 §1). */
  readonly ownerCutPct: number;
  /** True when an OWNED vessel flies this mode — cut-free & discounted (design/13 E). */
  readonly owned: boolean;
}

/** An idle crew member who can ride as courier/escort (Ideas2 §1). */
export interface CourierOption {
  readonly id: string;
  readonly name: string;
  /** Mid-betrayal-arc — riding means a DISCLOSED skim (telegraphed, design/02 §4). */
  readonly warned: boolean;
}

function countryName(stash: Stash): string {
  return findCountry(stash.countryId)?.name ?? stash.countryId;
}

/** Every stash holding product, as an origin choice. */
export function originOptions(state: GameState): readonly OriginOption[] {
  return state.stashes
    .map((s) => ({
      id: s.id,
      name: s.name,
      countryName: countryName(s),
      cargo: (Object.entries(s.inventory) as [ProductId, number][])
        .filter(([, qty]) => qty > 0)
        // Whole units only — floor to the shippable integer (the sub-unit remainder waits).
        .map(([id, qty]) => ({
          id,
          name: productDisplayName(state.world, id),
          held: Math.floor(qty),
        })),
    }))
    .filter((o) => o.cargo.length > 0);
}

/** Your stashes in OTHER countries than the origin's — where a boat can land. */
export function destinationOptions(
  state: GameState,
  fromStashId: string,
): readonly DestinationOption[] {
  const from = state.stashes.find((s) => s.id === fromStashId);
  if (!from) return [];
  return state.stashes
    .filter((s) => s.countryId !== from.countryId)
    .map((s) => ({ id: s.id, name: s.name, countryName: countryName(s) }));
}

/** The mode table for the picker (config, not literals), with owned-vessel state. */
export function modeOptions(state: GameState): readonly ModeOption[] {
  return TRANSPORTS.map((t) => {
    const owned = ownedVesselForMode(state, t.id) !== null;
    return {
      id: t.id,
      name: t.name,
      cargoCap: effectiveCargoCap(state, t.id),
      // An owned vessel pays no owner cut (design/13 E) — surface 0 when you own it.
      ownerCutPct: owned ? 0 : (t.ownerCutPct ?? 0),
      owned,
    };
  });
}

/** The people-are-capacity counter (design/13 E; Prompt 47) — "5 of 6 out". */
export interface PeopleStatus {
  /** Everyone available to crew runs: the whole crew, plus you. */
  readonly total: number;
  /** People currently out on in-flight runs (couriers + you when helming). */
  readonly out: number;
  /** People free to launch another run right now. */
  readonly available: number;
}

export function peopleStatus(state: GameState): PeopleStatus {
  return {
    total: peopleTotal(state),
    out: peopleOut(state),
    available: peopleAvailable(state),
  };
}

/** One owned-or-buyable vessel row for the Fleet card (design/13 E; Prompt 47). */
export interface FleetOption {
  readonly id: VesselId;
  readonly name: string;
  readonly modeName: string;
  readonly blurb: string;
  /** True once bought — then it shows level/cargo and an upgrade price. */
  readonly owned: boolean;
  /** The saved vessel's id (for upgrade dispatch); undefined until bought. */
  readonly vesselId?: string;
  readonly level: number;
  readonly maxLevel: number;
  /** Current cargo cap (level-scaled once owned; the level-1 cap before). */
  readonly cargoCap: number;
  readonly legDiscountPct: number;
  /** Clean-cash price of the NEXT action: buy-in when unowned, upgrade cost when owned. */
  readonly nextCost: number;
  /** True when the vessel is maxed (owned at max level — no next action). */
  readonly maxed: boolean;
  /** Whether clean cash covers `nextCost` right now. */
  readonly affordable: boolean;
}

/** Every vessel — owned first-class, the rest buyable (open access, price the only gate). */
export function fleetOptions(state: GameState): readonly FleetOption[] {
  return VESSELS.map((cfg) => {
    const owned = state.vessels.find((v) => v.type === cfg.id) ?? null;
    const level = owned?.level ?? 1;
    const maxed = owned !== null && level >= VESSEL_MAX_LEVEL;
    const cargoCap = owned
      ? vesselCargoCap(owned, state.config.vessels)
      : cfg.baseCargoCap;
    const nextCost = !owned
      ? cfg.buyIn
      : maxed
        ? 0
        : vesselUpgradeCost(cfg.id, level, state.config.vessels);
    return {
      id: cfg.id,
      name: cfg.name,
      modeName: getTransport(cfg.mode).name,
      blurb: cfg.blurb,
      owned: owned !== null,
      ...(owned ? { vesselId: owned.id } : {}),
      level,
      maxLevel: VESSEL_MAX_LEVEL,
      cargoCap,
      legDiscountPct: Math.round(cfg.legDiscount * 100),
      nextCost,
      maxed,
      affordable: !maxed && state.cleanCash >= nextCost,
    };
  });
}

/** Idle crew, with the betrayal-arc warning surfaced (telegraphed, never hidden). */
export function courierOptions(state: GameState): readonly CourierOption[] {
  return state.crew
    .filter((c) => c.assignment.kind === 'idle')
    .map((c) => ({ id: c.id, name: c.name, warned: c.activeArc !== undefined }));
}

/** The full disclosed quote — `quoteShipment` verbatim (the fairness anchor). */
export function deskQuote(state: GameState, intent: ShipIntent): ShipmentQuote {
  return quoteShipment(state, intent);
}

/** One in-flight consignment on the tracker. */
export interface ShipmentView {
  readonly id: string;
  /** "San Cristo → Miami" — origin/destination country names. */
  readonly route: string;
  readonly modeName: string;
  readonly productName: string;
  readonly qty: number;
  /** In-game hours until the leg completes (0 = lands on the next online tick). */
  readonly etaHours: number;
  /** The odds snapshotted at launch — exactly what arrival will roll. */
  readonly interdictionChance: number;
  /** Survived its roll but waiting offshore for room at the destination. */
  readonly waiting: boolean;
  readonly courierCount: number;
}

/** Every shipment in flight, oldest first — the map's tracker list. */
export function inFlightViews(state: GameState): readonly ShipmentView[] {
  return state.shipments.map((s) => ({
    id: s.id,
    route: shipmentRoute(state, s),
    modeName: getTransport(s.mode).name,
    productName: productDisplayName(state.world, s.product),
    qty: Math.floor(s.qty),
    etaHours: Math.max(0, Math.ceil(s.arrivesAtHours - state.clock.hours)),
    interdictionChance: s.interdictionChance,
    waiting: s.cleared === true,
    courierCount: s.courierIds.length,
  }));
}

/** Arrival / interdiction scenes queued by the engine (never toasts). */
export interface ShipmentScene {
  readonly id: string;
  readonly kind: 'shipment-arrived' | 'shipment-seized';
  readonly text: string;
}

export function shipmentScenes(state: GameState): readonly ShipmentScene[] {
  return state.pendingChoices
    .filter((c) => c.kind === 'shipment-arrived' || c.kind === 'shipment-seized')
    .map((c) => ({
      id: c.id,
      kind: c.kind as ShipmentScene['kind'],
      text: c.summary,
    }));
}
