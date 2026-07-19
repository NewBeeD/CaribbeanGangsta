# 14 — Deployment: Cloud Backend, Web Launch & Mobile Apps

Source: user request (July 2026) — "take this game online with a cloud database,
then ship it as an app on Google Play and the Apple App Store." Decisions signed
off: **Supabase** as the backend, **free game with no monetization** (no ads, no
IAP), delivered as this design doc plus build prompts **51–56**.

This doc is the strategy and architecture authority for that work. The prompts
implement it in order: cloud client & auth (51), cloud saves & meta sync (52),
remote leaderboard (53), web deploy + PWA + CI (54), Capacitor mobile shell
(55), store submission (56).

House rules that bind everything below (prompts/README.md):

- **Local-first stays law.** IndexedDB (`LocalSaveStore`) remains the on-device
  source of truth. The cloud is a *backup, sync, and leaderboard* layer. The
  game must run 100% offline forever — a player with no account and no network
  loses nothing they have today.
- **Engine stays pure.** Nothing in `app/src/engine/` gains a network call, an
  env var, or a wall clock. All cloud code lives in the store/services layer,
  behind the interfaces that already exist for exactly this purpose:
  `SaveStore`, `MetaProgressStore`, `Leaderboard`.
- **Offline stays frozen/safe** (GDD §6). Cloud sync never introduces a way for
  absence, a failed request, or a sync conflict to cost the player progress.
- **No PII beyond auth.** The only personal data that ever leaves the device is
  the auth identity (an anonymous id, optionally an email) and game numbers.
  Telemetry stays local (`RemoteSink` stays a stub until a separate decision).
- **Free game, no monetization SDKs.** No ads, no IAP, no tracking SDKs. This
  keeps the store data-safety forms nearly empty and the review surface small.

---

## 1. Architecture overview

```
                ┌──────────────────────────────────────────────┐
                │              THE ONE CODEBASE (app/)          │
                │  engine (pure) ← store (Zustand) ← UI (React) │
                │                                               │
                │  SaveStore ────────┐                          │
                │  MetaProgressStore ┼── interfaces (exist now) │
                │  Leaderboard ──────┘                          │
                └───────┬──────────────────────────┬───────────┘
                        │ local impls (unchanged)  │ cloud impls (new)
                        ▼                          ▼
             IndexedDB / localStorage      Supabase JS client
             (source of truth)             (backup & boards)
                                                   │
                                    ┌──────────────┴──────────────┐
                                    │           SUPABASE           │
                                    │  Auth (anonymous + email)    │
                                    │  Postgres + RLS              │
                                    │    profiles / saves /        │
                                    │    meta_progress /           │
                                    │    leaderboard_entries       │
                                    │  Edge Function: submit_run   │
                                    └──────────────────────────────┘

  DISTRIBUTION (same build, three shells):
    Web      → static host (Vercel) + PWA manifest/service worker
    Android  → Capacitor shell → Google Play
    iOS      → Capacitor shell → Apple App Store
```

Key property: the three seams (`SaveStore` in `app/src/store/persistence.ts`,
`MetaProgressStore` in `app/src/store/metaProgress.ts`, `Leaderboard` in
`app/src/store/leaderboard.ts`) were built local-first with conforming cloud
stubs (`CloudSaveStore`, `CloudMetaProgressStore`, `RemoteLeaderboard`). Going
online means **implementing those three stubs** — no caller changes, no engine
changes, no UI rewiring beyond surfacing sync status.

## 2. Backend: Supabase

Why Supabase over Firebase / custom:

- **Postgres fits the leaderboard.** `top(n, board)` is a one-line indexed SQL
  query; seasons are a `WHERE season = 'YYYY-MM'`. Firestore makes ranked
  queries and dedup awkward.
- **Row Level Security (RLS)** gives per-user data isolation declaratively —
  users can only read/write their own saves — without writing an API server.
- **Edge Functions** cover the one endpoint that must not be client-writable
  (leaderboard submit, §5).
- **Free tier** (500MB database, 50k monthly active auth users, 2M edge
  invocations) covers this game far past launch. No lock-in — it's Postgres;
  it can be self-hosted or dumped and moved.

Project setup (manual, once — checklist in Prompt 51): create project, enable
anonymous sign-ins, note the project URL and anon key. Two Vite env vars:
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (the anon key is public by
design; RLS is the security boundary, not the key).

## 3. Data model

Four tables. `user_id` is always `auth.uid()`; RLS on every table.

```sql
profiles            (user_id uuid PK → auth.users, display_name text,
                     created_at timestamptz)
saves               (user_id uuid, slot text, schema_version int,
                     saved_at bigint,          -- epoch ms, mirrors SlotMeta
                     seed text, run_status text, day int,
                     envelope jsonb,           -- the full SaveEnvelope
                     PK (user_id, slot))
meta_progress       (user_id uuid PK, version int, meta jsonb,
                     updated_at bigint)
leaderboard_entries (id text PK,               -- entry id: run-<endedAt>-<seed>
                     user_id uuid, display_name text,
                     score bigint, peak_empire_size int, rivals_toppled int,
                     weeks_survived int, cause text, seed text,
                     ended_at bigint, season text)
                     -- indexes: (season, score DESC), (score DESC), (user_id)
```

RLS policy summary:

| table | select | insert/update | delete |
|---|---|---|---|
| `profiles` | own row | own row | own row |
| `saves` | own rows | own rows | own rows |
| `meta_progress` | own row | own row | own row |
| `leaderboard_entries` | **everyone** (it's a public board) | **nobody** (service-role only, via `submit_run` Edge Function) | nobody |

Two schema-versioning rules carried over from the local layer:

- **The client owns migrations.** The cloud stores the envelope verbatim at
  whatever `schemaVersion` wrote it. On pull, the envelope goes through the
  same `migrateEnvelope`/`MIGRATIONS` table (`persistence.ts`) as a local
  load. The server never interprets `envelope` contents.
- **Never load ahead.** If a pulled envelope's `schema_version` is *newer*
  than the running client's `SCHEMA_VERSION` (player updated on phone, opened
  stale web build), the client refuses the pull and keeps its local save,
  surfacing "update the app to sync" — mirroring the local "unknown version →
  clean reject" rule.

## 4. Auth: anonymous-first, email upgrade

- **First launch:** `signInAnonymously()` silently. Zero friction — the player
  never sees a login wall; they just have a stable `user_id` that cloud saves
  and leaderboard entries hang off. If the call fails (offline, Supabase
  down), the game runs exactly as today and retries in the background.
- **Optional upgrade:** a "Secure my progress" action (Money screen / settings)
  links an **email magic link** to the anonymous identity
  (`updateUser({ email })` → link flow). Same `user_id`, so all rows follow.
  This is the cross-device story: sign in with the same email on a new device
  and pull your saves. No passwords anywhere.
- **Display name:** optional, self-chosen, profanity-filtered client-side, the
  only thing other players ever see (on the leaderboard). Defaults to a
  generated alias ("Bridgetown Ghost #4821").

## 5. Sync strategy (saves & meta)

Local behavior is unchanged: autosave to IndexedDB every 30s
(`LIVE_AUTOSAVE_EVERY_MS`), offline settlement on resume, migrations on load.
Cloud sync is layered on top:

- **Push (debounced):** after a local autosave, if ≥2 minutes since the last
  cloud push, push the envelope. Always push immediately on: run end, app
  hide/background (`visibilitychange` / Capacitor `appStateChange`), and
  manual "Save to cloud". Push failures are silent-retry — never block play,
  never lose the local save.
- **Pull (on boot):** after hydrating the local autosave, fetch the cloud
  slot's `SlotMeta`. Then:
  - cloud `savedAt` ≤ local → do nothing (normal same-device case);
  - cloud newer **and** local run unchanged since its own last push → adopt
    cloud silently (normal new-device / reinstall case);
  - **both diverged** (cloud newer but local also progressed) → conflict
    prompt: show both sides (day, net worth, saved-when) and let the player
    pick. **Never auto-overwrite an active local run silently.** The losing
    side is parked in a `conflict-backup` slot for one cycle, so even a wrong
    choice seizes nothing.
- **Meta merge is order-free by construction:** `MetaProgress` is monotonic
  (bests climb, tallies add, prestige unions — see `bankScore` in
  `metaProgress.ts`). Cloud merge = field-wise `max` on bests, `max` on
  counters (idempotent under re-push), union on `unlockedPrestige`. No
  conflict prompt ever needed for meta.

Ethical framing: the cloud can only ever *add* safety (a backup that survives
a lost phone). Every failure mode degrades to "exactly the game we ship
today."

## 6. Leaderboard: going live, honestly

`RemoteLeaderboard` implements the existing `Leaderboard` interface (submit /
top / personalBest / recent) against `leaderboard_entries`. Boards map 1:1:
`all-time` = full table, `season` = `WHERE season = seasonKey(now)` (same
`YYYY-MM` scheme as `LocalLeaderboard`).

**Integrity problem, stated plainly:** the sim is client-authoritative, so a
hostile client can claim any score. Tiered response:

1. **Ship now (Prompt 53):** submits go only through a `submit_run` Edge
   Function (clients cannot insert directly — RLS). It enforces: valid auth,
   entry-id dedup (one submit per run end — the id is `run-<endedAt>-<seed>`),
   rate limit (a run takes hours; >4 submits/hour/user is noise), and sanity
   bounds on score/weeks/empire size vs. a config'd ceiling. Every entry keeps
   its `seed` for audit.
2. **Ship now (display honesty):** the UI labels the global board as
   unverified-by-machine ("scores as reported") and always shows the local
   board alongside — local remains the trusted mastery record.
3. **Future option (documented, not built):** deterministic replay
   verification. The engine is pure and seeded — a submitted `(seed, intent
   log)` can be re-simulated server-side to reproduce the exact score. This is
   the *real* anti-cheat and the codebase's determinism makes it uniquely
   cheap here, but it needs intent-log capture and a server runtime for the
   engine. Park until the board matters competitively.

Red line preserved (GDD §12): boards stay aspirational — no purchasable rank,
entries only from finished runs' banked scores, submit only via the existing
`endCurrentRun` path (the ONLY banking path).

## 7. Web hosting & CI/CD (Prompt 54)

- **Host: Vercel** (free tier). The build is a ~405KB static SPA — `vite
  build` output from `app/dist/`. Netlify/Cloudflare Pages are equivalent;
  Vercel chosen for zero-config Vite support and per-PR preview deploys.
- **CI: GitHub Actions** (`.github/workflows/ci.yml`): on every push/PR →
  `npm run typecheck` → `npm run lint` → `npm run test` → `npm run build`.
  Deploys: Vercel's Git integration deploys `main` to production and every PR
  to a preview URL (no deploy step needed in the workflow itself).
- **Env:** `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` set in Vercel
  project settings and in a local `.env` (git-ignored; `.env.example`
  committed). Build must succeed with them **absent** (cloud features
  disabled, game fully playable) — that's the local-first guarantee expressed
  as a build rule.
- **Domain:** optional vanity domain later; `*.vercel.app` fine for launch.

## 8. PWA layer (Prompt 54; extends Prompt 27)

Prompt 27 already specifies the PWA + notifications + accessibility scope and
remains the design authority for it. Deployment needs the PWA *subset* on the
critical path (installability + offline shell), so Prompt 54 implements:
`manifest.webmanifest` (name, icons, `display: standalone`, theme color),
icon set (one 1024px master → generated sizes), and a service worker
(`vite-plugin-pwa`, precache app shell, network-first for the Supabase
client). Prompt 27's notification block-list and accessibility items stay in
Prompt 27 — not swallowed here.

## 9. Mobile packaging: Capacitor (Prompt 55)

**Why Capacitor, not React Native:** the game is a finished React DOM app with
zero native-UI needs. Capacitor wraps the exact production web build in a
WebView shell with native project scaffolding for both stores — ~99% code
reuse, no rewrite, and the web/PWA build stays the same artifact. (React
Native would mean re-implementing every screen; rejected.)

Layout: `@capacitor/core` + `@capacitor/cli` in `app/`, native projects at
`app/ios/` and `app/android/` (committed), `capacitor.config.ts` pointing
`webDir` at `dist/`. Workflow: `vite build` → `npx cap sync` → open in
Xcode/Android Studio.

Mobile-specific wiring (small, and the architecture already anticipates it):

- **Lifecycle:** the clock already pauses on `visibilitychange`
  (`AppShell.tsx` tab-visibility sync) and away-gaps settle through the
  frozen/safe offline path. Capacitor's App plugin `appStateChange` event
  feeds the **same** pause/settle handler, plus a cloud push on background
  (§5). No engine change.
- **Safe areas:** `viewport-fit=cover` is already set; audit screens against
  `env(safe-area-inset-*)` on a notched device.
- **Android back button:** App plugin `backButton` → navigate back in the
  hash-based nav (`ui/shell/nav.ts`); on the root screen, background the app
  (never exit-and-lose — autosave makes this safe regardless).
- **Status bar / splash / icons:** `@capacitor/status-bar` themed to the
  design tokens; icons + splash generated from the same 1024px master via
  `@capacitor/assets`.
- **Storage:** IndexedDB/localStorage work in both WebViews. Caveat: iOS can
  evict WKWebView storage under disk pressure — which is precisely why cloud
  backup (Prompt 52) ships **before** the iOS app.

## 10. Store accounts, signing & submission (Prompt 56)

| | Google Play | Apple App Store |
|---|---|---|
| Account | $25 one-time (Play Console) | $99/year (Developer Program) |
| Build | AAB via Android Studio / Gradle | IPA via Xcode |
| Signing | Play App Signing (Google holds release key; keep upload key safe) | Certificates + provisioning via Xcode-managed signing |
| Beta | Internal → closed → open testing tracks | TestFlight |
| Review time | Hours–days | 1–3 days typical, longer on first submission |
| Age rating | IARC questionnaire | Age-rating questionnaire in App Store Connect |

Both stores require, even for a free app with no tracking:

- **Privacy policy URL** — a static page on the web deploy (what's collected:
  anonymous auth id, optional email, game-save data, leaderboard entries; no
  ads, no tracking, no sale of data; deletion contact).
- **Data-safety / privacy-nutrition forms** — declare: email (optional,
  account), app activity (game saves), no third-party sharing, no tracking.
  Keeping telemetry local (no `RemoteSink`) keeps these forms honest and
  short.
- **Account deletion path** (both stores now mandate it for apps with
  accounts) — a "delete my cloud data" action that drops the user's rows and
  signs out; local play continues.
- Listing assets: title, descriptions, screenshots per required device sizes,
  feature graphic (Play), keywords (Apple).

## 11. Content-rating risk — the honest one (read before submitting)

The game is drug-trafficking themed. This is survivable on both stores but is
the **single biggest schedule risk**, on Apple especially:

- Expect **Mature 17+** (Play/IARC: drug references, violence) and **17+**
  (Apple). Answer the questionnaires truthfully — under-rating is the fastest
  route to removal.
- Apple guideline 1.1 (objectionable content) has hit drug-themed games
  before; titles have been rejected or pulled and later reinstated with
  softened *presentation*. Google is more mechanical but its Inappropriate
  Content / Marijuana policies bite on anything that "facilitates or
  glamorizes" drug sales as a real-world matter.
- Mitigations, in order of leverage:
  1. **Listing copy frames it as satirical crime *fiction* / a strategy
     roguelike** — sell the systems (empire sim, permadeath, leaderboard),
     not the contraband. No "become a real drug dealer" phrasing.
  2. Screenshots show maps, markets, story cards, the money screen — **no
     drug-use imagery** (the game has none; keep it that way in marketing).
  3. Fictional world already helps: invented countries, no real brands or
     cartels. Keep names fictional.
  4. The ethical-guardrail sheet (GDD §8 — no gambling-adjacent monetization,
     no loot boxes, disclosed odds, and now no monetization at all) is genuine
     review ammunition if a human reviewer flags it.
  5. Contingency ladder if rejected: soften listing language → resubmit with
     appeal notes → regional availability tweaks → (last resort) rename/
     re-skin the storefront presentation. Do not pre-soften the game itself.
- **Rollout order is the hedge (§13):** web first (no gatekeeper), then
  Google Play (cheaper, faster, more predictable), then Apple — so an Apple
  review stall never blocks the launch.

## 12. Push notifications — deferred (not critical path)

Prompt 27's design holds: notifications are **opt-in, bonus-only**, with a
code-enforced block-list making punitive pushes impossible by construction.
Remote push (FCM + APNs via `@capacitor/push-notifications`, a small Supabase
Edge Function scheduler) is a *post-launch* phase — nothing in prompts 51–56
depends on it, and shipping without push avoids the heaviest permission
prompts at review time. When built, it slots behind the existing notification
service seam from Prompt 27.

## 13. Rollout order & phases

1. **Phase A — Cloud (prompts 51–53):** Supabase client + anonymous auth →
   cloud saves & meta sync → live leaderboard. Each lands behind existing
   interfaces; the game is shippable after every prompt.
2. **Phase B — Web launch (prompt 54):** CI green-gate, Vercel production
   deploy, PWA installable. **This is the actual launch** — feedback starts
   here with zero review gate.
3. **Phase C — Android (prompt 55 + 56):** Capacitor shell, Play internal
   testing → production. $25, fast review, WebView parity with Chrome.
4. **Phase D — iOS (prompt 55 + 56):** same shell, TestFlight → App Store.
   Budget review-cycle slack (§11).

Costs: Supabase $0 (free tier), Vercel $0 (free tier), Google Play $25 once,
Apple $99/year, domain ~$12/year optional. Total year-one: ≈ $125–140.

## 14. What deliberately does NOT change

- `app/src/engine/` — untouched by every prompt in this doc.
- `LocalSaveStore` / `LocalLeaderboard` / `LocalMetaProgressStore` — remain
  the defaults and the source of truth.
- The offline-frozen guarantee, the fairness law (odds shown = odds rolled),
  the single banking path (`endCurrentRun`), and schema migration discipline
  (client-side, never-seize) — all unchanged and re-asserted in each prompt's
  acceptance criteria.
