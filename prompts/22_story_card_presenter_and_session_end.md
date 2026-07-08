# Prompt 22 — Story-card presenter & session-end hook

**Phase:** 2 — UI
**Depends on:** 13, 14
**Design refs:** `design/08` (cards); `design/05` §4 (failure = story); GDD §11
(session-end hooks); `design/04` §3, `design/07` §7

## Goal
Render story cards as **in-world scenes with choices**, and guarantee every natural
stopping point ends on an **open loop** (something resolving, something pending, income
accruing) — the return hook that pulls the next session.

## Build
- `src/ui/components/StoryCardModal.tsx` — presents a `StoryCard`: `SceneText` prose,
  characters, and 2–4 choice buttons. On choose → `applyChoice(state, cardId, i)` via the
  store; render the `sceneResult`. **No UI language in scene text** (it's prose). Failure/
  negative beats render here as **scenes**, never toasts.
- A **card queue** in the store: beats fired by the engine (Prompt 12) enqueue cards;
  the presenter shows them at appropriate moments (immediately for interrupts, or via the
  Money-screen "pending decisions" list for return-hook choices).
- `src/ui/shell/SessionEndHook.tsx` — detect a natural stopping point and ensure the
  visible state shows **one thing resolving + one thing pending + income accruing**
  (design/07 §3, GDD §11). Never let the player exit on a clean empty state.
- Wire the reputation-variant selection (dominant rep track) through to the presenter.

## Acceptance criteria
- Cards render as prose scenes with working choices; choosing applies exactly the card's
  declared effects (via engine reducers) and advances flags/next-cards.
- Failure beats appear as **scenes** in this presenter, not as error/toast UI.
  (design/05 §4)
- At any stopping point, the session-end surface shows a resolving thread, a pending
  decision, and accruing income. (GDD §11)
- Return-hook choices from `settleOffline` appear as pending decisions and clear when
  resolved.

## Guardrails
- **Don't let them leave clean** — always an open loop. But the pull is *interesting
  choices*, never guilt/loss-aversion. (GDD §11, §8)
- ≤ ~8 words of any UI instruction; the scene carries meaning. (design/08, GDD §9)
