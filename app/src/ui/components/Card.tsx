import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '@/ui/theme/cx';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Optional stamped header label (rendered as a dossier section head). */
  heading?: ReactNode;
  children: ReactNode;
}

/** Dossier index panel — the primary content container for a screen section. */
export function Card({ heading, children, className, ...rest }: CardProps) {
  return (
    <div className={cx('cg-card', className)} {...rest}>
      {heading != null && <span className="cg-label cg-card__head">{heading}</span>}
      {children}
    </div>
  );
}
