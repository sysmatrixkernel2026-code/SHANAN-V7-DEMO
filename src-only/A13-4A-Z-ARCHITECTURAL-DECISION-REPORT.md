# A13-4A-Z-ARCHITECTURAL-DECISION-REPORT.md
## SHANAN Engineering Knowledge Platform — Architectural Decision Review
## Phase A13-4A — READ-ONLY AUDIT, NO CODE CHANGES

**Date:** 2026-08-18
**Executor:** Z / GLM-5.2 — Main Engineering Executor
**Codebase:** `/home/z/my-project/upload/src-only/` (A13-3 complete)
**Phase Type:** Architectural decision review — NO CODE MODIFICATION

---

## 1. Project Baseline Inspected

| Phase | Status |
|-------|--------|
| A12 | COMPLETE (Product Master, admin UI, image upload, storage) |
| A13-0 | COMPLETE (Independent audit — 22 findings) |
| A13-0R | COMPLETE (Reconciliation — corrected counts: 11 CONFIRMED, 2 PARTIALLY, 2 FALSE POSITIVE, 4 OUTDATED, 3 ARCHITECTURAL) |
| A13-1 | COMPLETE (Findings 1–7: auth/authorization on users + customers endpoints) |
| A13-2 | COMPLETE (Findings 10, 12: rate limiting + error boundary) |
| A13-3 | COMPLETE (Findings 14, 15, 16: form validation + ESLint + tests) |

**Current A13-0R architectural decisions under review:**
- Finding 9 — Token storage (localStorage)
- Finding 11 — No CSRF protection
- Finding 13 — Monolithic CSS (6855 lines)
- Finding 22 — Storage endpoint public access (PARTIALLY CONFIRMED)

---

## 2. Finding 9 — Token Storage

### Current Implementation Evidence

| Aspect | Actual Implementation |
|--------|----------------------|
| Token format | `crypto.randomUUID() + '-' + crypto.randomUUID()` (128+ character random string) |
| Token lifetime | 24 hours (`SESSION_DURATION_MS = 24 * 60 * 60 * 1000`) |
| Server-side storage | `user_sessions` table (SQLite) with `token`, `user_id`, `expires_at` |
| Frontend storage | `localStorage.setItem('shanan_auth_token', token)` in `AuthContext.tsx` line 70 |
| Token attachment | `Authorization: Bearer ${token}` header on every API request (`AuthContext.tsx` lines 42, 79, 115) |
| Logout | `DELETE FROM user_sessions WHERE token = ?` + `localStorage.removeItem()` |
| Session expiry | Server checks `new Date(session.expires_at) < new Date()` on every request; expired sessions are deleted |
| Is_active check | Server checks `!session.is_active` — deactivated users are rejected |
| Cookie usage | **Zero** — `grep -c 'cookie\|Cookie\|Set-Cookie\|httpOnly' api/server.ts` = 0 |
| CORS credentials | Not used — `Access-Control-Allow-Credentials` is not set |

### Actual Risk Level Today: LOW

**What is realistically possible today:**
1. **XSS token theft**: If an XSS vulnerability exists in the React app, an attacker's JavaScript could read `localStorage.getItem('shanan_auth_token')` and exfiltrate the token. However:
   - React's JSX escaping prevents most XSS vectors
   - No `dangerouslySetInnerHTML` usage found in the codebase
   - No user-generated HTML content is rendered
   - The token is opaque (not a JWT) — it cannot be decoded to extract user data
2. **Token persistence after tab close**: `localStorage` persists across browser sessions. A token remains valid until expiry (24h) or explicit logout. This is standard SPA behavior.

**What is NOT possible today:**
- CSRF attacks (Bearer tokens are not automatically sent by browsers — see Finding 11)
- Token replay across origins (CORS restricts which origins can use the token)
- Token forgery (128+ character random UUIDs are cryptographically unguessable)

### Migration Cost Analysis

| Factor | Cost |
|--------|------|
| Backend changes | Add cookie middleware, set `Set-Cookie` header with `HttpOnly; Secure; SameSite=Strict`, change `getAuthenticatedUser` to read from cookie instead of Authorization header |
| Frontend changes | Remove `localStorage` token management from `AuthContext`, change `authFetch` to use `credentials: 'include'`, update CORS to allow credentials |
| CSRF protection | Must add CSRF tokens (double-submit or synchronizer token pattern) — cookie-based auth is vulnerable to CSRF |
| Regression risk | HIGH — every authenticated API call changes, all frontend pages that use `useAuth().token` must be updated, logout flow changes |
| Testing | All A13-1/A13-3 tests must be rewritten (they use Bearer tokens) |

### Decision: **KEEP NOW**

**Rationale:**
- Current risk is LOW (no XSS vectors found, token is opaque, server validates on every request)
- Migration cost is HIGH (backend + frontend + CSRF infrastructure + test rewrite)
- The system has no known XSS vulnerability
- Bearer tokens provide implicit CSRF resistance (see Finding 11)
- The system is a B2B internal procurement platform, not a high-traffic consumer app

**Recommended future phase:** If the platform adds user-generated content (comments, rich text), re-evaluate token storage. If a security audit requires httpOnly cookies for compliance, plan as a dedicated migration phase.

---

## 3. Finding 11 — CSRF Protection

### Current Implementation Evidence

| Aspect | Actual Implementation |
|--------|----------------------|
| Authentication mechanism | Bearer token in `Authorization` header |
| Cookie-based auth | **None** — zero cookie references in `api/server.ts` |
| CSRF middleware | **None** — `grep -c 'csrf\|CSRF' api/server.ts` = 0 |
| `SameSite` cookie attributes | N/A (no cookies used) |
| CORS credentials mode | Not enabled — `Access-Control-Allow-Credentials` is not set |

### Actual Risk Level Today: NONE (practical)

**Why CSRF is not a practical threat with Bearer tokens:**

1. **Bearer tokens are NOT automatically sent by browsers.** Unlike cookies, which browsers attach automatically to every request to the matching domain, Bearer tokens must be explicitly set in the `Authorization` header by JavaScript.

2. **Cross-origin requests cannot set custom headers.** A malicious website cannot send a `POST` request to the SHANAN API with an `Authorization: Bearer <token>` header unless:
   - The attacker already has the token (which requires XSS — see Finding 9)
   - The CORS policy allows the attacker's origin (CORS is restricted to localhost + preview domains)

3. **No cookies = no CSRF surface.** CSRF attacks exploit the browser's automatic cookie attachment behavior. Since the SHANAN API uses zero cookies, there is no CSRF attack surface.

### What Changes If Cookie Migration Happens

If Finding 9 is migrated to httpOnly cookies in the future:
- CSRF becomes a **real vulnerability** — browsers will automatically attach cookies to cross-origin requests
- CSRF tokens (double-submit or synchronizer pattern) must be implemented
- `SameSite=Strict` or `SameSite=Lax` must be set on all cookies
- CORS must enable `Access-Control-Allow-Credentials: true`

### Decision: **NO ACTION NOW**

**Rationale:**
- Bearer token authentication provides inherent CSRF resistance
- No cookies are used anywhere in the application
- Adding CSRF middleware now would be dead code — there is no cookie-based auth to protect
- CSRF protection is **REQUIRED WITH FUTURE COOKIE MIGRATION** — if Finding 9 is ever migrated, CSRF must be implemented simultaneously

---

## 4. Finding 13 — Monolithic CSS

### Current Implementation Evidence

| Aspect | Actual Implementation |
|--------|----------------------|
| File | `src/styles/components.css` |
| Size | 6,855 lines |
| Second file | `src/styles/global.css` (350 lines — design tokens, root variables, resets) |
| Total CSS | 7,205 lines |
| Loading | `import './styles/global.css'` + `import './styles/components.css'` in `main.tsx` |
| Structure | Organized by component (app layout, header, footer, catalog, portal, admin, etc.) with section comments |
| Design system | CSS custom properties (variables) defined in `:root` in `global.css` |
| Issues | No CSS modules, no scoped component styles, no Tailwind |

### Actual Risk Level Today: LOW

**Current maintainability assessment:**
1. The CSS is **organized** — section comments clearly delimit component groups (`/* ---- App Layout ---- */`, `/* ---- Header ---- */`, etc.)
2. The design system is **consistent** — all colors, spacing, and typography use CSS variables from `global.css`
3. The CSS **works** — no known rendering bugs or specificity wars
4. The CSS is **not causing functional problems** — production build succeeds, pages render correctly

**What is NOT a problem today:**
- No CSS conflicts between components (the codebase is small enough that the monolith is manageable)
- No performance issue (112KB minified, 16.8KB gzipped — acceptable for a B2B platform)
- No developer confusion (section comments make navigation straightforward)

**What IS a mild concern:**
- Adding new components requires editing a 6,855-line file
- No scoped styles means class name collisions are theoretically possible (though not observed in practice)

### Regression Risk of Splitting Now

| Factor | Risk |
|--------|------|
| Moving CSS to per-component files | MEDIUM — each component's CSS must be identified and extracted; missed styles will cause visual regressions |
| Adopting CSS modules | HIGH — requires renaming all class references in TSX files |
| Adopting Tailwind | VERY HIGH — complete rewrite of all styling |
| Keeping current structure | NONE — no change, no regression |

### Decision: **KEEP NOW**

**Rationale:**
- The CSS is functional, organized, and does not cause problems
- Splitting introduces regression risk with no functional benefit
- The file size (112KB / 16.8KB gzipped) is acceptable
- The codebase has ~46 source files — the CSS-to-component ratio is manageable
- Future refactoring should be incremental (extract new components into separate files going forward, without rewriting existing CSS)

**Recommended future approach:** When adding new pages or major components, create separate `.css` files for them rather than appending to `components.css`. Do not rewrite existing CSS.

---

## 5. Finding 22 — Storage Endpoint Public Access

### Current Implementation Evidence

| Aspect | Actual Implementation |
|--------|----------------------|
| Endpoint | `GET /api/storage/:key` — no authentication required |
| Route pattern | `/^\/api\/storage\/(.+)$/` — captures any path after `/api/storage/` |
| Path traversal protection | `isValidStorageKey()` rejects `..`, leading `/`, and non-alphanumeric characters |
| Storage contents | `storage/` directory is empty (no uploaded files persist after test cleanup) |
| Product images | 1 record: `products/prod-00001/001-sample.jpg` with `public_url: /shanan-logo.png` (sample data) |
| Product documents | 0 records (table exists but empty) |
| Storage keys | Include UUIDs + timestamps (e.g., `products/prod-xxx/000-1787037988093-test-img.png`) — effectively unguessable |

### What Is Currently Exposed

| Content Type | Current Exposure | Risk |
|-------------|-----------------|------|
| Product images | Public (intentional — customers need to see product images in the catalog) | NONE — this is by design |
| Product documents | 0 records exist — no documents are stored yet | NONE (today) |
| Internal documents | Same endpoint would serve them if documents are uploaded in the future | LOW (future risk) |

### Actual Risk Level Today: LOW

**What is realistically possible today:**
1. An attacker who knows a storage key (e.g., `products/prod-xxx/001-timestamp.png`) can access the file without authentication. However:
   - Storage keys contain UUIDs and timestamps — they are effectively unguessable
   - The only stored file is a sample SHANAN logo placeholder
   - No sensitive documents exist in the system

2. If product documents (PDFs, datasheets, internal specs) are uploaded in the future, they would be accessible via the same public endpoint.

**What is NOT a problem today:**
- No sensitive data is stored in the storage system
- Path traversal is blocked by `isValidStorageKey()`
- Storage keys are unguessable (UUID + timestamp)

### Future Policy Recommendation

| Content Type | Recommended Access Policy |
|-------------|--------------------------|
| Product images (catalog) | **PUBLIC** — customers must see product images. Keep current behavior. |
| Product documents (datasheets, specs) | **AUTHENTICATED** — require `requireAuth()` for document access. Documents may contain proprietary information. |
| Internal documents (supplier contracts, etc.) | **INTERNAL ONLY** — require `requireInternal()`. These should never be public. |

### Decision: **SMALL HARDENING NOW** (for future readiness)

**Rationale:**
- Today's risk is LOW (no sensitive data stored, keys unguessable, path traversal blocked)
- However, when real product data is imported with documents, the same public endpoint would expose them
- A small fix now (separate document serving endpoint with auth) prevents a future vulnerability

**Recommended fix (for future A13-4B):**
- Keep `GET /api/storage/:key` public for images only (key pattern: `products/**`)
- Add `GET /api/admin/storage/:key` with `requireInternal()` for documents (key pattern: `documents/**`)
- Or: add authentication to the storage endpoint and have the frontend pass the token when loading document URLs

**If deferred:** The system can operate safely today. The risk materializes only when documents are uploaded. Since document upload is not yet used at scale, this can wait until real document import begins.

---

## 6. Decision Matrix

| Finding | Current Risk | Change Now? | Recommendation | Future Phase |
|---------|-------------|-------------|----------------|-------------|
| 9 — Token in localStorage | LOW | No | **KEEP NOW** | Re-evaluate if user-generated content is added or compliance requires it |
| 11 — No CSRF | NONE (with Bearer tokens) | No | **NO ACTION NOW** | Required if cookie migration happens (coupled with Finding 9) |
| 13 — Monolithic CSS (6855 lines) | LOW | No | **KEEP NOW** | Incremental: new components get separate CSS files; existing CSS not rewritten |
| 22 — Storage endpoint public | LOW (no sensitive data yet) | Small fix for future | **SMALL HARDENING NOW** (or defer to A13-4B) | Add document-specific auth when real documents are imported |

---

## 7. Newly Discovered Critical Issues

**None.** No new critical vulnerabilities were discovered during this architectural review. The A13-1 fixes (authentication on user/customer endpoints) and A13-2 fixes (rate limiting + error boundary) have addressed the critical security gaps. The remaining architectural findings are low-risk design decisions, not active vulnerabilities.

---

## 8. Recommended A13 Closure Status

**A13 can be CLOSED** with the following status:

| Sub-phase | Status |
|-----------|--------|
| A13-0 (Audit) | COMPLETE |
| A13-0R (Reconciliation) | COMPLETE |
| A13-1 (Critical Auth Fixes) | COMPLETE |
| A13-2 (Rate Limiting + Error Boundary) | COMPLETE |
| A13-3 (Quality Infrastructure) | COMPLETE |
| A13-4A (Architectural Decisions) | COMPLETE |

**Optional A13-4B (Small targeted fixes):**
- Finding 22 storage hardening (add auth for document serving)
- This is the ONLY finding recommended for immediate implementation
- All other findings are KEEP NOW or NO ACTION NOW

---

## 9. Recommended Next Engineering Phase After A13

Based on the current project state:

1. **If A13-4B is approved:** Implement storage endpoint hardening (separate public image serving from authenticated document serving). This is a small, safe change.

2. **A14 (suggested):** Begin importing real SHANAN product data and ~16,000 images using the bulk import infrastructure built in A12. The system is architecturally ready for this — all import endpoints, storage abstraction, and product master are in place.

3. **A15 (suggested):** Begin implementing value-added features (ticker, sector news, etc.) as separately numbered phases, now that the core system is complete and security-hardened.

---

A13-4A STATUS: COMPLETE
