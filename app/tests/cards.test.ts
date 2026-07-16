import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  emptyCrewSkills,
  // beats
  BEAT_TRIGGERS,
  // cards — engine surface
  ALL_CARDS,
  validateCard,
  auditRegistry,
  cardForBeat,
  applyChoice,
  applyEffect,
  getCard,
  isCardEligible,
  prerequisitesMet,
  hasCardFired,
  dominantRepTrack,
  MVP_CRITICAL_BEATS,
  type GameState,
  type CrewMember,
  type StoryCard,
} from '@/engine';
import {
  DEBT_ACTIVE_FLAG,
  FIRST_SALE_FLAG,
  PORT_BEAUMONT_PAID_FLAG,
  SILVIO_HOSTILE_FLAG,
  ALT_ROUTE_FLAG,
} from '@/engine/cards/content/flags';

const CARD_BY_ID = new Map(ALL_CARDS.map((c) => [c.id, c]));
const card = (id: string): StoryCard => {
  const c = CARD_BY_ID.get(id);
  if (!c) throw new Error(`test references missing card ${id}`);
  return c;
};

/** A crew member for the loyalty-effect test. */
function crewMember(): CrewMember {
  return {
    id: 'crew-1',
    archetypeId: 'enforcer',
    name: 'Deon',
    role: 'soldier',
    traits: [],
    skills: emptyCrewSkills(),
    loyalty: 50,
    bond: 'You came up together.',
    agenda: 'wants-own-territory',
    memoryLog: [],
    assignment: { kind: 'idle' },
    productionOpIds: [],
  };
}

describe('cards — every authored card validates against the schema (Prompt 13)', () => {
  it('has no schema violations across the whole MVP set', () => {
    const issues = ALL_CARDS.flatMap((c) => validateCard(c));
    expect(issues).toEqual([]);
  });

  it('has unique card ids', () => {
    const ids = ALL_CARDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('cards — registry wiring: no orphans, chains resolve, MVP beats covered', () => {
  it('every beat-bound trigger maps to a real beat id, every firesCard resolves', () => {
    expect(auditRegistry()).toEqual([]);
  });

  it('binds a card to each MVP-critical beat', () => {
    const beatIds = new Set(BEAT_TRIGGERS.map((t) => t.beatId));
    for (const beatId of MVP_CRITICAL_BEATS) {
      expect(beatIds.has(beatId)).toBe(true); // the beat itself exists
      const base = createInitialState('mvp');
      // A fresh-eligible card exists for the beat (prereqs empty on MVP openers).
      const bound = ALL_CARDS.find((c) => c.trigger === beatId);
      expect(bound, `no card for ${beatId}`).toBeDefined();
      void base;
    }
  });

  it('chained cards never bind a beat', () => {
    for (const c of ALL_CARDS) {
      if (c.triggerType === 'chained') expect(c.trigger).toBeNull();
    }
  });
});

describe('cards — applyChoice applies declared effects through reducers, deterministically', () => {
  it('cash + flag: taking Papa Cass\'s loan adds $1,500 and marks debt active', () => {
    const base = createInitialState('debt');
    const after = applyChoice(base, 'DEBT-01', 0);
    expect(after.cleanCash).toBe(base.cleanCash + 1500);
    expect(after.flags[DEBT_ACTIVE_FLAG]).toBe(true);
    expect(hasCardFired(after, 'DEBT-01')).toBe(true);
  });

  it('cash spend + flag: paying Beaumont costs $4,000 and sets the paid flag', () => {
    const base = { ...createInitialState('corr'), cleanCash: 10_000 };
    const after = applyChoice(base, 'CORR-01', 0);
    expect(after.cleanCash).toBe(6_000);
    expect(after.flags[PORT_BEAUMONT_PAID_FLAG]).toBe(true);
  });

  it('rep + heat + flag + chain: the violent rival answer does exactly that', () => {
    const base = createInitialState('riv');
    const after = applyChoice(base, 'RIV-01', 0);
    expect(after.reputation.street).toBe(base.reputation.street + 2);
    expect(after.heat).toBe(base.heat + 6);
    expect(after.flags[SILVIO_HOSTILE_FLAG]).toBe(true);
    // firesCard queues the next scene in the chain.
    expect(after.pendingChoices.some((p) => p.id.startsWith('card-RIV-02-'))).toBe(true);
  });

  it('inventory + cash: the fire-sale stockpiles 20 units of cocaine for $8,000', () => {
    const base = { ...createInitialState('mkt'), cleanCash: 20_000 };
    const after = applyChoice(base, 'MARKET-01', 0);
    expect(after.cleanCash).toBe(12_000);
    expect(after.inventory.cocaine).toBe(base.inventory.cocaine + 20);
  });

  it('is deterministic — same choice on the same state yields an identical result', () => {
    const base = createInitialState('det');
    expect(applyChoice(base, 'RIV-01', 0)).toEqual(applyChoice(base, 'RIV-01', 0));
  });

  it('unknown card / out-of-range choice is a safe no-op', () => {
    const base = createInitialState('noop');
    expect(applyChoice(base, 'NOPE', 0)).toBe(base);
    expect(applyChoice(base, 'RIV-01', 99)).toBe(base);
  });
});

describe('cards — applyEffect routes each effect kind through its reducer', () => {
  it('unlock sets a progression flag true', () => {
    const base = createInitialState('unlock');
    const after = applyEffect(base, { kind: 'unlock', flag: ALT_ROUTE_FLAG });
    expect(after.flags[ALT_ROUTE_FLAG]).toBe(true);
  });

  it('heat clamps at the meter ceiling via addHeat', () => {
    const base = { ...createInitialState('heat'), heat: 98 };
    const after = applyEffect(base, { kind: 'heat', amount: 50 });
    expect(after.heat).toBe(100);
  });

  it('inventory never drops below zero', () => {
    const base = createInitialState('inv');
    const after = applyEffect(base, { kind: 'inventory', product: 'weed', units: -5 });
    expect(after.inventory.weed).toBe(0);
  });

  it('loyalty routes through the crew reducer — shifts loyalty AND writes memory', () => {
    const base: GameState = { ...createInitialState('loy'), crew: [crewMember()] };
    const after = applyEffect(base, {
      kind: 'loyalty',
      crewId: 'crew-1',
      event: { kind: 'promoted' },
    });
    const npc = after.crew[0]!;
    expect(npc.loyalty).toBeGreaterThan(50);
    expect(npc.memoryLog.length).toBe(1);
  });

  it('queue-choice enqueues a pending scene (return hook)', () => {
    const base = createInitialState('queue');
    const after = applyEffect(base, { kind: 'queue-choice', summary: 'Someone wants a word.' });
    expect(after.pendingChoices.at(-1)?.summary).toBe('Someone wants a word.');
  });
});

describe('cards — reputation-variant selection picks the dominant track (design/08)', () => {
  it('dominantRepTrack favors the strict leader, ties resolve to street then business', () => {
    expect(dominantRepTrack({ street: 0, business: 0, political: 0 })).toBe('street');
    expect(dominantRepTrack({ street: 1, business: 1, political: 0 })).toBe('street');
    expect(dominantRepTrack({ street: 0, business: 2, political: 2 })).toBe('business');
    expect(dominantRepTrack({ street: 1, business: 2, political: 5 })).toBe('political');
  });

  it('cardForBeat stamps the resolved variant onto the returned card', () => {
    const bizState: GameState = {
      ...createInitialState('variant'),
      reputation: { street: 1, business: 9, political: 0 },
    };
    const resolved = cardForBeat('beat.first-sale', bizState);
    expect(resolved?.activeVariant).toBe('business');
    // the base content is untouched — resolution is a copy
    expect(card('ONB-01').activeVariant).toBeUndefined();
  });
});

describe('cards — one-shot fire once; prerequisite chains resolve (design/08)', () => {
  it('a one-shot card is no longer offered for its beat once it has fired', () => {
    const base = createInitialState('once');
    expect(cardForBeat('beat.papa-cass-offer', base)?.id).toBe('DEBT-01');
    const after = applyChoice(base, 'DEBT-01', 0);
    expect(cardForBeat('beat.papa-cass-offer', after)).toBeNull();
  });

  it('a chained outcome card is gated until its prerequisite flag is set', () => {
    const base = createInitialState('chain');
    const clear = getCard('DEBT-CLEAR-01')!;
    expect(prerequisitesMet(base, clear)).toBe(false);
    expect(isCardEligible(base, clear)).toBe(false);

    const borrowed = applyChoice(base, 'DEBT-01', 0); // sets DEBT_ACTIVE_FLAG
    expect(borrowed.flags[DEBT_ACTIVE_FLAG]).toBe(true);
    expect(prerequisitesMet(borrowed, clear)).toBe(true);
    expect(isCardEligible(borrowed, clear)).toBe(true);
  });

  it('the onboarding chain: ONB-01 sets first_sale and queues ONB-02', () => {
    const base = createInitialState('onb');
    const after = applyChoice(base, 'ONB-01', 0);
    expect(after.flags[FIRST_SALE_FLAG]).toBe(true);
    expect(prerequisitesMet(after, card('ONB-02'))).toBe(true);
    expect(after.pendingChoices.some((p) => p.id.startsWith('card-ONB-02-'))).toBe(true);
  });
});

describe('cards — invisible tutorial: teach through fiction (GDD §9; Prompt 13)', () => {
  const onboarding = ALL_CARDS.filter((c) => c.arc === 'onboarding');

  it('no card is literally labeled a tutorial', () => {
    for (const c of ALL_CARDS) {
      expect(c.id.toLowerCase()).not.toContain('tutorial');
      for (const choice of c.choices) {
        expect(choice.label.toLowerCase()).not.toContain('tutorial');
      }
    }
  });

  it('onboarding choice labels (the on-screen instruction) stay ≤ 8 words', () => {
    for (const c of onboarding) {
      for (const choice of c.choices) {
        const words = choice.label.trim().split(/\s+/).length;
        expect(words, `"${choice.label}"`).toBeLessThanOrEqual(8);
      }
    }
  });
});
