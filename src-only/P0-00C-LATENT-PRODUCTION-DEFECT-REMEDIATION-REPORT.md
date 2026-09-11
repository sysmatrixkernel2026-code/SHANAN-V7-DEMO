# P0-00C — LATENT PRODUCTION DEFECT REMEDIATION — REPORT

- **Date:** 2026-09-11
- **Repo:** SHANAN-V7-INSPECTION
- **Working tree:** `src-only/`
- **Branch:** `phase4-identity`
- **Baseline:** P0-00B (`aaf300d`) → P0-00C commit `fe9afbb`
- **Scope:** Three latent defects in `src-only/api/[[...route]].ts` identified and classified in P0-00B (§8). Minimal, contract-preserving fixes only. No deployment, no DB/data changes, no unrelated code modified.

---

## 1. Executive Summary

Three latent production defects — each causing a runtime exception in a specific API path — were remediated in the Vercel serverless catch-all business API (`api/[[...route]].ts`) using single-line, contract-preserving fixes. The API is not type-checked or linted by the project's CI (per P0-00B §8), so these bugs escaped all local and deployment pipelines.

| Defect | Root cause | API path affected | Runtime error | Fix |
|---|---|---|---|---|
| **C1** | `sql` is a lazy factory function in the catch-all, not the client instance | `POST /api/supply-requests` | `TypeError: sql.begin is not a function` → always 500 | `sql.begin(` → `sql().begin(` |
| **C2** | Shorthand `data_completeness,` references an undeclared identifier; camelCase local is `dataCompleteness` | `GET /api/supply-requests/:id/sourcing-evaluation` + `validateSelectedOption` | `ReferenceError: data_completeness is not defined` → 500 | `data_completeness,` → `data_completeness: dataCompleteness,` (×2) |
| **C3** | `Buffer<ArrayBufferLike>` is not assignable to WebCrypto's `BufferSource` under strict types; not checked in CI | S3 pre-signed URL construction (HEAD/PUT/DELETE objects) | Type-only; runtime-safe under Node's WebCrypto | `importKey('raw', keyData,...)` → `importKey('raw', new Uint8Array(keyData),...)` |

All validation passes (51 tests, `tsc -b`, ESLint, production build). Three regression tests were added mirroring the established A13-4A source-scanning pattern.

---

## 2. C1 — `sql.begin(...)` Root Cause and Fix

### 2.1 Root cause
The catch-all defines a **factory function** (`function sql(): any { ... return _sql; }`, line 21). Every transaction in the file correctly invokes `sql().begin(async (tx) => { ... })` (lines 4253, 4591, 4975, 5151). The `insertSupplyRequest` function at line 1716 called `sql.begin(...)` instead — invoking `.begin` on the function object, which has no such property. The error is caught at line 2006 and surfaced as 500 `"Could not persist your request"`.

The postgres **client** (from `postgres(url, {...})`) is held in `_sql` inside the factory closure and is never directly assigned to `sql` at module scope. The auth file (`api/auth/[[...route]].ts`) also has `sql.begin(` at line 313 but its `sql` is the postgres client instance passed into `createSqlStore(sql: any)` — a separate module with a distinct binding.

### 2.2 Fix
Single-line change: `sql.begin(` → `sql().begin(` (line 1716). All five transaction sites in the catch-all now uniformly call `sql().begin(...)`.

### 2.3 Properties preserved
- **Transaction boundaries/atomicity/rollback:** identical (same postgres.js `client.begin()` API).
- **Authorization + tenant isolation:** unchanged; happen upstream (`requireAuth`, customer-company assignment at 1987–1989) before `insertSupplyRequest` is called.
- **Validation:** unchanged; `validate()` runs at line 1991, before the try block.
- **State transition:** `status = 'pending'` (single INSERT); preserved exactly.
- **Response contract:** `201 { id, reference, createdAt }` on success; 500 on exception. Unchanged.

---

## 3. C2 — `data_completeness` Root Cause and Fix

### 3.1 Root cause
`evaluateSourcingForRequest` (line 1159) declares a local `let dataCompleteness: 'complete' | 'partial' | 'missing_critical' = 'complete'` in two places: once per agreement-term source (line 1202) and once per RFQ-offer source (line 1328). The contract property is `data_completeness` (snake_case; line 1112 type, consumed by `SourcingEvaluation.tsx:417`). The legacy reference implementation (`legacy/api/server.ts:885/1002`) writes `data_completeness: dataCompleteness,` — explicit key-value assignment. The catch-all used shorthand `data_completeness,`, which JavaScript interprets as "read variable `data_completeness`", which doesn't exist → `ReferenceError` on any sourcing evaluation path.

### 3.2 Fix
Both occurrences changed from `data_completeness,` to `data_completeness: dataCompleteness,` — matching legacy parity exactly.

### 3.3 Properties preserved
- **API contract:** JSON field `data_completeness` unchanged (same key; frontend reads `opt.data_completeness`).
- **Business semantics:** value is still computed by the same eligibility/flags logic (`complete`/`partial`/`missing_critical`).
- **Tenancy/auth:** downstream endpoints (`GET .../sourcing-evaluation`, `POST .../select-option`) still do `requireAuth` + ownership checks; unrelated to the object construction.

---

## 4. C3 — `importKey` Root Cause and Fix

### 4.1 Root cause
The `hmac` helper at line 398 types its parameter as `Buffer`. Under the installed TypeScript version + `@types/node` + lib.es2020 + lib.dom, `Buffer<ArrayBufferLike>` is not assignable to `BufferSource` (`ArrayBufferView<ArrayBuffer> | ArrayBuffer`) due to the `SharedArrayBuffer` variance issue introduced in TS 5.7's generic array-buffer types. The probe produces TS2769 at line 399 (overload mismatch), while `crypto.subtle.sign` at line 400 does not error (its overload set matches `Buffer` via the `ArrayBufferView` path). At runtime the call is safe — Node's WebCrypto accepts `Buffer` as `BufferSource` — but it is a strict-type defect that blocks adding `api/` to any type-checked pipeline.

### 4.2 Fix
Pass a fresh `Uint8Array` copy to `importKey`: `new Uint8Array(keyData)`. This creates a concrete-`ArrayBuffer`-backed view (the "safe" variant of `BufferSource`), which TS 5.5+ lib accepts directly. The HMAC keys here are ≤64 bytes; copying is negligible.

### 4.3 Properties preserved
- **Byte-identical key material:** `new Uint8Array(buffer)` copies bytes exactly.
- **Signature format:** unchanged (`AWS4-HMAC-SHA256`...).
- **S3 semantics:** no contract/API change.

---

## 5. Files Changed

| File | Change |
|---|---|
| `src-only/api/[[...route]].ts` | 4 lines changed (lines 399, 1302, 1412, 1716) |
| `src-only/tests/a13-regression.test.ts` | 1 import added + 1 describe/3 tests appended (54 lines) |

Nothing else was touched. No other files in `src-only/api/`, `src-only/src/`, `src-only/db/`, or Vercel/Supabase config modified.

---

## 6. Tests Added / Changed

Three regression tests appended to `a13-regression.test.ts` following the established A13-4A source-scanning convention (read the catch-all file, assert the correct pattern is present and the defective pattern is absent):

| Test | Assertion |
|---|---|
| C1 — `sql().begin` | `await sql().begin(async (tx: any) => {` present; `await sql.begin(` absent; exactly 5 `sql().begin(` matches (existing 4 + fixed 1). |
| C2 — `data_completeness` | Exactly 2 `data_completeness: dataCompleteness,` matches; no `data_completeness,` shorthand anywhere. |
| C3 — `importKey` | `"importKey('raw', new Uint8Array(keyData)"` present; `"importKey('raw', keyData,"` absent. |

---

## 7. Validation Results

| Gate | Result |
|---|---|
| `bun test` | **51 pass / 0 fail** (48 baseline + 3 P0-00C regression) |
| `tsc -b` | **exit 0** |
| `bunx eslint src/` | **0 errors, 45 warnings** (unchanged vs P0-00B) |
| Production build (`bun run build`) | **exit 0** (94 modules, 703 kB chunk) |

Type correctness of the catch-all under `types:["node"]` + strict (the configuration that finds the defect) confirmed via a throwaway probe config deleted before commit: the three approved defects resolve; a pre-existing 4th error at line 2222 (`Uint8Array → Response` body in the PDF-download path) is type-only (runtime-safe) and outside P0-00C scope.

---

## 8. Security / Tenant-Isolation Verification

| Property | C1 | C2 | C3 |
|---|---|---|---|
| Authorization | Unchanged (upstream of fix) | Unchanged (downstream endpoints do `requireAuth` + ownership) | Unchanged (S3 signing path) |
| Tenant isolation | Unchanged (data-scoped by `requireAuth` user) | Unchanged | N/A (infrastructure signing) |
| Role enforcement | Unchanged | Unchanged | N/A |
| State machine | `status='pending'` insert preserved | N/A | N/A |
| Transaction integrity | Now functional; atomic INSERT preserved via postgres.js `begin` | N/A | N/A |
| Parameterized SQL | All template strings unchanged | Unchanged | N/A |
| API response contract | Unchanged (`201 {id, reference, createdAt}`) | Unchanged (`data_completeness` field preserved) | Unchanged (S3 URL + headers) |

---

## 9. API Contract Verification

| Endpoint | Contract | Impact |
|---|---|---|
| `POST /api/supply-requests` | `201 {id, reference, createdAt}` on valid request; 422 on validation; 500 on insert failure | **Now functional** (was always 500). All behavior per existing contract. |
| `GET /api/supply-requests/:id/sourcing-evaluation` | `{items: [{options: [{data_completeness: "complete|partial|missing_critical", ...}]}]}` | **Now functional** (was always 500 when agreement-term or RFQ-offer sources existed). JSON key unchanged. |
| S3 pre-signed URLs | `{url, headers: {host, Authorization, ...}}` | Unchanged (type-only fix; byte-identical key material). |

---

## 10. Git Diff Scope Verification

```
 M src-only/api/[[...route]].ts           (4 lines)
 M src-only/tests/a13-regression.test.ts  (54 lines added)
```

No UI, database schema, migration, Vercel config, env/secrets, or unrelated file modifications.

---

## 11. Commit SHA

`fe9afbbdde4f1d997427a8216b756fc5cb1e0500`

---

## 12. Deployment Status

**DEPLOYMENT: NOT PERFORMED**

**PRODUCTION DATABASE: NOT MODIFIED**

**PRODUCTION DATA: NOT MODIFIED**

---

## 13. Remaining Observations (Out of Scope)

| Item | Classification | Note |
|---|---|---|
| `api/[[...route]].ts:2222` — `new Response(pdfBytes: Uint8Array)` type friction | Type-only (runtime-safe; `Uint8Array` is a valid `BodyInit` at runtime). Pre-existing. | Emerges only under strict `types:["node"]` probe; not in `tsc -b` scope; not in the approved P0-00C findings. |
| `api/[[...route]].ts` excluded from `tsc -b` and ESLint | Tooling gap | Requires (a) no outstanding tsc errors under the probe config; (b) a dedicated `tsconfig.api.json` (noEmit). The line-2222 friction must be resolved before adding `api/` to any CI type-check pipeline. |
| 45 warnings in `src/` | Pre-existing | 0 errors, 45 warnings (unchanged). |
| Vite bundle >500 kB | Pre-existing | Not related to P0-00C. |
