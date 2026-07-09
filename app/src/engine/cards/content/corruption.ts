/**
 * The corruption arc (design/08 CORR-01 + CORR-FLIP-01). CORR-01 introduces the
 * port-bribe network with the estimable-but-fair contract (the number shown is the
 * number rolled). CORR-FLIP-01 is the failure branch — a paid official goes quiet —
 * written as a SCENE with readable warning signs, never an error toast (design/08).
 */

import type { StoryCard } from '../schema';
import { PORT_BEAUMONT_PAID_FLAG, BEAUMONT_FED_FALSE_FLAG } from './flags';

/** CORR-01 — Plata o Plomo (design/08). Unlocks the port-bribe loop. */
const PLATA_O_PLOMO: StoryCard = {
  id: 'CORR-01',
  trigger: 'beat.port-official-offer',
  triggerType: 'deterministic',
  act: 2,
  arc: 'corruption',
  characters: ['Officer Beaumont'],
  hookRole: 'core',
  oneShot: true,
  prerequisites: [],
  sceneText:
    "Beaumont doesn't touch the envelope. He just looks at it, then at the container " +
    'manifest, then out at the water. "That box goes through clean, or it goes ' +
    'through a scanner. Your choice, not mine." He finally meets your eye. "*Plata o ' +
    'plomo*, my friend. Silver\'s cheaper. I\'d take the silver."',
  choices: [
    {
      label: 'Pay his price',
      effects: [{ kind: 'cash', amount: -4000 }],
      setsFlags: { [PORT_BEAUMONT_PAID_FLAG]: true },
      sceneResult: 'The envelope disappears. Your seizure risk drops to a rumor. The box sails.',
    },
    {
      label: 'Haggle',
      effects: [{ kind: 'cash', amount: -2500 }, { kind: 'rep', track: 'business', amount: 1 }],
      setsFlags: { [PORT_BEAUMONT_PAID_FLAG]: true },
      sceneResult: 'You push; he grumbles and takes less. Cheaper safety, a little colder handshake.',
    },
    {
      label: 'Ship anyway',
      effects: [{ kind: 'heat', amount: 3, source: 'corruption-walk' }],
      sceneResult: 'You walk. The box rides at full risk. If it lands clean, you saved a fortune.',
    },
    {
      label: 'Lean on him',
      effects: [{ kind: 'rep', track: 'street', amount: 2 }, { kind: 'heat', amount: 5, source: 'corruption-threat' }],
      setsFlags: { [PORT_BEAUMONT_PAID_FLAG]: true },
      sceneResult: 'You get the discount by fear. Beaumont smiles thin — and remembers this.',
    },
  ],
  reputationVariants: {
    street: 'The threat reads as mutual sizing-up; Beaumont respects nerve.',
    business: 'Framed as a recurring arrangement — "a percentage, every box."',
    political: 'He hints he answers to someone above him — seeding the payroll ladder.',
  },
  writerNotes:
    'The number shown IS the number rolled (design/09). Keep the menace in-fiction, on ' +
    'the character, never the player. Who Beaumont answers to stays a gap. Fire ' +
    'corruption_first_bribe_offered.',
  telemetryFlag: 'corruption_first_bribe_offered',
};

/** CORR-FLIP-01 — The Cop Goes Quiet (design/08). The payroll's betrayal branch. */
const FLIP: StoryCard = {
  id: 'CORR-FLIP-01',
  trigger: 'beat.official-flip',
  triggerType: 'variable',
  act: 3,
  arc: 'corruption',
  characters: ['Officer Beaumont'],
  hookRole: 'core',
  oneShot: true,
  prerequisites: [],
  sceneText:
    'Beaumont used to pick up on the first ring. Now it goes three, four, and his ' +
    "voice is careful, like someone's in the room. \"Everything's fine,\" he says, " +
    "which he's never once said before. The tip-off you paid for this week didn't " +
    'come. Somewhere, quietly, the price of your safety just changed hands.',
  choices: [
    {
      label: 'Raise his pay, cool your heat',
      effects: [{ kind: 'cash', amount: -6000 }, { kind: 'heat', amount: -5, source: 'corruption-recover' }],
      sceneResult: 'You make loyalty the better deal again. If the grievance was money, he comes back.',
    },
    {
      label: 'Feed him false intel',
      effects: [{ kind: 'rep', track: 'political', amount: 2 }],
      setsFlags: { [BEAUMONT_FED_FALSE_FLAG]: true },
      sceneResult: 'You poison the well. If he turned, LE drinks it. If he didn\'t, you burned a loyal man.',
    },
    {
      label: 'Cut him loose',
      effects: [{ kind: 'heat', amount: 4, source: 'corruption-cut' }],
      sceneResult: 'You stop paying. The tip-offs stop too — but so does your exposure through him.',
    },
    {
      label: 'Remove him',
      effects: [{ kind: 'rep', track: 'street', amount: 2 }, { kind: 'heat', amount: 14, source: 'corruption-silence' }],
      sceneResult: 'The wire goes silent for good. Big heat — and every official on the coast hears it.',
    },
  ],
  reputationVariants: {
    street: 'The read is "he\'s soft — handle it before it handles you."',
    business: 'The read is "outbid the rival, make loyalty the better deal."',
    political: 'Pull the string above him — remind him who he really answers to.',
  },
  writerNotes:
    'Warning signs are READABLE prose, not a bar (three rings, "everything\'s fine," ' +
    'the missing tip). The player had the intel to act — that\'s what makes the loss ' +
    'fair. Who turned him stays a gap. Fire official_flip_started.',
  telemetryFlag: 'official_flip_started',
};

export const CORRUPTION_CARDS: readonly StoryCard[] = [PLATA_O_PLOMO, FLIP];
