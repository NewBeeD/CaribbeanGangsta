/**
 * Street-team tuning — the crack corner economy (design/12 Item 5; Prompt 34).
 *
 * Cooking crack no longer stacks retail units in a stash (that was the source of
 * the "Not enough on hand" mislabel — the cook is space-hungry). Instead the
 * rocks go to the CREW, who move them on the corners over time: a hands-off dirty
 * -cash drip that converts bulk seizure risk into slow income (design/12 Item 5d).
 *
 * The crew is the whole limiter (no artificial cooldown): sell-through scales with
 * `crew.length`, and the queue a crew can hold is capped per member — with no crew
 * there are no corners, so a cook can't be booked at all. Corners are loud, so
 * every rock sold adds a little heat. All ACTIVE-only: the world (and the crew's
 * hustle) freezes while the player is away (GDD §6), so absence never earns, never
 * heats. Every number here is a v1 HYPOTHESIS held as config (prompts/README.md
 * "Config, not literals"); the live values are read from `state.config.street`.
 */

/** Units a single crew member moves on the corners per ACTIVE in-game day. */
export const STREET_SALE_PER_CREW_PER_DAY = 8;

/**
 * Most rocks a single crew member can hold in the sell queue. Total queue cap =
 * this × `crew.length`; a cook is clamped to the room left under it, and with no
 * crew the cap is 0 — the natural conversion limiter (design/12 Item 5b: no crew,
 * no corners), so no artificial cooldown is needed.
 */
export const STREET_QUEUE_PER_CREW = 200;

/** Heat added per rock sold on a corner (corners are loud — design/12 Item 5d). */
export const STREET_HEAT_PER_UNIT = 0.02;
