import { Button } from './Button';

export interface QtyInputProps {
  /** Current quantity (already clamped by the caller into `[min, max]`). */
  readonly value: number;
  /** The upper clamp — `min(cash, stock, capacity)` at the call site (design/12 Item 4). */
  readonly max: number;
  /** Emits a value clamped into `[min, max]`; the caller holds the state. */
  readonly onChange: (qty: number) => void;
  /** Lower bound (default 1 — a deal is at least one unit). */
  readonly min?: number;
  /** Accessible label for the number field (e.g. "Quantity to buy"). */
  readonly ariaLabel?: string;
  /** Unit noun rendered after the field ("units", "batches"). */
  readonly unit?: string;
  /**
   * Which limit pinned `max`, shown as a small note so the clamp is never a
   * surprise (design/12 Item 4 — "shows which limit bound it"). Absent = no note.
   */
  readonly boundLabel?: string | undefined;
  readonly disabled?: boolean;
}

/**
 * The quantity control (design/12 Item 4): a −/+ stepper PLUS a free numeric
 * field PLUS a MAX chip that fills the current clamp — so a big buy no longer
 * means tapping `+` a hundred times. Pure presentational: it clamps every edit
 * into `[min, max]` and reports it up; the caller owns the value and the clamp.
 * Reused by DealScreen buy/sell, the convert card, and the shipment desk.
 */
export function QtyInput({
  value,
  max,
  onChange,
  min = 1,
  ariaLabel,
  unit = 'units',
  boundLabel,
  disabled = false,
}: QtyInputProps) {
  const usableMax = Math.max(min, max);
  const canAct = !disabled && max >= min;
  const clamp = (q: number): number => Math.min(Math.max(min, Math.round(q)), usableMax);
  const set = (q: number) => onChange(clamp(q));

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          margin: '18px 0 8px',
        }}
      >
        <Button
          variant="secondary"
          onClick={() => set(value - 1)}
          disabled={!canAct}
          aria-label="Fewer units"
        >
          −
        </Button>
        <input
          className="cg-input"
          type="number"
          inputMode="numeric"
          min={min}
          max={usableMax}
          aria-label={ariaLabel ?? 'Quantity'}
          value={canAct ? value : 0}
          disabled={!canAct}
          onChange={(e) => set(Number(e.target.value) || min)}
          data-testid="qty-input"
          style={{ width: 96, textAlign: 'center' }}
        />
        <Button
          variant="secondary"
          onClick={() => set(value + 1)}
          disabled={!canAct}
          aria-label="More units"
        >
          +
        </Button>
        <Button
          variant="ghost"
          onClick={() => set(usableMax)}
          disabled={!canAct}
          aria-label={`Max ${unit}`}
          data-testid="qty-max"
        >
          Max
        </Button>
      </div>
      {canAct && boundLabel ? (
        <p className="cg-label" style={{ textAlign: 'center', marginTop: 0 }}>
          Up to {usableMax} {unit} — {boundLabel}
        </p>
      ) : null}
    </div>
  );
}
