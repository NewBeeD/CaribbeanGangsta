/**
 * Rival archetype pool (GDD §4.4). Each run draws 2–4 rivals from these, with
 * personality/aggression rolled within the archetype's ranges (design/01 §0a) —
 * so every run has a different named antagonist to read and outplay.
 *
 * Traits are all 0..1 so downstream systems (turf wars, alliances, chaos beats)
 * can reason about them uniformly:
 *  - aggression: how readily they escalate to violence / turf pressure
 *  - cunning:    how well they hide moves and spring traps (the "ghost" axis)
 *  - reach:      political / institutional influence (the "politician" axis)
 */

import type { Band } from './countries';

export interface RivalArchetype {
  readonly id: string;
  /** Display name for the archetype, e.g. "The Violent Bull". */
  readonly name: string;
  readonly blurb: string;
  readonly aggression: Band;
  readonly cunning: Band;
  readonly reach: Band;
}

export const RIVAL_ARCHETYPES: readonly RivalArchetype[] = [
  {
    id: 'violent-bull',
    name: 'The Violent Bull',
    blurb: 'Answers everything with force. Loud, dangerous, easy to provoke.',
    aggression: { min: 0.7, max: 1.0 },
    cunning: { min: 0.1, max: 0.4 },
    reach: { min: 0.1, max: 0.4 },
  },
  {
    id: 'politician',
    name: 'The Politician',
    blurb: 'Owns officials, not corners. Beats you in rooms you never enter.',
    aggression: { min: 0.2, max: 0.5 },
    cunning: { min: 0.4, max: 0.7 },
    reach: { min: 0.7, max: 1.0 },
  },
  {
    id: 'ghost',
    name: 'The Ghost',
    blurb: 'Never seen, always ahead of you. You feel the moves before you see them.',
    aggression: { min: 0.2, max: 0.5 },
    cunning: { min: 0.7, max: 1.0 },
    reach: { min: 0.3, max: 0.6 },
  },
  {
    id: 'tech-cartel',
    name: 'The Tech Cartel',
    blurb: 'Runs on encrypted logistics and crypto. Efficient, cold, expanding.',
    aggression: { min: 0.3, max: 0.6 },
    cunning: { min: 0.6, max: 0.9 },
    reach: { min: 0.5, max: 0.8 },
  },
] as const;

/** Given-name pool for generated rivals (world gen tries to keep names unique). */
export const RIVAL_NAMES: readonly string[] = [
  'Reyes',
  'Marchetti',
  'Solano',
  'Okafor',
  'Delacroix',
  'Voss',
  'Amara',
  'Castellano',
  'Nkemi',
  'Sartre',
  'Zheng',
  'Bianco',
] as const;

/** Number of rivals per run (design/01 §0a: 2–4). */
export const RIVAL_COUNT: Band = { min: 2, max: 4 };
