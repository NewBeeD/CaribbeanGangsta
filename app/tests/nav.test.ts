import { describe, expect, it } from 'vitest';
import {
  SCREEN_NODES,
  screenForHash,
  getScreenNode,
  DEFAULT_SCREEN,
} from '@/ui/shell/nav';

describe('Screen registry & routing (Ideas.md — open access)', () => {
  it('every screen is routable from minute one — no progression gates', () => {
    for (const node of SCREEN_NODES) {
      expect(screenForHash(`#/${node.route}`)).toBe(node.id);
    }
  });

  it('an unknown or empty route falls back to the default (deals)', () => {
    expect(screenForHash('')).toBe(DEFAULT_SCREEN);
    expect(screenForHash('#/nowhere')).toBe(DEFAULT_SCREEN);
    expect(screenForHash('#/')).toBe(DEFAULT_SCREEN);
  });

  it('routes with trailing segments or queries resolve to the base screen', () => {
    expect(screenForHash('#/crew/roster')).toBe('crew');
    expect(screenForHash('#/money?tab=fronts')).toBe('money');
  });

  it('the four persistent nav tabs are Deals · Crew · Money · Heat', () => {
    const nav = SCREEN_NODES.filter((n) => n.inNav).map((n) => n.label);
    expect(nav).toEqual(['Deals', 'Crew', 'Money', 'Heat']);
  });

  it('Empire · Storage · Corruption · Debt · High Score live one level up (not in bottom nav)', () => {
    const up = SCREEN_NODES.filter((n) => !n.inNav).map((n) => n.id);
    expect(up).toEqual(['empire', 'storage', 'corruption', 'debt', 'highscore']);
  });

  it('every node is retrievable by id', () => {
    for (const node of SCREEN_NODES) {
      expect(getScreenNode(node.id)).toBe(node);
    }
  });
});
