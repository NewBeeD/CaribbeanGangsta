# Prompt 52 — Cloud saves & meta sync (implement the stubs)

**Phase:** 5 — Deployment (design/14 Phase A)
**Depends on:** 51 (Supabase client & auth), 03 (SaveStore + migrations)
**Design authority:** `design/14_Deployment_Cloud_and_Mobile.md` §3 (data
model), §5 (sync strategy).

## Objective

Turn `CloudSaveStore` (`app/src/store/persistence.ts`, bottom) and
`CloudMetaProgressStore` (`app/src/store/metaProgress.ts`, bottom) from
conforming stubs into real Supabase implementations, layered on top of the
unchanged local stores. The cloud is a **backup that follows the player** —
it can only add safety; every failure mode degrades to today's local-only
game.

## Deliverables

- **Tables + RLS** (SQL in `supabase/migrations/`): `saves` (PK
  `(user_id, slot)`; `SlotMeta` columns + `envelope jsonb`) and
  `meta_progress` (PK `user_id`), per design/14 §3. Own-rows-only policies on
  both.
- **`CloudSaveStore` implements `SaveStore`** against `saves`, keeping the
  interface byte-identical (drop-in — the whole point of the stub). Upserts
  the full `SaveEnvelope` verbatim at its `schemaVersion`; the server never
  interprets it.
- **Client-owned migrations, both directions (design/14 §3):**
  - every pulled envelope passes through the existing
    `migrateEnvelope`/`MIGRATIONS` table exactly like a local load;
  - a pulled `schema_version` **newer** than the running `SCHEMA_VERSION`
    refuses the pull, keeps local, and surfaces "update the app to sync" —
    the cloud row is untouched.
- **Sync orchestration** (store layer, `gameStore.ts` or a new
  `store/cloudSync.ts`):
  - **push** after local autosave, debounced (≥2 min between pushes; new
    config knob, config-not-literals); immediate push on run end, on
    hide/background, and on manual "Save to cloud"; failures silent-retry
    and never block play or the local save;
  - **pull on boot**, after local hydrate: compare `savedAt` per design/14 §5
    — cloud older/equal ⇒ no-op; cloud newer with local unchanged since its
    own last push ⇒ adopt silently; **both diverged ⇒ conflict prompt**
    (both sides' day, net worth, saved-when; player picks; losing side parked
    in a `conflict-backup` slot for one cycle). Never auto-overwrite an
    active local run silently.
- **`CloudMetaProgressStore` implements `MetaProgressStore`** with the
  order-free merge (design/14 §5): on sync, merged meta = field-wise `max` of
  `personalBest`/`bestEmpireSize`, `max` of `runsPlayed`/`rivalsToppledTotal`
  (idempotent under re-push), `unionIds` on `unlockedPrestige` (reuse the
  helper in `metaProgress.ts`). No conflict UI — monotonicity makes merge
  safe by construction.
- **Sync status surface:** the Prompt 51 "Cloud" block gains
  last-synced-at / syncing / offline states and the manual push + "restore
  from cloud" actions.

## Acceptance criteria

- [ ] `CloudSaveStore` and `CloudMetaProgressStore` pass a shared
      `SaveStore`/`MetaProgressStore` contract test also run against the local
      implementations (mocked Supabase client; no network in tests).
- [ ] Round-trip: push envelope → pull on a fresh "device" → `rngState`
      round-trips and the next roll is identical (Prompt 03's determinism
      acceptance, now across the cloud hop).
- [ ] Pulled v(old) envelope is migrated by the existing `MIGRATIONS` chain;
      pulled v(newer-than-client) is refused with local kept (both tested).
- [ ] Conflict matrix tested: cloud-older ⇒ no-op; cloud-newer/local-clean ⇒
      silent adopt; diverged ⇒ prompt, and BOTH choices leave the losing side
      recoverable in `conflict-backup`.
- [ ] Meta merge is commutative + idempotent (property-style test: any
      push/pull ordering of the same run results yields the same profile;
      bests never decrease).
- [ ] Signed-out / null-client / offline: all sync paths no-op silently; the
      local game is untouched. Full suite green, `tsc` clean, engine diff
      empty.

## Ethical guardrails

- **Sync can never seize.** No code path deletes or downgrades a local save
  except the player's explicit conflict choice — and even that parks a
  backup. Mirrors the migration never-seize law.
- Offline stays frozen/safe: sync failure is invisible, retried, and costless
  — absence or bad connectivity never risks progress (GDD §6).
- The envelope contains game state only — no PII rides in `saves` rows beyond
  the owning `user_id`.
