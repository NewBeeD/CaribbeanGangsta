// @vitest-environment jsdom
import { StrictMode, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  cardForPending,
  createInitialState,
  dominantRepTrack,
  getCard,
  variantText,
  type GameState,
  type PendingChoice,
} from '@/engine';
import { LocalSaveStore, useGameStore, type SaveStore } from '@/store';
import { StoryCardModal } from '@/ui/shell/StoryCardModal';
import { SessionEndHook } from '@/ui/shell/SessionEndHook';
import { nextCardScene } from '@/ui/shell/storyCardPresenter.model';
import { openLoop } from '@/ui/shell/sessionEnd.model';

// react-dom/test-utils `act` requires this flag to be set.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function freshSaveStore(): SaveStore {
  return new LocalSaveStore({ factory: new IDBFactory() });
}

function mount(ui: JSX.Element) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root!: Root;
  act(() => {
    root = createRoot(container);
    root.render(<StrictMode>{ui}</StrictMode>);
  });
  return {
    container,
    click(el: Element) {
      act(() => {
        el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
    },
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

/** A queued beat scene — how `beatStep` enqueues a fired beat (with its `beatId`). */
function beatChoice(beatId: string): PendingChoice {
  return { id: `beat-${beatId}-0`, kind: 'beat', summary: 'a beat', createdAtHours: 0, beatId };
}

/** A plain offline return-hook (no card) — how `settleOffline` queues an allocation. */
function returnHook(): PendingChoice {
  return { id: 'return-buyer-0', kind: 'buyer', summary: 'A buyer is waiting.', createdAtHours: 0 };
}

beforeEach(() => {
  useGameStore.setState({ state: null, lastOfflineReport: null, saveStore: freshSaveStore() });
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('presenter model — beats become scenes, return-hooks do not (Prompt 22)', () => {
  it('resolves a queued beat to its card, skipping card-less return-hooks', () => {
    const withBeat: GameState = {
      ...createInitialState('present-beat'),
      pendingChoices: [returnHook(), beatChoice('beat.first-front')],
    };
    const scene = nextCardScene(withBeat);
    expect(scene?.card.id).toBe('FRONT-01');
    expect(scene?.choiceId).toBe('beat-beat.first-front-0');
  });

  it('a queue of only return-hooks has no interrupt scene', () => {
    const onlyHooks: GameState = {
      ...createInitialState('present-hooks'),
      pendingChoices: [returnHook()],
    };
    expect(nextCardScene(onlyHooks)).toBeNull();
  });

  it('stamps the dominant reputation track onto the resolved scene', () => {
    const politicalRun: GameState = {
      ...createInitialState('present-rep'),
      reputation: { street: 1, business: 1, political: 9 },
      pendingChoices: [beatChoice('beat.first-front')],
    };
    const card = cardForPending(politicalRun, politicalRun.pendingChoices[0]!);
    expect(dominantRepTrack(politicalRun.reputation)).toBe('political');
    expect(card?.activeVariant).toBe('political');
    expect(variantText(card!)).toBe(card!.reputationVariants.political);
  });
});

describe('StoryCardModal — an in-world scene with choices (Prompt 22)', () => {
  const card = getCard('FRONT-01')!;

  it('renders prose, the characters, and one button per choice', () => {
    const resolved = { ...card, activeVariant: 'street' as const };
    const view = mount(<StoryCardModal card={resolved} onResolve={() => {}} />);
    expect(view.container.textContent).toContain('The banker locks the office door');
    expect(view.container.textContent).toContain('A tired banker');
    expect(view.container.querySelectorAll('[data-testid="scene-choice"]')).toHaveLength(
      card.choices.length,
    );
    view.unmount();
  });

  it('weaves the reputation variant in — the same scene, told for your path', () => {
    const resolved = { ...card, activeVariant: 'business' as const };
    const view = mount(<StoryCardModal card={resolved} onResolve={() => {}} />);
    expect(view.container.textContent).toContain(card.reputationVariants.business);
    view.unmount();
  });

  it('choosing shows the result prose, then Continue commits the choice index', () => {
    let resolvedWith: number | null = null;
    const resolved = { ...card, activeVariant: 'street' as const };
    const view = mount(
      <StoryCardModal card={resolved} onResolve={(i) => (resolvedWith = i)} />,
    );

    // Picking a choice only stages it — the result prose appears, no commit yet.
    const [choice] = view.container.querySelectorAll('[data-testid="scene-choice"]');
    view.click(choice!);
    expect(resolvedWith).toBeNull();
    expect(view.container.textContent).toContain(card.choices[0]!.sceneResult);

    // Continue commits exactly that index.
    view.click(view.container.querySelector('[data-testid="scene-continue"]')!);
    expect(resolvedWith).toBe(0);
    view.unmount();
  });

  it('a negative beat renders as a scene, not an error/toast (design/05 §4)', () => {
    const betrayal = getCard('CREW-BETRAY-01')!;
    const resolved = { ...betrayal, activeVariant: 'street' as const };
    const view = mount(<StoryCardModal card={resolved} onResolve={() => {}} />);
    // Prose scene (the shared SceneText surface), no toast/alert/error chrome.
    expect(view.container.querySelector('.cg-scene')).not.toBeNull();
    expect(view.container.querySelector('[role="alert"]')).toBeNull();
    expect(view.container.textContent).toContain('stopped looking you');
    view.unmount();
  });
});

describe('store — resolving a scene applies effects and clears the queue (Prompt 22)', () => {
  it('applies exactly the chosen effect and drops the resolved scene', () => {
    const state: GameState = {
      ...createInitialState('resolve-effects'),
      pendingChoices: [beatChoice('beat.first-front')],
    };
    useGameStore.setState({ state });
    const before = state.reputation.business;

    // FRONT-01 choice 0 declares exactly { rep business +2 }.
    useGameStore.getState().resolveCardChoice('beat-beat.first-front-0', 0);

    const after = useGameStore.getState().state!;
    expect(after.reputation.business).toBe(before + 2);
    expect(after.pendingChoices).toHaveLength(0);
    // One-shot bookkeeping: the card is recorded as fired.
    expect(after.flags['@card-fired/FRONT-01']).toBe(true);
  });

  it('dismissing a return-hook clears it from the queue', () => {
    const state: GameState = {
      ...createInitialState('resolve-dismiss'),
      pendingChoices: [returnHook()],
    };
    useGameStore.setState({ state });

    useGameStore.getState().dismissPendingChoice('return-buyer-0');
    expect(useGameStore.getState().state!.pendingChoices).toHaveLength(0);
  });
});

describe('session-end hook — never leave on a clean, empty state (GDD §11)', () => {
  it('always yields a resolving thread, a pending decision, and an income rate', () => {
    const bare = createInitialState('open-loop');
    const loop = openLoop(bare);
    expect(loop.resolving.length).toBeGreaterThan(0);
    expect(loop.pending.length).toBeGreaterThan(0);
    expect(Number.isFinite(loop.incomeRate)).toBe(true);
  });

  it('surfaces a queued scene as the pending decision', () => {
    const withHook: GameState = {
      ...createInitialState('open-loop-hook'),
      pendingChoices: [returnHook()],
    };
    expect(openLoop(withHook).pending).toBe('A buyer is waiting.');
  });

  it('renders the open loop — no loss framing anywhere (GDD §8)', () => {
    useGameStore.setState({ state: createInitialState('open-loop-render') });
    const view = mount(<SessionEndHook />);
    expect(view.container.querySelector('[data-testid="session-end"]')).not.toBeNull();
    expect(view.container.textContent).toContain('Income accruing');
    const text = view.container.textContent!.toLowerCase();
    expect(text).not.toContain('at risk');
    expect(text).not.toContain('you lost');
    view.unmount();
  });
});
