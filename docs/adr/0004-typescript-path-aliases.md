# ADR-0004: TypeScript path aliases (`@/*`)

- **Status:** Accepted
- **Date:** 2026-10-27
- **Roadmap item:** P0-01 (review feedback), applied from P0-03 onward
- **Deciders:** owner (requested aliases for development, testing and production) + architect

## Context

Deep relative imports (`../../../lib/format`) break when files move and are hard to read in review, which matters doubly when an agent moves files around. The owner wants one alias that works the same in all four TypeScript contexts:

- the typecheck (`tsc`, and the editor);
- tests (Vitest);
- the dev server (Vite);
- the production build (Vite/Rolldown bundle).

The web app uses shadcn/ui, whose CLI expects `@/` aliases from `tsconfig.json`. The stack is TypeScript 7.0.2, Vite 8.3.5 and Vitest 5.0.5 (VERSIONS).

## Options considered

### A: `tsconfig.json` `paths`, read natively by Vite (`resolve.tsconfigPaths: true`)
- One alias declaration per project, in `tsconfig.json`.
- `tsc` understands it, and Vite 8 resolves it natively in dev and build.
- Vitest inherits Vite's config.
- shadcn's CLI reads it.
- No plugin is needed. Vite 8's `ResolveOptions.tsconfigPaths` was verified in its type definitions.

### B: Node subpath imports (`"imports": { "#/*": "./src/*" }` in `package.json`)
- Standards-based: understood by Node, TypeScript (`moduleResolution: bundler`) and Vite with zero config.
- But the `#/` prefix is unfamiliar, and shadcn's tooling is built around `@/`.
- It would also add a second convention next to every tsconfig.

### C: Duplicate alias maps (`tsconfig` `paths` + `resolve.alias` in Vite + Vitest), or the `vite-tsconfig-paths` plugin
- Duplication drifts: an alias that typechecks but fails at build time is the classic bug.
- The plugin was the standard fix before Vite gained native support. It's now an unnecessary dependency.

## Decision

**Option A.**

- `tsconfig.base.json` holds the shared strict compiler options.
- Every TS app and package has a `tsconfig.json` that extends it and declares `"paths": { "@/*": ["./src/*"] }`.
- Every TS app and package has a `vite.config.ts` that sets `resolve.tsconfigPaths: true`.

Rules:

1. `@/` always means **this project's** `src/`. It never reaches into another package.
2. Cross-package imports use workspace package names (`@earlii/tokens`, `@earlii/api`) with `workspace:*` dependencies, never path aliases.
3. Parent-relative imports (`../`) are banned in `apps/**/src` and `packages/**/src` by Biome `style/noRestrictedImports`. Sibling imports (`./x`) are fine.
4. Repo scripts (`scripts/*.mjs`) run directly on Node without a bundler and keep plain relative imports.

## Consequences

- Positive:
  - one source of truth per project;
  - identical resolution in typecheck, tests, dev and production;
  - files can move without import churn;
  - works with shadcn out of the box.
- Negative:
  - every new project must copy two lines (the fixture is the template);
  - production bundles resolve aliases at build time, so any code run *unbundled* on Node (e.g. a future SSR or tooling script written in TS) needs its own resolution step.
- **UNVERIFIED for E-07:** Expo/Metro support for tsconfig `paths`. Check the Expo docs for the pinned SDK before the mobile app starts.

## Verification

`scripts/test/ts-alias.test.mjs` runs against `scripts/test/fixtures/ts-alias/` (10 tests, ~3 s):

- `tsc` passes, and fails with TS2307 on a broken alias;
- Vitest passes;
- the Vite dev server rewrites `@/lib/freshness` to `/src/lib/freshness.ts`;
- `vite build` output contains no alias and runs;
- Biome rejects `../` imports and allows `@/` and `./`.
