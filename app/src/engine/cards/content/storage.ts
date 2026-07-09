/**
 * The storage failure/lesson arc (design/08 RAID-01 → STASH-01). RAID-01 makes the
 * anti-wipe rule felt in fiction — they took ONE place, not the empire — and hands
 * off to STASH-01, the diversification lesson. Both are `chained`: the raid system
 * (Prompt 06) fires RAID-01 when a stash is hit; its "spread the load" choice chains
 * to STASH-01. Failure reads as a SCENE, sequenced after wins (design/05 §4).
 */

import type { StoryCard } from '../schema';
import { ANTIWIPE_LESSON_FLAG } from './flags';

/** RAID-01 — They Took the Springtown Cache (design/08). Bounded loss, felt as story. */
const RAID: StoryCard = {
  id: 'RAID-01',
  trigger: null,
  triggerType: 'chained',
  act: 2,
  arc: 'storage',
  characters: ['A runner'],
  hookRole: 'core',
  oneShot: false, // repeatable — a raid can happen more than once
  prerequisites: [],
  sceneText:
    'The runner is out of breath. "They hit Springtown. Kicked the door at dawn, ' +
    'took everything in the back room." He watches your face. "But that\'s *all* ' +
    'they got — the jungle drop\'s clean, the container\'s clean. They didn\'t know ' +
    'about the rest." One location, one bad morning. Not the empire.',
  choices: [
    {
      label: 'Spread the load',
      effects: [{ kind: 'rep', track: 'business', amount: 1 }],
      firesCard: 'STASH-01',
      sceneResult: 'You resolve to never keep it all in one room again. The lesson has a price tag.',
    },
    {
      label: 'Find the leak',
      effects: [{ kind: 'rep', track: 'street', amount: 1 }],
      sceneResult: 'Someone talked. You go looking — was it a guard with nothing to lose?',
    },
    {
      label: 'Rebuild and move on',
      effects: [],
      sceneResult: 'You eat it and keep moving. Time heals a stash. Nothing here is fatal.',
    },
  ],
  reputationVariants: {
    street: 'The instinct is to find who talked and answer it.',
    business: 'The instinct is to price in the loss and restructure storage.',
    political: 'Vindication for the ones who spread and buried quietly.',
  },
  writerNotes:
    'Land the anti-wipe rule EMOTIONALLY — "they got one place, not you" (design/09 ' +
    'A.2). Never zero the player out here. Fire raid_resolved + raid_loss_pct.',
  telemetryFlag: 'raid_resolved',
};

/** STASH-01 — Somewhere To Put It (chained): the diversification lesson pays off. */
const STASH: StoryCard = {
  id: 'STASH-01',
  trigger: null,
  triggerType: 'chained',
  act: 2,
  arc: 'storage',
  characters: ['Your quartermaster'],
  hookRole: 'core',
  oneShot: true,
  prerequisites: [],
  sceneText:
    'She lays three keys on the table. "A jungle drop nobody walks to. A container ' +
    'that\'s just cargo among cargo. A safehouse in a name that isn\'t yours." She ' +
    'slides them across one at a time. "They can take a room. They can\'t take a room ' +
    'they don\'t know exists."',
  choices: [
    {
      label: 'Invest in storage',
      effects: [{ kind: 'cash', amount: -3000 }],
      setsFlags: { [ANTIWIPE_LESSON_FLAG]: true },
      sceneResult: 'You buy the spread. From now on a raid costs a corner of the empire, not the crown.',
    },
    {
      label: 'Stay lean for now',
      effects: [],
      setsFlags: { [ANTIWIPE_LESSON_FLAG]: true },
      sceneResult: 'You keep it simple and cheap — and you accept the risk with your eyes open.',
    },
  ],
  reputationVariants: {
    street: 'Spreading out reads as never being caught flat-footed again.',
    business: 'Framed as diversification — never one point of failure.',
    political: 'The safehouse in another name is the political read — deniability.',
  },
  writerNotes:
    'The competence track after the RAID-01 setback — turns a loss into a plan ' +
    '(design/09). Keep it short and practical. Fire storage_diversified.',
  telemetryFlag: 'storage_diversified',
};

export const STORAGE_CARDS: readonly StoryCard[] = [RAID, STASH];
