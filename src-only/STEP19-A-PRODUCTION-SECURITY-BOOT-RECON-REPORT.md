# STEP 19-A RECONNAISSANCE REPORT
# Production Security & Boot Hardening — Reconnaissance ONLY

**Phase:** STEP 19-A (reconnaissance only — no source/schema/data modifications)
**System under test:** SHANAN B2B (React/Vite :3000 → Bun API :3001 → SQLite)
**Date:** 2026-08-27
**Parent gate:** STEP 19 = PASS (CONDITIONAL) — findings P2-1 / P2-2 / P2-3

> Nothing was changed. This report identifies the exact smallest safe changes,
> their risk, and a recommended execution order for the next (execution) command.

---

## 1 · Current Auto-Seed Mechanism (TARGET 1)

**Call site:** `api/server.ts:175-183` — runs *unconditionally on every server startup*:

```
// P1: Auto-seed demo product master data on first run (idempotent — safe on restart)
try {
  const seedResult = seedProductMaster(db);
  if (seedResult.products > 0 || seedResult.categories > 0) {
    console.log(`[shanan-api] Product master seeded: ... (SAMPLE/DEMO data)`);
  }
} catch (e) { console.warn('[shanan-api] Seed skipped:', e); }
```

**Seed module:** `api/seed.ts` (imported at `server.ts:14`).
- Creates **8 categories** (`cat-001..008`), **5 brands** (SKF/Bosch/Festo/3M/Parker), **12 sample products** (`prod-00001..12`), 4 specs, 3 tech-meta records.
- All seeded **products** have `is_sample_data = 1` (`seed.ts:83`, `status='active', 1`).
- **Idempotent:** every insert is guarded by an existence check (by slug/sku/product_id), so re-running inserts nothing new. Current DB already contains all 12 sample products.
- Categories/brands tables have **no `is_sample_data` column** → the 8 sample categories and 5 brands are **not** individually flaggable and are mixed with the 443 real categories (same `cat-*`/`brand-*` id namespace).

**Why it runs at startup:** dev convenience to guarantee a demo dataset exists ("auto-seed demo data on first run" per DEPLOYMENT.md and the `P1:` comment).

**Can it execute in production:** Yes, technically — it runs and (after the first run) inserts nothing new. But it *attempts* to write demo data on a production boot, violating the required principle.

**Is it protected by `is_sample_data`?** Products: YES (excluded from public `/api/products`, filter `is_sample_data=0`; live total = **3860**). Categories/brands: **NO flag** — the 8 sample categories and 5 sample brands appear in `/api/categories` and `/api/brands`, and `/api/categories` product_count (`server.ts:6028`) does **not** filter `is_sample_data`, so sample products are counted in category totals. (Minor residual leak; primary fix is to stop seeding on production boot.)

**Would removing auto-execution break an existing deployment?** No. The 12 sample products already exist; the catalog serves 3860 real products; no runtime path depends on the seed having run during this boot.

**Explicit environment-variable control:** Feasible and consistent with the codebase — `server.ts` already reads `process.env` (PORT, DATABASE_URL, EXTRA_CORS_ORIGINS, LOGIN_MAX_REQUESTS, …). Bun auto-loads `.env`. There is an **on-demand admin route** `POST /api/admin/seed` (`server.ts:6569`, `requireInternal`) that retains explicit dev/test seeding regardless of the startup gate.

### Smallest safe production design (recommended)
Gate the startup call behind an **explicit opt-in env var** (default = OFF), e.g.:

```ts
if (process.env.SEED_DEMO_DATA === '1' || process.env.NODE_ENV === 'development') {
  // existing try/catch seedProductMaster(db) block
}
```

- Default production boot: **no automatic seeding** (satisfies the principle).
- Development/test: `SEED_DEMO_DATA=1` or `NODE_ENV=development` re-enables it.
- On-demand `/api/admin/seed` remains available for explicit seeding.
- **Risk:** Very low. No data is removed; idempotent seed simply stops being auto-invoked. Considered against `NODE_ENV` explicitly: `NODE_ENV` may be undefined in this run (not referenced anywhere in `server.ts`), so prefer an explicit `SEED_DEMO_DATA` flag to avoid surprising behavior.

---

## 2 · Current CORS Mechanism (TARGET 2)

**Implementation:** hand-rolled in `api/server.ts` (no middleware dependency).
- **Allow-list** `ALLOWED_ORIGINS` (`server.ts:24-36`):
  `http://localhost:3000`, `http://127.0.0.1:3000`, `http://localhost:5173`, `http://127.0.0.1:5173`, `http://127.0.0.1:81`, `http://localhost:81`, **+ `EXTRA_CORS_ORIGINS` env** (comma-separated).
- **Preview wildcard** `PREVIEW_ORIGIN_PATTERN = /^https?:\/\/preview-[a-f0-9-]+\.z\.ai$/` (`server.ts:38`).
- **Origin validation** `originAllowed()` (`server.ts:186-191`): null origin → false; in allow-list → true; matches preview pattern → true; else false.
- **Response helper** `corsHeaders(origin)` (`server.ts:193-205`): always sets `Access-Control-Allow-Methods` (POST, GET, PATCH, DELETE, OPTIONS), `Access-Control-Allow-Headers` (Content-Type, Authorization), `Access-Control-Max-Age` (86400); only when `originAllowed` adds `Access-Control-Allow-Origin: <origin>` + `Vary: Origin`.
- **Preflight:** OPTIONS → 204 with `corsHeaders` (`server.ts:1569-1571`).
- **Credentials:** NO `Access-Control-Allow-Credentials` anywhere → cross-origin credentialed requests are blocked (correct; auth is `Authorization: Bearer`, always same-origin via proxy). No `*` wildcard used.
- **Production behavior today:** because dev/preview origins are hardcoded, a production deployment would still accept `localhost`/`127.0.0.1:81`/`preview-*.z.ai` origins even though they should not be allowed. Attacks are still limited (unlisted origins get no ACAO header), but the allow-list is not environment-scoped.

### Safest configuration model (development / staging / production)
Use the existing `process.env` pattern to make the allow-list environment-scoped, **without hardcoding an unknown production domain** (prod domains come from `EXTRA_CORS_ORIGINS`):

| Environment | Behavior |
|---|---|
| **Development** | Keep current defaults (localhost:3000/5173, 127.0.0.1:81, preview-*.z.ai) **or** read the same list for convenience. |
| **Staging / Production** | Build the allow-list **entirely from `EXTRA_CORS_ORIGINS`**; drop all hardcoded dev/preview origins. If unset → only same-origin allowed (no ACAO) — safe default. |

Smallest change: make `ALLOWED_ORIGINS`/`PREVIEW_ORIGIN_PATTERN` conditional on env, e.g. only include dev/preview entries when `NODE_ENV !== 'production'`, and in production derive origins solely from `EXTRA_CORS_ORIGINS`.
- **Credentials:** keep omitted (do not add `Access-Control-Allow-Credentials`).
- **Risk:** Low. Improves the security posture; only changes which origins receive `Access-Control-Allow-Origin`. Must ensure the real production origin is set via `EXTRA_CORS_ORIGINS` at deploy time, or same-origin traffic still works (API and frontend same-origin via proxy produce no cross-origin need).

---

## 3 · Security-Header State (TARGET 3)

**Current state:** **none of the five headers is emitted** by the API or the frontend.
- API (`curl -D - http://localhost:3001/api/health`) returns only: `Content-Type`, `Access-Control-Allow-Methods`, `Access-Control-Allow-Headers`, `Access-Control-Max-Age`.
- Frontend (Vite dev, `http://localhost:3000/`) returns only: `Content-Type: text/html`, `Cache-Control: no-cache`, `Etag`.
- **No** `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Strict-Transport-Security`.

**All Response construction points in the Bun layer** (complete inventory):
- `server.ts:208` — `jsonResponse` (every JSON response, incl. `/api/health` and all errors via `errorResponse`) — spreads `corsHeaders(origin)`.
- `server.ts:217` — `errorResponse` → delegates to `jsonResponse`.
- `server.ts:1519-1531` — `rateLimitResponse` (429) — spreads `corsHeaders(origin)`.
- `server.ts:1570` — CORS preflight — `headers: corsHeaders(origin)`.
- `server.ts:2895-2903` — PDF bytes — spreads `corsHeaders(origin)`.
- `server.ts:6321` — storage file serve — spreads `corsHeaders(origin)`.
- `server.ts:6012` — static asset serve — does **NOT** spread `corsHeaders` (only Content-Type + Cache-Control).

**Smallest safe implementation with the existing Bun layer:** add unconditional security headers inside the **single `corsHeaders()` function** (`server.ts:193`). Because every JSON/error/429/preflight/PDF/storage response already spreads or uses `corsHeaders`, one edit propagates headers to all of them. The security headers are origin-independent and safe to emit unconditionally.
- The only manual add: the standalone static-asset response at `server.ts:6012` (spread `corsHeaders(origin)` or add the headers there).
- No new middleware, no new dependencies.

**Header-recommendation (staged — CSP is the risky one):**

- **Stage 1 — zero-risk headers (all environments / all responses):**
  `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`.

- **Stage 2 — CSP on the frontend document only (production), NOT on the API.**
  CSP protects the served HTML document; the API returns JSON (no HTML), so CSP belongs on the frontend (index.html `<meta http-equiv>` or the hosting/edge layer), not the Bun API.
  Resource audit (what CSP could break):
  - **Scripts:** production bundle is same-origin `dist/assets/index-*.js` → `script-src 'self'`. ⚠ **Dev (Vite :3000) uses inline/module + HMR** → a strict CSP breaks the dev server; keep dev without strict CSP.
  - **Styles:** React sets **inline style attributes** extensively (Login.tsx, SuppliersAdmin, AgreementsAdmin, etc.) → bypassing `'unsafe-inline'` for styles **will break the UI layout**. Use `style-src 'self' 'unsafe-inline'` (and/or `style-src-attr 'unsafe-inline'`).
  - **Images:** served same-origin via `/api/storage/...` and `/shanan-logo.png`. `img-src 'self' data:`. If any product image is an external `https:` URL, include `https:` (verify before tightening).
  - **Fonts:** none custom → `font-src 'self'`.
  - **API (connect):** frontend calls `/api/*` same-origin (Vite proxy in dev; same origin if served together in prod) → `connect-src 'self'`. If API is a separate origin in prod, add it.
  - **frame-ancestors/base-uri:** `frame-ancestors 'self'`, `base-uri 'self'` (safe additions).

  Recommended **staged production CSP** (frontend only):
  ```
  default-src 'self';
  script-src 'self';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https:;
  font-src 'self';
  connect-src 'self';
  base-uri 'self';
  frame-ancestors 'self';
  form-action 'self'
  ```
  Do **not** enable strict CSP in the Vite dev configuration. ⚠ Verify all image URLs are same-origin or covered by `https:` before locking down `img-src`.

- **Stage 3 (optional):** `Strict-Transport-Security` only meaningful over HTTPS; add at the hosting/edge tier (harmless, ignored over plain HTTP).

**Risk:**
- Stage 1 headers: negligible risk (no functionality dependency).
- CSP: moderate risk only if applied to dev or if `img-src`/`style-src` are over-tightened; the pragmatic production-only CSP above avoids the known breakages (React inline styles, Vite HMR).

---

## 4 · Exact Demo/Placeholder Locations (TARGET 4)

**String definitions — `src/i18n/translations.ts`:**
- `:1541` — `'home.placeholderNotice'`: `en: 'Demo Platform — Product data shown is placeholder content. Real catalog data will be connected from the backend.'`, `ar: 'منصة تجريبية …'`
- `:2161` — `'footer.placeholder'`: `en: 'Demo Platform - Placeholder data'`, `ar: 'منصة تجريبية - بيانات تجريبية''
- Both keys are declared in the i18n `TranslationKey` union (`:124`, `:742`).

**UI usage sites (exhaustive — grep-verified, exactly 4):**
| # | File:Line | Key | Element / Is present on |
|---|---|---|---|
| 1 | `src/components/Header.tsx:37` | `home.placeholderNotice` | `<span class="header-topbar-text">` — **every public page** (top bar) |
| 2 | `src/pages/About.tsx:34` | `home.placeholderNotice` | `<div class="placeholder-notice">` — About page |
| 3 | `src/components/Footer.tsx:18` | `footer.placeholder` | `<p class="footer-placeholder-tag">` — **every public page** (footer brand col) |
| 4 | `src/components/Footer.tsx:74` | `footer.placeholder` | `<span>` — **every public page** (footer bottom bar) |

**Classification:** All four are **obsolete demo/release messaging** — they falsely state the catalog is "placeholder content" and "will be connected from the backend" although the catalog is now API-backed with 3860 real products. None is legitimate product messaging, none is a placeholder for real copy; all are stale and misleading for end users.

### Smallest safe replacement
**Primary (recommended) — single-file, 2-line change:** set both translation values to empty strings in `translations.ts`:
```
'home.placeholderNotice': { en: '', ar: '' },
'footer.placeholder':       { en: '', ar: '' },
```
This neutralizes **all four** UI sites with zero component changes and zero type-union risk. Empty elements render as nothing; the only side effect is possible minor whitespace from the now-empty `.header-topbar-text` / `.footer-placeholder-tag` / `.placeholder-notice` / bottom-bar `<span>`.

**Optional cleanup (if empty spacing is visually undesirable):** remove the four JSX lines in `Header.tsx`, `About.tsx`, `Footer.tsx` (and optionally then the two translation entries) — a second, slightly larger but still small step.

**Risk:** Very low. Text-only; no logic/data/layout dependence. Recommended to pair with the CORS/seed changes (P2-2/P2-3) for a single reboot in the next execution command.

---

## 5 · Current Environment Configuration

- **No `.env` file present** in the repo (only `.env.example`). Server runs entirely on built-in defaults (`server.ts`): `PORT=3001`, `DATABASE_URL` → `../db/custom.db`, `EXTRA_CORS_ORIGINS` unset, `STORAGE_PROVIDER=local`.
- `NODE_ENV` is **not referenced** anywhere in `api/server.ts` — there is currently no environment branching.
- Non-secret env knobs already supported: `PORT`, `DATABASE_URL`, `EXTRA_CORS_ORIGINS`, `STORAGE_*`, `S3_*`, `LOGIN_MAX_REQUESTS`, `LOGIN_WINDOW_MS`, `GENERAL_MAX_REQUESTS`, `GENERAL_WINDOW_MS`, `MAX_IMAGE_SIZE_MB`, `ANALYSIS_WINDOW_DAYS`. `SESSION_DURATION_MS` is hardcoded (24h) despite `.env.example` listing it.
- Passwords hashed (PBKDF2 + salt); no hardcoded secrets in source; no S3 credentials configured.

---

## 6 · Live Health Result (TARGET 5)
- API health: **200** — `{"ok":true,"service":"shanan-supply-api","version":"1.0.0","storage":{...},"database":"...\\src-only\\db\\custom.db"}`
- Frontend: **200** (`http://localhost:3000/`)
- No stop/restart performed; server left untouched. Database not mutated.

---

## 7 · Git Status (TARGET 6)

`git status --short`:
```
 M api/server.ts
 M db/schema.sql
 M src/App.tsx
 M src/i18n/translations.ts
 M src/pages/SupplyRequest.tsx
 M src/pages/portal/NewRequest.tsx
 M src/pages/portal/RequestDetails.tsx
 M src/pages/supplier/SupplierLayout.tsx
?? STEP19-PRODUCTION-READINESS-GATE-REPORT.md
?? src/pages/supplier/SupplierAgreementDetail.tsx
?? src/pages/supplier/SupplierAgreements.tsx
```

**PRE-EXISTING (belongs to STEP 18 and earlier; NOT created by STEP 19-A):**
- 8 modified tracked files above (delivery_date migration, RTL/i18n additions, portal/supplier/layout work, PHASE 7 auth fixes).
- 2 untracked new source pages: `SupplierAgreementDetail.tsx`, `SupplierAgreements.tsx`.
- `STEP19-PRODUCTION-READINESS-GATE-REPORT.md` (STEP 19 deliverable).

**CURRENT STEP 19-A (this reconnaissance phase):** **NONE.** Zero files modified/created.
- `Header.tsx`, `Footer.tsx`, `About.tsx` have **empty diffs** (unmodified).
- `api/server.ts` diff = pre-existing STEP 18 changes only (no CORS/seed/header edits by 19-A).
- `translations.ts` 86 additions = pre-existing PHASE 5 work; `placeholderNotice`/`footer.placeholder` lines are unchanged baseline.
- No temp/audit artifacts left on disk (tmp_*.ts/cjs cleared); git not reset; nothing committed.

---

## 8 · Exact Smallest Safe Changes Required

| # | Change | File(s):Line | Scope |
|---|---|---|---|
| C1 (P2-3) | Gate auto-seed behind `SEED_DEMO_DATA === '1'` (or `NODE_ENV==='development'`); default = no seeding on boot | `api/server.ts:175-183` | 1 block wrap |
| C2 (P2-3) | Make `ALLOWED_ORIGINS`/`PREVIEW_ORIGIN_PATTERN` environment-scoped: dev/preview only when not production; production allow-list = `EXTRA_CORS_ORIGINS` only | `api/server.ts:24-38` (+ `originAllowed` already keys off this) | 2 blocks |
| C3 (P2-2) | Add unconditional safe headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`) inside `corsHeaders()` | `api/server.ts:193-205` | 1 function |
| C4 (P2-2) | Static-asset response to also emit security/CORS headers | `api/server.ts:6012` | 1 line |
| C5 (P2-2) | Add **production-only** frontend CSP (index.html meta / hosting tier); keep dev without strict CSP | `index.html` or hosting | 1 directive set |
| C6 (P2-1) | Empty `home.placeholderNotice` and `footer.placeholder` translation values (primary single-file fix) | `src/i18n/translations.ts:1541,:2161` | 2 lines |
| C7 (P2-1, optional) | Remove the 4 empty banner elements if spacing matters | `Header.tsx:37`, `About.tsx:34`, `Footer.tsx:18,:74` | 4 lines |

No new dependency, no schema change, no data migration. Each change is small and locally scoped.

---

## 9 · Risk of Each Change

| # | Risk | Mitigation |
|---|---|---|
| C1 (seed gate) | **Very low.** No data loss; idempotent seed just no longer auto-runs. If dev relied on auto-seed, must set `SEED_DEMO_DATA=1`. | Keep on-demand `/api/admin/seed`; document the flag in `.env.example`/DEPLOYMENT.md. |
| C2 (CORS scope) | **Low.** Only changes which origins receive `ACAO`. Could block a dev origin if `EXTRA_CORS_ORIGINS` unset in dev — dev keeps defaults. | Confirm production origin configured via `EXTRA_CORS_ORIGINS`; same-origin traffic unaffected. |
| C3 (safe headers) | **Negligible.** No functionality depends on absence of these headers. | None (headers are origin-independent). |
| C4 (asset headers) | **Negligible.** Adds headers to static asset responses. | None. |
| C5 (CSP) | **Moderate** (only the risky one). Wrong `script-src`/`img-src`/`style-src` can break the app or dev server. | Apply to production frontend only; use `style-src 'self' 'unsafe-inline'` (React inline styles); verify all image URLs same-origin/`https:`; never enable in Vite dev. |
| C6 (empty banners) | **Very low.** Text-only; type union unchanged. Possible minor empty-element whitespace. | If spacing is an issue, apply optional C7. |
| C7 (remove elements) | **Very low.** Pure JSX removal. | None. |

---

## 10 · Recommended Execution Order

1. **C1 (seed gate)** — stops demo data creation on production boot (data-safety).
2. **C2 (CORS scope)** — restricts cross-origin to the real environment.
3. **C3 + C4 (security headers, safe set)** — immediate hardening with negligible risk.
4. **C6 (empty placeholder banners)** — removes all misleading public messaging in one file.
5. **C7 (optional)** — remove empty banner elements if whitespace is undesirable.
6. **C5 (production CSP)** — last, staged, and only after verifying image origins and confirming it is applied to the production frontend only.

**Impact of the fix set:** zero schema/data changes, zero new dependencies, one API restart + one frontend rebuild/restart. All changes are directly verifiable live:
- Restart API → confirm no `...seeded (SAMPLE/DEMO data)` log line, `/api/health` 200, new security headers present via `curl -D -`.
- Frontend rebuild/preview → no "Demo Platform" banner anywhere; CSP (Stage 2) does not break layout/images.
- `git status` unchanged in scope (API/translations/index.html only) — already-pending source files remain pending; no new commits.

---

*STEP 19-A reconnaissance only. No implementation was performed. Awaiting the execution command.*
