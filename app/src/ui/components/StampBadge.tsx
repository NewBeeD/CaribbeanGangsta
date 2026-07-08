import { cx } from '@/ui/theme/cx';

export type StampVariant = 'confidential' | 'filed' | 'danger';

export interface StampBadgeProps {
  /** Stamp text. Defaults to the variant's canonical word. */
  label?: string;
  variant?: StampVariant;
}

const DEFAULT_LABEL: Record<StampVariant, string> = {
  confidential: 'CONFIDENTIAL',
  filed: 'FILED',
  danger: 'BUSTED',
};

/**
 * Inked, rotated case stamp (CONFIDENTIAL / FILED / danger motifs, design/07).
 * Purely decorative status flavour — pair with real text elsewhere.
 */
export function StampBadge({ variant = 'confidential', label }: StampBadgeProps) {
  return (
    <span className={cx('cg-stamp', `cg-stamp--${variant}`)}>
      {label ?? DEFAULT_LABEL[variant]}
    </span>
  );
}
