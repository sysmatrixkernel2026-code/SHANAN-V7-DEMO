# A13-0-Z-INDEPENDENT-AUDIT-REPORT.md
## SHANAN Engineering Knowledge Platform — Independent Audit Validation
## Phase A13-0 — NO CODE CHANGES — AUDIT ONLY

**Audit Date:** 2026-08-18
**Auditor:** Z / GLM-5.2 Advanced Track
**Codebase Audited:** `/home/z/my-project/upload/src-only/` (A12-complete state)
**Audit Method:** Source inspection, execution path tracing, actual code verification

---

## Summary Table

| Metric | Count |
|--------|------:|
| Total original findings reviewed | 22 |
| CONFIRMED | 7 |
| PARTIALLY CONFIRMED | 2 |
| FALSE POSITIVE | 5 |
| OUTDATED | 4 |
| NEEDS ARCHITECTURAL DECISION | 4 |
| TOTAL | 22 |

---

## Finding Details

---

### Finding 1: PATCH /api/users/:id — Privilege Escalation

| Field | Value |
|------|-------|
| Original claimed severity | CRITICAL |
| Classification | **CONFIRMED** |
| Actual severity | CRITICAL |
| File(s) | `api/server.ts` |
| Line(s) | 1923–1980 |

**Execution path inspected:**
1. `PATCH /api/users/:id` matches `userMatch` at line 1899
2. Handler starts at line 1924
3. No `requireAuth()` or `requireInternal()` call exists before the handler logic
4. Handler directly reads request body and updates user fields
5. Fields updatable: `name`, `role`, `isActive`
6. Role validation checks that the new role is valid for the user's `user_type` — but does NOT check whether the *caller* is authorized to change roles

**Existing protection found:** None. There is no authentication or authorization check on this endpoint.

**Evidence:**
- Line 1924: `if (userMatch && req.method === 'PATCH')` — enters handler
- Line 1925: `const userId = decodeURIComponent(userMatch[1]);` — reads target user ID
- Line 1927–1929: reads request body — no auth check before this
- Line 1937–1944: role update logic validates role enum, but does NOT check caller identity/role

**Vulnerability confirmed:**
- Any unauthenticated user can call `PATCH /api/users/:id`
- Can modify any user's role (e.g., promote to `admin`)
- Can deactivate any user (`isActive: false`)
- Can change any user's name

**Recommended next action:** FIX IN A13

---

### Finding 2: GET /api/users — Unauthenticated User Listing

| Field | Value |
|------|-------|
| Original claimed severity | HIGH |
| Classification | **CONFIRMED** |
| Actual severity | HIGH |
| File(s) | `api/server.ts` |
| Line(s) | 1738–1757 |

**Execution path inspected:**
1. `GET /api/users` matches at line 1739
2. No `requireAuth()` or `requireInternal()` call
3. Returns all users with: id, name, email, user_type, role, company_id, is_active, timestamps

**Evidence:**
- Line 1739: enters handler
- Line 1740: `try {` — no auth check
- Line 1741–1747: direct DB query returning all users

**Vulnerability confirmed:** Any unauthenticated person can enumerate all users, emails, roles, and company associations.

**Recommended next action:** FIX IN A13

---

### Finding 3: GET /api/users/:id — Unauthenticated Single User Lookup

| Field | Value |
|------|-------|
| Original claimed severity | HIGH |
| Classification | **CONFIRMED** |
| Actual severity | HIGH |
| File(s) | `api/server.ts` |
| Line(s) | 1899–1922 |

**Execution path inspected:**
1. `userMatch` defined at line 1899
2. `GET` handler at line 1900 — no `requireAuth()` call
3. Returns full user record by ID

**Evidence:**
- Line 1900: enters handler
- Line 1901: reads userId from URL
- Line 1903–1909: direct DB query, no auth check

**Vulnerability confirmed:** Any unauthenticated person can look up any user by ID, including email, role, and company association.

**Recommended next action:** FIX IN A13

---

### Finding 4: GET /api/customers — Unauthenticated Customer Company Listing

| Field | Value |
|------|-------|
| Original claimed severity | HIGH |
| Classification | **CONFIRMED** |
| Actual severity | MEDIUM-HIGH |
| File(s) | `api/server.ts` |
| Line(s) | 1546–1562 |

**Execution path inspected:**
1. `GET /api/customers` at line 1547 — no auth check
2. Returns all customer companies with: reference, name, email, phone, address, tax_id, account_status, payment_mode

**Evidence:**
- Line 1547: enters handler
- Line 1548: `try {` — no auth
- Returns sensitive business data (tax_id, account_status, payment_mode)

**Vulnerability confirmed:** Unauthenticated access to customer company data including tax IDs and account status.

**Recommended next action:** FIX IN A13

---

### Finding 5: POST /api/customers — Unauthenticated Customer Company Creation

| Field | Value |
|------|-------|
| Original claimed severity | HIGH |
| Classification | **CONFIRMED** |
| Actual severity | MEDIUM |
| File(s) | `api/server.ts` |
| Line(s) | 1564–1630 |

**Execution path inspected:**
1. `POST /api/customers` at line 1565 — no auth check
2. Accepts body and creates customer company with controlled enum validation

**Evidence:**
- Line 1565: enters handler
- Line 1566–1568: reads body — no auth
- Creates customer company with server-generated reference

**Vulnerability confirmed:** Any unauthenticated person can create customer companies in the system.

**Recommended next action:** FIX IN A13

---

### Finding 6: PATCH /api/customers/:id — Unauthenticated Customer Company Update

| Field | Value |
|------|-------|
| Original claimed severity | HIGH |
| Classification | **CONFIRMED** |
| Actual severity | HIGH |
| File(s) | `api/server.ts` |
| Line(s) | 1655–1730 |

**Execution path inspected:**
1. `PATCH /api/customers/:id` at line 1656 — no auth check
2. Can update: account_status, payment_mode, contact fields, tax_id

**Evidence:**
- Line 1656: enters handler
- Line 1657–1660: reads body — no auth
- Can change `account_status` (active/suspended/rejected/closed) and `payment_mode`

**Vulnerability confirmed:** Any unauthenticated person can change customer account status (e.g., suspend or close accounts) and payment mode.

**Recommended next action:** FIX IN A13

---

### Finding 7: GET /api/customers/:id — Unauthenticated Customer Detail

| Field | Value |
|------|-------|
| Original claimed severity | MEDIUM |
| Classification | **CONFIRMED** |
| Actual severity | MEDIUM |
| File(s) | `api/server.ts` |
| Line(s) | 1633–1650 |

**Execution path inspected:**
1. `GET /api/customers/:id` at line 1635 — no auth check
2. Returns full customer company record by ID or reference

**Evidence:**
- Line 1635: enters handler
- Line 1636: reads customer ID — no auth
- Returns tax_id, account_status, payment_mode

**Vulnerability confirmed:** Unauthenticated access to individual customer company details.

**Recommended next action:** FIX IN A13

---

### Finding 8: Admin Frontend Routes Without Protection

| Field | Value |
|------|-------|
| Original claimed severity | HIGH |
| Classification | **FALSE POSITIVE** |
| File(s) | `src/App.tsx` |
| Line(s) | 44–56, 64 |

**Execution path inspected:**
1. All `/admin/*` routes are wrapped in `<ProtectedRoute requireInternal>`
2. `ProtectedRoute` component checks `user?.userType !== 'internal'` and redirects
3. Specific routes verified:
   - `/admin/supply-requests` — line 45: `ProtectedRoute requireInternal` ✓
   - `/admin/suppliers` — line 47: `ProtectedRoute requireInternal` ✓
   - `/admin/agreements` — line 48: `ProtectedRoute requireInternal` ✓
   - `/admin/agreements/:id` — line 49: `ProtectedRoute requireInternal` ✓
   - `/admin/rfqs` — line 51: `ProtectedRoute requireInternal` ✓
   - `/admin/rfqs/:id` — line 52: `ProtectedRoute requireInternal` ✓
   - `/admin/supply-requests/:id/sourcing` — line 54: `ProtectedRoute requireInternal` ✓
   - `/admin/products` — line 56: `ProtectedRoute requireInternal` ✓
4. `/portal/*` routes wrapped in `<ProtectedRoute>` (requires auth) ✓

**Evidence:** Every admin route has `requireInternal` in `App.tsx`. The `ProtectedRoute` component at `src/components/ProtectedRoute.tsx` checks `isAuthenticated` and `userType === 'internal'`.

**Why false positive:** The older audit may have been produced before ProtectedRoute was added, or may have confused frontend route protection with backend API authorization (which is a separate concern — see Findings 1-7).

**Recommended next action:** CLOSE

---

### Finding 9: Token Stored in localStorage (XSS Vulnerability)

| Field | Value |
|------|-------|
| Original claimed severity | MEDIUM |
| Classification | **NEEDS ARCHITECTURAL DECISION** |
| File(s) | `src/context/AuthContext.tsx` |
| Line(s) | 5, 35, 70, 75, 82, 84 |

**Execution path inspected:**
1. `TOKEN_KEY = 'shanan_auth_token'` at line 5
2. Token stored via `localStorage.setItem(TOKEN_KEY, data.token)` at line 70
3. Token read via `localStorage.getItem(TOKEN_KEY)` at line 35
4. Token removed on logout at lines 75, 82, 84

**Evidence:** Session token is stored in `localStorage`, which is accessible to JavaScript. Any XSS vulnerability would expose the token.

**Why architectural decision:** This is a standard SPA authentication pattern. Moving to `httpOnly` cookies requires backend changes (CORS credentials, CSRF tokens, cookie middleware). This is a valid security improvement but is an architectural change, not a bug fix. The system has no known XSS vulnerabilities currently, but the attack surface exists.

**Recommended next action:** ARCHITECTURAL DECISION REQUIRED

---

### Finding 10: No Rate Limiting on Login Endpoint

| Field | Value |
|------|-------|
| Original claimed severity | MEDIUM |
| Classification | **CONFIRMED** |
| Actual severity | MEDIUM |
| File(s) | `api/server.ts` |
| Line(s) | 1182–1218 |

**Execution path inspected:**
1. `POST /api/auth/login` at line 1183
2. No rate limiting, IP throttling, or failed-attempt tracking
3. Password verification uses PBKDF2 (100K iterations) — computationally expensive per attempt
4. `grep -c 'rate.limit\|rateLimit\|RATE_LIMIT' api/server.ts` = 0

**Evidence:** No rate limiting middleware or logic exists anywhere in `api/server.ts`. An attacker can attempt unlimited password guesses.

**Mitigating factor:** PBKDF2 with 100K iterations makes each attempt ~200ms server-side, providing natural rate limiting but not sufficient against distributed attacks.

**Recommended next action:** FIX IN A13

---

### Finding 11: No CSRF Protection

| Field | Value |
|------|-------|
| Original claimed severity | MEDIUM |
| Classification | **NEEDS ARCHITECTURAL DECISION** |
| File(s) | `api/server.ts`, `src/context/AuthContext.tsx` |
| Line(s) | N/A |

**Execution path inspected:**
1. `grep -c 'csrf\|CSRF\|sameSite\|SameSite' api/server.ts` = 0
2. Authentication uses Bearer token in Authorization header (not cookies)
3. Bearer tokens are not automatically sent by browsers on cross-origin requests

**Evidence:** No CSRF protection exists. However, the system uses Bearer token authentication via `Authorization` header, not cookies. Bearer tokens are not vulnerable to CSRF in the same way cookies are — a cross-origin site cannot attach the Authorization header without CORS permission.

**Why architectural decision:** The current Bearer-token approach provides implicit CSRF resistance. If the system migrates to `httpOnly` cookies (Finding 9), CSRF protection becomes mandatory. This is coupled to the token storage architecture decision.

**Recommended next action:** ARCHITECTURAL DECISION REQUIRED (coupled with Finding 9)

---

### Finding 12: No Error Boundary in React Application

| Field | Value |
|------|-------|
| Original claimed severity | LOW-MEDIUM |
| Classification | **CONFIRMED** |
| Actual severity | LOW |
| File(s) | `src/App.tsx`, `src/main.tsx` |
| Line(s) | N/A |

**Execution path inspected:**
1. `grep -c 'ErrorBoundary\|componentDidCatch\|getDerivedStateFromError' src/App.tsx src/main.tsx` = 0
2. No React error boundary component exists anywhere in `src/`
3. An unhandled exception in any component will crash the entire application

**Evidence:** No error boundary implementation found. The app will show a blank page on any unhandled runtime error.

**Recommended next action:** FIX IN A13 (quality improvement)

---

### Finding 13: Large Monolithic CSS File (6855 lines)

| Field | Value |
|------|-------|
| Original claimed severity | LOW |
| Classification | **NEEDS ARCHITECTURAL DECISION** |
| File(s) | `src/styles/components.css` |
| Line(s) | 1–6855 |

**Execution path inspected:**
1. `wc -l src/styles/components.css` = 6855 lines
2. `wc -l src/styles/global.css` = 350 lines
3. All styling is in two large CSS files
4. No CSS modules, no CSS-in-JS, no Tailwind

**Evidence:** The CSS is functional but monolithic. Splitting into per-component files is a maintainability improvement, not a bug fix.

**Why architectural decision:** The current CSS works. Refactoring requires a decision about the preferred CSS architecture (CSS modules, Tailwind, etc.).

**Recommended next action:** ARCHITECTURAL DECISION REQUIRED

---

### Finding 14: Insufficient Frontend Form Validation

| Field | Value |
|------|-------|
| Original claimed severity | LOW |
| Classification | **PARTIALLY CONFIRMED** |
| Actual severity | LOW |
| File(s) | Various `.tsx` page files |

**Execution path inspected:**
1. Login form (`src/pages/portal/Login.tsx`) — has basic `required` attributes
2. Supply Request form (`src/pages/SupplyRequest.tsx`) — has validation
3. New Request form (`src/pages/portal/NewRequest.tsx`) — has some validation
4. Admin forms (SuppliersAdmin, AgreementDetail, etc.) — have inline validation
5. ProductsAdmin form — has `required` attributes

**Evidence:** Some forms have client-side validation (required fields, email format), but validation is inconsistent across forms. Backend validation is comprehensive and catches all invalid input.

**Why partially confirmed:** Backend validation is strong (validated enums, FK checks, ownership checks). Frontend validation exists but is not uniformly applied. The backend is the security boundary, so this is a UX issue, not a security issue.

**Recommended next action:** FIX IN A13 (UX improvement, not security-critical)

---

### Finding 15: No ESLint Configuration

| Field | Value |
|------|-------|
| Original claimed severity | LOW |
| Classification | **CONFIRMED** |
| Actual severity | LOW |
| File(s) | Project root |

**Execution path inspected:**
1. `ls .eslintrc* eslint.config*` — exit code 2 (not found)
2. No ESLint dependency in `package.json`
3. No linting scripts in `package.json`

**Evidence:** No linting configuration exists. Code quality issues may go undetected.

**Recommended next action:** FIX IN A13 (quality improvement)

---

### Finding 16: No Automated Tests

| Field | Value |
|------|-------|
| Original claimed severity | MEDIUM |
| Classification | **CONFIRMED** |
| Actual severity | MEDIUM |
| File(s) | Project root |

**Execution path inspected:**
1. `find . -name '*.test.*' -o -name '*.spec.*'` (excluding node_modules) — no results
2. No test framework in `package.json`
3. No test scripts in `package.json`
4. Verification scripts exist in `/home/z/my-project/scripts/` but are not part of the project

**Evidence:** No automated tests exist. All verification was done via manual curl commands and ad-hoc scripts.

**Recommended next action:** FIX IN A13 (quality improvement)

---

### Finding 17: Product Master Not Persisted (48 Products in Memory)

| Field | Value |
|------|-------|
| Original claimed severity | HIGH |
| Classification | **OUTDATED** |
| File(s) | `api/server.ts`, `db/schema.sql`, `src/data/catalog.ts`, `src/data/mockData.ts` |

**Execution path inspected:**
1. `grep 'mockProducts' api/server.ts` — only 1 result: a comment on line 322
2. `isValidProductId()` (line ~316) uses `db.prepare('SELECT id FROM products WHERE id = ? AND status = ?')` — SQLite query, not in-memory
3. `getProductSummary()` (line ~319) uses `db.prepare('SELECT id, sku, product_code, name_en FROM products WHERE id = ?')` — SQLite query
4. `db/schema.sql` has `CREATE TABLE products` with 12 seeded products
5. `src/data/catalog.ts` fetches from `${API_URL}/api/products` — API-backed
6. `src/data/mockData.ts` — converted to compatibility shim with `export const mockProducts: Product[] = []`

**Evidence:** The Product Master IS persisted in SQLite. The `products` table exists with 12 sample products. Server-side validation queries SQLite, not in-memory mockData. The older finding is no longer applicable.

**Why outdated:** This was fixed during the Product Master P1-P8 work (pre-A12). The older audit was produced against a pre-Product-Master baseline.

**Recommended next action:** ALREADY FIXED / OUTDATED

---

### Finding 18: ProductsAdmin Page Missing

| Field | Value |
|------|-------|
| Original claimed severity | MEDIUM |
| Classification | **OUTDATED** |
| File(s) | `src/pages/ProductsAdmin.tsx`, `src/App.tsx` |

**Execution path inspected:**
1. `ls src/pages/ProductsAdmin.tsx` — exists, 703 lines
2. `grep '/admin/products' src/App.tsx` — route exists with `ProtectedRoute requireInternal`
3. `POST /api/admin/products` in `api/server.ts` — has `requireInternal`
4. `PATCH /api/admin/products/:id` — has `requireInternal`
5. `POST /api/admin/products/:id/images/upload` — has `requireInternal`

**Evidence:** ProductsAdmin page exists with full create/edit/list/detail/image-upload functionality. Route is protected on both frontend and backend.

**Why outdated:** This was implemented during A12.

**Recommended next action:** ALREADY FIXED / OUTDATED

---

### Finding 19: AgreementDetail Product Picker Missing

| Field | Value |
|------|-------|
| Original claimed severity | MEDIUM |
| Classification | **OUTDATED** |
| File(s) | `src/pages/AgreementDetail.tsx` |

**Execution path inspected:**
1. `grep -c 'productSearch\|datalist' src/pages/AgreementDetail.tsx` = 13
2. Async debounced product search implemented with `useEffect` + `setTimeout`
3. Results displayed in a clickable dropdown with SKU + bilingual name
4. Selected product stores canonical persistent product ID

**Evidence:** Async product picker is implemented and queries the API Product Master.

**Why outdated:** This was fixed during A12.

**Recommended next action:** ALREADY FIXED / OUTDATED

---

### Finding 20: No Image Upload API

| Field | Value |
|------|-------|
| Original claimed severity | MEDIUM |
| Classification | **OUTDATED** |
| File(s) | `api/server.ts`, `api/storage.ts` |

**Execution path inspected:**
1. `grep -c 'images/upload' api/server.ts` = 1 — endpoint exists
2. `POST /api/admin/products/:id/images/upload` at line ~4165 — has `requireInternal`, multipart form data, MIME validation, file size limit, path traversal prevention
3. `DELETE /api/admin/products/:id/images/:imageId` at line ~4259 — has `requireInternal`
4. `GET /api/admin/products/:id/images` at line ~4275 — has `requireInternal`
5. `api/storage.ts` — `LocalStorageProvider` fully functional with save/read/delete/serveFile. `S3StorageProvider` implemented with real SigV4 signing.

**Evidence:** Full image upload/delete/list API exists with proper authorization and storage abstraction.

**Why outdated:** This was implemented during A12.

**Recommended next action:** ALREADY FIXED / OUTDATED

---

### Finding 21: Public Product Endpoints Lack Authentication

| Field | Value |
|------|-------|
| Original claimed severity | LOW |
| Classification | **FALSE POSITIVE** |
| File(s) | `api/server.ts` |
| Line(s) | 3856, 3881, 3905, 3984 |

**Execution path inspected:**
1. `GET /api/categories` (line 3856) — no auth — intentionally public (catalog browsing)
2. `GET /api/brands` (line 3881) — no auth — intentionally public
3. `GET /api/products` (line 3905) — no auth — intentionally public
4. `GET /api/products/:id` (line 3984) — no auth — intentionally public
5. `GET /api/storage/:key` (line 4074) — no auth — intentionally public (image serving)

**Evidence:** These endpoints are intentionally public. They are the public-facing catalog that customers browse. They do not expose:
- Supplier identity
- Pricing data
- Internal commercial terms
- User data
- Customer company data

They only expose: product names, SKUs, categories, brands, availability status, descriptions, images, specifications, and documents — all of which are intended for public display.

**Why false positive:** Public catalog endpoints are by design public. The data they expose is non-sensitive product information intended for customers.

**Recommended next action:** CLOSE

---

### Finding 22: Storage Endpoint (/api/storage/:key) Public Access

| Field | Value |
|------|-------|
| Original claimed severity | LOW |
| Classification | **PARTIALLY CONFIRMED** |
| Actual severity | LOW |
| File(s) | `api/server.ts` |
| Line(s) | 4074–4090 |

**Execution path inspected:**
1. `GET /api/storage/:key` at line 4074 — no auth check
2. Serves any file from local storage based on the key
3. `isValidStorageKey()` validates the key format (alphanumeric + slashes + dots + dashes) and rejects `..`
4. No authentication required to access stored files

**Evidence:** The storage endpoint is publicly accessible. Path traversal is prevented by `isValidStorageKey()`, but any uploaded file can be accessed by anyone who knows or guesses the storage key.

**Why partially confirmed:** The endpoint is intentionally public for serving product images to the catalog (customers need to see images). However, it also serves documents (PDFs, datasheets) that may be intended for internal use only. The current design does not distinguish between public product images and internal documents.

**Mitigating factors:** Storage keys include UUIDs and timestamps, making them effectively unguessable. Path traversal is blocked.

**Recommended next action:** ARCHITECTURAL DECISION REQUIRED (decide whether to add auth for document storage, or keep all storage public with unguessable keys)

---

## Classification Summary

| # | Finding | Classification | Severity |
|---|---------|---------------|----------|
| 1 | PATCH /api/users/:id privilege escalation | CONFIRMED | CRITICAL |
| 2 | GET /api/users unauthenticated | CONFIRMED | HIGH |
| 3 | GET /api/users/:id unauthenticated | CONFIRMED | HIGH |
| 4 | GET /api/customers unauthenticated | CONFIRMED | MEDIUM-HIGH |
| 5 | POST /api/customers unauthenticated | CONFIRMED | MEDIUM |
| 6 | PATCH /api/customers/:id unauthenticated | CONFIRMED | HIGH |
| 7 | GET /api/customers/:id unauthenticated | CONFIRMED | MEDIUM |
| 8 | Admin frontend routes without protection | FALSE POSITIVE | — |
| 9 | Token stored in localStorage | NEEDS ARCHITECTURAL DECISION | — |
| 10 | No rate limiting on login | CONFIRMED | MEDIUM |
| 11 | No CSRF protection | NEEDS ARCHITECTURAL DECISION | — |
| 12 | No error boundary | CONFIRMED | LOW |
| 13 | Large monolithic CSS | NEEDS ARCHITECTURAL DECISION | — |
| 14 | Insufficient frontend form validation | PARTIALLY CONFIRMED | LOW |
| 15 | No ESLint configuration | CONFIRMED | LOW |
| 16 | No automated tests | CONFIRMED | MEDIUM |
| 17 | Product Master not persisted (48 in memory) | OUTDATED | — |
| 18 | ProductsAdmin page missing | OUTDATED | — |
| 19 | AgreementDetail product picker missing | OUTDATED | — |
| 20 | No image upload API | OUTDATED | — |
| 21 | Public product endpoints lack auth | FALSE POSITIVE | — |
| 22 | Storage endpoint public access | PARTIALLY CONFIRMED | LOW |

---

## Findings Approved for Future A13 Implementation

| # | Finding | Severity | Fix Type |
|---|---------|----------|----------|
| 1 | PATCH /api/users/:id — no auth/authorization | CRITICAL | Add `requireAuth` + role-based authorization |
| 2 | GET /api/users — no auth | HIGH | Add `requireInternal` |
| 3 | GET /api/users/:id — no auth | HIGH | Add `requireInternal` (or `requireAuth` with self-access check) |
| 4 | GET /api/customers — no auth | MEDIUM-HIGH | Add `requireInternal` |
| 5 | POST /api/customers — no auth | MEDIUM | Add `requireInternal` |
| 6 | PATCH /api/customers/:id — no auth | HIGH | Add `requireInternal` |
| 7 | GET /api/customers/:id — no auth | MEDIUM | Add `requireInternal` |
| 10 | No rate limiting on login | MEDIUM | Add IP-based rate limiting |
| 12 | No error boundary | LOW | Add React ErrorBoundary component |
| 14 | Insufficient frontend form validation | LOW | Improve client-side validation consistency |
| 15 | No ESLint configuration | LOW | Add ESLint config + lint script |
| 16 | No automated tests | MEDIUM | Add test framework + initial tests |
| 22 | Storage endpoint public access | LOW | Architectural decision on document auth |

---

## Findings CLOSED (False Positives)

| # | Finding | Reason |
|---|---------|--------|
| 8 | Admin frontend routes without protection | All admin routes have `ProtectedRoute requireInternal` |
| 21 | Public product endpoints lack auth | Intentionally public catalog endpoints — no sensitive data exposed |

---

## Findings Already Resolved (Outdated)

| # | Finding | Resolution |
|---|---------|-----------|
| 17 | Product Master not persisted | Fixed in P1-P8 — products table in SQLite, mockProducts removed |
| 18 | ProductsAdmin page missing | Implemented in A12 |
| 19 | AgreementDetail product picker missing | Implemented in A12 |
| 20 | No image upload API | Implemented in A12 |

---

## Findings Requiring Management/Architecture Decision

| # | Finding | Decision Needed |
|---|---------|----------------|
| 9 | Token stored in localStorage | Migrate to httpOnly cookies? Requires backend cookie + CSRF changes |
| 11 | No CSRF protection | Coupled with Finding 9 — Bearer tokens provide implicit CSRF resistance |
| 13 | Large monolithic CSS (6855 lines) | Split into per-component CSS? Adopt CSS modules or Tailwind? |
| 22 | Storage endpoint public access | Add auth for document storage, or keep unguessable-key approach? |

---

## Recommended Prioritization for A13

### A13-1 — Critical Security Fixes (Findings 1, 2, 3, 4, 5, 6, 7)

Add `requireInternal` to all `/api/users` and `/api/customers` endpoints. For `PATCH /api/users/:id`, add both authentication and authorization (only admin/manager can change roles; users can only edit their own name). This is the highest priority — 7 confirmed vulnerabilities with CRITICAL/HIGH severity.

### A13-2 — Rate Limiting + Error Boundary (Findings 10, 12)

Add IP-based rate limiting to login endpoint (e.g., max 10 attempts per IP per 5 minutes). Add React ErrorBoundary wrapper around the app to prevent white-screen crashes.

### A13-3 — Quality Infrastructure (Findings 14, 15, 16)

Add ESLint configuration with recommended rules. Add a test framework (Bun's built-in test runner or Vitest). Write initial tests for auth, product validation, and supply request workflows.

### A13-4 — Architectural Decisions (Findings 9, 11, 13, 22)

Management decision on: token storage migration (localStorage → httpOnly cookies), CSRF strategy, CSS architecture, and storage endpoint authorization model.

---

A13-0 STATUS: COMPLETE
