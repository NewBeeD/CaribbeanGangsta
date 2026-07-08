export interface HeatDotsProps {
  /** Current heat level, clamped into [0, max]. */
  value: number;
  /** Total pips. Default 10 matches the Heat/Threats wireframe (design/07 §5). */
  max?: number;
  /** Optional tier caption, e.g. "DEA". */
  tier?: string;
}

/**
 * Heat as filled/empty pips rather than a raw number — tension stays legible
 * and estimable without exposing the machinery (design/07 §1, wireframe §5).
 * The dot shape (● vs ○) carries the level, so it's readable without colour.
 */
export function HeatDots({ value, max = 10, tier }: HeatDotsProps) {
  const filled = Math.max(0, Math.min(max, Math.round(value)));

  return (
    <span
      className="cg-heatdots"
      role="img"
      aria-label={`Heat ${filled} of ${max}${tier ? ` — ${tier}` : ''}`}
    >
      {tier != null && <span className="cg-label">{tier}</span>}
      <span aria-hidden="true">
        {Array.from({ length: max }, (_, i) => (
          <span
            key={i}
            className={i < filled ? 'cg-heatdots__dot--on' : 'cg-heatdots__dot--off'}
          >
            {i < filled ? '●' : '○'}
          </span>
        ))}
      </span>
    </span>
  );
}
