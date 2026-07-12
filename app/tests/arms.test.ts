import { describe, expect, it } from 'vitest';
import {
  ARMS_BROKER_COST,
  ARMS_COUNTRY_IDS,
  ARMS_UNLOCKED_FLAG,
  armsBustProbability,
  armsConflictActive,
  armsMarketStep,
  armsTierBasePrice,
  armsTraded,
  createInitialState,
  getArmsPrice,
  hire,
  resolveArmsDeal,
  tick,
  unlockArmsBroker,
  WEAPON_TIERS,
  type GameState,
  type MarketEvent,
} from '@/engine';

/** A run with the arms broker paid and plenty of cash on hand. */
function armed(seed = 'arms'): GameState {
  const base = createInitialState(seed);
  const withCash: GameState = { ...base, cleanCash: 3_000_000 };
  const opened = unlockArmsBroker(withCash);
  expect(opened.ok).toBe(true);
  // Stock the home stash with dirty cash so buys can execute.
  const home = opened.state.stashes[0]!;
  return {
    ...opened.state,
    stashes: [{ ...home, dirtyCash: 500_000 }, ...opened.state.stashes.slice(1)],
  };
}

const homeId = (s: GameState): string => s.stashes[0]!.countryId;
const homeCash = (s: GameState): number => s.stashes[0]!.dirtyCash;

describe('arms broker — the money gate (design/12 Item 1; Prompt 35)', () => {
  it('starts locked; the trade rejects until the broker is paid', () => {
    const s = createInitialState('locked');
    expect(s.armsBroker).toBe(false);
    const buy = resolveArmsDeal(s, { type: 'buyArms', tier: 'pistols', qty: 1, countryId: homeId(s) });
    expect(buy.outcome).toBe('rejected');
    expect(buy.rejected).toBe('no-broker');
    expect(buy.state).toBe(s); // a rejection never mutates state
  });

  it('rejects the intro when clean cash is short, without mutating', () => {
    const s = createInitialState('broke');
    const r = unlockArmsBroker(s);
    expect(r.ok).toBe(false);
    expect(r.rejected).toBe('insufficient-funds');
    expect(r.state).toBe(s);
  });

  it('opens the trade for the priced intro: spends clean cash, adds heat, fires the beat flag', () => {
    const s: GameState = { ...createInitialState('open'), cleanCash: ARMS_BROKER_COST + 10_000 };
    const r = unlockArmsBroker(s);
    expect(r.ok).toBe(true);
    expect(r.cost).toBe(ARMS_BROKER_COST);
    expect(r.state.armsBroker).toBe(true);
    expect(r.state.cleanCash).toBe(10_000);
    expect(r.state.heat).toBeGreaterThan(s.heat);
    expect(r.state.flags[ARMS_UNLOCKED_FLAG]).toBe(true);
  });

  it('rejects a second intro (already-unlocked)', () => {
    const s = armed('twice');
    const r = unlockArmsBroker(s);
    expect(r.ok).toBe(false);
    expect(r.rejected).toBe('already-unlocked');
  });
});

describe('arms trade — buy / sell / stock', () => {
  it('buys arms into the armory, off the street, paying cash + the heaviest heat', () => {
    const s = armed('buy');
    const country = homeId(s);
    const before = getArmsPrice(s, 'pistols', country);
    const r = resolveArmsDeal(s, { type: 'buyArms', tier: 'pistols', qty: 10, countryId: country });
    expect(r.outcome).toBe('success');
    expect(r.state.armory.pistols).toBe(10);
    expect(getArmsPrice(r.state, 'pistols', country).stock).toBe(before.stock - 10);
    expect(r.state.heat).toBeGreaterThan(s.heat);
    expect(r.cashDelta).toBe(-before.price * 10);
  });

  it('rejects a buy past the street supply (never a hidden cap)', () => {
    const s = armed('supply');
    const country = homeId(s);
    const stock = getArmsPrice(s, 'pistols', country).stock;
    const r = resolveArmsDeal(s, {
      type: 'buyArms',
      tier: 'pistols',
      qty: stock + 1,
      countryId: country,
    });
    expect(r.rejected).toBe('no-supply');
  });

  it('rejects arms where they do not trade (regional culture — e.g. Rotterdam)', () => {
    const s = armed('rotterdam');
    expect(armsTraded('rotterdam')).toBe(false);
    const r = resolveArmsDeal(s, { type: 'buyArms', tier: 'pistols', qty: 1, countryId: 'rotterdam' });
    expect(r.rejected).toBe('not-traded');
  });

  it('sells arms from the armory, banking proceeds to the home stash (fairness: shown == rolled)', () => {
    const bought = resolveArmsDeal(armed('sell'), {
      type: 'buyArms',
      tier: 'rifles',
      qty: 8,
      countryId: homeId(armed('sell')),
    }).state;
    const country = homeId(bought);
    const price = getArmsPrice(bought, 'rifles', country);
    const shown = armsBustProbability(bought, 'rifles', 5, country);
    const cashBefore = homeCash(bought);

    const r = resolveArmsDeal(bought, { type: 'sellArms', tier: 'rifles', qty: 5, countryId: country });
    // The one draw decides the outcome against the SHOWN number (design/01 §0.3).
    expect(r.displayedBustProb).toBe(shown);
    expect(r.outcome).toBe(r.rolledValue < shown ? 'bust' : 'success');
    if (r.outcome === 'success') {
      expect(r.state.armory.rifles).toBe(3);
      expect(homeCash(r.state)).toBe(cashBefore + price.price * 5);
    } else {
      expect(homeCash(r.state)).toBe(0); // a bust seizes the staked dirty cash
    }
  });

  it('rejects selling more than the armory holds', () => {
    const s = armed('empty-armory');
    const r = resolveArmsDeal(s, { type: 'sellArms', tier: 'military', qty: 1, countryId: homeId(s) });
    expect(r.rejected).toBe('insufficient-inventory');
  });
});

describe('arms tiers, geography & conflict pricing', () => {
  it('resolves each tier base price within its band, deterministically per run', () => {
    for (const tier of WEAPON_TIERS) {
      const p = armsTierBasePrice('geo', tier.id);
      expect(p).toBeGreaterThanOrEqual(tier.price.min);
      expect(p).toBeLessThanOrEqual(tier.price.max);
      expect(armsTierBasePrice('geo', tier.id)).toBe(p); // stable
    }
  });

  it('tiers rise in price and carry the heaviest heat in the game (2.5 → 6.0)', () => {
    const heats = WEAPON_TIERS.map((t) => t.heatPerUnit);
    expect(heats).toEqual([...heats].sort((a, b) => a - b)); // monotone up
    expect(Math.min(...heats)).toBe(2.5);
    expect(Math.max(...heats)).toBe(6.0);
    // Heavier than any drug (fentanyl 2.0 is the drug max — design/12 Item 1).
    expect(Math.min(...heats)).toBeGreaterThanOrEqual(2.0);
  });

  it('a conflict event spikes the price and flags the market (item-6 overlay)', () => {
    const s = armed('conflict');
    const country = homeId(s);
    const calm = getArmsPrice(s, 'automatic', country).price;

    const event: MarketEvent = {
      id: 'ev-war',
      product: 'arms',
      scope: 'country',
      scopeId: country,
      direction: 'up',
      magnitude: 'sharp',
      peakMultiplier: 2.5,
      startHours: s.clock.hours,
      endHours: s.clock.hours + 72,
    };
    const spiked: GameState = { ...s, marketEvents: [event] };
    expect(armsConflictActive(spiked, country)).toBe(true);
    const priced = getArmsPrice(spiked, 'automatic', country);
    expect(priced.conflict).toBe(true);
    expect(priced.price).toBeGreaterThan(calm);
  });

  it('selling into a conflict spike adds bonus heat over a calm sale', () => {
    const stock = resolveArmsDeal(armed('spike-heat'), {
      type: 'buyArms',
      tier: 'automatic',
      qty: 6,
      countryId: homeId(armed('spike-heat')),
    }).state;
    const country = homeId(stock);
    const event: MarketEvent = {
      id: 'ev',
      product: 'arms',
      scope: 'country',
      scopeId: country,
      direction: 'up',
      magnitude: 'moderate',
      peakMultiplier: 1.5,
      startHours: stock.clock.hours,
      endHours: stock.clock.hours + 72,
    };
    const spiked: GameState = { ...stock, marketEvents: [event] };

    const calmSale = resolveArmsDeal(stock, { type: 'sellArms', tier: 'automatic', qty: 3, countryId: country });
    const warSale = resolveArmsDeal(spiked, { type: 'sellArms', tier: 'automatic', qty: 3, countryId: country });
    // Compare only when neither busts (heat deltas are otherwise incomparable).
    if (calmSale.outcome === 'success' && warSale.outcome === 'success') {
      expect(warSale.state.heat - stock.heat).toBeGreaterThan(calmSale.state.heat - stock.heat);
    }
  });
});

describe('EUC paperwork — the Customs Chief tie-in (design/12 Item 1)', () => {
  it('a paid Customs Chief cuts the arms seizure odds (paper is the product)', () => {
    const s = armed('euc');
    const country = homeId(s);
    const withChief = hire({ ...s, cleanCash: 100_000 }, 'customs-chief', { portId: country });
    expect(withChief.official).not.toBeNull();

    const bare = armsBustProbability(s, 'military', 10, country);
    const covered = armsBustProbability(withChief.state, 'military', 10, country);
    expect(covered).toBeLessThan(bare);
  });
});

describe('arms markets tick — drift + restock, frozen offline', () => {
  it('every arms-trading country has a market; Rotterdam has none', () => {
    expect(ARMS_COUNTRY_IDS).toContain('miami');
    expect(ARMS_COUNTRY_IDS).not.toContain('rotterdam');
  });

  it('restocks a drained pool over active play (design/12 Item 10 shape)', () => {
    const s = armed('restock');
    const country = homeId(s);
    // Drain the pool by buying most of it.
    const stock = getArmsPrice(s, 'pistols', country).stock;
    const drained = resolveArmsDeal(s, {
      type: 'buyArms',
      tier: 'pistols',
      qty: stock,
      countryId: country,
    }).state;
    expect(getArmsPrice(drained, 'pistols', country).stock).toBe(0);

    const stepped = armsMarketStep(drained, 48); // two in-game days
    expect(getArmsPrice(stepped, 'pistols', country).stock).toBeGreaterThan(0);
  });

  it('advances arms drift as an active tick step without touching player holdings', () => {
    const s = armed('tick');
    const country = homeId(s);
    const withArmory: GameState = { ...s, armory: { ...s.armory, rifles: 4 } };
    const next = tick(withArmory, 24);
    expect(next.armory.rifles).toBe(4); // holdings untouched by the world tick
    // The market moved (drift/restock ran).
    expect(next.armsMarkets[country]).toBeDefined();
  });

  it('is a no-op for a zero-length step', () => {
    const s = armed('zero');
    expect(armsMarketStep(s, 0)).toBe(s);
  });
});
