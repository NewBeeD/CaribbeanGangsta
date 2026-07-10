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
  findCountry,
  getTransport,
  productDisplayName,
  quoteShipment,
  shipmentRoute,
  type GameState,
  type ProductId,
  type ShipIntent,
  type ShipmentQuote,
  type Stash,
  type TransportId,
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
  readonly cargoCap: number;
  /** The go-fast owner's % of cargo value, 0 for the others (Ideas2 §1). */
  readonly ownerCutPct: number;
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
        .map(([id, qty]) => ({
          id,
          name: productDisplayName(state.world, id),
          held: qty,
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

/** The mode table for the picker (config, not literals). */
export function modeOptions(): readonly ModeOption[] {
  return TRANSPORTS.map((t) => ({
    id: t.id,
    name: t.name,
    cargoCap: t.cargoCap,
    ownerCutPct: t.ownerCutPct ?? 0,
  }));
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
    qty: s.qty,
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
