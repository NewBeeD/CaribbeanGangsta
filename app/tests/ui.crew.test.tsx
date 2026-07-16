// @vitest-environment jsdom
import { StrictMode, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CREW_ARCHETYPES,
  createInitialState,
  describeLoyalty,
  spawnCrew,
  type CrewMember,
  type GameState,
} from '@/engine';
import { AUTOSAVE_SLOT, LocalSaveStore, useGameStore, type SaveStore } from '@/store';
import { CrewScreen } from '@/ui/screens/CrewScreen';
import { CrewDetail } from '@/ui/screens/CrewDetail';

// react-dom/test-utils `act` requires this flag to be set.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function freshSaveStore(): SaveStore {
  return new LocalSaveStore({ factory: new IDBFactory() });
}

/** Mount a component into a real (jsdom) client root — the path that reads the LIVE store. */
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

/** A run whose crew is exactly `crew`. */
function runWith(seed: string, crew: readonly CrewMember[]): GameState {
  return { ...createInitialState(seed), crew };
}

beforeEach(() => {
  useGameStore.setState({ state: null, lastOfflineReport: null, saveStore: freshSaveStore() });
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('CrewScreen — loyalty is behaviour/prose, never a number (design/02 §1)', () => {
  it('renders the loyalty line and NEVER leaks the raw 0–100 value to the DOM', () => {
    // A distinctive loyalty that would be conspicuous if it leaked.
    const marco = spawnCrew('marco', { loyalty: 73 });
    useGameStore.setState({ state: runWith('crew-prose', [marco]) });

    const view = mount(<CrewScreen />);
    // The prose standing is present…
    expect(view.container.textContent).toContain(describeLoyalty(marco));
    // …and the hidden number never reaches the DOM.
    expect(view.container.textContent).not.toContain('73');
    // Nothing renders a progress bar / meter for loyalty either.
    expect(view.container.querySelector('[role="meter"]')).toBeNull();
    view.unmount();
  });

  it('starts empty and offers the whole roster — recruit is open access, not a flag gate', () => {
    useGameStore.setState({ state: createInitialState('crew-open') });
    const view = mount(<CrewScreen />);
    // Every archetype is offered when the crew is empty (money/relationships gate, not menus).
    for (const a of CREW_ARCHETYPES) {
      expect(view.container.textContent).toContain(`Recruit ${a.name}`);
    }
    view.unmount();
  });

  it('recruiting adds exactly that person to the crew', () => {
    useGameStore.setState({ state: createInitialState('crew-recruit') });
    const view = mount(<CrewScreen />);

    const target = CREW_ARCHETYPES[0]!;
    const button = [...view.container.querySelectorAll('.cg-btn')].find((b) =>
      b.textContent?.includes(`Recruit ${target.name}`),
    )!;
    view.click(button);

    const after = useGameStore.getState().state!;
    expect(after.crew.map((c) => c.archetypeId)).toContain(target.id);
    view.unmount();
  });

  it('groups the roster by duty and shows the available count (design/13 D; Prompt 46)', () => {
    const lt = spawnCrew('marco', { id: 'lt', role: 'lieutenant', productionOpIds: ['prod-x'] });
    const idle = spawnCrew('deon', { id: 'idle' });
    const courier = spawnCrew('benji', {
      id: 'cour',
      assignment: { kind: 'courier', targetId: 'ship-1' },
    });
    useGameStore.setState({ state: runWith('crew-groups', [lt, idle, courier]) });

    const view = mount(<CrewScreen />);
    const text = view.container.textContent ?? '';
    // Only the truly-idle body counts as available.
    expect(text).toContain('1 available');
    // Duty group headers surface each state; the free pool leads.
    expect(text).toContain('Available now');
    expect(text).toContain('On production');
    // An in-flight courier reads as busy, not available.
    expect(text).toContain('Couriers in flight');
    expect(text).not.toContain('2 available');
    view.unmount();
  });
});

describe('CrewDetail — perspective, memory, and the betrayal arc (design/02 §2–§4)', () => {
  it('renders the memory log and it survives a save/reload round-trip', async () => {
    const saveStore = freshSaveStore();
    const deon = spawnCrew('deon', {
      memoryLog: [
        { atHours: 12, kind: 'tookTheFall', note: 'You left Deon to take the fall in Kingston.', delta: -13 },
      ],
    });
    const state = runWith('crew-memory', [deon]);

    // Persist, wipe the live store, then hydrate from disk (the "reload").
    useGameStore.setState({ state, saveStore });
    await useGameStore.getState().persist(AUTOSAVE_SLOT);
    useGameStore.setState({ state: null, saveStore });
    await useGameStore.getState().hydrate(AUTOSAVE_SLOT);

    const view = mount(<CrewDetail crewId={deon.id} onBack={() => {}} />);
    expect(view.container.textContent).toContain('You left Deon to take the fall in Kingston.');
    view.unmount();
  });

  it('surfaces a betrayal arc as a readable sign with intervention actions', () => {
    const marco = spawnCrew('marco', {
      loyalty: 35,
      memoryLog: [{ atHours: 8, kind: 'passedOver', note: 'You passed Marco over.', delta: -11 }],
      activeArc: {
        stage: 'warning',
        startedAtHours: 8,
        advancedAtHours: 8,
        sign: 'Marco has been distant and short with you.',
      },
    });
    useGameStore.setState({ state: runWith('crew-arc', [marco]) });

    const view = mount(<CrewDetail crewId={marco.id} onBack={() => {}} />);
    const text = view.container.textContent ?? '';
    // The warning is prose, not a gauge…
    expect(text).toContain('Marco has been distant and short with you.');
    // …with the intervention levers offered (design/02 §4).
    expect(text).toContain('Raise their pay');
    expect(text).toContain('Confront them');
    view.unmount();
  });

  it('raising pay dispatches a treatment that recovers loyalty (the intervention window)', () => {
    const marco = spawnCrew('marco', {
      loyalty: 35,
      memoryLog: [{ atHours: 8, kind: 'passedOver', note: 'You passed Marco over.', delta: -11 }],
      activeArc: {
        stage: 'warning',
        startedAtHours: 8,
        advancedAtHours: 8,
        sign: 'Marco has been distant and short with you.',
      },
    });
    useGameStore.setState({ state: { ...runWith('crew-raise', [marco]), cleanCash: 1_000_000 } });

    const view = mount(<CrewDetail crewId={marco.id} onBack={() => {}} />);
    const before = useGameStore.getState().state!.crew[0]!.loyalty;
    const button = [...view.container.querySelectorAll('.cg-btn')].find((b) =>
      b.textContent?.includes('Raise their pay'),
    )!;
    view.click(button);

    const after = useGameStore.getState().state!.crew[0]!;
    expect(after.loyalty).toBeGreaterThan(before);
    // The treatment is remembered (design/02 §3).
    expect(after.memoryLog.length).toBe(2);
    view.unmount();
  });
});
