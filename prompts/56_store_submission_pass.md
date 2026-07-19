# Prompt 56 — Store submission pass (Google Play, then Apple)

**Phase:** 5 — Deployment (design/14 Phases C/D) — mostly checklist, little code
**Depends on:** 55 (shells), 54 (privacy policy URL live), 52 (account
deletion needs cloud-data delete)
**Design authority:** `design/14_Deployment_Cloud_and_Mobile.md` §10
(accounts/signing/forms), §11 (content-rating risk — READ IT before filling
any questionnaire), §13 (order: Play first, Apple second).

## Objective

Take the Capacitor builds through beta tracks to public listings on Google
Play and the Apple App Store. Google first — cheaper, faster, more
predictable — so Apple's review risk (design/14 §11) never blocks being live
on mobile.

## Code deliverables (small, before any upload)

- **Account deletion path** (both stores mandate it for apps with accounts):
  a "Delete my cloud data" action in the Prompt 51 Cloud block — drops the
  user's `saves` / `meta_progress` / `profiles` rows (leaderboard entries per
  design decision: delete or anonymize — pick one, document it), signs out,
  local play continues. Plus the same offered via the privacy-policy contact.
- **Version plumbing:** app version surfaced in-app (settings/about), synced
  with `versionName`/`CFBundleShortVersionString`; a bump checklist in the
  README (web deploy does not require store releases — the shells wrap a
  pinned build).
- **Age gate:** a one-time 17+/mature confirmation on first launch of the
  store builds (config-flagged; web unaffected) — cheap review ammunition
  for a mature-rated title.

## Checklist deliverables (record everything in the PR / a `store/` docs dir)

- **Accounts:** Google Play Console ($25 once) · Apple Developer Program
  ($99/yr).
- **Signing:** Android — Play App Signing (Google holds the release key;
  generate + BACK UP the upload keystore, document its location out-of-repo).
  iOS — Xcode-managed signing under the team account.
- **Builds:** Android AAB (release, minified) · iOS archive via Xcode.
- **Listings (both stores):** title, short + full description framed per
  design/14 §11 — satirical crime **fiction**, strategy-roguelike systems
  (empire sim, permadeath, leaderboard), never real-world drug-dealing
  framing; screenshots at required sizes showing maps/markets/story
  cards/money screen — **no drug-use imagery**; Play feature graphic; Apple
  keywords. Privacy policy URL from Prompt 54.
- **Questionnaires — answer truthfully (design/14 §11):** IARC (Play) and
  Apple age rating: drug references YES, violence YES, gambling NO, no
  real-money wagering, no user-generated content. Expect Mature 17+ / 17+.
  Data-safety (Play) + privacy nutrition (Apple): collects optional email
  (account), app activity (game saves), no third-party sharing, no tracking,
  no ads.
- **Beta:** Play internal testing track → closed track · TestFlight. Run the
  Prompt 55 device checklist on beta builds installed FROM the stores.
- **Submission order & contingency (design/14 §11 ladder):** Play production
  first; Apple after Play is live. If Apple rejects on content (guideline
  1.1): soften LISTING language and appeal citing the fiction framing, the
  no-monetization model, and the GDD §8 guardrails — do not change the game
  itself; escalate the ladder (regional tweaks → storefront re-skin) only if
  appeals fail.

## Acceptance criteria

- [ ] Cloud-data deletion works end-to-end (rows gone, signed out, local play
      continues) and is reachable both in-app and via the privacy page.
- [ ] Both beta tracks have a build installed and passing the Prompt 55
      checklist on real devices.
- [ ] All questionnaire answers are recorded in the repo (`store/` docs) so
      future updates re-answer consistently.
- [ ] Google Play listing is live in production.
- [ ] Apple submission is in (approved, or in the appeal ladder with status
      documented).
- [ ] Upload keystore + signing recovery steps documented (out-of-repo
      location referenced, never committed).

## Ethical guardrails

- **Never under-rate.** The mature rating is correct for the theme; gaming
  the questionnaire is the fastest route to removal and forfeits the
  high-ground the GDD §8 guardrails earn.
- The listings sell the systems, not the contraband — fiction framing is
  honesty, not spin: the game contains no drug-use imagery, no real brands,
  no real places, and no monetization of any kind.
- Deletion is real deletion: the player can walk away with everything
  removed, no dark-pattern retention flow.
