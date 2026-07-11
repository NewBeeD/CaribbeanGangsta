/**
 * Prestige-unlocked starting scenarios (GDD §7; design/01 §7; Prompt 26).
 *
 * **Data only, and NON-POWER by construction.** A scenario may vary WHERE a run
 * starts and which world flags open early (roster/route variety — the same kind
 * of variety world generation already produces) — it must never carry a stat
 * multiplier, a cash bonus, or a heat discount. Compounding power would dilute
 * the high-score stakes (GDD §7), so the `StartingScenario` shape has no numeric
 * field at all: a power unlock is unrepresentable, which is how the guarantee is
 * enforced (the same trick as `config/prestige.ts`'s category union).
 *
 * Unlocks reference `PRESTIGE_UNLOCKS` ids (category `scenario`). The run-setup
 * flow (Prompt 24/28) reads this table; the engine itself never gates on it.
 */

import { ALT_ROUTE_FLAG } from './events';

export interface StartingScenario {
  readonly id: string;
  readonly name: string;
  /** Scene-setting prose shown when picking the scenario. */
  readonly description: string;
  /**
   * The `PRESTIGE_UNLOCKS` id (category `scenario`) that opens this, or `null`
   * for the always-available default.
   */
  readonly unlockedBy: string | null;
  /**
   * Pin the run's starting country (a start-eligible or roster country id), or
   * `null` to let world generation draw one (the default variety).
   */
  readonly startingCountryId: string | null;
  /**
   * World flags set at run start — route/roster variety only (e.g. the
   * Guyana/Suriname corridor already open). Never a stat.
   */
  readonly startingFlags: Readonly<Record<string, true>>;
  /** The opening hook line the scenario leads with. */
  readonly openingHook: string;
}

export const STARTING_SCENARIOS: readonly StartingScenario[] = [
  {
    id: 'fresh-off-the-boat',
    name: 'Fresh Off the Boat',
    description:
      'The standard come-up: a random island, a pocket of dirty cash, and everything to prove.',
    unlockedBy: null,
    startingCountryId: null, // world generation draws the island (design/01 §0a)
    startingFlags: {},
    openingHook: 'The dock smells like diesel and opportunity.',
  },
  {
    id: 'clean-slate',
    name: 'Clean Slate',
    description:
      'Start on Marigot Bay, the quiet island — nobody knows your name, and nobody is looking for you. Yet.',
    unlockedBy: 'scenario-clean-slate',
    startingCountryId: 'marigot-bay',
    startingFlags: {},
    openingHook: 'A sleepy harbor town. The kind of quiet you could build something under.',
  },
  {
    id: 'guyana-corridor',
    name: 'Cartel Ties',
    description:
      'Old friends in low places: the Guyana/Suriname back-door corridor is already open to you — high stakes, early routes, same starting pocket.',
    unlockedBy: 'scenario-cartel-ties',
    startingCountryId: 'port-lazaro',
    startingFlags: { [ALT_ROUTE_FLAG]: true }, // early route ACCESS, not power (GDD §7)
    openingHook: 'A number you never deleted calls back. The corridor is open.',
  },
] as const;

const SCENARIO_BY_ID: ReadonlyMap<string, StartingScenario> = new Map(
  STARTING_SCENARIOS.map((s) => [s.id, s]),
);

/** Look up a scenario without throwing (tolerant UI/meta reads). */
export function findScenario(id: string): StartingScenario | undefined {
  return SCENARIO_BY_ID.get(id);
}
