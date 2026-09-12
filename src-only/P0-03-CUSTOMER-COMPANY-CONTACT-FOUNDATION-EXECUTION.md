# P0-03 — Costumer Company Contact Model Execution Report (Organization / Contact / Address sweep)

Date: 2026-09-12
Milestone: SHANAN Phase 4
Base: `46f0aef` (`phase4-identity`)

## P0-03 STATUS

**COMPLETE — PASS**

Scope locked to the single genuine gap found by read-only discovery: the customer
organization **contact-person model** was missing (schema comment at
`db/supabase-schema.sql:11` promised "Contacts" as a future phase; it was never built,
while Customer Users and Credit Applications were). Organization identity, addresses,
and the request/RFQ/quotation lineage already exist and required no change.

## Already existed (no change made)

- Organization entity: `customer_companies` with `reference` (UNIQUE), `name_en`/`name_ar`,
  `email`, `phone`, `tax_id`, `account_status` (pending/active/suspended/rejected/closed),
  `payment_mode` (cash/credit).
- Organization addresses: single `address` + `country` + `city` columns (smallest existing
  model). Multi-address billing/shipping split is **not** required — no business/UI driver;
  implementing it would invent unnecessary address complexity, which the task forbids.
- Customer users ↔ company: `users.company_id` FK (ON DELETE SET NULL) + CHECK-constraint
  linkage between `user_type` and company/supplier.
- Tenant isolation (verified in P0-02): cross-tenant reads are indistinguishable 404s;
  `requireNotSupplier`, `ownsCompanyTenant` helpers.
- Customer/company admin APIs: `GET /api/customers` (internal), `POST /api/customers`
  (internal), `GET/PATCH /api/customers/:id` (internal), `GET /api/customers/me`
  (customer self-profile).
- Request/RFQ/quotation lineage at company level: `supply_requests.customer_company_id`
  FK + submit-time contact snapshot; `rfqs.supply_request_id`; offers = quotations;
  `purchase_orders` link back to SR/supplier.

## Genuine gaps (implemented)

| CAPABILITY | CURRENT STATE | REQUIRED CHANGE | PRIORITY |
|---|---|---|---|
| Customer organization contact person | MISSING — no customer contact concept anywhere (suppliers have contact columns; SRs and credit apps keep document-level snapshots only) | Add `contact_name` / `contact_title` / `contact_email` / `contact_phone` to `customer_companies` (mirrors `suppliers` + credit-app authorized-person patterns) | P1 |
| Primary contact on a company | MISSING | Covered by the four contact columns (org-level primary contact) | P1 |
| Maintainability of the contact | MISSING — no way to set/read contact data | Expose columns on every customer-companies query surface + internal create/update + customer self-service PATCH | P1 |

Not invented (deliberately excluded): separate `customer_contacts` / `customer_addresses`
tables; billing/shipping multi-address model; new quotation entity (offers are the
quotation equivalent).

## Implemented

1. **Migration** `src-only/db/migrations/0004_customer_contacts.sql` — additive, idempotent,
   replayable (`ADD COLUMN IF NOT EXISTS` x4) on `public.customer_companies`. No rows
   modified; no other object created/altered/dropped.
2. **Canonical schema** `src-only/db/supabase-schema.sql` — `customer_companies` now carries
   the four contact columns (source-of-truth file, same pattern as suppliers city/address/
   website shipped via migration 0002).
3. **API** (`src-only/api/[[...route]].ts`), all additive:
   - `GET /api/customers` (internal) — SELECTs the four contact columns.
   - `POST /api/customers` (internal) — accepts optional `contactName`/`contactTitle`/
     `contactEmail`/`contactPhone` with length + email-format validation.
   - `GET`/`PATCH /api/customers/:id` (internal) — contact columns in reads; field map
     extended so internal ops can set them.
   - `GET /api/customers/me` — self-profile read now includes contact columns.
   - **New `PATCH /api/customers/me`** — a customer updates its own company contact fields
     only; update is pinned to `WHERE id = ${auth.user.company_id}` (same-company only,
     cannot touch other tenants or non-contact fields); contactEmail format-validated.
     Guard: `GET`/`PATCH` share the existing customer-only 404 guard (requireAuth +
     requireNotSupplier + customer user_type with company_id).
4. **Regression tests** (`src-only/tests/a13-regression.test.ts`) — new "P0-03" suite
   (serverless-safe source-level assertions):
   - all four SELECT surfaces carry the contact columns (occurrence count = 4);
   - self-profile `PATCH` guard + same-company `UPDATE` + contactEmail validation present;
   - migration 0004 is additive/idempotent only (no CREATE TABLE / DROP / ALTER COLUMN /
     RENAME);
   - no duplicate `customer_contacts`/`customer_addresses` tables in the canonical schema,
     which carries the four columns on `customer_companies`.

## Files changed

- `src-only/db/migrations/0004_customer_contacts.sql` (new)
- `src-only/db/supabase-schema.sql`
- `src-only/api/[[...route]].ts`
- `src-only/tests/a13-regression.test.ts`
- `src-only/P0-03-CUSTOMER-COMPANY-CONTACT-FOUNDATION-EXECUTION.md` (this report)

## Migration created

**YES** — `0004_customer_contacts.sql`. **NOT applied to any database.** It is a local
artifact for the next approved deploy. Idempotent and additive; does not recreate or
alter any existing table, constraint, or row.

## Tests

- `bun test`: **64 pass, 0 fail** (60 baseline at P0-02 + 4 new P0-03 regressions).
- `bun run build` (`tsc -b && vite build`): **PASS**.
- `bun run lint` (`bunx eslint src/`): **0 errors, 45 warnings** — identical to baseline.
- Bundling: catch-all `api/[[...route]].ts` bundles cleanly via `bun build --target=bun`
  (65 modules).
- Strict `tsc --noEmit` on the catch-all: **one pre-existing, unrelated latent finding ONLY**

## Tenant isolation

- New self-service `PATCH /api/customers/me` is bound to `auth.user.company_id`; a
  customer cannot address another company's row (single-row UPDATE keyed to own company).
- The customer-only 404 guard is unchanged and reused for both `GET` and `PATCH` `/me`;
  suppliers and unauthenticated callers receive 401/404 as before.
- Internal endpoints remain `requireInternal`-gated; the new contact fields are exposed on
  the same internal-only surfaces and via the customer's own `/me` profile.

## Backward compatibility

- All responses are supersets (new columns added; existing keys unchanged); API contract
  preserved.
- All request shapes additive and optional — existing internal create/update payloads
  without contact fields behave exactly as before.
- No column renamed/repurposed; no CHECK constraint touched; no index/RLS/FK change;
  production schema untouched.
- `customer_companies`, `supply_requests`, `credit_applications`, `users`, `rfqs`,
  `purchase_orders` unchanged in shape and data.

## Production deployment

**NOT DEPLOYED** — per task constraints. No migration executed against any database.

## Pre-existing unrelated finding (out of scope, not fixed)

Strict `tsc --noEmit` on `api/[[...route]].ts` reports `TS2345` at line 2222 (PDF download
endpoint: `generateOfficialDocumentPDF` returns `Uint8Array<ArrayBufferLike>` passed to
`new Response`, which the installed TS DOM lib types as needing `ArrayBufferView<ArrayBuffer>`).
Present at HEAD, runtime-correct, unrelated to P0-03. Not audited further (no new audit
phase) and not fixed (not required for P0-03). Routine repo gates (`tsc -b`, `vite build`,
eslint, bun test) do not typecheck `api/` and are all green.

## Commit

Single commit with a descriptive message.

`1d7e5a0` — feat(customers): implement customer company contact foundation (P0-03)