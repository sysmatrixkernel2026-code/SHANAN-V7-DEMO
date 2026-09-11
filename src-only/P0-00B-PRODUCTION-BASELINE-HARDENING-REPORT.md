# P0-00B — PRODUCTION BASELINE REPRODUCIBILITY & TOOLING HARDENING — REPORT

- **Date:** 2026-09-11
- **Repo:** SHANAN-V7-INSPECTION (git root: `C:\Users\Dell\Desktop\SHANAN-V7-INSPECTION`)
- **Working tree:** `src-only/`
- **Branch / baseline commit:** `phase4-identity`, HEAD `ed7c541` before this work
- **Scope:** P0-00A confirmed findings A–E only. Contract-neutral (docs / env example / schema documentation / reproducibility migration). NO Vercel deployment, NO Supabase migration execution, NO production DB writes, NO runtime code change.
- **Authoritative baseline:** `P0-00A-BASELINE-RECONCILIATION-REPORT.md`

---

## 1. Executive Summary

P0-00B hardened the repository's production reproducibility and tooling
blind spots identified in P0-00A, without touching runtime behavior.

Delivered:
1. **`DEPLOYMENT.md` rewritten** to describe the live architecture
   (Vercel serverless API + Supabase PostgreSQL) instead of the stale
   Bun+SQLite/port-3001 guide that previously shipped.
2. **`.env.example` updated** to the verified runtime variable set:
   added `SUPABASE_DB_URL` and `SUPABASE_SSL_CA`, documented
   `LOGIN_MAX_REQUESTS`, `LOGIN_WINDOW_MS`, `MAX_IMAGE_SIZE_MB`,
   `ANALYSIS_WINDOW_DAYS`, re-based storage defaults to the serverless
   reality (`/tmp/shanan-storage`), and re-labeled the legacy-only
   variables (`DATABASE_URL`, `PORT`, `EXTRA_CORS_ORIGINS`) as legacy.
3. **`user_sessions` reproducibility** resolved: reconstructed the
   runtime/auth table from tracked evidence with high confidence and
   delivered it as idempotent migration `0003_user_sessions.sql`
   (no-op on the live DB — contains only `CREATE TABLE IF NOT EXISTS` +
   `CREATE INDEX IF NOT EXISTS`).
4. **`db/supabase-migration.sql` clarified** — headerdocumented as the
   LEGACY SQLite schema (not the Supabase PostgreSQL schema), zero
   semantic change, file retained (named unchanged, nothing references
   it).
5. **Catch-all API tooling blind spot fully investigated and
   classified.** `api/[[...route]].ts` is excluded from `tsc -b` and
   ESLint. A strict noEmit probe (`tsconfig.api-probe.json`) surfaced
   three error classes, two of which are **genuine latent production
   bugs** (`sql.begin(...)` and `data_completeness`). Per mission
   non-negotiables these are **reported, not fixed** in this phase.

**Validation:** `bun test` 48/48 pass; `tsc -b` exit 0; ESLint
0 errors / 45 warnings (unchanged vs P0-00A); production build
(`tsc -b && vite build`) exit 0.

Commit: `5ef78e3 chore(baseline): harden production reproducibility and tooling`.

---

## 2. P0-00A Confirmed Findings — Dispositions

| # | Finding (P0-00A) | Level | Disposition in P0-00B |
|---|---|---|---|
| A | `DEPLOYMENT.md` stale (Bun/SQLite/3001, wrong commands) | P1 | **Fixed** — full rewrite (§5). |
| B | `.env.example` missing `SUPABASE_DB_URL`/`SUPABASE_SSL_CA`, obsolete `DATABASE_URL`/`PORT` boots | P1 | **Fixed** — verified-usage rewrite (§6). |
| C | `user_sessions` DDL not in any tracked schema/migration | P1 | **Fixed as reproducibility migration** — reconstruction evidence + idempotent no-op migration (§4). |
| D | `supabase-migration.sql` misleadingly named; is SQLite | P1 | **Fixed (least disruptive)** — header documents it as LEGACY SQLITE; name and content untouched (§7). |
| E | `api/[[...route]].ts` (6.5k lines, monolithic) excluded from tsc/eslint | P1 | **Investigated + classified; NOT changed in code** — two latent runtime bugs found; tooling can't be switched on without fixing them (would break build / is a runtime change). See §8. |

---

## 3. Findings Intentionally Not Changed

Per mission non-negotiables ("If any proposed change could affect runtime
behavior: STOP and report"), the following are **reported only**:

1. **`api/[[...route]].ts:1716` — `sql.begin(...)` on a function**
   (`TypeError: sql.begin is not a function` at runtime when
   `insertSupplyRequest` runs). Fixing = runtime behavior change → out
   of scope. MUST be addressed in a runtime-audit phase (§8).
2. **`api/[[...route]].ts:1302` & `:1412` — `data_completeness` undefined**
   (`ReferenceError` in `evaluateSourcingForRequest`). Same STOP reason.
3. **ESLint scope** — kept at `src/` only (`bunx eslint src/`); enabling
   `api/` fails today. Documented (§8).
4. **`tsconfig.json` includes** — kept at `["src"]`; adding `api/**`
   breaks `tsc -b`. A non-breaking *report-only* mechanism (separate
   CI probe) is recommended in §13.
5. Legacy self-hosted deployment (PM2/systemd/Docker/SQLite) — MENTIONED
   in DEPLOYMENT.md as deprecated provenance only; nothing removed.

---

## 4. user_sessions Reproducibility — Investigation & Decision

### 4.1 Why it matters
Every login path writes/reads `public.user_sessions`
(`api/postgres.ts`, `api/auth/[[...route]].ts`). No tracked schema file
(`db/schema.sql`, `db/supabase-schema.sql`, `db/supabase-migration.sql`,
or the 0001/0002 migrations) and no migration ever created it, so a
**fresh** Supabase project built strictly from the repo would be missing
the auth table.

### 4.2 Evidence trail (all from the repo, no prod DB access)
- **Only tracked DDL** lives in the legacy SQLite bootstrap:
  `legacy/api/server.ts` (A5 bootstrap) and `legacy/api/server.restore.ts`,
  lines 116–124:
  ```sql
  CREATE TABLE IF NOT EXISTS user_sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ...
  CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ...
  ```
- Introduced by commit `adc6a07` (phase 1); never present in any
  `db/*` file (`git log -p -S user_sessions -- db/`: no hits).
- **Runtime column contract (auth code):**
  - `INSERT INTO user_sessions (token, user_id, expires_at) VALUES (...)`
    — `created_at` omitted ⇒ must have a default (or be nullable).
  - `INSERT ... ON CONFLICT (token) DO UPDATE` (`postgres.ts`) ⇒ `token`
    must be UNIQUE (PK or unique index).
  - `SELECT ... FROM user_sessions s JOIN users u ... WHERE s.token = $`
    and `AND s.expires_at > $nowIso` ⇒ `token`, `user_id`, `expires_at`
    required.
  - `expires_at` compared as **TEXT** ISO-8601 — confirmed authoritative
    by commit `ed7c541` ("compare session expiry as text on TEXT
    expires_at column") at HEAD.
- Regressions: `tests/a13-regression.test.ts:235` expects
  `>= 22 tables` and line 305 asserts the TEXT-expiry legacy contract.

### 4.3 Confidence assessment
| Element | Source | Confidence |
|---|---|---|
| `token TEXT PRIMARY KEY` | legacy DDL + upsert needs unique | High |
| `user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE` | legacy DDL + join queries | High |
| `expires_at TEXT NOT NULL` | legacy DDL + HEAD commit `ed7c541` | High |
| `created_at` has default | every runtime INSERT omits it | High |

The only non-observable from the repo is the exact default expression the
*production* table uses (TEXT `datetime('now')` vs Postgres
`CURRENT_TIMESTAMP`); the runtime contract only requires *a* default.

### 4.4 Decision
Because the table **already exists** in production, the delivered
migration is constructed as **idempotent and no-op on the live DB**:
`0003_user_sessions.sql` contains only
`CREATE TABLE IF NOT EXISTS public.user_sessions (...)` and two
`CREATE INDEX IF NOT EXISTS` statements, mirroring migration conventions
from `0001`/`0002` (`public.` prefix, single-purpose, RLS deferral note).
Executing it against the live Supabase DB is a no-op; creating it on a
fresh DB reproduces the exact runtime contract. **Nothing in this file
creates/recreates/drops/alters any existing object or row.**

No operation was and will be run against production in this phase (mission
constraint: do NOT run the migration now).

---

## 5. Deployment Documentation Changes

`src-only/DEPLOYMENT.md` fully rewritten (~441 lines new). Highlights:
- **Architecture**: Vercel (static SPA + serverless `api/*` functions via
  `vercel.json` rewrites) → **Supabase PostgreSQL 16**; object storage
  local `/tmp` or S3.
- **Environments matrix**: LOCAL / PREVIEW / PRODUCTION.
- **Commands**: `bun install`, `bun test`, `bunx eslint src/`, `bun tsc -b`,
  `bun run build` (= `tsc -b && vite build`), `bun run dev`.
- **Verified env var table** (names, consumer, prod-required flag, notes)
  matching the code survey (§6).
- **Auth architecture** (bearer sessions, PBKDF2-SHA256 100k iters,
  `login_attempts` rate limit, exemption from RLS).
- **Database/migration workflow**: `supabase-schema.sql` authoritative;
  changes delivered as numbered `db/migrations/*` files applied through
  Supabase tooling (repo/vercel never auto-runs them; `db/` excluded from
  deploy bundle via `.vercelignore`).
- **Legacy local server section**: clearly flagged deprecated/reference-only
  (Bun+SQLite, port 3001, PM2/systemd/Docker removed as active guidance).
- No credentials, keys, or connection strings with real values anywhere.

---

## 6. Environment Example Changes

`src-only/.env.example` updated after surveying **every** runtime env read
in `api/` and `src/`. Verified usage (unique refs):

```
process.env.SUPABASE_DB_URL, SUPABASE_SSL_CA,
LOGIN_MAX_REQUESTS, LOGIN_WINDOW_MS, SESSION_DURATION_MS,
MAX_IMAGE_SIZE_MB, ANALYSIS_WINDOW_DAYS,
STORAGE_PROVIDER, STORAGE_BASE_PATH, STORAGE_PUBLIC_URL,
S3_ACCESS_KEY, S3_BUCKET, S3_ENDPOINT, S3_FORCE_PATH_STYLE, S3_REGION, S3_SECRET_KEY
import.meta.env.VITE_API_URL
```

Changes vs the committed example:
- **Added**: `SUPABASE_DB_URL` + `SUPABASE_SSL_CA` (both commented
  placeholders, per no-secrets rule), `LOGIN_MAX_REQUESTS`,
  `LOGIN_WINDOW_MS`, `MAX_IMAGE_SIZE_MB`, `ANALYSIS_WINDOW_DAYS`.
- **Rebased defaults**: `STORAGE_BASE_PATH` → `/tmp/shanan-storage`
  (serverless reality); `VITE_API_URL` → Vercel-origin example.
- **Re-labeled legacy-only**: `PORT=3001`, `DATABASE_URL`,
  `EXTRA_CORS_ORIGINS` now explicitly marked "legacy local Bun server
  only — not used by Vercel serverless". `DATABASE_URL` itself removed
  from active usage (it configures the deprecated SQLite server); kept
  as a documented legacy note in DEPLOYMENT.md instead.
- **No real values committed** (placeholders only).

---

## 7. Legacy SQLite Schema Decision (`db/supabase-migration.sql`)

- **Verified**: file is byte-identical to `db/schema.sql`
  (SHA256 `A8984B60…`), full SQSQLite dialect (PRAGMA foreign_keys,
  `datetime('now')`, `AUTOINCREMENT`, `REAL`). The Pg schema is
  `db/supabase-schema.sql` (SHA256 `4AAC19E7…`).
- **Git history**: zero tracked references to the filename
  (`git grep -n "supabase-migration"`: no hits) — it is a dangling,
  never-referenced artifact.
- **Options weighed**: delete vs rename vs header-document.
  Per mission "**Prefer the least disruptive option**" and "do not delete
  schema files", chose the **header-only documentation** approach.
- **Change** (comment-only; no SQL semantics altered):
  added an `IMPORTANT — DATABASE IDIOM NOTICE (P0-00B)` header at the
  top stating this is the LEGACY SQLITE schema, is byte-identical to
  `schema.sql`, must NOT be applied to Supabase, and pointing to
  `supabase-schema.sql` as the authoritative PostgreSQL production schema.

---

## 8. Catch-all TypeScript / ESLint Coverage Investigation (`api/[[...route]].ts`)

### 8.1 Tooling surface surveyed
- `tsconfig.json` includes **only `["src"]`**; `tsconfig.node.json`
  covers only `vite.config.ts` ⇒ `tsc -b` never type-checks `api/**`.
- ESLint flat config **ignores `api/**`** (and `db/**`, `storage/**`);
  lint script is `bunx eslint src/`.
- Vercel bundles `api/*.ts` at build time (esbuild-style transpile, no
  type check) ⇒ `api/` errors escape all local CI and the production
  build.

### 8.2 Probe methodology
Created throwaway `tsconfig.api-probe.json` at repo root
(includes `api/**/*.ts`, `types: ["node"]`, `strict`, `noEmit`) and ran
`bunx tsc -p`. **Probe deleted after investigation** (not committed).

### 8.3 Probe results — three error classes
| # | Location | Error | Classification |
|---|---|---|---|
| 1 | `api/[[...route]].ts:399` | `TS2769` — `crypto.subtle.importKey('raw', Buffer …)` type mismatch (Node `Buffer` vs `BufferSource`) | **Type-only friction**; runtime-safe under Node Vercel runtime. |
| 2 | `api/[[...route]].ts:1302` & `:1412` | `TS2552` — `Cannot find name 'data_completeness'` | **LATENT RUNTIME BUG**: object-literal shorthand for the declared `dataCompleteness` (declared at 1202/1328) in `evaluateSourcingForRequest` (fn at 1159). Throws `ReferenceError` on any path that builds a sourcing-evaluation option (reachable via `GET /api/supply-requests/:id/sourcing-evaluation` at ~4647 and `validateSelectedOption` at ~1499). |
| 3 | `api/[[...route]].ts:1716` | `TS2339` — `Property 'begin' does not exist on type '() => any'` | **LATENT RUNTIME BUG**: `insertSupplyRequest` calls `sql.begin(...)` where `sql` is the lazy **function** `function sql(): any` (line 21) — every other transaction correctly calls `sql().begin(...)` (4253, 4591, 4975, 5151). Throws `TypeError: sql.begin is not a function` → POST `/api/supply-requests` surfaces the 500 path in `handlePost` (try/catch at ~2006). |

### 8.4 Why NOT fixed / NOT switched on in this phase
- Fixing #2/#3 = changing runtime behavior ⇒ **STOP, report** per the
  mission non-negotiables.
- Enabling `api/**` in `tsconfig.json` would make `tsc -b` fail ⇒ build
  red; also a tooling change affecting the build pipeline. Kept out.
- Enabling ESLint on `api/**` similarly fails today (errors present).

### 8.5 Recommendation (deferred, §13)
Close class #2/#3 in a **runtime-audit phase**, then add a CI-only
separate `tsconfig.api.json` (noEmit) + eslint api-overrides so the
6.5k-line business API gets static coverage without changing the shipped
build.

---

## 9. Exact Files Changed

Committed in `5ef78e3` (4 files, +281/−270):

| File | Change | Contract impact |
|---|---|---|
| `src-only/DEPLOYMENT.md` | Full rewrite to current architecture | Docs only — none |
| `src-only/.env.example` | Verified-usage rewrite, added Supabase placeholders | Docs/example only — none |
| `src-only/db/supabase-migration.sql` | LEGACY SQLITE header added (comment-only) | None — SQL semantics untouched |
| `src-only/db/migrations/0003_user_sessions.sql` | **New** idempotent reproducibility migration | None on produce (IF NOT EXISTS no-op); enables fresh-DB auth table |

Not staged (pre-existing / unrelated/untracked, left untouched):
`frontend-tunnel.log`, `P0-00A-…REPORT.md`, `P0-01-…AUDIT.md`,
`supabase/.temp/*` (secret-adjacent tooling cache),
`vercel.json.pre-security-20260908-232210.bak`.
Probe `tsconfig.api-probe.json` deleted.

---

## 10. Validation Results (all green)

| Gate | Command | Result |
|---|---|---|
| Unit/regression | `bun test` | **48 pass / 0 fail** (163 expect calls; 2 files) |
| Type-check | `bun tsc -b` | **exit 0** |
| Lint | `bunx eslint src/` | **0 errors, 45 warnings** (identical to P0-00A baseline; no new) |
| Production build | `bun run build` (`tsc -b && vite build`) | **exit 0** (94 modules → `dist/`) |

---

## 11. Regression Assessment

- **Runtime code:** zero application lines changed. No auth, RBAC, route,
  storage, or schema-execution code touched.
- **Database migrations:** the only new SQL is `CREATE … IF NOT EXISTS`
  (idempotent) — executing on an existing environment is a no-op; the
  file is not referenced by application code and `db/` is excluded from
  the deploy bundle.
- **Config/example:** `.env.example` is a template only; `.env`,
  `.env.production`, `.vercel/.env.*` (real values) are git-ignored and
  were never read/committed.
- **Docs:** no code path reads `DEPLOYMENT.md` or migration headers.
- Residual risks carried forward are the two classified latent bugs (§8.3)
  which are pre-existing and unmodified.

---

## 12. Remaining P1 / P2 Items

**P1 — latent runtime bugs (pre-existing, unmodified by P0-00B):**
1. `api/[[...route]].ts:1716` `sql.begin(...)` → POST `/api/supply-requests`
   transaction never commits (500 path). Fix = `sql().begin(...)`.
2. `api/[[...route]].ts:1302,1412` `data_completeness` → sourcing
   evaluation 500s. Fix = use `dataCompleteness`.

**P1 — tooling:**
3. `api/**` still untracked by `tsc -b`/ESLint; needs the runtime fix +
   CI-only probe config to close fully.

**P2 (documented, out of scope):**
- `src/types/index.ts` `UserType`/`UserRole` enum gap (supplier) — noted
  P0-00A Phase 4; runtime uses AuthContext `SafeUser`, unaffected.
- Unused-import/vars warnings in `src/` (45).
- Vite chunk >500 kB warning (single bundle).
- `frontend-tunnel.log` and `vercel.json…bak` untracked clutter.

---

## 13. Recommendation for Next Phase

1. **Runtime-audit phase (highest priority):** fix the two classified
   latent bugs (`sql.begin` → `sql().begin`; `data_completeness` →
   `dataCompleteness`), each with a focused regression test, after
   architectural review. This is a runtime change and must be a separate,
   explicitly-scoped phase, NOT bundled into this baseline work.
2. **Close the tooling gap:** after the fixes pass, add a CI-only
   `tsconfig.api.json` (noEmit, strict, node types) + ESLint overrides for
   `api/**` so the catch-all has static coverage without altering the
   shipped Vercel build (`vercel.json`/`package.json` scripts unchanged).
3. **Select expansion phase** based on the pending architectural review
   (Candidate Identity, Approval Engine, RFQ, PR/PO, UI modernization,
   AI agents, CMS, dynamic hero, ticker are all candidates — none started).
4. Revisit DEPLOYMENT.md as part of that phase to document the new
   functionality when shipped.

**STOP after P0-00B.** No expansion phase was started.