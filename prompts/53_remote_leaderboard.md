# Prompt 53 — Remote leaderboard (global & seasonal boards go live)

**Phase:** 5 — Deployment (design/14 Phase A)
**Depends on:** 51 (auth), 52 (cloud plumbing patterns), 23 (leaderboard seam
+ run-end path)
**Design authority:** `design/14_Deployment_Cloud_and_Mobile.md` §6; GDD §12
red lines; `design/01` §7 (score = banked peak net worth).

## Objective

Turn `RemoteLeaderboard` (`app/src/store/leaderboard.ts`, bottom) from a
conforming stub into a live global/seasonal board on Supabase — submits
guarded by an Edge Function, reads open to all — without touching a single
caller and without weakening the local board as the trusted mastery record.

## Deliverables

- **Table + policies** (SQL in `supabase/migrations/`): `leaderboard_entries`
  per design/14 §3 — columns mirror `LeaderboardEntry` plus `user_id` and
  `display_name`; indexes `(season, score DESC)`, `(score DESC)`,
  `(user_id)`. RLS: select for everyone; **no** client insert/update/delete —
  writes happen only via the Edge Function with the service role.
- **Edge Function `submit_run`** (`supabase/functions/submit_run/`):
  - requires a valid auth JWT (anonymous or linked);
  - **dedup:** entry `id` is the existing `run-<endedAt>-<seed>` (see
    `entryFromRunEnd`) and is the PK — a re-submit is a no-op success, so one
    run banks at most once;
  - **rate limit:** rejects a user's >N submits/hour (config'd, generous —
    runs take hours);
  - **sanity bounds:** rejects score / weeksSurvived / peakEmpireSize outside
    config'd ceilings (documented as anti-nonsense, not anti-cheat);
  - stamps `display_name` from the caller's `profiles` row server-side (the
    client never writes another player's name).
- **`RemoteLeaderboard` implements `Leaderboard`** verbatim: `submit` →
  invoke `submit_run`; `top(n, board)` → indexed select (`season` filter uses
  the same `seasonKey` YYYY-MM scheme); `personalBest`/`recent` → selects
  scoped to the caller's `user_id`. Ranking = existing `byScore` order (best
  score first, ties to the earlier run) expressed in SQL.
- **Wiring:** run end (via the existing `endCurrentRun` path — still the ONLY
  banking path) submits to local **and** remote; remote failure queues one
  pending submit (retried on next boot/online) and never blocks the run-end
  flow.
- **UI:** the Prompt 23 leaderboard screen gains a Global | Local toggle
  (Global shown when signed in + online, with all-time/season sub-boards and
  display names; Local unchanged and always available). Global board is
  labeled "scores as reported" (design/14 §6 display honesty).
- **Documented, NOT built:** deterministic replay verification (design/14 §6
  tier 3). Leave a pointer comment at the Edge Function's bounds check.

## Acceptance criteria

- [ ] `RemoteLeaderboard` passes the same `Leaderboard` contract test as
      `LocalLeaderboard` (mocked client; no network in tests).
- [ ] Submitting the same `RunEndResult` twice yields one row (dedup by entry
      id), and a run end still banks locally even with the network down —
      with the remote submit queued and retried.
- [ ] Direct table insert with an anon-key client is rejected by RLS
      (documented check against a live/local Supabase; not part of vitest).
- [ ] Out-of-bounds and over-rate submits are rejected by `submit_run`
      (function unit tests).
- [ ] Season filtering matches `seasonKey` month boundaries; ordering matches
      `byScore` including the tie rule.
- [ ] Signed-out / null-client: leaderboard screen shows Local only, no
      errors. Full suite green, `tsc` clean, engine diff empty.

## Ethical guardrails

- **Boards stay aspirational (GDD §12):** no purchasable rank, no paid
  rerolls, entries only from finished runs banked through `endCurrentRun`.
- Display honesty over false assurance: the global board says what it is
  ("scores as reported") rather than implying server-verified truth we don't
  have yet; the local board remains the trusted personal record.
- The only cross-player-visible datum is the self-chosen/generated
  `display_name` — no emails, no ids, no PII on the board.
