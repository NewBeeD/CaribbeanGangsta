import type { ReactNode } from 'react';
import { cx } from '@/ui/theme/cx';

export type Tone = 'default' | 'gold' | 'green' | 'red' | 'dim';

const TONE_CLASS: Record<Tone, string | false> = {
  default: false,
  gold: 'cg-tone-gold',
  green: 'cg-tone-green',
  red: 'cg-tone-red',
  dim: 'cg-tone-dim',
};

export interface StatProps {
  label: ReactNode;
  value: ReactNode;
  /** Colour the value. Always paired with the label text, never colour alone. */
  tone?: Tone;
  /** Render the value at display size (e.g. headline cash figure). */
  big?: boolean;
}

/** A label/value pair on one baseline — the plain dossier stat. */
export function Stat({ label, value, tone = 'default', big = false }: StatProps) {
  return (
    <div className={cx('cg-stat', big && 'cg-stat--big')}>
      <span className="cg-label">{label}</span>
      <span className={cx('cg-stat__value', TONE_CLASS[tone])}>{value}</span>
    </div>
  );
}

export interface DottedRowProps {
  label: ReactNode;
  value: ReactNode;
  tone?: Tone;
}

/**
 * The case-file row: `label · · · · · · value` with a dotted leader. Use for
 * ledger-style readouts (e.g. "Clean chance ······ 70%").
 */
export function DottedRow({ label, value, tone = 'default' }: DottedRowProps) {
  return (
    <div className="cg-dotted">
      <span className="cg-dotted__label">{label}</span>
      <span className="cg-dotted__fill" aria-hidden="true" />
      <span className={cx('cg-dotted__value', TONE_CLASS[tone])}>{value}</span>
    </div>
  );
}
