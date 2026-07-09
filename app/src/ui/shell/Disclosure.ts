/**
 * Progressive disclosure — the gating layer that reveals screens/features step by
 * step so minute one isn't the whole dashboard (design/04 §0.2, design/07 §2; GDD §9).
 *
 * Each node is `unlocked`, `locked` (rendered greyed + aspirational — visible-but-
 * locked, never missing), or `hidden`. Unlock predicates read the SAME durable flags
 * the onboarding beats set (`FIRST_RUNNER_FLAG`, `HEAT_LESSON_FLAG`, …) so a screen
 * opens exactly when its flag flips (Prompt 14 acceptance), with an organic state
 * fallback (a front exists, a second block is held) so the disclosure is testable
 * before the card presenter (Prompt 22) wires the flags.
 *
 * This is pure presentation/routing logic: it only READS state (flags, counts,
 * presence) — no economic math, no dispatch (design/07 §8; README UI rule).
 */

import {
  FIRST_RUNNER_FLAG,
  HEAT_LESSON_FLAG,
  type GameState,
} from '@/engine';

/** Every routable screen in the shell. */
export type ScreenId = 'deals' | 'crew' | 'money' | 'heat' | 'empire' | 'highscore';

/** A node's disclosure state for the current run. */
export type DisclosureState = 'unlocked' | 'locked' | 'hidden';

export interface DisclosureNode {
  readonly id: ScreenId;
  /** Short nav/label text. */
  readonly label: string;
  /** Hash route (without the leading `#/`). */
  readonly route: string;
  /** Persistent bottom-nav tab (Deals·Crew·Money·Heat) vs one level up (Empire/High Score). */
  readonly inNav: boolean;
  /**
   * While locked: render greyed-aspirational (true) or fully hidden (false).
   * Nav tabs stay visible-but-locked so growth reads as aspiration (design/07 §2).
   */
  readonly lockedVisible: boolean;
  /** One-line aspiration shown on the locked tab (≤ ~8 words — design/04 §0.5). */
  readonly aspiration: string;
  /** Unlock predicate — keyed off flags the beats set, with an organic fallback. */
  readonly unlocked: (state: GameState) => boolean;
}

/**
 * The disclosure registry, in reveal order. Deals is the whole game on minute one;
 * Heat, Crew and Money light up across the first session (design/07 §7), and the
 * Empire map opens once there's a territory worth seeing.
 */
export const DISCLOSURE_NODES: readonly DisclosureNode[] = [
  {
    id: 'deals',
    label: 'Deals',
    route: 'deals',
    inNav: true,
    lockedVisible: true,
    aspiration: 'Buy low, sell high, don’t get seen.',
    unlocked: () => true,
  },
  {
    id: 'crew',
    label: 'Crew',
    route: 'crew',
    inNav: true,
    lockedVisible: true,
    aspiration: 'Put people on. Loyalty is leverage.',
    unlocked: (s) => s.flags[FIRST_RUNNER_FLAG] === true || s.crew.length > 0,
  },
  {
    id: 'money',
    label: 'Money',
    route: 'money',
    inNav: true,
    lockedVisible: true,
    aspiration: 'Turn it clean while you sleep.',
    unlocked: (s) => s.fronts.length > 0 || s.cleanCash > 0,
  },
  {
    id: 'heat',
    label: 'Heat',
    route: 'heat',
    inNav: true,
    lockedVisible: true,
    aspiration: 'The law is watching. Learn to cool it.',
    unlocked: (s) =>
      s.flags[HEAT_LESSON_FLAG] === true || s.heat > s.world.startingCountry.heatBaseline,
  },
  {
    id: 'empire',
    label: 'Empire',
    route: 'empire',
    inNav: false,
    lockedVisible: true,
    aspiration: 'Your territory, at a glance.',
    unlocked: (s) => s.stashes.length > 1 || s.fronts.length > 0,
  },
  {
    id: 'highscore',
    label: 'High Score',
    route: 'highscore',
    inNav: false,
    lockedVisible: true,
    // The cross-run chase is always available — it's the "beat it next run" hook.
    aspiration: 'How big did you get?',
    unlocked: () => true,
  },
];

const NODE_BY_ID: ReadonlyMap<ScreenId, DisclosureNode> = new Map(
  DISCLOSURE_NODES.map((n) => [n.id, n]),
);

/** The route the shell falls back to (always unlocked). */
export const DEFAULT_SCREEN: ScreenId = 'deals';

/** Resolve one node's disclosure state for the current run. */
export function disclosureState(
  node: DisclosureNode,
  state: GameState,
): DisclosureState {
  if (node.unlocked(state)) return 'unlocked';
  return node.lockedVisible ? 'locked' : 'hidden';
}

/** Resolve every node's disclosure state (the map the shell renders from). */
export function resolveDisclosure(
  state: GameState,
): Readonly<Record<ScreenId, DisclosureState>> {
  const out = {} as Record<ScreenId, DisclosureState>;
  for (const node of DISCLOSURE_NODES) out[node.id] = disclosureState(node, state);
  return out;
}

/** Look up a node by id. */
export function getDisclosureNode(id: ScreenId): DisclosureNode | undefined {
  return NODE_BY_ID.get(id);
}

/** Whether the player may navigate to a screen right now (unlocked only). */
export function isScreenAccessible(state: GameState, id: ScreenId): boolean {
  const node = NODE_BY_ID.get(id);
  return node ? node.unlocked(state) : false;
}

/** Map a raw location hash to a routable, ACCESSIBLE screen id (locked → default). */
export function screenForHash(state: GameState, hash: string): ScreenId {
  const route = hash.replace(/^#\/?/, '').split(/[/?]/)[0] ?? '';
  const node = DISCLOSURE_NODES.find((n) => n.route === route);
  if (node && node.unlocked(state)) return node.id;
  return DEFAULT_SCREEN;
}
