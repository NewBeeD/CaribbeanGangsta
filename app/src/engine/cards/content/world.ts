/**
 * The mid/late-game world beats rendered as scenes (design/08 HEAT-03, ARMS-01,
 * ROUTE-01, MARKET-01, and the acts II–III milestone cards from design/05 §2). These
 * bind to the deterministic act-defining beats and the variable texture beats so no
 * MVP beat is left without a scene. Withheld payoffs land at the biggest thresholds
 * (design/08 rules): Silvio/Reyes get faces at the CIA tier, not before.
 */

import type { StoryCard } from '../schema';
import { ALT_ROUTE_FLAG } from './flags';

/** FRONT-01 — The First Front (beat.first-front): laundering, taught by a banker. */
const FIRST_FRONT: StoryCard = {
  id: 'FRONT-01',
  trigger: 'beat.first-front',
  triggerType: 'deterministic',
  act: 2,
  arc: 'corruption',
  characters: ['A tired banker'],
  hookRole: 'core',
  oneShot: true,
  prerequisites: [],
  sceneText:
    'The banker locks the office door before he talks. "Dirty money is loud — it ' +
    "can't buy a house, can't sit in a bank. A bar, though? A car wash? Nobody counts " +
    'the cups of coffee." He slides you a lease. "This is how loud money learns to ' +
    'whisper. Slow. Patient. Clean on the far end."',
  choices: [
    {
      label: 'Open the front',
      effects: [{ kind: 'rep', track: 'business', amount: 2 }],
      sceneResult: 'You sign. A slow, quiet machine that turns dirty cash into money you can spend.',
    },
    {
      label: 'Ask how it can go wrong',
      effects: [{ kind: 'rep', track: 'political', amount: 1 }],
      sceneResult: '"Greed and speed," he says. "Launder too fast and the pattern screams." You listen.',
    },
  ],
  reputationVariants: {
    street: 'The front reads as a cover — a place that\'s always got a reason for cash.',
    business: 'Framed as balance sheets — the real skill under the whole empire.',
    political: 'The banker hints which inspectors look the other way — for a price.',
  },
  writerNotes:
    'Teaches laundering as a scene, not a mechanic dump (GDD §9). The banker\'s own ' +
    'exposure is an implied gap. Fire laundering_first_front.',
  telemetryFlag: 'laundering_first_front',
};

/** MAP-01 — On The Map (beat.on-the-map): a DEA file opens with your name. */
const ON_THE_MAP: StoryCard = {
  id: 'MAP-01',
  trigger: 'beat.on-the-map',
  triggerType: 'deterministic',
  act: 3,
  arc: 'heat',
  characters: ['An unseen analyst'],
  hookRole: 'core',
  oneShot: true,
  prerequisites: [],
  sceneText:
    'A million clean. You feel it the way you feel weather change. Somewhere in a ' +
    'grey building a folder gets a name on the tab — yours — and a photo, and a ' +
    'first thin sheet of paper. You\'re not a rumor anymore. You\'re a case.',
  choices: [
    {
      label: 'Go quieter, spend to cool',
      effects: [{ kind: 'heat', amount: -8, source: 'on-map-cool' }, { kind: 'cash', amount: -10000 }],
      sceneResult: 'You buy silence and shadow. The folder stays thin a while longer.',
    },
    {
      label: 'Wear it — you earned it',
      effects: [{ kind: 'rep', track: 'street', amount: 3 }, { kind: 'heat', amount: 4, source: 'on-map-flaunt' }],
      sceneResult: 'Let them watch. The name that scares runners now scares the grey buildings too.',
    },
  ],
  reputationVariants: {
    street: 'Being a case is a badge — you climbed high enough for them to notice.',
    business: 'The file is a cost of scale — you price in the attention and keep building.',
    political: 'A file is a liability to be managed — who can you pay to keep it thin?',
  },
  writerNotes:
    'The faceless heat system begins to personalize (design/05 §2). Withhold the AGENT ' +
    'until the CIA tier (HEAT-03). Fire on_the_map_reached.',
  telemetryFlag: 'on_the_map_reached',
};

/** HEAT-03 — It Gets Personal (beat.heat-taskforce-named): Reyes gets a face. */
const TASKFORCE: StoryCard = {
  id: 'HEAT-03',
  trigger: 'beat.heat-taskforce-named',
  triggerType: 'deterministic',
  act: 3,
  arc: 'heat',
  characters: ['Agent Reyes'],
  hookRole: 'core',
  oneShot: true,
  prerequisites: [],
  sceneText:
    "The photo on your burner isn't from your people. It's of you — grainy, long " +
    'lens, the marina last Tuesday. A number you don\'t know sends one line: "We ' +
    'should talk before this gets loud. — Reyes." Somebody finally put your file on ' +
    'their own desk and decided to make it their career.',
  choices: [
    {
      label: 'Go dark, spend to cool heat',
      effects: [{ kind: 'heat', amount: -10, source: 'reyes-godark' }, { kind: 'cash', amount: -15000 }],
      sceneResult: 'You vanish for a while. Reyes\'s trail goes cold — she is patient, though.',
    },
    {
      label: 'Feel her out',
      effects: [{ kind: 'rep', track: 'political', amount: 2 }],
      sceneResult: 'You take the meeting. Dangerous — but a door to informants and leverage cracks open.',
    },
    {
      label: 'Make yourself too expensive to chase',
      effects: [{ kind: 'rep', track: 'street', amount: 2 }, { kind: 'heat', amount: 10, source: 'reyes-escalate' }],
      sceneResult: 'You raise the cost of the hunt. Reyes only digs in harder — you may have made a zealot.',
    },
  ],
  reputationVariants: {
    street: 'Intimidation branch — high risk of making Reyes a martyr/zealot.',
    business: 'A "make the problem cost more than it\'s worth" bribe branch.',
    political: 'A corrupt-official branch opens — call in a favor above Reyes.',
  },
  writerNotes:
    'A BIG withheld beat — the faceless system finally gets a person. Don\'t spend ' +
    'Reyes cheaply; season-long antagonist. Fire heat_tier_cia_reached + sentiment survey.',
  telemetryFlag: 'heat_tier_cia_reached',
};

/** CROWN-01 — The Crown Weighs Heavy (beat.crown-weighs-heavy): the personal cost. */
const CROWN: StoryCard = {
  id: 'CROWN-01',
  trigger: 'beat.crown-weighs-heavy',
  triggerType: 'deterministic',
  act: 3,
  arc: 'personal',
  characters: ['Your sister'],
  hookRole: 'plateau',
  oneShot: true,
  prerequisites: [],
  sceneText:
    'At the top, the view is mostly of what it cost. Your sister sets a plate in ' +
    'front of you like she used to. "You don\'t have to tell me what you do," she ' +
    'says. "I just want to know you\'re still in there." The rice is exactly how you ' +
    'remember it. For a second, none of the empire is in the room.',
  choices: [
    {
      label: 'Be honest with her',
      effects: [{ kind: 'rep', track: 'street', amount: 1 }],
      sceneResult: 'You let her in. The bond deepens — and now she can be reached, if anyone tries.',
    },
    {
      label: 'Keep her out of it',
      effects: [],
      sceneResult: 'You protect her with distance. A small, quiet cost you\'ll feel later.',
    },
  ],
  reputationVariants: {
    street: 'The read is loyalty to blood over everything you built.',
    business: 'Even here, the transactional reflex — what does honesty cost?',
    political: 'Family as the one relationship you can\'t leverage, and it unsettles you.',
  },
  writerNotes:
    'A BREATH at the peak — no sim reward on purpose (design/08 PLATEAU-01). Contrast ' +
    'makes the coming fall hit harder. Keep it short. Fire crown_weighs_heavy.',
  telemetryFlag: 'crown_weighs_heavy',
};

/** ARMS-01 — The Iron River (beat.arms-unlock): a new systems layer, higher heat. */
const ARMS: StoryCard = {
  id: 'ARMS-01',
  trigger: 'beat.arms-unlock',
  triggerType: 'deterministic',
  act: 3,
  arc: 'arms',
  characters: ['Dutch'],
  hookRole: 'core',
  oneShot: true,
  prerequisites: [],
  sceneText:
    'Dutch talks fast, like he always does. "Gun laws down here are tight. Up ' +
    '*there*?" He grins. "Cousin walks into three shops in one afternoon, cash, no ' +
    'questions, comes out with a trunk full. Iron River, baby — it flows *south*." He ' +
    'leans in. "But these bring more heat than powder ever did. You sure you want in?"',
  choices: [
    {
      label: 'Open the arms pipeline',
      effects: [{ kind: 'rep', track: 'street', amount: 2 }, { kind: 'heat', amount: 6, source: 'arms-open' }],
      sceneResult: 'A whole new market, a whole new heat. The stakes just changed shape.',
    },
    {
      label: 'Buy only for protection',
      effects: [{ kind: 'rep', track: 'political', amount: 1 }],
      sceneResult: 'Iron for your own people, not for resale. Less heat, no new line — a defensive read.',
    },
    {
      label: 'Pass for now',
      effects: [],
      sceneResult: 'You stay powder-only, low and quiet. Dutch shrugs — "offer stays open."',
    },
  ],
  reputationVariants: {
    street: 'The muscle/turf synergy is the whole appeal.',
    business: 'Framed as a margin play — another product, another market.',
    political: 'Wary of the heat — guns draw federal attention faster than drugs.',
  },
  writerNotes:
    'Ground the realism as FLAVOR and consequence, never a how-to — keep it at Dutch\'s ' +
    'bragging altitude (GDD §8). This beat should feel like the stakes changed. Fire ' +
    'arms_unlocked + sentiment survey.',
  telemetryFlag: 'arms_unlocked',
};

/** ROUTE-OPEN-01 — Wider Water (beat.international-route): the map widens. */
const ROUTE_OPEN: StoryCard = {
  id: 'ROUTE-OPEN-01',
  trigger: 'beat.international-route',
  triggerType: 'deterministic',
  act: 3,
  arc: 'economy',
  characters: ['Yolanda'],
  hookRole: 'core',
  oneShot: true,
  prerequisites: [],
  sceneText:
    'Yolanda unrolls a bigger chart than you\'ve ever used. "Local water\'s a pond. ' +
    'This—" she draws a line off the edge of the island, toward other flags, other ' +
    'coasts "—this is the ocean. More money out there. More people who\'d kill for a ' +
    'lane on it." She looks up. "You ready to be one of them?"',
  choices: [
    {
      label: 'Go international',
      effects: [{ kind: 'rep', track: 'business', amount: 3 }, { kind: 'heat', amount: 5, source: 'route-open' }],
      sceneResult: 'The map — and the stakes — widen. You\'re playing an ocean now, not a pond.',
    },
    {
      label: 'Master the pond first',
      effects: [{ kind: 'rep', track: 'street', amount: 1 }],
      sceneResult: 'You hold the local water tight before reaching. Patience is a lane too.',
    },
  ],
  reputationVariants: {
    street: 'Reaching out is claiming water nobody said was yours.',
    business: 'Framed as expansion — new markets, new supply lines, redundancy.',
    political: 'International means foreign officials — a whole new payroll ladder.',
  },
  writerNotes:
    'The scope-widening beat (design/05 §2). Yolanda\'s competence is the relatedness ' +
    'hook. Fire international_route_opened.',
  telemetryFlag: 'international_route_opened',
};

/** ROUTE-01 — The Reroute (beat.major-disruption): the network adapts, never dies. */
const REROUTE: StoryCard = {
  id: 'ROUTE-01',
  trigger: 'beat.major-disruption',
  triggerType: 'variable',
  act: 3,
  arc: 'economy',
  characters: ['Yolanda'],
  hookRole: 'return',
  oneShot: true,
  prerequisites: [],
  sceneText:
    'Yolanda spreads the chart on the hood, rain still coming down. "Coast Guard\'s ' +
    'all over the north passage since the seizure. Nothing moves through there for ' +
    'weeks." She taps a line further south, toward the mainland rivers. "But the ' +
    'Guyana run\'s quiet. Longer, thinner margins, more hands to grease — and nobody\'s ' +
    'watching it. Yet."',
  choices: [
    {
      label: 'Open the Guyana corridor',
      effects: [{ kind: 'unlock', flag: ALT_ROUTE_FLAG }, { kind: 'rep', track: 'business', amount: 2 }],
      sceneResult: 'The network adapts rather than collapses. A longer, quieter, thinner lane opens.',
    },
    {
      label: 'Sit tight, let heat cool',
      effects: [{ kind: 'heat', amount: -6, source: 'route-wait' }],
      sceneResult: 'You idle the routes a while. Nothing lost but time — the water will cool.',
    },
    {
      label: 'Push the hot route anyway',
      effects: [{ kind: 'heat', amount: 10, source: 'route-force' }],
      sceneResult: 'You run the watched passage at spiked risk. Desperate leverage — eyes open.',
    },
  ],
  reputationVariants: {
    street: 'Framed as refusing to be pushed off your water.',
    business: 'Framed as diversifying supply lines — never one point of failure.',
    political: 'A bought official can reopen the north passage early (payroll payoff).',
  },
  writerNotes:
    'The "networks reroute, they don\'t die" beat — always a SETBACK WITH AN OPTION, ' +
    'never a wall (GDD §6). Yolanda\'s competence is the hook. Fire route_disruption_rerouted.',
  telemetryFlag: 'route_disruption_rerouted',
};

/** MARKET-01 — Fire-Sale (beat.supply-shock): the buy-low half of the loop. */
const FIRE_SALE: StoryCard = {
  id: 'MARKET-01',
  trigger: 'beat.supply-shock',
  triggerType: 'variable',
  act: 3,
  arc: 'economy',
  characters: ['A source broker (offscreen)'],
  hookRole: 'core',
  oneShot: true,
  prerequisites: [],
  sceneText:
    '"You hearing this?" The broker\'s almost laughing. "Somebody flooded the market ' +
    '— whole season\'s crop landed at once, price is on the floor. Won\'t last. Word ' +
    'is half the island\'s buying everything that isn\'t nailed down." A pause. "You ' +
    'got somewhere to *put* it?"',
  choices: [
    {
      label: 'Buy big, stockpile the dip',
      effects: [{ kind: 'cash', amount: -8000 }, { kind: 'inventory', product: 'cocaine', units: 20 }],
      sceneResult: 'You back the truck up. If storage holds and the price recovers, this was the come-up.',
    },
    {
      label: 'Pass — could be a setup',
      effects: [],
      sceneResult: 'A flood this convenient itches wrong. You sit it out; the glut passes, no loss.',
    },
  ],
  reputationVariants: {
    street: 'Framed as instinct — "you feel a come-up, you take it."',
    business: 'Framed as arbitrage — buy the trough, sell the peak; count twice.',
    political: 'Wary of a flood this convenient — could be a setup / LE sting.',
  },
  writerNotes:
    'Keep the swing VISIBLE so acting on it is skill, not a gamble (GDD §5.4). The ' +
    '"could be a setup" read is a nice apophenia gap — never confirm it. Fire ' +
    'market_glut_decision.',
  telemetryFlag: 'market_glut_decision',
};

/** JUDGE-01 — The Charges Evaporate (beat.judge-saves-run): the payroll pays off. */
const JUDGE: StoryCard = {
  id: 'JUDGE-01',
  trigger: 'beat.judge-saves-run',
  triggerType: 'variable',
  act: 4,
  arc: 'corruption',
  characters: ['Your lawyer'],
  hookRole: 'core',
  oneShot: true,
  prerequisites: [],
  sceneText:
    'Your lawyer can\'t quite keep the disbelief off his face. "It\'s gone. The whole ' +
    'file. A judge you never met looked at what they had and decided it wasn\'t ' +
    'enough — that fast." He gathers his papers. "Somebody upstairs likes you. I\'m ' +
    'not going to ask who." You walk out the front door a free person.',
  choices: [
    {
      label: 'Reward the friend upstairs',
      effects: [{ kind: 'cash', amount: -12000 }, { kind: 'rep', track: 'political', amount: 2 }],
      sceneResult: 'You feed the relationship that just saved your life. A judge is worth every dollar.',
    },
    {
      label: 'Walk quietly and lie low',
      effects: [{ kind: 'heat', amount: -12, source: 'judge-cool' }],
      sceneResult: 'You take the gift and disappear a while. Don\'t make the favor look expensive.',
    },
  ],
  reputationVariants: {
    street: 'Walking free reads as untouchable — the street hears you beat a case.',
    business: 'The favor is an asset that appreciated — protection you invested in, returning.',
    political: 'Proof the payroll reaches the bench — the deepest kind of safety.',
  },
  writerNotes:
    'The political-protection payoff (design/09). Keep the benefactor an implied gap ' +
    '("I\'m not going to ask who"). Fire judge_saved_run.',
  telemetryFlag: 'judge_saved_run',
};

/** LIFELINE-01 — Back From The Brink (beat.comeback-lifeline): wiped, not finished. */
const LIFELINE: StoryCard = {
  id: 'LIFELINE-01',
  trigger: 'beat.comeback-lifeline',
  triggerType: 'variable',
  act: 4,
  arc: 'debt',
  characters: ['A lender who still trusts you'],
  hookRole: 'return',
  oneShot: true,
  prerequisites: [],
  sceneText:
    'You\'re wiped — down to lint and a phone that won\'t stop with bad news. Then it ' +
    'rings with something else. "I heard you got cleaned out," the voice says, and ' +
    'there\'s no gloat in it. "I also heard you always pay. So here\'s a stake. Don\'t ' +
    'make me regret being the one who believed you." It\'s not much. It\'s everything.',
  choices: [
    {
      label: 'Take the stake, claw back',
      effects: [{ kind: 'cash', amount: 5000 }],
      sceneResult: 'A thin lifeline and a reputation for paying. From nothing, you begin again.',
    },
    {
      label: 'Refuse — do it clean',
      effects: [{ kind: 'rep', track: 'street', amount: 2 }],
      sceneResult: 'You won\'t owe again. Harder, slower, yours — you rebuild on your own back.',
    },
  ],
  reputationVariants: {
    street: 'The stake reads as respect earned — they bet on your name.',
    business: 'Your credit rating survived the wipe — reputation is the last asset standing.',
    political: 'Someone in your network chose you over the odds — remember that.',
  },
  writerNotes:
    'The brink beat — only meaningful AFTER wins were banked (design/05 §4). Reputation ' +
    'as the thing that survives a wipe. Fire lifeline_offered.',
  telemetryFlag: 'lifeline_offered',
};

export const WORLD_CARDS: readonly StoryCard[] = [
  FIRST_FRONT,
  ON_THE_MAP,
  TASKFORCE,
  CROWN,
  ARMS,
  ROUTE_OPEN,
  REROUTE,
  FIRE_SALE,
  JUDGE,
  LIFELINE,
];
