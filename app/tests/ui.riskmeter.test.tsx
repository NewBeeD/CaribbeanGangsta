import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RiskMeter } from '@/ui/components';

/**
 * Fairness law (design/01 §0.3, GDD §8): the odds SHOWN are the odds ROLLED.
 * The % rendered must be derived straight from the passed probability. Rendered
 * to a static string so no DOM/testing-library dependency is needed.
 */
describe('RiskMeter — displayed odds match the input', () => {
  it('renders "70%" for probability 0.7', () => {
    const html = renderToStaticMarkup(<RiskMeter probability={0.7} />);
    expect(html).toContain('70%');
    expect(html).toContain('aria-valuenow="70"');
  });

  it('rounds to the exact percent and clamps out-of-range input', () => {
    expect(renderToStaticMarkup(<RiskMeter probability={0.355} />)).toContain('36%');
    expect(renderToStaticMarkup(<RiskMeter probability={0} />)).toContain('0%');
    expect(renderToStaticMarkup(<RiskMeter probability={1} />)).toContain('100%');
    expect(renderToStaticMarkup(<RiskMeter probability={1.4} />)).toContain('100%');
    expect(renderToStaticMarkup(<RiskMeter probability={-0.2} />)).toContain('0%');
  });

  it('carries risk with shape (dots), not colour alone', () => {
    const html = renderToStaticMarkup(<RiskMeter probability={0.7} dots={10} />);
    // 7 filled + 3 empty pips -> colourblind-safe cue.
    expect((html.match(/●/g) ?? []).length).toBe(7);
    expect((html.match(/○/g) ?? []).length).toBe(3);
  });
});
