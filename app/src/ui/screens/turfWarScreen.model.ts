/**
 * The Turf War screen's view-model (design "Turf Wars Between Countries"). PURE
 * reads that turn engine state into presentable rows — every number comes from a
 * `turfWar.ts` selector verbatim (the shown battle strength/odds ARE the ones
 * `resolveBattle` rolls; the UI authors no combat math). No mutation.
 */

import {
  activeWars,
  battleCapture,
  battleStrength,
  contestableRivals,
  countryStake,
  declareWarCost,
  findRival,
  heldCountries,
  rivalTension,
  toppleSpoils,
  truceCost,
  appeaseCost,
  warForCountry,
  winRepAvailable,
  type BattleCommitment,
  type BattleBreakdown,
  type GameState,
  type TurfWar,
  type TurfWarKind,
} from '@/engine';
import { WEAPON_TIERS, getCountry, type WeaponTierId } from '@/engine';

/** A one-line label for how a rival prosecutes a war (archetype flavor). */
export function kindLabel(kind: TurfWarKind): string {
  switch (kind) {
    case 'hot':
      return 'Open war — guns and bodies';
    case 'cold':
      return 'Cold war — cops and customs';
    case 'raid':
      return 'Raids — hitting your stashes';
    case 'undercut':
      return 'Price war — undercutting your corners';
  }
}

/** A presentable active-war row (all reads, no math authored here). */
export interface WarRow {
  readonly warId: string;
  readonly countryId: string;
  readonly countryName: string;
  readonly rivalName: string;
  readonly archetype: string;
  readonly kind: TurfWarKind;
  readonly kindNote: string;
  readonly pressure: number;
  readonly initiatedByPlayer: boolean;
  readonly tributeActive: boolean;
  readonly lossCount: number;
  /** Dirty cash at stake in the contested country. */
  readonly stake: number;
  /** Whether this is the home country (can't be lost, only taxed). */
  readonly isHome: boolean;
  readonly truceCost: number;
  readonly tributeCost: number;
  /** What a won battle captures, named ("3 rifles and 1 automatic") — the exact
   * deterministic haul `resolveBattle` applies ('' if the kind drops nothing). */
  readonly winCaptureNote: string;
  /** Street rep the next won battle pays (0 once the per-war cap is reached). */
  readonly winRep: number;
  /** Dirty spoils a topple would seize — only on a player-declared war (a
   * defensive win ends the war without breaking the rival). */
  readonly spoilsOnTopple: number | null;
}

/** Name a capture record for display, tier by tier ("3 rifles and 1 automatic"). */
export function captureNote(
  capture: Readonly<Partial<Record<WeaponTierId, number>>>,
): string {
  const byId = new Map(WEAPON_TIERS.map((t) => [t.id, t.name.toLowerCase()]));
  const parts = (Object.entries(capture) as [WeaponTierId, number][])
    .filter(([, units]) => units > 0)
    .map(([tier, units]) => `${units} ${byId.get(tier) ?? tier}`);
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

function warRow(state: GameState, war: TurfWar): WarRow {
  const rival = findRival(state, war.rivalId);
  return {
    warId: war.id,
    countryId: war.countryId,
    countryName: getCountry(war.countryId).name,
    rivalName: rival?.name ?? 'Unknown',
    archetype: rival?.archetype ?? '',
    kind: war.kind,
    kindNote: kindLabel(war.kind),
    pressure: war.pressure,
    initiatedByPlayer: war.initiatedBy === 'player',
    tributeActive: war.tributeActive,
    lossCount: war.lossCount,
    stake: countryStake(state, war.countryId),
    isHome: war.countryId === state.world.startingCountry.id,
    truceCost: truceCost(state, war.countryId),
    tributeCost: appeaseCost(state, war.countryId),
    winCaptureNote: captureNote(battleCapture(state, war)),
    winRep: winRepAvailable(state, war),
    spoilsOnTopple:
      war.initiatedBy === 'player' ? toppleSpoils(state, war.rivalId) : null,
  };
}

/** Every active war, as presentable rows (home country last, then by pressure). */
export function turfWarRows(state: GameState): readonly WarRow[] {
  return activeWars(state)
    .map((w) => warRow(state, w))
    .sort((a, b) => (a.isHome ? 1 : 0) - (b.isHome ? 1 : 0) || b.pressure - a.pressure);
}

/** A weapon tier the player can commit, with how many are on hand. */
export interface ArmoryRow {
  readonly tier: WeaponTierId;
  readonly name: string;
  readonly held: number;
}

/** The armory, tier by tier — the firepower available to commit to a battle. */
export function armoryRows(state: GameState): readonly ArmoryRow[] {
  return WEAPON_TIERS.map((t) => ({
    tier: t.id,
    name: t.name,
    held: state.armory[t.id] ?? 0,
  }));
}

/** A crew member the player can throw into a fight, with their muscle. */
export interface FighterRow {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly muscle: number;
}

/** Crew available to commit to a battle (anyone on the roster; muscle shown so
 * the player picks their fighters). Ordered by muscle, hardest first. */
export function fighterRows(state: GameState): readonly FighterRow[] {
  return state.crew
    .map((c) => ({ id: c.id, name: c.name, role: c.role, muscle: c.skills.muscle }))
    .sort((a, b) => b.muscle - a.muscle);
}

/** The itemized battle preview for a war + the player's current commitment — the
 * exact strengths and win chance `resolveBattle` will roll (fairness). */
export function battlePreview(
  state: GameState,
  warId: string,
  commitment: BattleCommitment,
): BattleBreakdown | null {
  const war = activeWars(state).find((w) => w.id === warId);
  if (!war) return null;
  return battleStrength(state, war, commitment);
}

/** A country the player could open an offensive war in — held, and not already
 * contested. */
export interface DeclareTarget {
  readonly countryId: string;
  readonly countryName: string;
  readonly rivals: readonly { readonly id: string; readonly name: string; readonly archetype: string; readonly tension: number }[];
}

/** Where the player could go on the offensive right now, with the eligible
 * rivals in each held country. Countries already at war are excluded. */
export function declareTargets(state: GameState): readonly DeclareTarget[] {
  return heldCountries(state)
    .filter((countryId) => !warForCountry(state, countryId))
    .map((countryId) => ({
      countryId,
      countryName: getCountry(countryId).name,
      rivals: contestableRivals(state, countryId).map((r) => ({
        id: r.id,
        name: r.name,
        archetype: r.archetype,
        tension: rivalTension(state, r.id),
      })),
    }))
    .filter((t) => t.rivals.length > 0);
}

/** The up-front cost to declare a war (a flat money gate, shown before commit). */
export function declareCost(state: GameState): number {
  return declareWarCost(state);
}

/** How many rivals are still standing (not toppled) — the offensive endgame count. */
export function rivalsStanding(state: GameState): number {
  return state.rivals.filter((r) => !r.toppled).length;
}
