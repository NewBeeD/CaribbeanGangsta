# Prompt 55 — Capacitor mobile shell (iOS + Android projects)

**Phase:** 5 — Deployment (design/14 Phases C/D)
**Depends on:** 54 (the web build being wrapped; icon master), 52 (cloud
backup — ships BEFORE iOS because WKWebView storage can be evicted)
**Design authority:** `design/14_Deployment_Cloud_and_Mobile.md` §9.

## Objective

Wrap the exact production web build in Capacitor shells for Android and iOS —
native projects committed, lifecycle wired into the existing pause/settle
path, safe areas and back button handled — ending with the game running on a
real device/emulator of each platform. Store submission itself is Prompt 56.

## Deliverables

- **Capacitor install** in `app/`: `@capacitor/core`, `@capacitor/cli`,
  `@capacitor/app`, `@capacitor/status-bar`, `@capacitor/splash-screen`.
  `capacitor.config.ts`: appId (reverse-DNS, e.g. `com.<publisher>.
  caribbeangangsta` — decide once, it's permanent on Play), appName,
  `webDir: 'dist'`. Native projects committed at `app/android/` and
  `app/ios/`; npm scripts `cap:sync` (`vite build && cap sync`), `cap:android`,
  `cap:ios`.
- **Lifecycle wiring (the one real code change):** App plugin
  `appStateChange` feeds the SAME handler as the `AppShell.tsx`
  `visibilitychange` sync — inactive ⇒ stop clock + autosave + cloud push
  (52's on-background push); active ⇒ resume via the existing frozen/safe
  offline-settlement path. Extract the current handler so both event sources
  share one code path; no engine change, no second settlement
  implementation.
- **Android back button:** App plugin `backButton` → navigate back through
  the hash-based nav (`ui/shell/nav.ts`); on the root screen, minimize the
  app (`App.minimizeApp()`) — never exit-and-lose (autosave makes even a
  process kill safe, but don't rely on it for UX).
- **Safe areas & status bar:** audit every screen against
  `env(safe-area-inset-*)` on a notched device (viewport-fit is already
  `cover`); status bar themed to the design tokens; no content under the
  notch or the home indicator; keyboard does not cover focused inputs
  (QtyInput screens).
- **Icons & splash:** `@capacitor/assets` generates both platforms from the
  Prompt 54 1024px master + a splash source; splash background from theme
  tokens.
- **In-shell PWA behavior:** the service worker's update affordance is
  suppressed or harmless inside the shells (native updates come from the
  stores); document the choice.
- **Device test checklist** (recorded in the PR, both platforms): fresh
  install → new run; background mid-run → reopen (clock paused, offline
  settlement correct); kill mid-run → reopen (autosave restores); rotate /
  resize; cloud push-pull across web ↔ device (same linked account); Android
  hardware back on every screen depth.

## Acceptance criteria

- [ ] `npm run cap:sync` then opening in Android Studio / Xcode builds and
      runs on an emulator/simulator AND one real device per platform.
- [ ] Backgrounding fires the shared pause path: clock stopped, save written,
      cloud push attempted; reopening settles the gap exactly like the
      existing tab-hidden flow (assert the shared-handler refactor with the
      existing visibility tests still green).
- [ ] Android back never exits with unsaved anything; root-screen back
      minimizes.
- [ ] No layout intrusion under notch/home-indicator on the tallest and
      shortest supported screens.
- [ ] Web build artifacts unchanged (the shells wrap `dist/`; no forked
      code paths beyond the platform checks introduced here). Full suite
      green, `tsc` clean, engine diff empty.

## Ethical guardrails

- Backgrounding/killing the app is ALWAYS free: the same offline-frozen law,
  now on mobile process lifecycle — no heat, no debt, no seizure for
  putting your phone in your pocket (GDD §6).
- No mobile-only permission grabs: this prompt requests NO permissions
  (no push, no location, no contacts). Push, if ever, arrives via Prompt
  27's opt-in bonus-only machinery post-launch.
