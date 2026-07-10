import { describe, expect, it } from 'vitest';
import {
  ConsoleSink,
  LocalSink,
  RemoteSink,
  TelemetryBus,
  type AnyTelemetryEvent,
} from '@/telemetry';

/** A bus on a fixed clock so stamps are deterministic. */
function fixedBus(now = 1_000): TelemetryBus {
  return new TelemetryBus({ now: () => now });
}

describe('telemetry bus (Prompt 25; design/06)', () => {
  it('fans a typed event out to every sink with a stamp and a monotonic seq', () => {
    const bus = fixedBus(42);
    const a = new LocalSink();
    const b = new LocalSink();
    bus.addSink(a);
    bus.addSink(b);

    bus.track('beat_fired', { beatId: 'ONB-01' });
    bus.track('chaos_event', { flag: 'chaos.hurricane' });

    for (const sink of [a, b]) {
      expect(sink.events().map((e) => e.name)).toEqual(['beat_fired', 'chaos_event']);
      expect(sink.events()[0]!.at).toBe(42);
      expect(sink.events()[0]!.seq).toBe(0);
      expect(sink.events()[1]!.seq).toBe(1);
    }
  });

  it('a throwing sink is isolated — telemetry never breaks play', () => {
    const bus = fixedBus();
    const broken = {
      handle() {
        throw new Error('sink exploded');
      },
    };
    const local = new LocalSink();
    bus.addSink(broken);
    bus.addSink(local);
    expect(() => bus.track('beat_fired', { beatId: 'B' })).not.toThrow();
    expect(local.events()).toHaveLength(1);
  });

  it('removeSink detaches', () => {
    const bus = fixedBus();
    const local = new LocalSink();
    bus.addSink(local);
    bus.removeSink(local);
    bus.track('beat_fired', { beatId: 'B' });
    expect(local.events()).toHaveLength(0);
  });

  it('LocalSink is a bounded ring buffer with change notification', () => {
    const bus = fixedBus();
    const local = new LocalSink(3);
    bus.addSink(local);
    let notified = 0;
    const unsubscribe = local.subscribe(() => notified++);

    for (let i = 0; i < 5; i++) bus.track('beat_fired', { beatId: `B${i}` });

    // Oldest events rolled off; only the last 3 retained.
    expect(local.events().map((e) => (e.props as { beatId: string }).beatId)).toEqual([
      'B2',
      'B3',
      'B4',
    ]);
    expect(notified).toBe(5);

    unsubscribe();
    bus.track('beat_fired', { beatId: 'B5' });
    expect(notified).toBe(5);

    local.clear();
    expect(local.events()).toHaveLength(0);
  });

  it('each events() snapshot is stable (safe for useSyncExternalStore)', () => {
    const bus = fixedBus();
    const local = new LocalSink();
    bus.addSink(local);
    bus.track('beat_fired', { beatId: 'B' });
    const first = local.events();
    expect(local.events()).toBe(first); // same reference until the next event
    bus.track('beat_fired', { beatId: 'C' });
    expect(local.events()).not.toBe(first);
  });

  it('RemoteSink is a drop-in stub: queues locally, flush discards, no network', () => {
    const bus = fixedBus();
    const remote = new RemoteSink();
    bus.addSink(remote);
    bus.track('beat_fired', { beatId: 'B' });
    bus.track('beat_fired', { beatId: 'C' });
    expect(remote.pending()).toBe(2);
    remote.flush();
    expect(remote.pending()).toBe(0);
    // Nothing depends on it: the stub exposes no transport surface at all.
    expect('fetch' in remote).toBe(false);
  });

  it('carries no PII — props are game numbers/ids only', () => {
    const bus = fixedBus();
    const local = new LocalSink();
    bus.addSink(local);
    bus.track('session_start', {
      source: 'new-run',
      seed: 's',
      day: 1,
      everBorrowed: false,
    });
    const event = local.events()[0] as AnyTelemetryEvent;
    const banned = ['email', 'name', 'ip', 'device', 'user', 'account'];
    for (const key of Object.keys(event.props)) {
      expect(banned).not.toContain(key.toLowerCase());
    }
  });

  it('ConsoleSink writes through console.debug without throwing', () => {
    const bus = fixedBus();
    bus.addSink(new ConsoleSink());
    expect(() => bus.track('beat_fired', { beatId: 'B' })).not.toThrow();
  });
});
