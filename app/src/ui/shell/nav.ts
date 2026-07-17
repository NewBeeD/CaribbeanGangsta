/**
 * Screen registry & routing (Prompt 14, revised per Ideas.md — Drug Lord 2 open
 * access). Every screen is reachable from minute one: the shell never gates a
 * screen behind a progression flag. Money is the only limiter in the game, and
 * money lives in the systems — this module is pure routing (id ↔ hash ↔ nav
 * placement) and reads no state at all.
 */

/** Every routable screen in the shell. */
export type ScreenId =
  | 'deals'
  | 'crew'
  | 'money'
  | 'heat'
  | 'empire'
  | 'market'
  | 'transport'
  | 'storage'
  | 'corruption'
  | 'debt'
  | 'arms'
  | 'turfwar'
  | 'production'
  | 'highscore';

export interface ScreenNode {
  readonly id: ScreenId;
  /** Short nav/label text. */
  readonly label: string;
  /** Hash route (without the leading `#/`). */
  readonly route: string;
  /** Persistent bottom-nav tab (Deals·Crew·Money·Heat) vs one level up (Empire/High Score). */
  readonly inNav: boolean;
  /** One-line hook shown on placeholder screens (≤ ~8 words — design/04 §0.5). */
  readonly tagline: string;
}

/** The screen registry. All open from the start — money limits options, not menus. */
export const SCREEN_NODES: readonly ScreenNode[] = [
  {
    id: 'deals',
    label: 'Deals',
    route: 'deals',
    inNav: true,
    tagline: 'Buy low, sell high, don’t get seen.',
  },
  {
    id: 'crew',
    label: 'Crew',
    route: 'crew',
    inNav: true,
    tagline: 'Put people on. Loyalty is leverage.',
  },
  {
    id: 'money',
    label: 'Money',
    route: 'money',
    inNav: true,
    tagline: 'Turn it clean while you sleep.',
  },
  {
    id: 'heat',
    label: 'Heat',
    route: 'heat',
    inNav: true,
    tagline: 'The law is watching. Learn to cool it.',
  },
  {
    id: 'empire',
    label: 'Empire',
    route: 'empire',
    inNav: false,
    tagline: 'Your territory, at a glance.',
  },
  {
    id: 'market',
    label: 'Market',
    route: 'market',
    inNav: false,
    tagline: 'Every price, every island, always.',
  },
  {
    id: 'transport',
    label: 'Transport',
    route: 'transport',
    inNav: false,
    tagline: 'Move the weight across the water.',
  },
  {
    id: 'storage',
    label: 'Storage',
    route: 'storage',
    inNav: false,
    tagline: 'Spread the weight. One raid, one place.',
  },
  {
    id: 'corruption',
    label: 'Corruption',
    route: 'corruption',
    inNav: false,
    tagline: 'Buy the badge. Pay to stay safe.',
  },
  {
    id: 'debt',
    label: 'Debt',
    route: 'debt',
    inNav: false,
    tagline: 'Borrow to come up. Terms up front.',
  },
  {
    id: 'arms',
    label: 'Arms',
    route: 'arms',
    inNav: false,
    tagline: 'The broker deals in war. Highest heat in the game.',
  },
  {
    id: 'turfwar',
    label: 'Turf War',
    route: 'turfwar',
    inNav: false,
    tagline: 'Rivals want your ground. Take the fight to them.',
  },
  {
    id: 'production',
    label: 'Production',
    route: 'production',
    inNav: false,
    tagline: 'Grow it, cook it, supply the whole island.',
  },
  {
    id: 'highscore',
    label: 'High Score',
    route: 'highscore',
    inNav: false,
    tagline: 'How big did you get?',
  },
];

const NODE_BY_ID: ReadonlyMap<ScreenId, ScreenNode> = new Map(
  SCREEN_NODES.map((n) => [n.id, n]),
);

/** The route the shell falls back to. */
export const DEFAULT_SCREEN: ScreenId = 'deals';

/** Look up a node by id. */
export function getScreenNode(id: ScreenId): ScreenNode | undefined {
  return NODE_BY_ID.get(id);
}

/** Map a raw location hash to a routable screen id (unknown → default). */
export function screenForHash(hash: string): ScreenId {
  const route = hash.replace(/^#\/?/, '').split(/[/?]/)[0] ?? '';
  const node = SCREEN_NODES.find((n) => n.route === route);
  return node ? node.id : DEFAULT_SCREEN;
}
