# Prompt 23 — High-score / run-end screen + leaderboard

**Phase:** 2 — UI
**Depends on:** 11, 14
**Design refs:** `design/07` §6 (run-end wireframe); `design/01` §7; GDD §7, §12
(social/leaderboards); `prompts/README.md` (Leaderboard interface, local-first)

## Goal
End the run on the **"beat it next run"** cliffhanger and make the cross-run chase
concrete: banked score, personal best, prestige unlocks, and a (local) leaderboard —
with the remote leaderboard stubbed behind an interface.

## Build
- `src/store/leaderboard.ts`:
  - `interface Leaderboard { submit(entry): Promise<void>; top(n, board): Promise<Entry[]>; personalBest(): Promise<Entry|null>; }`
  - `LocalLeaderboard` (IndexedDB/localStorage) — real implementation.
  - `RemoteLeaderboard` — **stub** conforming to the interface (no-op/throws), so live
    boards drop in later without touching callers. (README: local-first, stub online)
- `src/ui/screens/RunEndScreen.tsx` (design/07 §6): "THE FALL — RUN OVER", peak net
  worth `← banked`, empire size (rank + best), rivals toppled, farthest act, **NEW
  PERSONAL BEST? ✓/✗ ($X short)**, leaderboard position, **prestige unlocked** (a new
  starting scenario/roster/cosmetic — **not** power), and
  `[ Start next run ]` / `[ Leaderboard ]`.
- `src/ui/screens/HighScoreScreen.tsx` — standalone: personal best, local/seasonal
  boards, prestige unlocks earned, run history.
- On run end (Prompt 11 `endRun`) → bank score, submit to `Leaderboard`, show the recap.

## Acceptance criteria
- The run-end screen shows the **banked peak** values (a late wipe still shows the height
  reached, not zero). (design/01 §7)
- Personal best persists across runs/permadeath via `LocalLeaderboard`.
- Prestige unlocks shown are **non-power** (scenario/roster/cosmetic). (GDD §7)
- `[ Start next run ]` generates a **new random world** (new seed). (design/01 §0a)
- `RemoteLeaderboard` is a drop-in stub; nothing in the UI depends on it being live.

## Guardrails
- Frame death as a **fall + a dare**, not a bare "game over" — thrilling, not
  demoralizing. (design/01 §7, design/05 §4)
- Leaderboards are **aspirational/mastery display, never pay-to-win**. (GDD §12, §8)
