# Prompt 27 — PWA, notifications, accessibility & well-being

**Phase:** 3 — Onboarding & integration
**Depends on:** 14, 25
**Design refs:** GDD §13 (PWA, push), §8 (guardrails); `design/04` §4 (notifications),
§6 (accessibility & well-being)

## Goal
Make the web app installable and mobile-ready as a PWA, wire **bonus-only** notifications
(never guilt), and ship the accessibility + well-being features — all of which are also
ethical guardrails.

## Build
- **PWA:** manifest, icons, a service worker for offline app-shell caching (the game is
  client-side already — Prompt 03). Installable; works offline (the *app*, not
  cloud sync). Cross-platform progress via the local save (cloud stub for later).
- **Notifications (opt-in, bonus-only):** a notification service that can fire ONLY
  positive/optional prompts ("A golden-hour buyer just showed up"). **Hard-code a
  block-list of forbidden categories** (anything implying loss/streak/absence-punishment)
  so a punitive push is impossible to send by construction. (design/04 §4, GDD §8)
- **Accessibility (design/04 §6):** colorblind-safe risk cues (shape/text, not color
  alone — already started in Prompt 01), text scaling, one-hand mobile reach for the
  primary action, reduced-motion honoring the OS setting (grain/vignette off).
- **Well-being (design/04 §6, GDD §8):** optional play-time reminder + a self-set session
  goal; transparent-randomness surface (a screen that explains "odds shown = odds
  rolled"). All optional, all off by default, none punitive.

## Acceptance criteria
- App is installable as a PWA and loads offline (app shell).
- The notification service **cannot** send a forbidden-category message (unit test the
  block-list rejects loss/streak/absence prompts). (GDD §8 — enforced, not just intended)
- Colorblind-safe cues, text scaling, reduced-motion, and one-hand primary reach work.
- Optional play-time reminder + session goal function and default to off.

## Guardrails
- Notifications are **bonus-only, opt-in**; the forbidden-category block-list is a
  code-enforced guardrail, not a guideline. (design/04 §4, GDD §8)
- Well-being/transparency features **increase** trust and retention — disclosure
  neutralizes "darkness." (GDD §8; core.ac.uk 30100776)
