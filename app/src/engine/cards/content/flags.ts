/**
 * Named flags the MVP card content sets and reads (design/08 — every card is
 * testable via explicit flags). Two families:
 *
 *  - **Engine gates** re-exported from the systems they belong to, so an `unlock`
 *    effect on a card actually opens the matching system (and its beat fires). A
 *    card that "opens the arms pipeline" sets the *same* flag `beats.ts` keys off.
 *  - **Story flags** — narrative bookkeeping (`silvio_hostile`, `first_sale`) that
 *    later cards gate on. Centralized here so the strings never drift.
 */

// Engine gates (reuse the real flags so beats/systems react to card choices).
export {
  ARMS_UNLOCK_FLAG,
  INTERNATIONAL_ROUTES_FLAG,
} from '../../beats';
export { ALT_ROUTE_FLAG } from '../../config/events';

// --- Story flags (narrative bookkeeping) -------------------------------------

/** The guided first sale landed — the onboarding spine's first checkpoint. */
export const FIRST_SALE_FLAG = 'first_sale';
/** The player learned the survivable-heat lesson (lie low, it cools). */
export const HEAT_LESSON_FLAG = 'learned_heat_lie_low';
/** A first runner is on the crew (onboarding relatedness seed). */
export const FIRST_RUNNER_FLAG = 'hired_first_runner';
/** The anti-wipe lesson landed in fiction (they took one place, not the empire). */
export const ANTIWIPE_LESSON_FLAG = 'learned_antiwipe';

/** The player took Papa Cass's loan (the debt engine is live in fiction). */
export const DEBT_ACTIVE_FLAG = 'debt_active';
/** The first loan was cleared in full (unlocks the standing-credit relationship). */
export const DEBT_CLEARED_FLAG = 'debt_cleared';
/** Cass's bigger line of credit is open (the leverage-worked payoff). */
export const CASS_LINE_EXTENDED_FLAG = 'cass_line_extended';

/** The rival Silvio has been made hostile (fast grudge escalation). */
export const SILVIO_HOSTILE_FLAG = 'silvio_hostile';
/** A fragile truce/alliance branch with Silvio is open. */
export const SILVIO_WARY_FLAG = 'silvio_wary';
/** Quietly gathering intel on Silvio (the low-profile read). */
export const SILVIO_WATCHED_FLAG = 'silvio_watched';

/** A port official (Beaumont) is paid — reduced seizure this run. */
export const PORT_BEAUMONT_PAID_FLAG = 'port_beaumont_paid';
/** Beaumont was fed false intel as counter-intelligence. */
export const BEAUMONT_FED_FALSE_FLAG = 'beaumont_fed_false';
