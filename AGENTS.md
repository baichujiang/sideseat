# AGENTS.md

## Cursor Cloud specific instructions

### Overview

SideSeat is a single Next.js 15 App Router application (frontend + API routes) backed by PostgreSQL via Prisma. There is no monorepo, no Docker Compose, and no separate backend service.

### Prerequisites

- **PostgreSQL** must be running locally. The update script does NOT start PostgreSQL — start it before running dev commands:
  ```
  sudo service postgresql start
  ```
- The `.env` file must exist with at least `DATABASE_URL`, `DIRECT_URL`, and `SESSION_SECRET`. `DIRECT_URL` can be the same value as `DATABASE_URL` for local dev (it exists for Neon connection pooling in production).

### Database setup (fresh database)

Use `npx prisma db push` instead of `npx prisma migrate dev` or `npx prisma migrate deploy`. The migration `20260215180000_schedule_share_mvp` has a timestamp before the init migration (`20260417121453_init`), so sequential migration apply fails on a fresh database. `prisma db push` syncs the schema directly from `prisma/schema.prisma`.

After pushing the schema, seed demo data: `npm run prisma:seed`. Demo login: `lin@tum.de` / `Password123`.

### Common commands

| Task | Command |
|------|---------|
| Install deps | `npm install` (also runs `prisma generate` via postinstall) |
| Dev server | `npm run dev` (port 3000) |
| Lint | `npm run lint` |
| E2E tests | `npm run test:e2e` (requires `npm run test:e2e:install` first for Playwright Chromium) |
| Smoke test | `SMOKE_APP_URL=http://127.0.0.1:3000 SMOKE_EMAIL=lin@tum.de npm run smoke:auth` (dev server must be running) |
| Seed data | `npm run prisma:seed` |

### Gotchas

- `npm run lint` (`next lint`) requires an `.eslintrc.json` file. If missing, it prompts interactively. For local runs only, create `{"extends":"next/core-web-vitals"}` — do **not** commit it until existing `react/no-unescaped-entities` errors are fixed, or `next build` / Vercel deploy will fail.
- The smoke test defaults to port 3001 and email `lin@example.com`. Override with `SMOKE_APP_URL` and `SMOKE_EMAIL` env vars as shown above.
- The smoke test's `/home` page check for "This week" may fail depending on the current day of the week; this is a pre-existing issue, not an environment problem.
- External services (Stripe, Resend, Twilio, Vercel Blob, VAPID push) are all optional for local dev — features degrade gracefully without their keys.
