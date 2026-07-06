# Deep-research checkpoint — game engagement/addiction research

**Start here → `PIPELINE-STATE.md`** — stage-by-stage status, banked results,
and exact next steps before/after synthesis. This README covers the raw files.

Save point for the deep-research run on "what makes games compelling and
habit-forming", feeding the Island Life engagement-prompts playbook.
Created 2026-07-03 while the resumed run (verification + synthesis) was in flight.

## What's here

| File | What it is |
|---|---|
| `deep-research-run1-full-output.json` | Result of run 1: 23 sources, 25 claims taken to verification, 2 confirmed 3-0 before the session limit killed the rest (their "refuted 0-0" entries are abstentions, not real refutations). |
| `deep-research-resume-journal.json` | The workflow resume journal (run `wf_98cbf101-e84`) — cached results of every completed agent call (searches, fetches, claim extraction, the 2 finished verifications). |
| `deep-research-agent-transcripts.zip` | Full per-agent transcripts (`agent-*.jsonl`, 249 files). Contains all 111 extracted claims with quotes/sources inside the fetch agents' final StructuredOutput calls. |
| `deep-research-workflow-script.js` | The exact workflow script that produced the journal. |

## How to restart if a usage limit hits again

**Same session** (journal still live in the session dir):

```
Workflow({
  scriptPath: "C:\\Users\\Dan\\.claude\\projects\\C--Users-Dan-Desktop-WebDev-IslandLife\\d95e48fe-c751-497c-9aa0-8405d9723465\\workflows\\scripts\\deep-research-wf_98cbf101-e84.js",
  resumeFromRunId: "wf_98cbf101-e84",
  args: <same research question verbatim>
})
```

Completed agents replay from cache; only failed/unfinished calls re-run.

**New session** (journal no longer resumable by runId): do NOT re-run search/fetch.
Unzip `deep-research-agent-transcripts.zip`, pull the extracted-claims JSON from the
fetch agents' transcripts (or start from the 25 claims already listed in
`deep-research-run1-full-output.json`), and hand-author a small workflow that only
does: verify remaining claims (3-vote adversarial) → synthesize. Point Claude at
this README and ask it to "continue the engagement research from the checkpoint".

## Continuation run (2026-07-03)

The verification+synthesis continuation runs as workflow `wf_00b250b9-bfc`
(script: `engagement-research-continuation-wf_7fc5642a-fff.js` in the session
workflows dir — self-contained, no args). Its live progress is mirrored every
60s into `live-run-wf_00b250b9\` (journal.json + transcripts\) by a background
sync, so a mid-run cutoff loses at most a minute of verdicts. To continue after
a cutoff: resume with `{scriptPath, resumeFromRunId: "wf_00b250b9-bfc"}` in the
same session, or in a new session read the mirrored transcripts and feed the
completed verdicts to a hand-authored recheck/synthesize script. Claims input:
`all-claims.json` (164 claims, extracted via `extract-claims.mjs`). Final report
target: `research\engagement-research-report.md`.

## Question researched

Evidence-backed design elements behind engagement/retention/"one more turn":
SDT/flow/reinforcement psychology; patterns from Stardew, RimWorld, FM, CK3,
incrementals, roguelites; first-session onboarding; goal layering & session-end
hooks vs dark patterns; application to a numberless, prose-driven economic life sim.

## Deliverable this feeds

A `.md` playbook of ready-to-run implementation prompts to make Island Life
compelling while respecting its no-stats / no-labels / prose-only philosophy.
