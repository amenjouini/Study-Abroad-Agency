# Progress

## Done
All 24 build-order steps have an implementation. `typecheck`, `lint`, `test` (126 tests) and the production `build` pass.

1. **Infrastructure** — Next.js 16 / TypeScript strict / Tailwind 4, Prisma 7 + PostgreSQL, docker-compose (Postgres + MinIO), `.env.example`, CLAUDE.md, README.
2. **Schema + seed** — all tables of spec section 7 (+ `timeline_entries`, `human_review_items`, `student_degrees`, `procedures`, `procedure_parameters`, `notification_templates`, `rate_limits`); roles, permissions, academic years, countries, regions, cities, universities, programs, the 2026/27 procedure (requirements, rule trees, dependencies, deadlines, parameters, sources), 2027/28 draft, DSU Toscana 2026/27, Italian holidays 2026–27, case stages, payment plan.
3. **Auth / RBAC / audit** — Better Auth (email+password, DB sessions, HttpOnly Secure SameSite=Lax cookie), permissions as data (`requirePermission(user, key, { caseId })`, `caseAccessWhere` for list queries), append-only audit log (DB trigger).
4. **i18n / shell** — next-intl fr/en/ar/it with RTL, per-user saved locale; student mobile-first shell, staff/admin sidebar shells.
5. **Domain services** — students, cases, applications, Universitaly and visa (attached to the application), funding, scholarships.
6. **Pure engine** — rules (AND/OR/NOT, 13 operators), funding, passport (15 months from the version), deadlines (calendar/working days, holidays, MIN of general/university/program), dependencies, re-evaluation planner.
7. **Demo seed** — checklists generated through the same engine service the app uses.
8. **Onboarding wizard** (10 steps, progress saved per step).
9. **Documents** — upload (MIME sniffing, size, extension), versioning (superseded, never deleted), formalities per version, staff review workspace (student / preview / review panel), dependency and formality enforcement on approval.
10. **"I need help" + human-review queue**.
11–13. **Dashboards** — student, staff (filters), admin (KPIs + charts, money per currency).
14–17. **Funding UI, visa, Universitaly, scholarships** (student + staff screens).
18–20. **Payments** (staff-recorded transactions, receipts, TND 3 decimals, no online payment), **agency appointments** (slots, day/week/month calendar, settings), **messaging + in-app notifications** (channel interface, reminders endpoint).
21–22. **Leads (with conversion), knowledge base, procedure management** (versions, clone, activate/archive, condition-tree editor, dependencies with cycle check, deadlines, parameters, explicit case migration with diff).
23. **Analytics + CSV exports** (formula-injection safe).
24. **Security pass** — CSP/HSTS in production, origin checks on mutating routes, DB-backed atomic rate limiting, static tests that every route/action authenticates.

## In progress
Nothing.

## Known gaps
- **Docker Desktop did not start on the development machine** (WSL engine failure), so `docker-compose.yml` was written but never run here. Development used `embedded-postgres` (real PostgreSQL 18 binaries, `npm run db:local`). The S3/MinIO storage driver is implemented but was not exercised against a live server.
- No password reset or e-mail verification (no e-mail channel is implemented; only the in-app channel behind `NotificationChannel`). Staff-created and lead-converted accounts get a one-time password shown once.
- Reminders need an external scheduler calling `/api/cron/reminders`.
- Some DB-stored display text is not translated: payment-plan item names, university/program/scholarship names, DB-stored sponsor labels. Requirement names and explanations exist in fr/en/it/ar (explanations in fr/en, other locales fall back to English).
- Staff/admin screens exist in French and English; Arabic and Italian fall back to French (as specified).
- Procedure editor edits existing requirements and can clone a version, but cannot create a brand-new requirement or a new procedure/country from the UI (seed or clone instead).
- `availability_slots` (per-date open/blocked windows) is supported by the slot generator and tests but has no admin UI beyond blocked dates.
- Document retention is stored as a setting; there is no purge workflow (documents are never deleted).
- The knowledge base is admin-only (the spec's route list has no student route for it).
- Browser E2E checks were run ad hoc with Playwright (Edge) and are not part of the test suite.

## Next step
Run the stack with Docker on a machine where it starts, point `STORAGE_DRIVER=s3` at MinIO, and add password-reset / e-mail delivery behind `NotificationChannel`.
