# ts-alias fixture

The reference project for Earlii's TypeScript path-alias convention ([ADR-0004](../../../../docs/adr/0004-typescript-path-aliases.md)). `scripts/test/ts-alias.test.mjs` proves that `@/*` resolves in all four TypeScript contexts:

- **Typecheck:** `tsc -p`, which also fails on a broken alias.
- **Tests:** Vitest.
- **Development:** the Vite dev server rewrites `@/…` to the real module.
- **Production:** `vite build` bundles the alias away, and the output runs without any runtime alias.

It isn't product code. Don't import it from apps or packages.
