# Agent notes

This is Next.js 16 (App Router, Turbopack, `proxy.ts` instead of middleware, async `params`/`cookies()`).
Read the bundled docs in `node_modules/next/dist/docs/` before changing framework-level code.

Core invariant: **nothing is published unless it was approved by the user.**
The gate lives in `src/lib/status.ts` (`publishGate`) and is enforced server-side in
`src/lib/publishing/publisher.ts`. Any new publishing path must call `publishContent()`.
Run `npm test`, `npm run typecheck` and `npm run lint` before committing.
