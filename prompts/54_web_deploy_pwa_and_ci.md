# Prompt 54 — Web launch: CI, Vercel deploy & PWA shell

**Phase:** 5 — Deployment (design/14 Phase B) — **this prompt IS the launch**
**Depends on:** 51–53 (cloud features; deployable without them if needed), 27
(PWA design authority — this implements its PWA subset)
**Design authority:** `design/14_Deployment_Cloud_and_Mobile.md` §7 (hosting &
CI), §8 (PWA); `prompts/27` (manifest/SW scope, notification & accessibility
items which REMAIN in 27 — do not swallow them here).

## Objective

Put the game on the public web: a green-gate CI pipeline, production deploys
from `main` on Vercel, and an installable PWA with an offline app shell. Web
ships first deliberately — feedback with zero store-review gate (design/14
§13).

## Deliverables

- **CI** `.github/workflows/ci.yml`: on push + PR — `npm ci`,
  `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`
  (working dir `app/`). Cache npm. This is the merge gate; deploys ride
  Vercel's Git integration, not the workflow.
- **Vercel project** (manual setup, steps recorded in the PR): root `app/`,
  framework Vite, output `dist/`. Production = `main`; every PR gets a
  preview URL. Env vars `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` set in
  project settings. SPA rewrite (all routes → `index.html`; hash-based nav
  needs nothing more).
- **Build-without-secrets rule:** CI runs `npm run build` with NO Supabase
  vars — proving the null-client path (Prompt 51) keeps the game fully
  playable cloud-free. The local-first guarantee, enforced by the pipeline.
- **PWA (via `vite-plugin-pwa`):**
  - `manifest.webmanifest`: name "Caribbean Gangsta", short name, description,
    `display: standalone`, portrait orientation, theme/background colors from
    the design tokens (`ui/theme/`);
  - icon pipeline: one committed 1024px master → generated 512/192/180
    (maskable + any) — the same master feeds Capacitor assets in Prompt 55;
  - service worker: precache the app shell (build assets, auto-update on new
    deploy with a quiet "refresh for update" affordance — never a forced
    reload mid-run); **network-only for Supabase requests** (sync has its own
    retry logic in 52/53 — the SW must not cache or replay API calls).
- **Privacy policy page** (static route or `public/privacy.html`): what's
  collected (anonymous auth id, optional email, saves, leaderboard entries),
  no ads/tracking/sale of data, deletion contact. Written now because Prompt
  56's store forms need its URL.
- **Smoke checklist in the PR:** production URL loads, installs as PWA
  (desktop + Android Chrome + iOS Safari), plays offline after install
  (airplane mode: app shell loads, run resumes from IndexedDB), cloud sync
  resumes when back online.

## Acceptance criteria

- [ ] CI is red on any typecheck/lint/test/build failure and green on `main`.
- [ ] Push to `main` → production deploy; PR → preview URL (verified once,
      linked in the PR).
- [ ] Lighthouse PWA installability checks pass on the production URL.
- [ ] Offline after install: app shell + saved run load with no network;
      no SW cache is consulted for Supabase requests (assert the SW routing
      config in a unit test or documented manual check).
- [ ] A new deploy surfaces the update affordance without interrupting an
      active run.
- [ ] Privacy policy page is live at a stable URL. Full suite green, engine
      diff empty.

## Ethical guardrails

- The SW update flow never forces a reload mid-run — a deploy can cost a
  player nothing, same law as offline-frozen (GDD §6).
- Prompt 27's guardrails carry: the PWA layer ships **no** notification
  machinery here; when notifications arrive (27 / post-launch), the
  bonus-only block-list applies.
- The privacy page tells the whole truth (design/14 house rules: no PII
  beyond auth, telemetry stays local) — honesty is the marketing.
