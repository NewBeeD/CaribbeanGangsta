/**
 * Onboarding cards (design/08 ONB-01 + the guided flow; GDD §9 invisible tutorial).
 * The scene carries the teaching — never a card labeled "tutorial", never a wall of
 * UI text. The come-up must produce a WIN inside the first minutes (beat the churn
 * cliff), so ONB-01 is a guaranteed-success first sale, then the flow hands off to
 * heat, crew, a front, and a session-end hook (design/08; GDD §11).
 */

import type { StoryCard } from '../schema';
import {
  FIRST_SALE_FLAG,
  HEAT_LESSON_FLAG,
  FIRST_RUNNER_FLAG,
} from './flags';

/** ONB-01 — First Sale (Auntie Pearl). The guaranteed win (design/08 ONB-01). */
const FIRST_SALE: StoryCard = {
  id: 'ONB-01',
  trigger: 'beat.first-sale',
  triggerType: 'deterministic',
  act: 1,
  arc: 'onboarding',
  characters: ['Auntie Pearl'],
  hookRole: 'onboarding',
  oneShot: true,
  prerequisites: [],
  sceneText:
    "Auntie Pearl doesn't look up from her fruit stall. \"You want to eat in this " +
    'town, you learn to move things quiet." She slides a folded cloth across the ' +
    'crate. "Somebody down the way is buying. Don\'t make it a story."',
  choices: [
    {
      label: 'Make the sell',
      effects: [{ kind: 'cash', amount: 500 }],
      setsFlags: { [FIRST_SALE_FLAG]: true },
      firesCard: 'ONB-02',
      sceneResult: 'The cloth changes hands. Money in your pocket that was never there before.',
    },
    {
      label: '"Why you helping me?"',
      effects: [{ kind: 'cash', amount: 500 }, { kind: 'rep', track: 'street', amount: 1 }],
      setsFlags: { [FIRST_SALE_FLAG]: true },
      firesCard: 'ONB-02',
      sceneResult: 'Pearl almost smiles. "I knew your mother." That\'s all she gives you.',
    },
  ],
  reputationVariants: {
    street: 'Pearl respects nerve — "You got sand, I like that."',
    business: 'Pearl frames it as arithmetic — "Buy low, move fast, count twice."',
    political: "Pearl mentions who you don't cross — seeding the world's power map.",
  },
  writerNotes:
    'The scene carries the teaching (GDD §9); Pearl\'s own history stays a gap. ' +
    'Fire onboarding_first_sale_complete.',
  telemetryFlag: 'onboarding_first_sale_complete',
};

/** ONB-02 — The Next Move: teach buy-low/sell-high in fiction (chained). */
const NEXT_MOVE: StoryCard = {
  id: 'ONB-02',
  trigger: null,
  triggerType: 'chained',
  act: 1,
  arc: 'onboarding',
  characters: ['Auntie Pearl'],
  hookRole: 'onboarding',
  oneShot: true,
  prerequisites: [FIRST_SALE_FLAG],
  sceneText:
    'Pearl watches you count it twice. "Now you know the trick — it\'s all buy cheap, ' +
    'sell dear, and don\'t get seen doing either." She nods at the water. "Price ' +
    'moves. Learn its moods. And the man in the blue shirt? He\'s been looking."',
  choices: [
    {
      label: 'Watch the price, move smart',
      effects: [{ kind: 'rep', track: 'business', amount: 1 }],
      firesCard: 'ONB-HEAT',
      sceneResult: 'You start reading the market like weather. The blue shirt drifts closer.',
    },
    {
      label: 'Keep your head down',
      effects: [],
      firesCard: 'ONB-END',
      sceneResult: 'Quiet and careful. The blue shirt loses interest — for now.',
    },
  ],
  reputationVariants: {
    street: 'Pearl talks instinct — "you feel a come-up, you take it."',
    business: 'Pearl talks arbitrage — "the trough and the peak, count twice."',
    political: 'Pearl warns which eyes matter — some watchers you can buy.',
  },
  writerNotes:
    'Teaches the deal loop through Pearl, not a tooltip (GDD §9). The "blue shirt" ' +
    'is an apophenia gap that becomes the first heat scare. Fire onboarding_deal_taught.',
  telemetryFlag: 'onboarding_deal_taught',
};

/** ONB-HEAT — First Heat Scare (survivable): teach lie-low in fiction (chained). */
const HEAT_SCARE: StoryCard = {
  id: 'ONB-HEAT',
  trigger: null,
  triggerType: 'chained',
  act: 1,
  arc: 'onboarding',
  characters: ['Auntie Pearl'],
  hookRole: 'onboarding',
  oneShot: true,
  prerequisites: [FIRST_SALE_FLAG],
  sceneText:
    'The blue shirt was a cop, and now a patrol car idles at the corner two mornings ' +
    'running. Pearl covers her fruit with a cloth. "Heat\'s like the sun, child. You ' +
    'don\'t fight it — you get out of it a while, and it passes." Nothing burned yet.',
  choices: [
    {
      label: 'Lie low a while',
      effects: [{ kind: 'heat', amount: -8, source: 'onboarding-lie-low' }],
      setsFlags: { [HEAT_LESSON_FLAG]: true },
      firesCard: 'ONB-RUNNER',
      sceneResult: 'You go quiet. Two days later the car is gone. It passed, just like she said.',
    },
    {
      label: 'Push through anyway',
      effects: [{ kind: 'heat', amount: 4, source: 'onboarding-push' }, { kind: 'cash', amount: 300 }],
      setsFlags: { [HEAT_LESSON_FLAG]: true },
      firesCard: 'ONB-RUNNER',
      sceneResult: 'You make the money — and the car stays another day. Now you know the cost.',
    },
  ],
  reputationVariants: {
    street: 'Pearl frames it as patience over pride — living to work again.',
    business: 'Pearl frames it as risk management — heat is a cost like any other.',
    political: 'Pearl hints a paid friend could make the car simply not show up.',
  },
  writerNotes:
    'The FIRST loss-adjacent moment, and it is SURVIVABLE (design/05 §4) — teaches ' +
    'the heat/lie-low loop as a scene, never an error toast. Fire onboarding_heat_survived.',
  telemetryFlag: 'onboarding_heat_survived',
};

/** ONB-RUNNER — Hire the First Runner: the crew relatedness seed (chained). */
const FIRST_RUNNER: StoryCard = {
  id: 'ONB-RUNNER',
  trigger: null,
  triggerType: 'chained',
  act: 1,
  arc: 'onboarding',
  characters: ['A young runner'],
  hookRole: 'onboarding',
  oneShot: true,
  prerequisites: [FIRST_SALE_FLAG],
  sceneText:
    'A kid keeps turning up wherever you are — fast, quiet, hungry. "You can\'t be ' +
    'everywhere," he says, like it\'s obvious. "I can. Cut me in and I\'ll run for ' +
    'you." Pearl watches to see what you do with a person, not just a package.',
  choices: [
    {
      label: 'Bring him on',
      effects: [{ kind: 'cash', amount: -100 }, { kind: 'rep', track: 'street', amount: 1 }],
      setsFlags: { [FIRST_RUNNER_FLAG]: true },
      firesCard: 'ONB-END',
      sceneResult: 'You put him on. He grins like you handed him the world. Now you have crew.',
    },
    {
      label: 'Work alone for now',
      effects: [],
      firesCard: 'ONB-END',
      sceneResult: 'You wave him off. He shrugs — "offer stands" — and melts back into the market.',
    },
  ],
  reputationVariants: {
    street: 'The kid reads as loyalty earned young — you don\'t forget who was there first.',
    business: 'The kid pitches himself as leverage — one of you becomes two of you.',
    political: 'The kid knows every stall and whisper on the block — eyes are worth wages.',
  },
  writerNotes:
    'The relatedness pillar seeded early (design/02 §0). Whether you hire or not is a ' +
    'legible playstyle, not a wrong answer. Fire onboarding_first_crew.',
  telemetryFlag: 'onboarding_first_crew',
};

/** ONB-END — Session-End Hook: close the first session on an open loop (design/08; GDD §11). */
const SESSION_END: StoryCard = {
  id: 'ONB-END',
  trigger: null,
  triggerType: 'chained',
  act: 1,
  arc: 'onboarding',
  characters: ['Auntie Pearl'],
  hookRole: 'session-end',
  oneShot: true,
  prerequisites: [FIRST_SALE_FLAG],
  sceneText:
    'Night on the water. Pearl closes her stall and stops beside you. "You did ' +
    'alright today. Sleep." Then, half to herself: "Word is somebody upriver wants ' +
    'to meet the new name on the docks. That\'s tomorrow\'s trouble." She walks off ' +
    'into the dark, leaving the sentence hanging.',
  choices: [
    {
      label: 'Rest — trouble waits',
      effects: [{ kind: 'queue-choice', summary: 'Someone upriver wants to meet the new name on the docks.', choiceKind: 'return-hook' }],
      sceneResult: 'You let it wait. But the sentence stays with you all the way home.',
    },
  ],
  reputationVariants: {
    street: 'The dangling threat reads as a challenge you already want to answer.',
    business: 'The meeting reads as a first negotiation — opportunity dressed as risk.',
    political: 'The unnamed party reads as the first real player on the board.',
  },
  writerNotes:
    'The session-end hook (GDD §11) — leave the loop OPEN so tomorrow has a reason. ' +
    'The queued choice is the return hook the presenter surfaces (Prompt 22). Fire ' +
    'session_end_hook_shown.',
  telemetryFlag: 'session_end_hook_shown',
};

export const ONBOARDING_CARDS: readonly StoryCard[] = [
  FIRST_SALE,
  NEXT_MOVE,
  HEAT_SCARE,
  FIRST_RUNNER,
  SESSION_END,
];
