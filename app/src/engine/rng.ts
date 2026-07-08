/**
 * Seeded, deterministic PRNG — the ONLY randomness source in `engine/`.
 *
 * Given the same seed and the same ordered draws, the stream is byte-identical.
 * This is what makes each run reproducible from its seed (save/load, telemetry
 * replay, and the "no dead-on-arrival seed" property test all depend on it).
 * No `Math.random` — see `.eslintrc` determinism guard and prompts/README.md.
 *
 * Algorithm: mulberry32 (fast, well-distributed 32-bit generator) seeded through
 * an xmur3 string hash, so both numeric and string seeds are supported.
 */

export interface Rng {
  /** Next float in [0, 1). */
  next(): number;
  /** Integer in [min, max] — both ends inclusive. */
  int(min: number, max: number): number;
  /** Float in [min, max). */
  float(min: number, max: number): number;
  /** Uniformly pick one element (throws on empty array). */
  pick<T>(a: readonly T[]): T;
  /** Pick a `[value, weight]` entry proportional to weight (weights > 0). */
  weighted<T>(e: readonly [T, number][]): T;
  /** True with probability `p` (clamped to [0, 1]). */
  chance(p: number): boolean;
  /**
   * Derive an INDEPENDENT sub-stream keyed by `label`. Forking does NOT consume
   * this stream, and the child depends only on the parent's seed + label — so
   * e.g. deal rolls can't desync world generation, and the same label always
   * yields the same sub-stream.
   */
  fork(label: string): Rng;
  /** Serializable snapshot for save/load. */
  getState(): RngState;
  /** Restore a snapshot produced by `getState()`. */
  setState(state: RngState): void;
}

export interface RngState {
  /** The internal 32-bit mulberry32 accumulator. */
  readonly a: number;
  /** The normalized seed key — needed so `fork()` stays reproducible. */
  readonly key: string;
}

/** xmur3 string hash → a 32-bit unsigned seed value. */
function xmur3Seed(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  h ^= h >>> 16;
  return h >>> 0;
}

class Mulberry32 implements Rng {
  private a: number;
  private readonly key: string;

  constructor(key: string, a: number) {
    this.key = key;
    this.a = a | 0;
  }

  next(): number {
    this.a = (this.a + 0x6d2b79f5) | 0;
    let t = Math.imul(this.a ^ (this.a >>> 15), 1 | this.a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(min: number, max: number): number {
    if (max < min) throw new Error(`int(${min}, ${max}): max < min`);
    return min + Math.floor(this.next() * (max - min + 1));
  }

  float(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  pick<T>(a: readonly T[]): T {
    if (a.length === 0) throw new Error('pick(): empty array');
    return a[this.int(0, a.length - 1)] as T;
  }

  weighted<T>(e: readonly [T, number][]): T {
    let total = 0;
    for (const [, w] of e) total += w;
    if (total <= 0) throw new Error('weighted(): total weight must be > 0');
    let r = this.next() * total;
    for (const [value, w] of e) {
      r -= w;
      if (r < 0) return value;
    }
    // Floating-point fall-through: return the last entry.
    return e[e.length - 1]![0];
  }

  chance(p: number): boolean {
    const clamped = p < 0 ? 0 : p > 1 ? 1 : p;
    return this.next() < clamped;
  }

  fork(label: string): Rng {
    return createRng(`${this.key}::${label}`);
  }

  getState(): RngState {
    return { a: this.a, key: this.key };
  }

  setState(state: RngState): void {
    if (state.key !== this.key) {
      throw new Error(
        `setState(): key mismatch (${state.key} != ${this.key}) — restoring a foreign stream`,
      );
    }
    this.a = state.a | 0;
  }
}

/** Create a fresh seeded RNG. Accepts a numeric or string seed. */
export function createRng(seed: number | string): Rng {
  const key = String(seed);
  return new Mulberry32(key, xmur3Seed(key));
}

/** Rehydrate an RNG from a serialized `RngState` (save/load). */
export function restoreRng(state: RngState): Rng {
  const rng = new Mulberry32(state.key, state.a);
  return rng;
}
