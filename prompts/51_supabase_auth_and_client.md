# Prompt 51 — Supabase client & anonymous-first auth

**Phase:** 5 — Deployment (design/14 Phase A)
**Depends on:** 03 (persistence seams), 23 (run-end path), 26 (config discipline)
**Design authority:** `design/14_Deployment_Cloud_and_Mobile.md` §2 (backend),
§4 (auth). Decisions signed off: Supabase backend, free game, no monetization.

## Objective

Stand up the Supabase project and give the app an auth'd cloud identity —
anonymous-first, optional email upgrade — behind a service seam, so prompts 52
and 53 have a `user_id` to hang rows off. After this prompt the game plays
*identically*; the only visible change is an optional "Secure my progress"
surface.

## Manual setup (do once, record in the PR description)

1. Create a Supabase project (free tier). Region: closest to you.
2. Auth → enable **Anonymous sign-ins**; enable **Email** provider with magic
   links (no passwords).
3. Copy the project URL and anon/public key.

## Deliverables

- **Client module** `app/src/services/supabase.ts`: creates the
  `@supabase/supabase-js` client from `import.meta.env.VITE_SUPABASE_URL` /
  `VITE_SUPABASE_ANON_KEY`. If either is absent, export a **null client** —
  every cloud feature no-ops and the game runs exactly as today. This is the
  local-first guarantee as a build rule (design/14 §7).
- **Env plumbing:** `.env.example` committed with both var names and comments;
  `.env` git-ignored. `npm run build` succeeds with and without the vars.
- **Auth service** `app/src/services/auth.ts` behind an interface (tests get a
  memory fake, same pattern as `KeyValueStorage`/`MemoryStorage` in
  `leaderboard.ts`):
  - on boot: restore session, else `signInAnonymously()` silently; failures
    are swallowed-and-retried in the background, never surfaced as errors,
    never block play;
  - `linkEmail(email)`: magic-link upgrade of the anonymous identity (same
    `user_id` — rows follow the player across devices);
  - `signOutCloud()`: drops the session, local play continues;
  - exposes `authState` (signed-out / anonymous / linked + user id) via a
    small Zustand slice or store field — **not** in `GameState` (the engine
    never learns about auth).
- **Display name:** self-chosen, stored in a `profiles` row (design/14 §3),
  defaulting to a generated alias ("Bridgetown Ghost #4821"). Client-side
  length/profanity filter. Only ever shown on the leaderboard.
- **`profiles` table + RLS** (SQL committed under `supabase/migrations/`):
  own-row select/insert/update only.
- **UI surface (minimal):** a "Cloud" block (settings or Money screen) showing
  auth state, the alias, "Secure my progress" (email link), and sign-out. No
  login wall anywhere, ever.

## Acceptance criteria

- [ ] With no env vars set: app boots, plays, saves locally; zero network
      calls; zero console errors. Full suite green.
- [ ] With env vars set and network down: identical to the above (retry is
      silent and backgrounded).
- [ ] First launch online: an anonymous session exists without any UI
      interruption; a `profiles` row exists with the default alias.
- [ ] Email upgrade keeps the same `user_id` (assert before/after).
- [ ] `app/src/engine/` diff is empty. Auth state is not in `GameState` and
      not in the save envelope.
- [ ] Auth service is interface-typed; store/UI tests run against the memory
      fake with no network. `tsc` and lint clean.

## Ethical guardrails

- No login wall, no nag: anonymous play is the permanent default, the email
  upgrade is a player-initiated safety feature, pitched as backup — never as
  a gate on content.
- The only personal datum introduced is an optional email (design/14 house
  rules — no PII beyond auth). No tracking, no analytics SDK rides along.
