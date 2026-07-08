# Prompt 00 — Project scaffold & tooling

**Phase:** 0 — Foundation
**Depends on:** nothing
**Design refs:** GDD §13 (Technical & Platform); `prompts/README.md` (architecture contract)

## Goal
Stand up the `app/` project with the exact folder structure and tooling the rest of
the prompts assume, so every later prompt drops into a known layout with tests and a
dev server that already run.

## Build
- Create `app/` as a Vite + React + TypeScript project (do **not** touch `prototype/`).
- Dependencies: `react`, `react-dom`, `zustand`. Dev: `vite`, `typescript`,
  `@types/react`, `@types/react-dom`, `vitest`, `@vitest/coverage-v8`, `eslint` +
  `@typescript-eslint/*`, `prettier`, `jsdom` (for later component tests).
- Scripts in `app/package.json`: `dev`, `build`, `preview`, `test` (vitest run),
  `test:watch`, `lint`, `typecheck` (`tsc --noEmit`).
- `tsconfig.json`: `strict: true`, `noUncheckedIndexedAccess: true`,
  `exactOptionalPropertyTypes: true`, path alias `@/*` → `src/*`.
- Create the full directory tree from the README architecture contract with a
  `.gitkeep` or a stub `index.ts` in each `engine/*` area so imports resolve:
  `src/engine/{config,cards}`, `src/store`, `src/ui/{shell,screens,components,theme}`,
  `src/telemetry`, `tests/`.
- `src/engine/index.ts` — export a placeholder `createGame()` returning a minimal
  `{ version }` object; a matching `tests/engine.smoke.test.ts` asserts it runs. This
  proves the test harness works end to end.
- `src/main.tsx` + `index.html` — render a placeholder `<App/>` that says the app is
  scaffolded. Wire the `@/*` alias in both `tsconfig` and `vite.config.ts`.
- Add `.eslintrc`, `.prettierrc`, `.gitignore` (node_modules, dist, coverage).
- Add a **CI guard config** decision: an eslint rule/notes forbidding `Math.random`
  and `Date.now` inside `src/engine/**` (a custom `no-restricted-globals` /
  `no-restricted-properties` entry scoped to that path). This enforces determinism
  from day one.

## Acceptance criteria
- `npm install` then `npm run dev` serves the placeholder app.
- `npm run test` runs and the smoke test passes.
- `npm run typecheck` and `npm run lint` pass with zero errors.
- Linting an `engine/` file that calls `Math.random()` or `Date.now()` **fails**.
- The directory tree matches the README contract exactly.

## Guardrails
- No game logic yet — this is purely scaffolding. Resist implementing features early;
  later prompts own them and assume the clean structure.
