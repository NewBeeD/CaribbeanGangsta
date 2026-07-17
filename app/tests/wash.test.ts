import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  netWorth,
  tick,
  totalDirtyCash,
  cancelWash,
  queueWash,
  washEtaHours,
  washRate,
  washStep,
  type GameState,
} from '@/engine';

/** A run whose home stash holds exactly `dirty` dollars (rest of the state fresh). */
function withDirty(seed: string, dirty: number): GameState {
  const base = createInitialState(seed);
  const stashes = base.stashes.map((s, i) => (i === 0 ? { ...s, dirtyCash: dirty } : s));
  return { ...base, stashes };
}

describe('wash queue — committing dirty cash to the mules', () => {
  it('pulls dirty out of stashes into the queue without changing net worth', () => {
    const s = withDirty('wash-queue', 20_000);
    const before = netWorth(s);

    const r = queueWash(s, 15_000);

    expect(r.rejected).toBeUndefined();
    expect(r.queuedDirty).toBe(15_000);
    expect(r.state.wash.queuedDirty).toBe(15_000);
    expect(totalDirtyCash(r.state)).toBe(5_000);
    // Cash moved stash → queue, both counted at face value — no loss on commit.
    expect(netWorth(r.state)).toBe(before);
  });

  it('adds to a batch already in flight (one pool)', () => {
    const first = queueWash(withDirty('wash-add', 50_000), 10_000).state;
    const second = queueWash(first, 5_000);
    expect(second.state.wash.queuedDirty).toBe(15_000);
    expect(totalDirtyCash(second.state)).toBe(35_000);
  });

  it('rejects a non-positive amount or more dirty than is on hand, without mutating', () => {
    const s = withDirty('wash-reject', 10_000);
    expect(queueWash(s, 0).rejected).toBe('invalid-amount');
    expect(queueWash(s, -5).rejected).toBe('invalid-amount');
    expect(queueWash(s, 10_001).rejected).toBe('insufficient-dirty');
    // No mutation on a rejection.
    expect(queueWash(s, 10_001).state).toBe(s);
  });
});

describe('fronts feed the mules — multiplicative in count & levels (design/13 §H)', () => {
  it('each new front multiplies throughput by ≥ ×1.5; upgrades compound on top', () => {
    const flatState = withDirty('wash-boost', 100_000);
    const flat = washRate(flatState);
    const fmult = flatState.config.fronts.WASH_FRONT_MULT;

    const oneFront: GameState = {
      ...flatState,
      fronts: [{ id: 'f1', type: 'cash-front', level: 1 }],
    };
    const twoFronts: GameState = {
      ...flatState,
      fronts: [
        { id: 'f1', type: 'cash-front', level: 1 },
        { id: 'f2', type: 'crypto', level: 1 },
      ],
    };

    // A fresh front (level 1) steps the rate up by exactly the front multiplier…
    expect(washRate(oneFront)).toBeCloseTo(flat * fmult);
    expect(washRate(twoFronts)).toBeCloseTo(flat * fmult * fmult);
    // …which is at least ×1.5 per the requirement.
    expect(washRate(oneFront) / flat).toBeGreaterThanOrEqual(1.5);

    // Upgrading an owned front raises the rate further (levels compound).
    const upgraded: GameState = {
      ...oneFront,
      fronts: [{ id: 'f1', type: 'cash-front', level: 2 }],
    };
    expect(washRate(upgraded)).toBeGreaterThan(washRate(oneFront));

    // Faster mules ⇒ a shorter ETA for the same committed batch.
    const flatEta = washEtaHours(queueWash(flatState, 100_000).state);
    const boostEta = washEtaHours(queueWash(twoFronts, 100_000).state);
    expect(boostEta).toBeLessThan(flatEta);
  });

  it('a fully built empire (all six fronts at max level) launders ≥ $2,000,000/hr', () => {
    const maxed: GameState = {
      ...withDirty('wash-max', 100_000),
      fronts: [
        { id: 'f1', type: 'cash-front', level: 5 },
        { id: 'f2', type: 'smurf-network', level: 5 },
        { id: 'f3', type: 'crypto', level: 5 },
        { id: 'f4', type: 'shell-company', level: 5 },
        { id: 'f5', type: 'trade-front', level: 5 },
        { id: 'f6', type: 'real-estate', level: 5 },
      ],
    };
    expect(washRate(maxed)).toBeGreaterThanOrEqual(2_000_000);
  });
});

describe('washStep — draining the queue over online time', () => {
  it('deposits at the mule throughput, landing clean at 1 − cut', () => {
    // Commit more than one hour clears so a single hour is a partial drain.
    const q = queueWash(withDirty('wash-drain', 200_000), 200_000).state;
    const rate = washRate(q);
    const cleanBefore = q.cleanCash;
    expect(rate).toBeLessThan(200_000); // guard: one hour must not clear the whole queue

    const next = washStep(q, 1); // one in-game hour

    expect(next.wash.queuedDirty).toBeCloseTo(200_000 - rate);
    expect(next.cleanCash).toBeCloseTo(cleanBefore + rate * 0.9);
  });

  it('never overshoots the queue and realizes exactly the cut on a full wash', () => {
    const q = queueWash(withDirty('wash-full', 100_000), 30_000).state;
    const before = netWorth(q);

    const done = washStep(q, 1_000); // far more than needed

    expect(done.wash.queuedDirty).toBe(0);
    expect(done.cleanCash).toBeCloseTo(30_000 * 0.9);
    // The only thing washing costs is the cut — net worth drops by exactly that.
    expect(netWorth(done)).toBeCloseTo(before - 30_000 * 0.1);
  });

  it('is active-only — a batch never clears while the player is away (GDD §6)', () => {
    const q = queueWash(withDirty('wash-offline', 100_000), 30_000).state;
    expect(washStep(q, 5, 'offline')).toBe(q);
    expect(washStep(q, 0)).toBe(q);
  });

  it('is driven by the live clock — tick() drains the queue', () => {
    const q = queueWash(withDirty('wash-tick', 100_000), 30_000).state;
    const t = tick(q, 1);
    expect(t.wash.queuedDirty).toBeLessThan(q.wash.queuedDirty);
    expect(t.cleanCash).toBeGreaterThan(q.cleanCash);
  });
});

describe('wash queue — more money, more time; and calling it off', () => {
  it('ETA scales linearly with the amount committed', () => {
    const small = queueWash(withDirty('wash-eta-a', 1_000_000), 10_000).state;
    const big = queueWash(withDirty('wash-eta-b', 1_000_000), 20_000).state;
    expect(washEtaHours(big)).toBeCloseTo(2 * washEtaHours(small));
  });

  it('cancel returns the un-deposited dirty to a stash and empties the queue', () => {
    const q = queueWash(withDirty('wash-cancel', 100_000), 30_000).state;
    const c = cancelWash(q);
    expect(c.wash.queuedDirty).toBe(0);
    expect(totalDirtyCash(c)).toBe(100_000);
    // Reclaiming un-laundered cash is lossless (no cut on money not yet deposited).
    expect(netWorth(c)).toBe(netWorth(q));
  });
});

describe('the pickup is disclosed as a feed line (design/13 A6)', () => {
  it('queueWash posts a wash-pickup pending choice naming the dollars', () => {
    const r = queueWash(withDirty('wash-feed', 20_000), 9_000);
    const line = r.state.pendingChoices.find((c) => c.kind === 'wash-pickup');
    expect(line).toBeTruthy();
    expect(line!.summary).toContain('Mules picked up $9,000');
  });

  it('a rejected commit posts nothing (rejections never mutate)', () => {
    const s = withDirty('wash-feed-reject', 1_000);
    const r = queueWash(s, 5_000);
    expect(r.rejected).toBe('insufficient-dirty');
    expect(r.state).toBe(s);
  });
});
