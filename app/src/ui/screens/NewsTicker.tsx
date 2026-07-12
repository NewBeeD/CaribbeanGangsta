/**
 * The news ticker (Prompt 33; design/12 Item 6) — a small "word on the street"
 * strip on the Deal and World Market screens. It surfaces the rumor feed: legit
 * and fake intel side by side, direction shown, TRUTH withheld (reading it is the
 * gamble). PURE composition — every line comes from `newsTicker.model`; it
 * dispatches nothing.
 */

import { useGameState } from '@/store';
import { Panel, TrendArrow } from '@/ui/components';
import { tickerLines } from './newsTicker.model';

export function NewsTicker() {
  const state = useGameState();
  if (!state) return null;
  const lines = tickerLines(state);
  if (lines.length === 0) return null;

  return (
    <div style={{ marginBottom: 16 }}>
      <Panel heading="Word on the street">
        <ul
          data-testid="news-ticker"
          aria-label="Market rumors"
          style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}
        >
          {lines.map((l) => (
            <li
              key={l.id}
              style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}
            >
              <TrendArrow direction={l.direction} />
              <span className="cg-label" style={{ lineHeight: 1.35 }}>
                {l.headline}
              </span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
