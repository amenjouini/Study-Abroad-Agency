# Progress

## Done
- Repository inspected: it contained only `docs/BUILD_PROMPT.md.txt`. Spec copied to `docs/BUILD_PROMPT.md`.
- Stack set up: Next.js 16, TypeScript strict, Tailwind 4, Prisma 7 + PostgreSQL, Better Auth, next-intl, Vitest.
- `docker-compose.yml` (Postgres 16 + MinIO), `.env.example`, `CLAUDE.md`, `README.md`.
- Prisma schema for all tables in spec section 7 (+ `timeline_entries`, `human_review_items`, `student_degrees`, `procedures`, `procedure_parameters`, `notification_templates`).
- Pure engine in `src/lib/engine`: rule evaluation (AND/OR/NOT, 13 operators), funding calculation, passport check, deadline engine (calendar/working days, holidays, MIN of general/university/program), dependencies, re-evaluation planner. 50 unit tests passing.
- 2026/27 procedure seed data as plain data (`prisma/seed/procedure-data.ts`).

## In progress
- Database migration + seed (blocked on Docker Desktop's engine failing to start on this machine — see Known gaps).

## Known gaps
- Docker Desktop engine did not start ("waiting for docker daemon: context deadline exceeded"), so migrations/seed have not yet been run against a live database.

## Next step
Run `npm run db:up`, create the initial migration, write `prisma/seed/index.ts` (roles, permissions, reference data, procedure, DSU Toscana, holidays), then authentication + RBAC + audit log (build order step 3).
