# P0-02 CUSTOMER IDENTITY & ACCOUNT — EXECUTION REPORT

**Repo:** `C:\Users\Dell\Desktop\SHANAN-V7-INSPECTION\src-only`
**Branch:** `phase4-identity` (HEAD before work: `b545c91`)
**Date:** 2026-09-12
**Method:** read-only discovery → STEP 2 gap matrix → implement only genuine gaps (additive, no schema change, no prod writes) → full validation → report.
**Non-negotiables honored:** no deploy, no production DB modification (read-only `SELECT`/`COUNT` queries only), no UI changes, no mock customer data, no new audit phase, no new tables/reference duplication, auth contract for `/api/auth/login|me|logout` fully preserved, any new auth surface additive only.

---

## P0-02 STATUS: PASS

Implemented, validated, and committed. No schema migration required. No production deployment performed.

---

## STEP 2 — GAP MATRIX

| CAPABILITY | CURRENT STATE | REQUIRED CHANGE | PRIORITY |
|---|---|---|---|
| A. Customer account identity (stable users, active/inactive) | PASS — `users` (id UUID text PK, `is_active`, timestamps); 1 active customer company in production with 1 `customer_admin` user | none | — |
| B. Customer organization relationship (`company_id` → `customer_companies`) | PASS — FK present; cross-tenant 404 obfuscation verified in code (`ownsCompanyTenant`, SR/customer guards); registration validates org existence | none | — |
| C. Role foundation (`user_type`/`role` unions, customer roles) | PASS — `customer_admin`/`customer_user`, internal/supplier roles; `canManageUser` RBAC matrix | none | — |
| D. Profile/contact foundation (company/contact fields on `customer_companies`) | PARTIAL — fields exist (`name_en/ar`, email, phone, country, city, address, tax_id, `payment_mode`, `account_status`) but **customers cannot read their own company profile** (all customer endpoints internal-only) | Add `GET /api/customers/me` (customer self, same-company only) | P1 |
| E. Security (PBKDF2, sessions, parameterized SQL, tenant isolation) | PARTIAL — PBKDF2-SHA256 100k + 24h opaque sessions + RLS-off app boundary + generic 401s exist, but **no self-service password change** and **no admin password reset** → G-01 lockout unrecoverable | Add `POST /api/auth/change-password` (keep current session, revoke others); add admin `password` field to `PATCH /api/users/:id` (revoke all sessions) | P1 |
| F. API compatibility (do not break existing customer/request APIs) | PASS — preserved; all new surface additive | additive routing only | — |
| Registration flows (admin/supplier/customer) | PARTIAL — `register-admin`, `register-supplier` exist; **customer self-registration absent** | Add `POST /api/auth/register-customer` mirroring the proven supplier pattern (pending gate, no token, rate-limited) | P2 |
| Password reset (email-based forgot-password) | MISSING | **NOT IMPLEMENTED** — no email/SMTP infrastructure exists; speculative per mission | n/a |

---

## Implemented

1. **`POST /api/auth/change-password`** (new, authenticated, self-service)
   - Requires session + `currentPassword` + `newPassword` (≥8 chars, must differ from current).
   - Re-hashes with the existing PBKDF2-SHA256 100k format via `users.password_hash`.
   - Generic 401 for no/invalid token; 401 `Invalid password` for wrong current password; 422 for missing/short/same password.
   - Keeps the current session; revokes **all other** sessions for that user (`deleteSessionsForUser(userId, currentToken)`).
2. **`POST /api/auth/register-customer`** (new, public, rate-limited)
   - Mirrors `register-supplier` exactly: validates `companyName`/`email`/`password`/`contactName` (+ optional `nameAr`/`country`/`city`/`address`/`phone`/`taxId`), 409 on duplicate email, `login_attempts` rate limit (20/15min).
   - Transactionally creates `customer_companies` (`account_status='pending'`, `payment_mode='cash'`, `CUS-YYYY-NNNNNN` reference) + `users` (`customer`/`customer_admin`, `is_active=1`, `company_id` linked) — **no session token issued**, matching the supplier activation gate (H1).
3. **`GET /api/customers/me`** (new, authenticated)
   - A customer reads **its own** `customer_companies` row (id/reference/name/contact/status/payment/created/updated). Guards: `requireAuth` + `requireNotSupplier`; non-customer or `company_id` null → 404 (obfuscated); query is `WHERE id = auth.user.company_id` — strictly same-tenant. Added **before** the internal `/api/customers/:id` match so `me` is never treated as an id.
4. **Admin password reset** — optional `password` field on `PATCH /api/users/:id`
   - Gated to internal `admin`/`manager` only (403 otherwise); ≥8 chars (400); re-hashes; then `DELETE FROM user_sessions WHERE user_id = ...` — revokes ALL sessions for the target (force re-login). This closes the "lockout unrecoverable" half of G-01 at the operator level.

**Store additions (`AuthStore` interface + SQL store):** `updatePassword`, `deleteSessionsForUser`, `insertCustomerUser` (+ `generateCustomerReference`). All inserts reuse existing columns/tables — no DDL.

---

## Already existed (verified, NOT re-implemented)

- Customer users + companies + org linkage; roles `customer_admin`/`customer_user`; `users.is_active` and `customer_companies.account_status` lifecycle states.
- PBKDF2-SHA256 100k hashing + generic 401 + inactive 403 + 24h opaque sessions over `user_sessions`; rate limiting via `login_attempts`; `login|me|logout|register-admin|register-supplier` contracts.
- Cross-tenant isolation (customer 404 obfuscation), parameterized queries, RLS-off app boundary (migration `20260909193832`).
- Full customer business surface: supply-requests (+sourcing/procurement), credit applications (approved + same-company linkage), account records/summary, internal customer/user management.

## Not implemented because not required

- Email-based password reset / email verification — no email infrastructure; self-service change + admin reset already mitigate G-01 lockout; deferred to auth hardening (speculative without SMTP).
- CAPTCHA on open registration — already tracked as G-02/P1 (supplier side); not a Customer Identity & Account foundation gap; manual activation gate mitigates spam.
- Login-time gate on `customer_companies.account_status` — would change existing auth/login behavior and risk breaking live customers; supplier parity keeps status enforcement at endpoint level; additive-only constraint. (Noted for a future hardening step.)
- Customer self-edit (PATCH) of company profile — internal activation/update flow already exists via `/api/customers/:id`; not required for the foundation.
- New activity event for password change — would require an idempotent CHECK-constraint migration; deliberately omitted to keep zero-schema scope (session invalidation is the security mechanism).
- Any UI changes / mock customer data — explicitly out of scope per mission.

## Files changed

- `src-only/api/auth/[[...route]].ts` — AuthStore interface (+3), SQL store (+3), `generateCustomerReference`, `handleChangePassword`, `handleRegisterCustomer`, route dispatch (`change-password`, `register-customer`).
- `src-only/api/[[...route]].ts` — `GET /api/customers/me`; admin `password` reset on `PATCH /api/users/:id` + session revocation.
- `src-only/tests/auth-auth.test.ts` — mem store completes the full `AuthStore` interface (incl. latent `insertSupplierUser` gap); +9 focused tests (register-customer ×4, change-password ×5).

## Database migrations created

**NONE.** All writes reuse existing tables/columns (`users.password_hash`, `customer_companies`, `user_sessions`). No DDL, no CHECK changes, no prod migration files. (Verified against `db/supabase-schema.sql` column sets and production `\d`-style inspection during discovery.)

## Tests

- `bun test`: **60/60 pass, 0 fail** (baseline 51; +9 new focused tests).
- `tsc`: **PASS** — `bun run build` (`tsc -b && vite build`) green. Note: repo tsconfigs cover `src/` + `vite.config.ts` only; the `api/` and `tests/` dirs are not in any tsconfig, so I additionally ran a strict `tsc --noEmit` on `api/auth/[[...route]].ts` (clean) and confirmed the test file's only residual error is the pre-existing missing ambient `bun:test` types (`@types/bun` not installed; identical to the original file). Both edited API files also bundle cleanly via `bun build`.
- `eslint` (`bun run lint`, scoped to `src/`): **PASS** — 0 errors, 45 warnings (pre-existing, unchanged).
- `build` (`bun run build`): **PASS**.

## Security / tenant isolation

PASS. PBKDF2 re-hash on both change paths; wrong-current → 401 (no enumeration); self-profile strictly `WHERE id = company_id` of the caller (cross-tenant 404); register-customer mirrors the supplier activation gate (no token until approved) and reuses per-(ip,email) rate limiting; no secrets in responses (`safeUserInfo` unchanged); all queries parameterized.

## Backward compatibility

PASS. No existing endpoint, response shape, or status code changed. All additions are supersets: new auth sub-routes, new `/api/customers/me` path (pre-existing behavior for internal users on that exact path was 404 via `:id`; still 404), and an optional additive `password` field on `PATCH /api/users/:id` (absent ⇒ prior behavior bit-for-bit).

## Production deployment

**NOT DEPLOYED.** No production DB write was executed; only read-only verification queries.

## Commit

Committed in one commit (implementation + tests + this report, matching the recent `docs(p0)/feat(p0)` repo style). Untracked artifacts excluded: `frontend-tunnel.log`, `P0-00A-*`, `P0-01-*`, `_p000f_*`, `_p000e_sstorage.mjs`, `src-only/supabase/`, `vercel.json.pre-security-*`.