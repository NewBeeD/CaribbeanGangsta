/**
 * The run-end scenes (design/08 failure-side + the tally; design/05 §4). The fall is
 * the deterministic, telegraphed death-spiral beat — written as a SCENE, never an
 * error screen — and the run-end tally banks the height you climbed to as your score,
 * pointing straight at the next run (the endowed-progress / beat-it-next-time hook).
 *
 * These carry no reward effects: the run is over. Their job is to make the fall land
 * as EARNED (the signs were readable) and the score feel like a height reached, so
 * the loss is a beginning, not a punishment.
 */

import type { StoryCard } from '../schema';

/** FALL-01 — The Fall (beat.death-spiral): wiped, marked, out of lifelines. */
const FALL: StoryCard = {
  id: 'FALL-01',
  trigger: 'beat.death-spiral',
  triggerType: 'deterministic',
  act: 4,
  arc: 'endgame',
  characters: ['You'],
  hookRole: 'core',
  oneShot: true,
  prerequisites: [],
  sceneText:
    'It doesn\'t come all at once. It comes as the last door closing — the lender who ' +
    'won\'t answer, the official who won\'t warn you, the corner that isn\'t yours ' +
    'anymore. The protection you paid for evaporates, and the hunt you outran for so ' +
    'long finally has nothing left to chase but you. You saw every step of it coming. ' +
    'That\'s the cruelest part. This is the fall.',
  choices: [
    {
      label: 'Face the end',
      effects: [],
      sceneResult: 'No more moves on the board. However it ends, you were somebody for a while.',
    },
  ],
  reputationVariants: {
    street: 'You go out the way you came up — on your feet, on your own water.',
    business: 'The empire was a balance sheet; the last line is red, and you close the book.',
    political: 'Every favor is called in, every string cut. Even the bought men are gone.',
  },
  writerNotes:
    'The fall is DETERMINISTIC and TELEGRAPHED (GDD §5.4; design/05 §4) — "you saw ' +
    'every step" makes it earned, not an ambush. A scene, never a game-over toast. ' +
    'Sequenced after wins. Fire death_spiral_reached.',
  telemetryFlag: 'death_spiral_reached',
};

/** RUNEND-01 — The Tally (beat.run-ends): bank the height, aim at the next run. */
const TALLY: StoryCard = {
  id: 'RUNEND-01',
  trigger: 'beat.run-ends',
  triggerType: 'deterministic',
  act: 4,
  arc: 'endgame',
  characters: ['You'],
  hookRole: 'session-end',
  oneShot: true,
  prerequisites: [],
  sceneText:
    'When it\'s over, the numbers stop moving and finally hold still long enough to ' +
    'read. Not where you ended — where you PEAKED. The most you ever held, the most ' +
    'you ever cleaned, the biggest the empire ever got. That height is your score now, ' +
    'carved in and kept. Somebody will climb higher. Maybe it\'s you, next time.',
  choices: [
    {
      label: 'Bank the run',
      effects: [],
      sceneResult: 'The height is recorded. The board remembers how big you got. Beat it next run.',
    },
  ],
  reputationVariants: {
    street: 'They\'ll tell the story of how high you got long after the fall.',
    business: 'Peak net worth is the ledger\'s final, honest line — the height, banked.',
    political: 'The name outlives the empire. That was always the real currency.',
  },
  writerNotes:
    'The score banks from PEAK values (design/01 §7) — a late wipe still records the ' +
    'climb. Close one run, open the next (GDD §11 session-end hook). Fire run_ended.',
  telemetryFlag: 'run_ended',
};

export const ENDGAME_CARDS: readonly StoryCard[] = [FALL, TALLY];
