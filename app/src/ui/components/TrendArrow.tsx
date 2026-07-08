import { cx } from '@/ui/theme/cx';

export type TrendDirection = 'up' | 'down' | 'flat';

const GLYPH: Record<TrendDirection, string> = {
  up: '▲',
  down: '▼',
  flat: '▬',
};

const SR_LABEL: Record<TrendDirection, string> = {
  up: 'rising',
  down: 'falling',
  flat: 'steady',
};

export interface TrendArrowProps {
  direction: TrendDirection;
  /** Optional visible caption, e.g. "price rising". Glyph shows regardless. */
  label?: string;
}

/**
 * Price/market trend glyph. Direction is carried by the arrow shape (and any
 * label), not colour alone, so it reads for colourblind players (design/04 §6).
 */
export function TrendArrow({ direction, label }: TrendArrowProps) {
  return (
    <span className={cx('cg-trend', `cg-trend--${direction}`)}>
      <span className="cg-trend__glyph" aria-hidden="true">
        {GLYPH[direction]}
      </span>
      {label != null ? <span>{label}</span> : <span className="cg-sr-only">{SR_LABEL[direction]}</span>}
    </span>
  );
}
