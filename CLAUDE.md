# CLAUDE.md — Study-in-Italy Agency CRM & Student Portal

Specification: `docs/BUILD_PROMPT.md` (re-read the relevant section before each feature).
Progress log: `docs/PROGRESS.md` — read it at the start of every session and continue from "Next step".

## Session workflow

WRITE THE CODE → RUN IT → TEST IT → FIX IT → CONTINUE.
After each completed feature: `npm run typecheck && npm run lint && npm test`, fix failures, commit, update `docs/PROGRESS.md` (Done / In progress / Known gaps / Next step). Never leave the repo in a non-building state.
Build order is fixed (spec section 3). No dashboard before the document engine has passing tests.

## Permanent rules

1. No procedure values are hard-coded in application logic. Amounts, deadlines, thresholds, requirements and rules live in the database under a procedure version. (Code may only hold *keys* — see `src/lib/engine/constants.ts`.)
2. Authorization is enforced server-side on every query, server action and route handler. Frontend checks are cosmetic only.
3. Students can never access another student's data. Staff only access cases they are assigned to or have an explicit permission for.
4. No fake features: no buttons that do nothing, no hard-coded dashboard numbers, no hard-coded student data in the frontend. If something is not implemented yet, show it clearly as "not yet available".
5. Never promise visa approval, faster appointments or guaranteed outcomes. The final visa decision belongs to the competent Italian authorities.
6. Never destroy documents or document versions. Superseded items are marked, not deleted.
7. Money is stored as integer minor units plus ISO currency code (TND = 3 decimals, EUR = 2). Amounts in different currencies are never added together (`src/lib/money.ts`).
8. Ambiguous or unsupported situations produce `REQUIRES_HUMAN_REVIEW`, never a guessed checklist.

## Architecture

- Next.js (App Router) + TypeScript strict, Tailwind v4, PostgreSQL + Prisma 7 (driver adapter `@prisma/adapter-pg`, client generated to `src/generated/prisma`), Better Auth, next-intl (cookie/user-based locale, no locale URL prefix), Vitest.
- `src/lib/engine/` — **pure** requirement/funding/passport/deadline engine. It never touches the database. `src/server/` services load facts, call the engine and persist results.
- `prisma/seed/procedure-data.ts` — procedure data (requirements, rules, parameters, deadlines) as plain data. It is written to the DB by the seed and is also what the engine tests run against.
- `src/lib/permissions.ts` + `requirePermission(user, key, { caseId })` is the single authorization entry point. Every server action/route handler starts with an auth check.
- Files go through the `StorageDriver` interface (`src/server/storage`); never served from a public path.
- Every state change that matters writes an audit log entry (`src/server/audit.ts`) and, for cases, a timeline entry.
- Windows dev machine: use the Write tool for source files (bash heredocs choke on quotes); shell commands via bash or PowerShell.

## Commands

`npm run db:up` · `npm run db:migrate` · `npm run db:seed` · `npm run dev` · `npm test` · `npm run typecheck` · `npm run lint` · `npm run build`

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
