# Research pipeline — state and next steps

Read this file first when continuing the engagement-research work in any session.
It records what each stage does, what is already complete (with file locations),
and exactly what remains before and after synthesis — so nothing is ever redone.

Goal chain: **research → verified findings → cited report → Island Life prompts playbook (.md)**

The research question (verbatim) is in `README.md` in this folder.

---

## The pipeline, stage by stage

| # | Stage | What it does | Status |
|---|---|---|---|
| 1 | Scope | Decompose question into 5 search angles | ✅ DONE (run 1) |
| 2 | Search | 5 parallel web searches, one per angle | ✅ DONE (run 1) |
| 3 | Fetch + extract | Fetch 23 sources, extract falsifiable claims with verbatim quotes | ✅ DONE (run 1) — **164 claims saved in `all-claims.json`** |
| 4 | Verify | Adversarial check of every claim against its source (per-source checkers; SUPPORTED / REFUTED / UNVERIFIABLE) | 🟡 PARTIAL — run `wf_00b250b9-bfc` was killed 2026-07-03 after 11/23 checkers finished. **91 verdicts banked in `verdicts.json`** (74 S / 17 U / 0 R). Remaining sources listed below. |
| 5 | Recheck | 2-judge second-opinion panel on each REFUTED claim; refutation stands only if a judge confirms | ⬜ 0 refutations so far — likely a no-op unless remaining sources refute something |
| 6 | Synthesize | Merge duplicate claims, rank by confidence, write cited report to `..\engagement-research-report.md` | ⬜ not started |
| 7 | Playbook | Claude (main session, not a subagent) writes the final deliverable: .md of implementation prompts for Island Life | ✅ DONE 2026-07-04 — `island_life_engagement_prompts.md` (project root), written from banked claims/verdicts without waiting for stage 6; stage 6 remains worthwhile as citable documentation only |

## Where everything lives

- `all-claims.json` — the 164 claims (source, claim, quote). **The single input to stages 4–6. Never re-run stages 1–3.**
- `claims-slim.json` — same claims without quotes (cheap to read).
- `extract-claims.mjs` — script that produced all-claims.json from run-1 transcripts.
- `live-run-wf_00b250b9\journal.json` — mirrored journal of the in-flight run (status, logs, per-phase progress).
- `live-run-wf_00b250b9\transcripts\agent-*.jsonl` — mirrored per-agent transcripts; each verify agent's final `StructuredOutput` call contains its verdicts JSON.
- `deep-research-agent-transcripts.zip` — run-1 transcripts (search/fetch stages), kept for provenance.
- Workflow script (self-contained, no args): session dir → `workflows\scripts\engagement-research-continuation-wf_7fc5642a-fff.js` — also mirrors the logic described here.

## Verification results already banked (do not re-verify)

- `gamedeveloper.com/business/how-first-session-length…` — inline WebFetch 2026-07-03: 5/6 claims SUPPORTED verbatim; "half return for 2nd session" is a fair paraphrase ("return rate … hovers around 50%").
- `gamedeveloper.com/design/deep-dive-…crusader-kings-iii-tutorial…` — inline WebFetch 2026-07-03: all 5 claims SUPPORTED (telemetry↔retention, completion not predictive, 67→~22 boxes, progressive disclosure, narrative framing).
- `selfdeterminationtheory.org/SDT/documents/2010_PrzybylskiRigbyRyan_ROGP.pdf` — 2 claims survived 3-0 adversarial votes in run 1 (SDT need-satisfaction model; three needs independently predict enjoyment/immersion/intention to keep playing).
- `tandfonline.com/doi/full/10.1080/15213269.2023.2242260` — paywalled to WebFetch (403); its 5 claims adjudicated inline against saved quotes 2026-07-03: quotes directly support all 5 (variable-ratio most extinction-resistant; both cohorts link random/contingency/social rewards to problematic gaming; meta-achievements NOT significant; log-in conditioning; ADHD moderation b=0.55/0.20). Treat as QUOTE-CONSISTENT.
- GDC Vault URLs (`1024232` RimWorld, `1014958` Turducken, `1019769` Sticky Science, `1023231` Gamer's Brain) are video pages — claims from them are designer-attributed, verifiable only as quote-consistent. Do not burn agents trying to fetch the videos.

## Verification state after the 2026-07-03 kill

`verdicts.json` holds the 91 finished verdicts (11 sources). Verified this run
(S=supported, U=unverifiable-from-source; **no refutations anywhere so far**):

- ✅ medium.com …player-goals (10 S) · gamedeveloper.com first-session (10 S) ·
  gamedeveloper.com PvZ tutorial tips (10 S) · gdcvault Gamer's Brain (8 S) ·
  gdcvault Sticky Science (8 S) · SDT 2010 PDF (5 S)
- ✅ quote-consistent only (source inaccessible): core.ac.uk dark-patterns PDF
  (3 S/7 U) · tandfonline 0144929X need-frustration (2 S/3 U) · academia.edu
  incremental-narrative (8 S/2 U) · dl.acm 3311350.3347180 idle designers
  (5 S/5 U) · gdcvault RimWorld (5 S)

**Sources still needing a checker (12):**
1. https://dl.acm.org/doi/10.1145/3173574.3174195 (idle games CHI'18)
2. https://www.frontiersin.org/journals/virtual-reality/articles/10.3389/frvir.2022.847120/full
3. https://www.researchgate.net/publication/225998888_The_Motivational_Pull_of_Video_Games_A_Self-Determination_Theory_Approach
4. https://dl.acm.org/doi/fullHtml/10.1145/3491101.3519837 (CHI'22 dark patterns)
5. https://www.gamedeveloper.com/game-platforms/just-one-more-turn---game-development-tips-and-tricks-from-the-creator-of-civilization-sid-meier-
6. https://gamedesignskills.com/game-design/text-based/
7. https://smartseries.sportspromedia.com/features/football-manager-miles-jacobson-sports-interactive-interview
8. https://gdcvault.com/play/1014958/The-Turducken-Method-of-Game (video — quote-consistency only)
9. https://www.linkedin.com/pulse/ingenious-addiction-stardew-valley-abhishek-iyer
10. https://www.tandfonline.com/doi/full/10.1080/15213269.2023.2242260 — already inline-adjudicated QUOTE-CONSISTENT (see banked results); a checker would add little
11. https://www.gamedeveloper.com/design/deep-dive-…crusader-kings-iii-tutorial… — already inline-verified 5/5 SUPPORTED; skip
12. https://selfdeterminationtheory.org/player-experience-of-needs-satisfaction-pens/

Net remaining before synthesis: checkers for ~10 sources (skip 10–11), then
synthesis per the spec below using `verdicts.json` + banked inline results +
new verdicts.

## If the in-flight run gets cut off — how to continue

1. Read `live-run-wf_00b250b9\journal.json` → `logs` shows which sources finished verifying; `status` shows how it ended.
2. Harvest completed verdicts: in `live-run-wf_00b250b9\transcripts\`, each `agent-*.jsonl` whose prompt names a source URL ends with a `StructuredOutput` tool call → `{source, accessible, verdicts:[{claim, verdict, note}]}`. (Adapt `extract-claims.mjs` — swap the `claims` filter for `verdicts`.)
3. Same session: relaunch with `Workflow({scriptPath: <script above>, resumeFromRunId: "wf_00b250b9-bfc"})` — finished checkers replay from cache.
4. New session: hand-author a short workflow (or do it inline) covering ONLY what's missing:
   - Verify any source with no verdicts yet (one adversarial checker per source; give it `all-claims.json`, its URL, and the banked-results list above).
   - Recheck any REFUTED claims (2 judges each; refutation stands if ≥1 confirms).
   - Then synthesis (spec below).

## The synthesis step, exactly (stage 6)

One agent. Inputs: `all-claims.json` + all verdicts. Rules:
- Confidence tags: SUPPORTED from accessible source → **[VERIFIED]**; SUPPORTED from inaccessible source → **[QUOTE-CONSISTENT]**; UNVERIFIABLE → **[ATTRIBUTED]**; REFUTED (after recheck) → **dropped**.
- Merge near-duplicate claims (the 164 contain several restatements of the same finding).
- Every finding cites its source URL inline. Conflicting evidence is called out. Note that F2P-mobile churn stats may not transfer to premium single-player.
- Write (Write tool) `C:\Users\Dan\Desktop\WebDev\IslandLife\research\engagement-research-report.md`, ~2,500–4,000 words, structured:
  1. Motivation psychology (SDT needs, need frustration vs satisfaction, variable-ratio, flow, appointment/return, endowed progress, loss aversion, sunk cost)
  2. Design patterns from named titles (Civ/Meier, Stardew, RimWorld, FM, CK3, idle/incremental, text games)
  3. The first session (churn stats, session-length benchmarks, onboarding evidence, progressive disclosure, goal-reveal ordering)
  4. Retention structures (goal layering, session-end hooks, nested loops, meta-progression, streaks)
  5. The ethical boundary (healthy vs dark pattern: consent, punishment-vs-bonus, tuning, vulnerable players)
  6. Application to a numberless narrative economic life-sim
  - Ends with a one-page "Design implications checklist" ranked by strength of evidence.

## After synthesis (stage 7) — the actual deliverable

Claude writes the prompts playbook .md in the project root: one ready-to-run
implementation prompt per engagement mechanism (aspiration seeding, session-end
hooks / dangling threads on ADVANCE, milestone punctuation, rival arcs,
first-session hook, goal layering, return hooks, ethical guardrails), each
grounded in a report finding and each explicitly constrained by Island Life's
design philosophy: no visible stats, no scores, no labeled choices, no explicit
probabilities — everything surfaces through prose (see
`island_life_player_experience.md`). Context worth rereading first:
the four `island_life_*.md` design docs; current code already has engine
(markets/banking/agents/reputation/jobs/ventures), web views (DailyLife,
Community, Money, Opportunities, Jobs, Skills), narrative templates + LLM layer.
