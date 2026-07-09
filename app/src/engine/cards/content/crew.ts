/**
 * The crew betrayal arc opener (design/08 CREW-BETRAY-01). A TELEGRAPHED beat — the
 * warning signs are readable prose, and every choice is an intervention with agency
 * (design/02 §4). The wavering lieutenant is resolved at presentation time (the beat
 * fires off a real crew member mid-arc), so the card's effects stay id-agnostic —
 * loyalty targeting is applied by the presenter/crew engine, not hardcoded here.
 */

import type { StoryCard } from '../schema';

/** CREW-BETRAY-01 — Warning Signs (design/08). Opens the betrayal chain. */
const WARNING_SIGNS: StoryCard = {
  id: 'CREW-BETRAY-01',
  trigger: 'beat.crew-betrayal',
  triggerType: 'variable',
  act: 2,
  arc: 'crew',
  characters: ['A wavering lieutenant', 'Deon'],
  hookRole: 'return',
  oneShot: true,
  prerequisites: [],
  sceneText:
    'His numbers are clean. Too clean. The take is up, but he\'s stopped looking you ' +
    'in the eye, and last night he took a call outside in the rain rather than in the ' +
    'room. Deon noticed it too. He didn\'t say anything. He didn\'t have to.',
  choices: [
    {
      label: 'Confront him',
      effects: [{ kind: 'rep', track: 'street', amount: 1 }],
      sceneResult: 'You force it into the open early. How it goes depends on how you\'ve treated him.',
    },
    {
      label: 'Buy him back',
      effects: [{ kind: 'cash', amount: -4000 }, { kind: 'rep', track: 'business', amount: 1 }],
      sceneResult: 'Money or a promotion — it resets loyalty IF the grievance was material, not personal.',
    },
    {
      label: 'Feed him false info',
      effects: [{ kind: 'rep', track: 'political', amount: 1 }],
      sceneResult: 'A trap. If he\'s turning, you learn it. If he isn\'t, you create the betrayal you feared.',
    },
    {
      label: 'Ignore it',
      effects: [],
      sceneResult: 'You let it ride. The arc keeps walking toward the flip on its own timer.',
    },
  ],
  reputationVariants: {
    street: 'Confrontation framed as respect and, if it comes to it, violence.',
    business: 'Framed as renegotiation — realign his incentives before he walks.',
    political: 'Framed as leverage and information — know his moves before he makes them.',
  },
  writerNotes:
    'The REASON for the wavering reads from his memory log (passed over? underpaid? ' +
    'family pressure?) — the same card personalizes per player (design/02 §3). Leave ' +
    'WHO he was calling implied until the next card. Fire betrayal_arc_started.',
  telemetryFlag: 'betrayal_arc_started',
};

export const CREW_CARDS: readonly StoryCard[] = [WARNING_SIGNS];
