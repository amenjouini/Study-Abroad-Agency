# bon-ita — Study-in-Italy agency CRM & student portal

A CRM and student portal for a Tunisia-based agency that helps Tunisian students study in Italy. The core of the app is a
**dynamic document-requirement engine**: the checklist each student sees is computed from their real situation
(sponsor relationship and status, funding, program language, scholarship, visa, …) and the active procedure version.

Full specification: [docs/BUILD_PROMPT.md](docs/BUILD_PROMPT.md). Progress: [docs/PROGRESS.md](docs/PROGRESS.md).

## Requirements

- Node.js 22+, npm
- Docker (PostgreSQL 16 + MinIO) — or your own PostgreSQL. No other database is supported.

## Setup

```bash
npm install
cp .env.example .env          # then edit secrets
npm run db:up                 # PostgreSQL (5432) + MinIO (9000/9001) via docker compose
npm run db:migrate            # apply migrations (creates the schema)
npm run db:seed               # reference data, 2026/27 procedure, demo accounts and students
npm run dev                   # http://localhost:3000
```

Other commands: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm run db:reset`.

## Development accounts (seed data — development only)

| Account | Password | Role |
| --- | --- | --- |
| admin@agency.test | `Admin#2026-dev` | ADMIN / owner |
| staff@agency.test | `Staff#2026-dev` | STAFF (assigned to the demo students) |
| staff2@agency.test | `Staff2#2026-dev` | STAFF (no assigned cases — used by permission tests) |
| ahmed@student.test, sarra@student.test, youssef@student.test, … | `Student#2026-dev` | STUDENT |

Change or remove these before any real deployment.

## Storage

`STORAGE_DRIVER=local` writes to `./storage` (git-ignored, never served statically). `STORAGE_DRIVER=s3` uses any
S3-compatible service (MinIO in `docker-compose.yml`). Downloads always go through the authorized route
`/api/documents/[versionId]`.

## Layout

```
prisma/            schema, migrations, seed (procedure data lives in prisma/seed/procedure-data.ts)
src/lib/engine/    pure rule / funding / passport / deadline engine (unit-tested)
src/lib/           money, dates, permissions catalog, i18n helpers
src/server/        services: facts loading, engine persistence, documents, audit, storage
src/app/           Next.js routes (/student, /staff, /admin, /api)
messages/          next-intl catalogs (fr, en, ar, it)
tests/             Vitest suites
```
