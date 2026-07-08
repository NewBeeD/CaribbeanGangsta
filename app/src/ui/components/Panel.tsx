import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '@/ui/theme/cx';

export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  /** Optional stamped label above the panel body. */
  heading?: ReactNode;
  children: ReactNode;
}

/**
 * Inset sub-box for grouping a sub-decision inside a Card (e.g. the deal
 * screen's "RISK THIS RUN" block). Lighter weight than Card.
 */
export function Panel({ heading, children, className, ...rest }: PanelProps) {
  return (
    <div className={cx('cg-panel', className)} {...rest}>
      {heading != null && (
        <span className="cg-label" style={{ display: 'block', marginBottom: 8 }}>
          {heading}
        </span>
      )}
      {children}
    </div>
  );
}
