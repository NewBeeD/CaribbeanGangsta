/**
 * The loan-shark arc (design/08 DEBT-01 + the clear/default outcomes). DEBT-01 must
 * teach the ethical contract IN FICTION: full terms up front, and the freeze-offline
 * rule ("clock only runs when you're out here working") — this is where the player
 * learns absence is never punished (design/10 §4). Declining is a first-class path.
 *
 * The outcome cards are `chained` (no beat of their own); the debt engine (Prompt 10)
 * fires them by prerequisite once a loan is live, on a clean repayment or a missed
 * due date. Both keep the pressure on the CHARACTER, never on the human.
 */

import type { StoryCard } from '../schema';
import {
  DEBT_ACTIVE_FLAG,
  DEBT_CLEARED_FLAG,
  CASS_LINE_EXTENDED_FLAG,
} from './flags';

/** DEBT-01 — Papa Cass's First Offer (design/08). Opt-in; teaches the terms. */
const FIRST_OFFER: StoryCard = {
  id: 'DEBT-01',
  trigger: 'beat.papa-cass-offer',
  triggerType: 'variable',
  act: 1,
  arc: 'debt',
  characters: ['Papa Cass'],
  hookRole: 'session-end',
  oneShot: true,
  prerequisites: [],
  sceneText:
    "Papa Cass counts a roll he isn't going to give you yet. \"I heard you got a " +
    'buyer and no product. That\'s a sad little story." He snaps a rubber band around ' +
    'the cash. "Fifteen hundred. You pay me back eighteen. Take your time — clock ' +
    'only runs when *you\'re* out here working, not when you\'re home sleeping. But ' +
    'when it\'s due, it\'s *due*. We understand each other?"',
  choices: [
    {
      label: 'Take the loan ($1,500 @ 20%/wk)',
      effects: [{ kind: 'cash', amount: 1500 }],
      setsFlags: { [DEBT_ACTIVE_FLAG]: true },
      sceneResult: 'The roll hits your palm. Eighteen hundred owed, and a clock that sleeps when you do.',
    },
    {
      label: 'Take less, gentler terms',
      effects: [{ kind: 'cash', amount: 700 }],
      setsFlags: { [DEBT_ACTIVE_FLAG]: true },
      sceneResult: '"Careful. I like careful." A smaller stake, a lower ceiling. Cass respects the read.',
    },
    {
      label: 'Walk away',
      effects: [{ kind: 'rep', track: 'business', amount: 1 }],
      sceneResult: 'Cass shrugs. "Offer stands. It always does." You leave owing nothing. Slower, and free.',
    },
  ],
  reputationVariants: {
    street: 'Cass tests your spine — respect is the real collateral.',
    business: 'Cass talks pure numbers — "the cheapest money you\'ll ever hate paying back."',
    political: 'Cass name-drops who he *also* lends to — seeding the power map.',
  },
  writerNotes:
    'MUST teach freeze-offline in fiction (design/10 §4) — the clock line is not ' +
    'optional. Full terms shown, no balloon. Never guilt the human. Fire debt_first_offer.',
  telemetryFlag: 'debt_first_offer',
};

/** DEBT-CLEAR-01 — Paid In Full (chained): the leverage-worked payoff (design/08). */
const CLEARED: StoryCard = {
  id: 'DEBT-CLEAR-01',
  trigger: null,
  triggerType: 'chained',
  act: 2,
  arc: 'debt',
  characters: ['Papa Cass'],
  hookRole: 'core',
  oneShot: true,
  prerequisites: [DEBT_ACTIVE_FLAG],
  sceneText:
    "Papa Cass takes the money and, for once, actually counts it slow — not because " +
    'he doubts it, because he\'s enjoying it. "On time. In full." He peels the rubber ' +
    'band off a *fatter* roll this time and lets you see it. "So. Now we can talk ' +
    'about real numbers. You and me, we\'re gonna do business a while."',
  choices: [
    {
      label: 'Take the bigger line',
      effects: [{ kind: 'rep', track: 'street', amount: 1 }],
      setsFlags: { [DEBT_CLEARED_FLAG]: true, [CASS_LINE_EXTENDED_FLAG]: true },
      sceneResult: 'A higher ceiling, a standing relationship. Cass is your banker now, and your friend.',
    },
    {
      label: 'Thank him, borrow later',
      effects: [{ kind: 'rep', track: 'business', amount: 1 }],
      setsFlags: { [DEBT_CLEARED_FLAG]: true },
      sceneResult: 'You bank the goodwill instead of the cash. The bigger line stays open on your terms.',
    },
    {
      label: 'Ask about his world',
      effects: [{ kind: 'rep', track: 'political', amount: 1 }],
      setsFlags: { [DEBT_CLEARED_FLAG]: true },
      sceneResult: 'One line about who else is on Cass\'s book. A contact worth having, someday.',
    },
  ],
  reputationVariants: {
    street: 'Cass respects that you didn\'t flinch — you\'re "good people" now.',
    business: 'Framed as a credit rating earned — "cheapest money just got cheaper."',
    political: 'Cass hints who else is on his book — a contact worth having.',
  },
  writerNotes:
    'Where voluntary debt FEELS like leverage, not a trap — the ethical case pays off ' +
    '(design/10). Don\'t oversell; Cass\'s warmth is the reward. Fire debt_repaid_clean.',
  telemetryFlag: 'debt_repaid_clean',
};

/** DEBT-DEFAULT-01 — Papa Cass Sends Someone (chained): a scare, heat-free (design/08). */
const DEFAULTED: StoryCard = {
  id: 'DEBT-DEFAULT-01',
  trigger: null,
  triggerType: 'chained',
  act: 2,
  arc: 'debt',
  characters: ["Two of Papa Cass's people"],
  hookRole: 'core',
  oneShot: true,
  prerequisites: [DEBT_ACTIVE_FLAG],
  sceneText:
    "They're waiting on your step, not hiding it. The big one turns your own door " +
    'handle over in his hand like he\'s thinking about keeping it. "Papa Cass says ' +
    'hi. Says he likes you, that\'s why he sent us to *talk*." He sets the handle ' +
    'down, gently. "Talk\'s the cheap part. Don\'t make him send us back."',
  choices: [
    {
      label: 'Pay in full',
      effects: [],
      setsFlags: { [DEBT_CLEARED_FLAG]: true },
      firesCard: 'DEBT-CLEAR-01',
      sceneResult: 'You clear it on the spot. The big one nods, almost disappointed. Cass warms right up.',
    },
    {
      label: 'Partial pay + new term',
      effects: [{ kind: 'cash', amount: -500 }],
      sceneResult: 'You buy his patience, not your freedom. No asset lost — the clock just resets.',
    },
    {
      label: 'Do him a favor instead',
      effects: [{ kind: 'rep', track: 'street', amount: 1 }],
      sceneResult: 'You move a package for Cass instead of paying. Debt as a relationship, not a receipt.',
    },
  ],
  reputationVariants: {
    street: 'A face-off — respect and menace both on the table.',
    business: 'Renegotiation — "what does this cost to make it go away, exactly?"',
    political: 'Leverage — you know someone Cass doesn\'t want hearing about this.',
  },
  writerNotes:
    'A SCARE, heat-free (design/10 §5 rung 2) — no asset taken yet. The clock froze ' +
    'while they were away. No real-world guilt, ever. Fire debt_default_visit.',
  telemetryFlag: 'debt_default_visit',
};

export const DEBT_CARDS: readonly StoryCard[] = [FIRST_OFFER, CLEARED, DEFAULTED];
