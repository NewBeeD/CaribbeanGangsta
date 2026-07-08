import { cx } from '@/ui/theme/cx';

export interface BottomNavItem {
  id: string;
  label: string;
  /** Locked tabs render greyed and unclickable (progressive disclosure). */
  disabled?: boolean;
}

export interface BottomNavProps {
  items: BottomNavItem[];
  activeId: string;
  onSelect: (id: string) => void;
}

/**
 * Persistent bottom navigation (Deals · Crew · Money · Heat, design/07 §8).
 * Presentational: the shell owns routing and which tabs are unlocked; this
 * renders state and reports taps.
 */
export function BottomNav({ items, activeId, onSelect }: BottomNavProps) {
  return (
    <nav className="cg-bottomnav" aria-label="Primary">
      {items.map((item) => {
        const active = item.id === activeId;
        return (
          <button
            key={item.id}
            type="button"
            className={cx('cg-bottomnav__btn', active && 'is-active')}
            disabled={item.disabled ?? false}
            aria-current={active ? 'page' : undefined}
            onClick={() => onSelect(item.id)}
          >
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
