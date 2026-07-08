import type { ButtonHTMLAttributes } from 'react';
import { cx } from '@/ui/theme/cx';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** `primary` = brass foil. Use exactly ONE primary per screen state (UX §3). */
  variant?: ButtonVariant;
  /** Stretch to the container width (default for primary calls-to-action). */
  fullWidth?: boolean;
}

/**
 * The dossier button. Presentational only — the caller owns `onClick` and the
 * one-primary-per-screen rule; this just renders the variant.
 */
export function Button({
  variant = 'secondary',
  fullWidth = false,
  className,
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        'cg-btn',
        `cg-btn--${variant}`,
        fullWidth && 'cg-btn--block',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
