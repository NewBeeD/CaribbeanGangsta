/**
 * The first rival arc (design/08 RIV-01 + one full grudge arc). Silvio stays a name
 * and a threat here — his face is withheld for a bigger beat (the CIA/heat tier),
 * withholding the payoff for the biggest threshold (design/08 rules). The three
 * choices ARE the three reputation paths (violence / alliance / intel).
 */

import type { StoryCard } from '../schema';
import { SILVIO_HOSTILE_FLAG, SILVIO_WARY_FLAG, SILVIO_WATCHED_FLAG } from './flags';

/** RIV-01 — The First Message (design/08). Opens the Silvio grudge. */
const FIRST_MESSAGE: StoryCard = {
  id: 'RIV-01',
  trigger: 'beat.first-district',
  triggerType: 'deterministic',
  act: 2,
  arc: 'rival',
  characters: ['A runner', 'Silvio (offscreen)'],
  hookRole: 'return',
  oneShot: true,
  prerequisites: [],
  sceneText:
    'Your runner comes back without the money and with a split lip. "Man says the ' +
    'corner you just took? It had a name on it already. Silvio\'s name." He wipes his ' +
    'mouth. "He says enjoy it while it\'s warm."',
  choices: [
    {
      label: 'Send a message back',
      effects: [{ kind: 'rep', track: 'street', amount: 2 }, { kind: 'heat', amount: 6, source: 'rival-violence' }],
      setsFlags: { [SILVIO_HOSTILE_FLAG]: true },
      firesCard: 'RIV-02',
      sceneResult: 'Your answer is loud and physical. Silvio hears it. This is a war now.',
    },
    {
      label: 'Propose a split',
      effects: [{ kind: 'rep', track: 'business', amount: 2 }],
      setsFlags: { [SILVIO_WARY_FLAG]: true },
      firesCard: 'RIV-02',
      sceneResult: 'You send terms, not a threat. A fragile, watchful truce takes shape.',
    },
    {
      label: 'Say nothing, dig',
      effects: [{ kind: 'rep', track: 'political', amount: 1 }],
      setsFlags: { [SILVIO_WATCHED_FLAG]: true },
      firesCard: 'RIV-02',
      sceneResult: "You give him silence and start learning who Silvio owes. Knowledge keeps.",
    },
  ],
  reputationVariants: {
    street: 'The violent answer is the natural one — you don\'t give back a corner.',
    business: 'The split reads as arithmetic — a war costs more than a percentage.',
    political: 'Silence-and-intel reads as the long game — find the string to pull.',
  },
  writerNotes:
    'Silvio stays OFFSCREEN — a name and a threat, no face yet (design/08). His face ' +
    'is the payoff at the heat/CIA beat. Telegraph, don\'t land. Fire rival_arc_started.',
  telemetryFlag: 'rival_arc_started',
};

/** RIV-02 — The Grudge Deepens (chained): Silvio tests whichever path you chose. */
const GRUDGE: StoryCard = {
  id: 'RIV-02',
  trigger: null,
  triggerType: 'chained',
  act: 2,
  arc: 'rival',
  characters: ['Silvio\'s lieutenant', 'Silvio (offscreen)'],
  hookRole: 'return',
  oneShot: true,
  prerequisites: [],
  sceneText:
    'Silvio\'s people push back — a torched car if you swung, a lowballed counter if ' +
    'you offered peace, a planted rumor if you went quiet. Whatever you did, he\'s ' +
    'answering in kind. The grudge has a rhythm now, and it\'s speeding up.',
  choices: [
    {
      label: 'Escalate hard',
      effects: [{ kind: 'rep', track: 'street', amount: 2 }, { kind: 'heat', amount: 8, source: 'rival-escalate' }],
      firesCard: 'RIV-03',
      sceneResult: 'You raise the stakes past where he wanted to go. One of you will blink.',
    },
    {
      label: 'Buy off his people',
      effects: [{ kind: 'cash', amount: -5000 }, { kind: 'rep', track: 'business', amount: 1 }],
      firesCard: 'RIV-03',
      sceneResult: 'Money peels a few of his men loose. Silvio feels the ground shift under him.',
    },
    {
      label: 'Find his weak point',
      effects: [{ kind: 'rep', track: 'political', amount: 2 }],
      firesCard: 'RIV-03',
      sceneResult: 'You learn who Silvio fears more than you. That name is worth more than a fight.',
    },
  ],
  reputationVariants: {
    street: 'Every exchange is measured in respect taken and returned.',
    business: 'Every exchange is a cost line — you\'re pricing him out, not fighting.',
    political: 'Every exchange is intel — you\'re mapping his network as he swings.',
  },
  writerNotes:
    'The middle of the arc — pressure without payoff, so the resolution lands harder ' +
    '(design/05 §2 withheld reward). Silvio still faceless. Fire rival_arc_escalated.',
  telemetryFlag: 'rival_arc_escalated',
};

/** RIV-03 — Silvio Blinks (chained): the arc resolves off how you played it. */
const RESOLUTION: StoryCard = {
  id: 'RIV-03',
  trigger: null,
  triggerType: 'chained',
  act: 2,
  arc: 'rival',
  characters: ['Silvio'],
  hookRole: 'core',
  oneShot: true,
  prerequisites: [],
  sceneText:
    'For the first time, Silvio comes in person — older and more tired than the name ' +
    'made him sound. "You\'re not going away," he says, almost respectful. "So. We ' +
    'kill each other broke, or we carve it up and both eat." He waits. The whole ' +
    'grudge has led to this one room.',
  choices: [
    {
      label: 'Take him out',
      effects: [{ kind: 'rep', track: 'street', amount: 3 }, { kind: 'heat', amount: 12, source: 'rival-topple' }],
      sceneResult: 'You end it your way. His corners are yours — and so are his enemies.',
    },
    {
      label: 'Carve up the map',
      effects: [{ kind: 'rep', track: 'business', amount: 3 }, { kind: 'cash', amount: 8000 }],
      sceneResult: 'You draw a line down the island. Peace is boring and it is profitable.',
    },
    {
      label: 'Make him your man',
      effects: [{ kind: 'rep', track: 'political', amount: 3 }],
      sceneResult: 'You leave him standing — and owing you. A former rival is the best lieutenant.',
    },
  ],
  reputationVariants: {
    street: 'The payoff is dominance — the name that scared runners is under yours now.',
    business: 'The payoff is a market divided cleanly — a competitor turned partner.',
    political: 'The payoff is a vassal — Silvio kept alive is Silvio in your debt.',
  },
  writerNotes:
    'Silvio finally gets a FACE (the withheld payoff, design/08). The arc\'s end reads ' +
    'straight off the player\'s chosen path — earned, not scripted. Fire rival_arc_resolved.',
  telemetryFlag: 'rival_arc_resolved',
};

export const RIVAL_CARDS: readonly StoryCard[] = [FIRST_MESSAGE, GRUDGE, RESOLUTION];
