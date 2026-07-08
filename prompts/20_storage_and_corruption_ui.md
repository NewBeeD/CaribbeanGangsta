# Prompt 20 — Storage & Corruption UI

**Phase:** 2 — UI
**Depends on:** 06, 09, 14
**Design refs:** `design/09` System A & B; `design/07` §5; GDD §4.8/§4.9

## Goal
Expose the *where to stash* and *who to buy* decisions with their **shown risk numbers**,
so the player can read exposure vs. cost (storage) and price vs. protection (corruption)
before committing. Both unlock via progressive disclosure (mid-game, not first session).

## Build
- `src/ui/screens/StorageScreen.tsx`:
  - Stash list: type, capacity used/total, **current seizure %** (the exact number rolled
    on a raid), heat footprint, access speed. Actions: buy stash, move product (with
    travel-delay feedback), assign a guard (guard loyalty affects effective seizure %),
    store dirty cash.
  - A **diversification cue** (are you over-concentrated?) — informational, not nagging.
  - Raid results render as **scenes** in the card presenter (Prompt 22), not toasts.
- `src/ui/screens/CorruptionScreen.tsx`:
  - **Port bribes:** for a shipment show `asking price + resulting seizure %` before
    commit; `[ Pay ]`, `[ Haggle ]` (odds shown), `[ Walk / reroute ]`.
  - **Standing payroll:** roster of hireable officials with weekly cost + standing
    benefit; hire/fire; handle **raise-asks** (accept/negotiate/refuse) and surface
    **flip warnings** as prose with intervention actions.
- Read all risk numbers from selectors; dispatch storage/corruption intents.

## Acceptance criteria
- Each stash's displayed seizure % equals `effectiveSeizurePct` (== rolled). (fairness)
- A paid port visibly lowers its container seizure %.
- Bribe asking price + resulting seizure % are shown **before** paying; haggle shows its
  odds; walk/reroute available.
- Payroll raise-asks and flip warnings surface as **prose** with intervention options.
- Both screens are hidden/greyed until their unlock flags. (design/09 sequencing)

## Guardrails
- **Estimable-but-fair:** every seizure %, bribe price, and flip warning is shown; the
  number displayed is the number rolled. (design/09 intro)
- Corruption is **optional deterministic power**, never gambling/pay-to-win; the menace
  is in-fiction, never guilt at the human. (design/09 B.3, GDD §8)
- Loss/raid renders as a **scene**. (design/09 A.4)
