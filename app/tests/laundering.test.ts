import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  rngFor,
  cleanCashRate,
  cryptoSwingFactor,
  accrue,
  offlineEarnings,
  settleOffline,
  rollGoldenHour,
  buyFront,
  upgradeFront,
  pesoExchange,
  pesoExchangeQuote,
  frontUpgradeCost,
  getFrontType,
  FRONT_MAX_LEVEL,
  FRONT_COST_GROWTH,
  OFFLINE_SOFT_CAP_HOURS,
  OFFLINE_REDUCED_RATE,
  PESO_EXCHANGE_HAIRCUT,
  type Front,
  type GameState,
  type Stash,
} from '@/engine';

/** A run with an explicit slate of fronts. */
function withFronts(state: GameState, fronts: Front[]): GameState {
  return { ...state, fronts };
}

const bar = (level = 1): Front => ({ id: `front-bar-${level}`, type: 'bar', level });

describe('cleanCashRate — Σ(ratePerLevel × level) (design/01 §3)', () => {
  it('sums every front by its per-level rate', () => {
    const state = withFronts(createInitialState('rate'), [
      bar(2), // 120 × 2 = 240
      { id: 'front-nightclub-1', type: 'nightclub', level: 1 }, // 450 × 1
    ]);
    expect(cleanCashRate(state)).toBe(240 + 450);
  });

  it('a run with no fronts earns nothing', () => {
    expect(cleanCashRate(createInitialState('none'))).toBe(0);
  });

  it('the crypto rate applies its live ±40% swing, deterministically', () => {
    const cfg = getFrontType('crypto');
    const state = withFronts(createInitialState('crypto'), [
      { id: 'front-crypto-1', type: 'crypto', level: 1 },
    ]);
    const rate = cleanCashRate(state);
    // Within the ±40% band, and exactly base × the (pure) swing factor.
    expect(rate).toBeGreaterThanOrEqual(cfg.ratePerLevel * (1 - cfg.swing) - 1e-6);
    expect(rate).toBeLessThanOrEqual(cfg.ratePerLevel * (1 + cfg.swing) + 1e-6);
    expect(rate).toBeCloseTo(cfg.ratePerLevel * cryptoSwingFactor(state), 6);
    // Same clock ⇒ same swing (deterministic, not a hidden roll).
    expect(cryptoSwingFactor(state)).toBe(cryptoSwingFactor(state));
  });
});

describe('offline accrual — piecewise curve (design/01 §3a)', () => {
  it('accrues full rate up to the 12h soft cap, then 25% beyond', () => {
    const rate = 120; // one Bar Lvl 1
    // The documented pacing check: a 12h absence returns ~$1,440.
    expect(offlineEarnings(rate, OFFLINE_SOFT_CAP_HOURS)).toBe(1_440);
    // Below the cap: strictly full rate.
    expect(offlineEarnings(rate, 6)).toBe(720);
    // Beyond the cap: full for the first 12h, then 25% for the overflow.
    const overflow = 12;
    expect(offlineEarnings(rate, OFFLINE_SOFT_CAP_HOURS + overflow)).toBe(
      rate * OFFLINE_SOFT_CAP_HOURS + rate * OFFLINE_REDUCED_RATE * overflow,
    );
  });

  it('settleOffline earns exactly the curve and banks it to clean cash', () => {
    const state = withFronts(createInitialState('settle'), [bar(1)]);
    const { state: after, report } = settleOffline(state, OFFLINE_SOFT_CAP_HOURS);
    expect(report.cleanEarned).toBe(1_440);
    expect(after.cleanCash).toBe(state.cleanCash + 1_440);
    expect(report.cappedAt).toBe(OFFLINE_SOFT_CAP_HOURS);
  });

  it('never zeroes out — a very long absence keeps idling (never a hard loss)', () => {
    const state = withFronts(createInitialState('long'), [bar(1)]);
    const short = settleOffline(state, 12).report.cleanEarned;
    const long = settleOffline(state, 10_000).report.cleanEarned;
    expect(long).toBeGreaterThan(short); // still accruing, just slower
  });
});

describe('settleOffline — the ethical core: adds only, never seizes (GDD §6, §8)', () => {
  /** A rich run: fronts, dirty cash, active debt, some heat — everything to lose. */
  function richRun(seed: string): GameState {
    const base = withFronts(createInitialState(seed), [bar(3)]);
    const stash: Stash = { ...(base.stashes[0] as Stash), dirtyCash: 250_000 };
    return {
      ...base,
      stashes: [stash],
      heat: 80,
      cleanCash: 10_000,
      debt: {
        lenderId: 'papa-cass',
        principal: 40_000,
        rate: 0.2,
        accruedInterest: 0,
        dueDay: base.clock.day + 14,
        ladderRung: 0,
        active: true,
      },
    };
  }

  it('only increases clean cash and only queues choices, for any hours away', () => {
    const base = richRun('adds-only');
    for (const hours of [1, 12, 24, 100, 1_000, 10_000]) {
      const { state: after, report } = settleOffline(base, hours);

      expect(after.cleanCash).toBeGreaterThanOrEqual(base.cleanCash); // adds only
      expect(after.stashes).toEqual(base.stashes); // nothing seized
      expect(after.heat).toBe(base.heat); // no punishment for absence
      expect(after.debt).toEqual(base.debt); // debt never advances offline
      expect(after.runStatus).toBe('active'); // never killed/imprisoned while away
      expect(after.clock).toEqual(base.clock); // world frozen

      // The return is *interesting choices* — 1–3 of them (design/01 §3).
      expect(report.pendingChoices.length).toBeGreaterThanOrEqual(1);
      expect(report.pendingChoices.length).toBeLessThanOrEqual(3);
      expect(after.pendingChoices.length).toBe(
        base.pendingChoices.length + report.pendingChoices.length,
      );
    }
  });

  it('the longer you are away, the more options await (design/07 §4)', () => {
    const base = richRun('more-options');
    const near = settleOffline(base, 1).report.pendingChoices.length;
    const far = settleOffline(base, 48).report.pendingChoices.length;
    expect(far).toBeGreaterThanOrEqual(near);
  });

  it('does not mutate its input', () => {
    const base = richRun('immut');
    const before = structuredClone(base);
    settleOffline(base, 500);
    expect(base).toEqual(before);
  });
});

describe('golden hours — bonus-only, never a penalty (design/01 §3a)', () => {
  it('every spawned event is a bonus with a 5–15 min life; a null is a no-op', () => {
    const state = withFronts(createInitialState('golden'), [bar(2)]);
    let rngState = state.rngState;
    let spawns = 0;
    for (let i = 0; i < 5_000; i++) {
      const trial: GameState = { ...state, rngState };
      const rng = rngFor(trial);
      const event = rollGoldenHour(trial, rng, 4);
      rngState = rng.getState();
      if (event) {
        spawns++;
        expect(event.bonusCash).toBeGreaterThan(0); // bonus-only
        expect(event.expiresInMinutes).toBeGreaterThanOrEqual(5);
        expect(event.expiresInMinutes).toBeLessThanOrEqual(15);
      }
    }
    // Poisson-ish: some spawn, but it is never a certainty (missing costs nothing).
    expect(spawns).toBeGreaterThan(0);
    expect(spawns).toBeLessThan(5_000);
  });

  it('a golden hour in an offline report never reduces state (opportunity, not auto-loss)', () => {
    // Whether or not one spawns, offline clean cash only ever grows.
    const state = withFronts(createInitialState('golden-safe'), [bar(1)]);
    const { state: after } = settleOffline(state, 20);
    expect(after.cleanCash).toBeGreaterThanOrEqual(state.cleanCash);
  });
});

describe('fronts — buy & upgrade curve (design/01 §3)', () => {
  it('buyFront costs the Lvl-1 buy-in from clean cash; rejects when broke', () => {
    const cfg = getFrontType('nightclub');
    const flush: GameState = { ...createInitialState('buy'), cleanCash: cfg.buyIn };
    const bought = buyFront(flush, 'nightclub');
    expect(bought.rejected).toBeUndefined();
    expect(bought.front?.level).toBe(1);
    expect(bought.state.cleanCash).toBe(0);
    expect(bought.state.fronts).toHaveLength(1);

    const broke: GameState = { ...createInitialState('broke'), cleanCash: cfg.buyIn - 1 };
    const failed = buyFront(broke, 'nightclub');
    expect(failed.rejected).toBe('insufficient-funds');
    expect(failed.state).toBe(broke); // no mutation
  });

  it('upgrade cost follows buy_in × 1.15^level, and there is always a next step', () => {
    const cfg = getFrontType('bar');
    let prev = 0;
    for (let level = 1; level < FRONT_MAX_LEVEL; level++) {
      const cost = frontUpgradeCost('bar', level);
      expect(cost).toBe(Math.round(cfg.buyIn * Math.pow(FRONT_COST_GROWTH, level)));
      expect(cost).toBeGreaterThan(prev); // strictly climbing, but finite/reachable
      prev = cost;
    }
  });

  it('upgradeFront deducts exactly the curve cost and advances the level', () => {
    const start = withFronts(
      { ...createInitialState('upg'), cleanCash: 1_000_000 },
      [bar(1)],
    );
    const cost = frontUpgradeCost('bar', 1);
    const up = upgradeFront(start, 'front-bar-1');
    expect(up.rejected).toBeUndefined();
    expect(up.front?.level).toBe(2);
    expect(up.state.cleanCash).toBe(1_000_000 - cost);
  });

  it('rejects an unknown front, a maxed level, and an unaffordable upgrade', () => {
    const maxed = withFronts(
      { ...createInitialState('max'), cleanCash: 1_000_000 },
      [bar(FRONT_MAX_LEVEL)],
    );
    expect(upgradeFront(maxed, 'nope').rejected).toBe('no-front');
    expect(upgradeFront(maxed, `front-bar-${FRONT_MAX_LEVEL}`).rejected).toBe('max-level');

    const poor = withFronts({ ...createInitialState('poor'), cleanCash: 0 }, [bar(1)]);
    const failed = upgradeFront(poor, 'front-bar-1');
    expect(failed.rejected).toBe('insufficient-funds');
    expect(failed.state).toBe(poor);
  });
});

describe('accrue — active clean-cash step (design/01 §3)', () => {
  it('adds clean cash at the current rate over online hours', () => {
    const state = withFronts(createInitialState('accrue'), [bar(1)]);
    const after = accrue(state, 5);
    expect(after.cleanCash).toBeCloseTo(state.cleanCash + 120 * 5, 6);
  });

  it('is a no-op with no fronts or non-positive dt', () => {
    const none = createInitialState('accrue-none');
    expect(accrue(none, 5)).toBe(none);
    const withF = withFronts(createInitialState('accrue-zero'), [bar(1)]);
    expect(accrue(withF, 0)).toBe(withF);
  });
});

describe('Black Market Peso Exchange — disclosed haircut sink (design/01 §3a)', () => {
  it('applies exactly the disclosed haircut and moves dirty → clean', () => {
    const stash: Stash = { ...(createInitialState('peso').stashes[0] as Stash), dirtyCash: 10_000 };
    const state = { ...createInitialState('peso'), stashes: [stash] };
    const quote = pesoExchangeQuote(10_000);
    expect(quote.haircut).toBe(PESO_EXCHANGE_HAIRCUT);
    expect(quote.clean).toBe(Math.round(10_000 * (1 - PESO_EXCHANGE_HAIRCUT)));

    const result = pesoExchange(state, 10_000);
    expect(result.ok).toBe(true);
    expect(result.clean).toBe(quote.clean); // shown == applied (fairness law)
    expect(result.state.cleanCash).toBe(state.cleanCash + quote.clean);
    expect((result.state.stashes[0] as Stash).dirtyCash).toBe(0);
  });

  it('rejects a bad amount or a shortfall without mutating', () => {
    const stash: Stash = { ...(createInitialState('peso2').stashes[0] as Stash), dirtyCash: 500 };
    const state = { ...createInitialState('peso2'), stashes: [stash] };
    expect(pesoExchange(state, 0).rejected).toBe('invalid-amount');
    const short = pesoExchange(state, 1_000);
    expect(short.rejected).toBe('insufficient-funds');
    expect(short.state).toBe(state);
  });
});
