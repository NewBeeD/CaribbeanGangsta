import { describe, expect, it } from 'vitest';
import { createGame, ENGINE_VERSION } from '@/engine';

/**
 * End-to-end proof that the test harness, TypeScript, and the `@/*` alias all
 * resolve. Real engine specs arrive with the simulation core (prompts 02+).
 */
describe('engine scaffold', () => {
  it('createGame() returns a versioned game object', () => {
    const game = createGame();
    expect(game).toEqual({ version: ENGINE_VERSION });
    expect(typeof game.version).toBe('string');
  });
});
