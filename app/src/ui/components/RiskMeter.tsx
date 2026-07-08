import type { ReactNode } from 'react';

export interface RiskMeterProps {
  /**
   * The probability to surface, in [0, 1]. FAIRNESS LAW: this is the exact value
   * the engine rolls against — the % rendered here is derived straight from it,
   * never a decorated approximation (design/01 §0.3, GDD §8).
   */
  probability: number;
  /** What the odds describe. Default reads as the deal screen's clean chance. */
  label?: ReactNode;
  /** Number of dots in the bar (visual granularity only). */
  dots?: number;
  /** Optional consequence line, e.g. "If busted: lose product + cash". */
  note?: ReactNode;
}

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

/**
 * Renders a probability three ways at once — an exact % label, a row of
 * filled/empty dots, and an inked bar — so risk is legible without colour
 * alone (colorblind-safe: shape + number carry it). The % is the source of
 * truth; the dots round to it.
 */
export function RiskMeter({
  probability,
  label = 'Clean chance',
  dots = 10,
  note,
}: RiskMeterProps) {
  const p = clamp01(probability);
  const percent = Math.round(p * 100);
  const filled = Math.round(p * dots);

  return (
    <div
      className="cg-riskmeter"
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext={`${percent}%`}
    >
      <div className="cg-riskmeter__head">
        <span className="cg-label">{label}</span>
        <span className="cg-riskmeter__pct">{percent}%</span>
      </div>
      <div className="cg-riskmeter__dots" aria-hidden="true">
        {Array.from({ length: dots }, (_, i) => (
          <span key={i} className={i < filled ? 'cg-dot--on' : 'cg-dot--off'}>
            {i < filled ? '●' : '○'}
          </span>
        ))}
      </div>
      <div className="cg-riskmeter__bar" aria-hidden="true">
        <i style={{ width: `${percent}%` }} />
      </div>
      {note != null && <p className="cg-riskmeter__note">{note}</p>}
    </div>
  );
}
