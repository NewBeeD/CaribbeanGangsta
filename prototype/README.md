# First-Session Prototype

A zero-dependency, clickable prototype of the **first session** — the part the
engagement research says makes or breaks retention. It implements:

- **The Deal screen** (doc 07 §1): buy low / sell high, price trend arrow,
  **displayed bust odds that exactly equal the rolled probability** (fairness), and
  failure rendered as a *scene*, not an error.
- **The first-session flow** (doc 07 §7): cold open → guided first sale → free
  dealing → a survivable heat scare → hire first runner → open first laundering
  front (idle engine starts) → **session-end hook** (income accruing + a buyer and
  a rival waiting — the reason to return).
- **Live telemetry** (doc 06): session length, deals, busts, idle rate, and an
  event log — so you can actually watch the funnel while playing.

## Run it

It's static — no build, no install. Either:

- **Double-click `index.html`**, or
- Serve the folder (better; avoids any `file://` quirks):
  ```
  # from the prototype/ folder
  python -m http.server 8000
  # then open http://localhost:8000
  ```

## What to look for (playtest questions from doc 06)

- Does the **first sale land inside ~2 minutes**? (beat the churn cliff)
- Do the **risk/price cues read clearly without a tooltip**? (competence legibility)
- Does the **session-end screen make you want to come back**? (return hook)
- Is the total first session in the **10–20 min** target window? (shown at session end)

## Fidelity notes / intentional design choices

- **Wins before risk:** the guided first sale and the first heat scare are
  guaranteed survivals; real bust risk only starts once competence is established
  (loss-sequencing, Sid Meier).
- **No punishment for absence:** the idle engine only ever *adds* clean cash.
- **Progressive disclosure:** the bottom nav and its tabs unlock step by step.
- Idle accrual is **time-accelerated** so it's visible in a short demo.

## Visual direction — "Cinematic dossier"

Modern game-UI pass in a prestige-crime-drama style: warm charcoal, film-grain +
vignette overlays, brass-foil buttons, a serif display face (**Fraunces**) paired
with a typewriter stamp face (**Special Elite**) and a serif body (**Spectral**),
laid out like a case file (`CONFIDENTIAL` tab, dotted-leader rows, `FILED` stamp).
Fonts load from Google Fonts — **online the first time**; offline it falls back to
Georgia/Courier and still works, just less characterful.

## This is a scaffold, not the game

One island, two products (weed/coke), one runner, one front. It exists to test the
*feel of the first session and the deal loop* against real players before committing
to the full build. Next steps: wire the story cards (doc 08) to the beats stubbed
here, and extend the dossier system to the remaining screens (Crew, Money, Heat,
Legacy) from doc 07.
