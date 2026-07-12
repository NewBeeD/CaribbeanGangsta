/**
 * The Transport screen (design/12 Item 8) — dispatch cargo across the water and
 * track what's in flight, lifted off the Empire Map into its own page. Route
 * *unlocking* stays on Empire (a foothold in another country is a destination);
 * the *moving* lives here. It's a thin header over the self-contained
 * `ShipmentDesk` (dispatch form + in-flight tracker + arrival/seizure scenes),
 * so this is a mount move, not a rewrite.
 */

import { useGameState } from '@/store';
import { navigate } from '@/ui/shell/useHash';
import { Button, Card } from '@/ui/components';
import { ShipmentDesk } from './ShipmentDesk';

export function TransportScreen() {
  const state = useGameState();
  // The shell only routes here with a live run; guard so hooks stay unconditional.
  if (!state) return null;

  const inFlight = state.shipments.length;

  return (
    <div>
      <header
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <span className="cg-kicker">Transport</span>
        <span className="cg-label" aria-live="polite">
          {inFlight > 0
            ? `${inFlight} on the water`
            : 'Nothing in flight'}
        </span>
      </header>

      {state.stashes.length <= 1 ? (
        <Card heading="No routes yet">
          <p className="cg-label" style={{ marginBottom: 12 }}>
            A shipment needs somewhere to land. Open a route on the Empire map — a
            foothold in another country is a destination.
          </p>
          <Button variant="secondary" onClick={() => navigate('empire')}>
            Open a route on the Empire map →
          </Button>
        </Card>
      ) : null}

      <ShipmentDesk />
    </div>
  );
}
