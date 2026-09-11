# SHANAN Platform — Deployment Guide (Current Architecture)

> Status: **Current** (rewritten in P0-00B, 2026-09-11).
> This document reflects the LIVE production architecture: a Vite/React
> frontend served by **Vercel**, an API implemented as **Vercel serverless
> functions** (`api/*.ts`), and a **Supabase PostgreSQL 16** production
> database. The older Bun/SQLite/port-3001 deployment is retained ONLY as
> a legacy reference — see [Legacy local server](#legacy-local-server).

## Architecture Overview

```
┌──────────────────────┐     ┌───────────────────────────┐
│   Vercel edge/CDN     │     │   Supabase PostgreSQL 16   │
│                      │     │   (production database)     │
│   Frontend           │     │                             │
│   Vite/React build   │     │   public schema              │
│   (dist published)   │     │   + db/migrations/* applied   │
│                      │     │                             │
│   /api/* serverless  │───▶ │   users, user_sessions,      │
│   api/[[...route]].ts│     │   login_attempts, suppliers, │
│   api/auth/...       │     │   rfqs/offers, products,     │
│   api/products.ts... │     │   purchase_*, activity, …    │
└──────────────────────┘     └─────────────────────────────┘
          │
          ▼
   Object storage (local /tmp or S3 via STORAGE_PROVIDER)
```

**Key facts verified in P0-00A/P0-00B:**

- Production runtime is **Vercel + Supabase PostgreSQL**.
- The business API is the monolithic serverless catch-all
  `api/[[...route]].ts` (all `/api/<resource>/*` routes via the rewrites
  in `vercel.json`).
- Authentication uses **opaque bearer sessions** over
  `users` / `user_sessions`, PBKDF2-SHA256 (100k iterations) password
  hashing, and DB-backed login rate limiting (`login_attempts`).
- The frontend calls the same origin; `VITE_API_URL` is build-time-inlined.

## Environments

| Layer | LOCAL | PREVIEW (Vercel) | PRODUCTION (Vercel) |
|---|---|---|---|
| Frontend | `bun run dev` (vite, port 3000) | Vercel Preview deployment | Vercel Production deployment |
| API | vite dev proxy or a local Bun instance of `api/*` (see note) | Vercel serverless functions (`/api/*`) | Vercel serverless functions (`/api/*`) |
| Database | Supabase project (or local) via `SUPABASE_DB_URL` | Branch/preview Supabase or shared | Supabase PostgreSQL (primary) |
| Auth | Same code path (serverless or local) | Same code path | Same code path |

> **Local server note:** the only self-hostable Bun server left is
> `legacy/api/server.ts` (port 3001) which runs against a **SQLite** file
> from `db/schema.sql`. It is a deprecated contract keeper and is NOT how
> production runs. For local development the frontend's `VITE_API_URL`
> normally points at a deployed/secondary preview API or a local port.

## Prerequisites

- **Node.js** >= 18 (frontend toolchain) and/or **Bun** >= 1.0
  (test runner, scripts; `bunx`/`npm` both work).
- A **Supabase project** (hosted at supabase.com) for the database.
- A **Vercel account/project** for hosting.
- Credentials (Supabase connection string, API keys, Vercel access) are
  supplied through the hosting panels — they must never be committed.

## Project Layout (source root `src-only/`)

```
src-only/
├── api/                      # Vercel serverless functions (TypeScript)
│   ├── [[...route]].ts       #   main business catch-all (~6.5k lines)
│   ├── auth/[[...route]].ts  #   auth API (login/me/logout/register)
│   ├── postgres.ts           #   shared lazy postgres client + helpers
│   ├── products.ts           #   catalog endpoints (concrete functions)
│   ├── categories.ts / brands.ts / health.ts / index.ts
│   └── products/[id].ts
├── src/                      # Vite/React frontend
├── db/                       # Schemas + migrations (documentation source)
│   ├── schema.sql            #   LEGACY SQLite schema
│   ├── supabase-schema.sql   #   canonical PostgreSQL schema (authoritative)
│   ├── supabase-migration.sql#   LEGACY (SQLite) — see header; NOT Pg
│   └── migrations/           #   incremental Supabase migrations
│       ├── 0001_supabase_login_attempts.sql
│       ├── 0002_suppliers_registration_address.sql
│       ├── 0003_user_sessions.sql
│       └── 20260909193832_revoke_public_rls_auto_enable_execute.sql
├── tests/                    # bun test suites (auth-auth, a13-regression)
├── supabase/                 # local Supabase tooling artifacts (.temp excluded)
├── vercel.json               # rewrites + security headers
├── .env.example              # documented variable names (placeholders only)
├── .vercelignore             # excludes db/, storage/, env files from build
└── package.json              # scripts (dev/build/lint/test)
```

> `db/` is excluded from the deploy bundle (`.vercelignore`); the running
> database never ships with the function. The schemas exist for
> reproducibility/documentation and must be kept in sync with migrations.

## Commands

```bash
# Install
bun install

# Test (unit suites — no live DB required)
bun test

# Lint (frontend source only currently; api/** intentionally out of the
# ESLint scope — see P0-00B report §8 for the classified blind spot)
bunx eslint src/

# Type-check (frontend src only, project references)
bun tsc -b

# Production build (type-check + Vite build → dist/)
bun run build        # == tsc -b && vite build

# Local dev server (frontend)
bun run dev
```

## Environment Variables

All variable names below are read by the API; current authoritative list
from the code, verified at runtime:

| Variable | Used by | Required in prod | Notes |
|---|---|---|---|
| `SUPABASE_DB_URL` | `api/postgres.ts`, `api/[[...route]].ts`, `api/auth/[[...route]].ts` | **Yes** | Supabase connection string (PK-pooled/direct). Server throws if absent. |
| `SUPABASE_SSL_CA` | same | Yes if used (self-hosted CA) | PEM certificate for TLS to Supabase. |
| `SESSION_DURATION_MS` | auth | no | default 86400000 (24 h). |
| `LOGIN_MAX_REQUESTS` | auth | no | default 20. |
| `LOGIN_WINDOW_MS` | auth | no | default 900000 (15 min). |
| `STORAGE_PROVIDER` | main API | no | `local` (default) or `s3`. |
| `STORAGE_BASE_PATH` | main API | no | local storage base; default `/tmp/shanan-storage`. |
| `STORAGE_PUBLIC_URL` | main API | no | public URL prefix for stored objects. |
| `S3_*` (ENDPOINT/REGION/BUCKET/KEYS/FORCE_PATH_STYLE) | main API | only when `STORAGE_PROVIDER=s3` | S3-compatible object storage. |
| `MAX_IMAGE_SIZE_MB` | main API | no | upload guard. |
| `ANALYSIS_WINDOW_DAYS` | main API | no | analytics window (default 30). |
| `VITE_API_URL` | frontend (build-time) | yes (build) | inlined into the bundle. |
| `EXTRA_CORS_ORIGINS` | legacy server only | no | not used by Vercel functions. |
| `DATABASE_URL`, `PORT` | legacy server only | no | SQLite path / 3001 — legacy only. |

> Set these in the **Vercel project environment** (per environment: Local/
> Preview/Production). Do **not** commit real values; `.env.example`
> contains safe placeholders (see `.env.example`).

## Authentication Architecture (verified contract)

- Opaque 256-bit-ish bearer tokens in `user_sessions` (`token` PK,
  `user_id` FK → `users`, `expires_at` TEXT, `created_at` TEXT).
- PBKDF2-SHA256, 100,000 iterations, 16-byte salt; password hashes stored
  as `pbkdf2$<iters>$<b64(salt+hash)>`.
- Endpoints: `POST /api/auth/login`, `POST /api/auth/logout`,
  `GET /api/auth/me`, `POST /api/auth/register-admin`,
  `POST /api/auth/register-supplier`.
- Session expiry compared **as text** on the TEXT `expires_at` column
  (ISO-8601) — see commit `ed7c541`.
- Login rate limiting via `public.login_attempts`
  (`0001_supabase_login_attempts.sql`), single atomic upsert, window reset
  on success.
- Generic 401s, inactive-user 403s, DP-safe tenant-obfuscated 404s.
- RBAC tenant helpers in `api/[[...route]].ts` (`requireInternal`,
  `requireSupplier`, `requireSupplierAnyStatus`, etc.).

## Database & Migration Workflow

1. **Authoritative schema:** `db/supabase-schema.sql` (PostgreSQL).
2. **Changes are delivered as migration files** under `db/migrations/`
   (`NUMBER_description.sql`), each single-purpose and idempotent.
3. Migrations are applied to the Supabase project manually/through the
   project's own migration tooling (Supabase local / SQL editor) — the
   repo does not auto-run them and `db/` is not deployed to the function.
4. Never edit `supabase-schema.sql` in a way that diverges from applied
   migrations; a new migration is the replayable record of a change.
5. `db/schema.sql` and `db/supabase-migration.sql` are the **legacy SQLite**
   schema and must not be applied to Supabase.

## Production Deployment Model

1. Push to the branch; **Vercel builds**: `bun install`, `tsc -b`,
   `vite build` (via `build` script; `api/*.ts` functions are bundled by
   Vercel automatically). `vercel.json` supplies security headers and
   rewrites `/api/<prefix>/*` → `/api/[[...route]]`.
2. **Preview** deploy for feature branches; **Production** deploy for
   `main`/release branch.
3. Database changes ship separately as **Supabase migrations** (see above)
   and must be applied before/with the code that relies on them.
4. Storage: if persistent artifacts are needed, set `STORAGE_PROVIDER=s3`
   in the Vercel env (local `/tmp` is ephemeral across cold starts).

## Health Check

- `GET /api/health` → `{ ok: true, ... }` (serverless endpoint;
  `api/health.ts`).

## Legacy Local Server (deprecated — reference only)

The old self-hosted deployment (`Bun + SQLite`, port **3001**,
`bun run api/server.ts`, PM2/systemd/Docker) is **not** used by the live
system. Files and procedures for it live under `legacy/` and are kept as
contract provenance and offline tooling. If anything in production
deployment expects SQLite/`DATABASE_URL`/`PORT=3001`, remove that
assumption — production is Supabase + Vercel.