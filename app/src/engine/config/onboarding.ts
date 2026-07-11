/**
 * First-session onboarding budget (design/01 §6; GDD §9; Prompt 24 consumes,
 * Prompt 26 centralizes). Target: **10–20 min, frustration-free, ends on an open
 * loop.** These are v1 balance HYPOTHESES held as config, never scattered
 * literals — data only; the onboarding UI (Prompt 24) reads this table, the
 * engine itself never gates on it (open access, Ideas.md).
 *
 * Tuned against the #1 telemetry hypothesis (design/01 §8.1, §9): first-session
 * length distribution vs. D1 retention.
 */

/** Target first-session length window, minutes (GDD §9). */
export const SESSION_TARGET_MIN_MINUTES = 10;
export const SESSION_TARGET_MAX_MINUTES = 20;

/** Minute budget for the opening (design/01 §6). Each entry is a "by minute X" goal. */
export const MINUTE_BUDGET = {
  /** Reveal the dream + first hand-held sale (beat the 2-min churn cliff). */
  firstSaleByMinute: 2,
  /** 3–4 more deals, first heat scare SURVIVED, first runner hired. */
  heatScareSurvivedByMinute: 8,
  /** Currency/laundering introduced no earlier than this (PvZ delayed-currency lesson). */
  currencyIntroMinute: 8,
  /** First laundering front open → offline engine set up → session-end open loop. */
  firstFrontByMinute: 15,
} as const;

/** More deals to hand-hold through after the first sale (design/01 §6: "3–4 more"). */
export const GUIDED_DEALS_AFTER_FIRST = 3;

/** Cap on-screen instruction length (design/01 §6: ~8 words). */
export const MAX_INSTRUCTION_WORDS = 8;

/**
 * Loss sequencing (design/01 §2; design/05 §4): real bust risk begins only after
 * this many wins are banked (`deals.hasBankedWin`) — the first sale is
 * guaranteed-survivable so competence lands before the first loss.
 */
export const SAFE_DEALS_BEFORE_RISK = 1;
