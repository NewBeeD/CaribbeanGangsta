import { describe, expect, it } from 'vitest';
import { createRng, restoreRng, type Rng } from '@/engine';

function draw(rng: Rng, n: number): number[] {
  return Array.from({ length: n }, () => rng.next());
}

describe('createRng', () => {
  it('is deterministic: same seed → identical stream', () => {
    expect(draw(createRng(12345), 20)).toEqual(draw(createRng(12345), 20));
    expect(draw(createRng('caribbean'), 20)).toEqual(draw(createRng('caribbean'), 20));
  });

  it('different seeds → different streams', () => {
    expect(draw(createRng(1), 20)).not.toEqual(draw(createRng(2), 20));
  });

  it('accepts numeric and string seeds', () => {
    expect(draw(createRng(42), 5)).toEqual(draw(createRng('42'), 5));
  });

  it('next() stays in [0, 1)', () => {
    const rng = createRng('range');
    for (let i = 0; i < 10_000; i++) {
      const x = rng.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it('int() is inclusive of both bounds and never escapes them', () => {
    const rng = createRng('ints');
    const seen = new Set<number>();
    for (let i = 0; i < 5000; i++) {
      const x = rng.int(1, 6);
      expect(Number.isInteger(x)).toBe(true);
      expect(x).toBeGreaterThanOrEqual(1);
      expect(x).toBeLessThanOrEqual(6);
      seen.add(x);
    }
    // A fair die over 5000 rolls should show every face.
    expect(seen).toEqual(new Set([1, 2, 3, 4, 5, 6]));
  });

  it('int() throws when max < min', () => {
    expect(() => createRng(0).int(5, 1)).toThrow();
  });

  it('float() stays within [min, max)', () => {
    const rng = createRng('floats');
    for (let i = 0; i < 5000; i++) {
      const x = rng.float(10, 20);
      expect(x).toBeGreaterThanOrEqual(10);
      expect(x).toBeLessThan(20);
    }
  });

  it('pick() only returns elements and throws on empty', () => {
    const rng = createRng('pick');
    const arr = ['a', 'b', 'c'] as const;
    for (let i = 0; i < 100; i++) expect(arr).toContain(rng.pick(arr));
    expect(() => rng.pick([])).toThrow();
  });

  it('weighted() honours the weights within tolerance', () => {
    const rng = createRng('weighted');
    const counts = { a: 0, b: 0 };
    const N = 20_000;
    for (let i = 0; i < N; i++) {
      counts[rng.weighted<'a' | 'b'>([
        ['a', 3],
        ['b', 1],
      ])]++;
    }
    // Expect ~75% 'a'. Allow generous slack.
    expect(counts.a / N).toBeGreaterThan(0.7);
    expect(counts.a / N).toBeLessThan(0.8);
  });

  it('chance() clamps out-of-range probabilities', () => {
    const rng = createRng('chance');
    for (let i = 0; i < 100; i++) {
      expect(rng.chance(2)).toBe(true);
      expect(rng.chance(-1)).toBe(false);
    }
  });
});

describe('fork', () => {
  it('produces reproducible sub-streams keyed by label', () => {
    const a = createRng('root').fork('deals');
    const b = createRng('root').fork('deals');
    expect(draw(a, 20)).toEqual(draw(b, 20));
  });

  it('different labels are independent streams', () => {
    const parent = createRng('root');
    expect(draw(parent.fork('deals'), 20)).not.toEqual(draw(parent.fork('world'), 20));
  });

  it('forking does not consume the parent, so sub-streams never desync it', () => {
    const parent = createRng('root');
    const before = parent.getState();
    const child = parent.fork('events');
    draw(child, 100); // hammer the child
    expect(parent.getState()).toEqual(before);
    // The parent's own stream is unchanged by the child's existence/consumption.
    const control = createRng('root');
    control.fork('events');
    expect(draw(parent, 10)).toEqual(draw(control, 10));
  });
});

describe('getState / setState / restoreRng', () => {
  it('round-trips: a restored RNG continues the exact same stream', () => {
    const rng = createRng('save-load');
    draw(rng, 17);
    const snapshot = rng.getState();
    const expected = draw(rng, 10);

    const restored = restoreRng(snapshot);
    expect(draw(restored, 10)).toEqual(expected);

    const viaSetState = createRng('save-load');
    viaSetState.setState(snapshot);
    expect(draw(viaSetState, 10)).toEqual(expected);
  });

  it('setState rejects a snapshot from a different seed', () => {
    const rng = createRng('a');
    expect(() => rng.setState(createRng('b').getState())).toThrow();
  });

  it('a restored RNG still forks identically', () => {
    const rng = createRng('fork-after-restore');
    draw(rng, 5);
    const restored = restoreRng(rng.getState());
    expect(draw(rng.fork('x'), 10)).toEqual(draw(restored.fork('x'), 10));
  });
});
