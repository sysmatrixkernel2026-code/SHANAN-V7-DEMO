# V3-Z-INTERNAL-OPPORTUNITY-ACTION-LAYER-REPORT.md
## SHANAN Engineering Knowledge Platform — Internal Opportunity Action Layer
## Phase V3

**Date:** 2026-08-18
**Executor:** Z / GLM-5.2 — Main Engineering Executor
**Codebase:** `/home/z/my-project/upload/src-only/` (V2 complete)

---

## 1. V3 Scope

Convert V2's read-only opportunity queue into a controlled internal employee action workflow:
- V3-1: Opportunity persistence with deduplication
- V3-2: Status lifecycle (NEW → UNDER_REVIEW → CONTACTED → CONVERTED → DISMISSED)
- V3-3: Assignment to internal users
- V3-4: Action history with controlled action types
- V3-5: Outcome recording via status + action types
- V3-6: Duplicate/repeat control via stable dedup keys
- V3-7: Internal API endpoints
- V3-8: No frontend (backend-only — minimal scope)

---

## 2. Actual V2 Baseline Inspected

V2 generates opportunities **dynamically** via SQL queries on `activity_events` — no persistence. Each call to `GET /api/admin/activity/opportunities` recomputes from live data. V3 adds a persistence layer on top of V2's rules.

---

## 3. Opportunity Persistence Decision

**Persisted.** Two new tables added:
- `opportunities` — stores tracked opportunities with stable dedup keys
- `opportunity_actions` — stores action history per opportunity

V2's dynamic endpoint is kept unchanged. V3 adds a `sync` endpoint that persists V2-generated opportunities into the `opportunities` table.

---

## 4. Exact Schema Changes

**2 new tables (25 total):**

### `opportunities`
- `id` (TEXT PK)
- `opportunity_type` (CHECK: 3 types)
- `dedup_key` (TEXT NOT NULL UNIQUE) — prevents duplicates
- `rule` (TEXT — RULE_A / RULE_B / RULE_C)
- `user_id` (FK → users)
- `company_id` (TEXT)
- `product_id` (TEXT)
- `reason` (TEXT)
- `evidence_json` (TEXT — snapshot at creation)
- `status` (CHECK: NEW/UNDER_REVIEW/CONTACTED/CONVERTED/DISMISSED)
- `assigned_to` (FK → users)
- `created_by` (FK → users)
- `created_at`, `updated_at`
- 5 indexes

### `opportunity_actions`
- `id` (TEXT PK)
- `opportunity_id` (FK → opportunities ON DELETE CASCADE)
- `action_type` (CHECK: 10 types)
- `actor_id` (FK → users — always from server-side auth)
- `note` (TEXT — max 500 chars, validated by API)
- `previous_status`, `new_status` (TEXT — for status change tracking)
- `created_at`
- 4 indexes

---

## 5. Opportunity Identity/Deduplication Strategy

**Stable dedup key** per opportunity type + entity:
- RULE_A/RULE_B: `dedup_key = "TYPE:user_id"` (one per user per type)
- RULE_C: `dedup_key = "TYPE:product_id"` (one per product per type)

**Sync behavior:** `POST /api/admin/activity/opportunities/sync` generates opportunities from V2 rules. If an opportunity with the same `dedup_key` already exists, it is **skipped** (not duplicated). Only opportunities that don't exist yet are created.

**Verified:** First sync created 4 opportunities. Second sync created 0, skipped 4.

---

## 6. Status Lifecycle

```
NEW → UNDER_REVIEW → CONTACTED → CONVERTED
                                    ↓
                              DISMISSED (from any status)
```

Status transitions are validated server-side. Invalid status values are rejected with 400. Some action types auto-trigger status changes:
- `REVIEWED` on a `NEW` opportunity → auto-sets `UNDER_REVIEW`
- `CUSTOMER_CONTACTED` → auto-sets `CONTACTED`
- `CONVERTED` → auto-sets `CONVERTED`
- `DISMISSED` → auto-sets `DISMISSED`

---

## 7. Assignment Model

- `assigned_to` field on `opportunities` table (FK → `users.id`)
- Only internal users can be assigned (verified server-side)
- Assignment to nonexistent users → 422 rejected
- Assignment to customer users → 400 rejected
- Reassignment records `REASSIGNED` action; first assignment records `ASSIGNED`
- Actor identity always from `auth.user.id` (never client-supplied)

---

## 8. Action History Model

10 controlled action types: `REVIEWED`, `CONTACT_ATTEMPTED`, `CUSTOMER_CONTACTED`, `FOLLOW_UP_REQUIRED`, `QUOTE_REQUESTED`, `CONVERTED`, `DISMISSED`, `ASSIGNED`, `REASSIGNED`, `STATUS_CHANGED`

Each action record includes: opportunity_id, action_type, actor_id (from auth), note (max 500 chars), previous_status, new_status, timestamp.

---

## 9. Outcome Model

Outcomes are recorded via:
1. **Status changes** — `PATCH /opportunities/:id` with `status` field
2. **Action types** — `POST /opportunities/:id/actions` with action types like `CONVERTED` or `DISMISSED`
3. **Auto-status from actions** — certain action types automatically update the opportunity status

The system distinguishes:
- **System evidence** (from V2 activity_events) — why the opportunity exists
- **Employee-recorded outcome** (from V3 opportunity_actions) — what the employee did

---

## 10-13. Files / Endpoints

### Files Created
None (backend-only, all changes in existing files)

### Files Modified

| File | Change |
|------|--------|
| `db/schema.sql` | Added `opportunities` + `opportunity_actions` tables + 9 indexes |
| `api/server.ts` | Added 5 V3 API endpoints + 2 helper functions |

### API Endpoints Added

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/admin/activity/opportunities/sync` | `requireInternal` | Sync V2 opportunities into persistence (dedup by dedup_key) |
| GET | `/api/admin/activity/opportunities/tracked` | `requireInternal` | List persisted opportunities (optional `?status=` filter) |
| GET | `/api/admin/activity/opportunities/:id` | `requireInternal` | Get single opportunity + action history |
| PATCH | `/api/admin/activity/opportunities/:id` | `requireInternal` | Update status or assignment |
| POST | `/api/admin/activity/opportunities/:id/actions` | `requireInternal` | Record an action |

### Authorization per Endpoint

All 5 endpoints use `requireInternal()` — unauthenticated → 401, customer → 403, internal → 200.

---

## 14. Identity Spoof Protection

Actor identity is **always** derived from `auth.user.id` (server-side). The `actor_id` field in `opportunity_actions` and `assigned_to` / `created_by` in `opportunities` are set from the authenticated session, never from client-supplied body fields.

---

## 15-19. Verification Results

### Test Results (All Actually Executed)

| # | Test | Result |
|---|------|--------|
| 1 | Sync creates opportunities from V2 rules | **PASS** — created=4, skipped=0 |
| 2 | Sync again — dedup prevents duplicates | **PASS** — created=0, skipped=4 |
| 3 | List tracked opportunities | **PASS** — 4 opportunities returned |
| 4 | Get single opportunity + actions | **PASS** — detail + 0 actions |
| 5 | Update status NEW→UNDER_REVIEW | **PASS** — status=UNDER_REVIEW |
| 6 | Record REVIEWED action | **PASS** — action id returned |
| 7 | Assign to admin user | **PASS** — assigned_to set |
| 8 | Invalid status rejected | **PASS** — 400 with validation error |
| 9 | Invalid action type rejected | **PASS** — 400 with validation error |
| 10 | Assignment to nonexistent user rejected | **PASS** — 422 "user not found" |
| 11 | Unauth access → 401 | **PASS** — all 3 endpoints |
| 12 | Customer access → 403 | **PASS** — all endpoints |
| 13 | Action history persists | **PASS** — 2 actions (STATUS_CHANGED + REVIEWED) |
| 14 | TypeScript | **PASS** — 0 errors |
| 15 | Production build | **PASS** — 75 modules, 12.90s |
| 16 | A13-3 tests | **PASS** — 24 pass, 0 fail |
| 17 | A13-1 auth regression | **PASS** — 401 on users/customers, 200 on products |
| 18 | DB FK integrity | **PASS** — `foreign_key_check = []` |
| 19 | V1 event recording | **PASS** — events still recorded |
| 20 | V2 opportunity generation | **PASS** — still works (dynamic endpoint unchanged) |

### Action History Evidence

```
actions: 2
  - STATUS_CHANGED | actor=V3A | note=Reviewing this opportunity | new_status=UNDER_REVIEW
  - REVIEWED | actor=V3A | note=Reviewed user activity | new_status=None
```

---

## 20-23. Regression Results

| Check | Result |
|-------|--------|
| V1 activity event creation | **PASS** |
| V2 customer/product insights | **PASS** |
| V2 dynamic opportunity generation | **PASS** (unchanged) |
| A14 workflow (products, SR, RFQ) | **PASS** |
| A13-1 auth (401 on users/customers) | **PASS** |
| A13-3 tests (24 pass, 0 fail) | **PASS** |
| DB FK integrity | **PASS** (`[]`) |

---

## 24-27. Build/API/DB Results

| Check | Result |
|-------|--------|
| TypeScript | **PASS** (0 errors) |
| Production build | **PASS** (75 modules, 12.90s) |
| API runtime | **PASS** (health 200, all endpoints functional) |
| DB integrity | **PASS** (`foreign_key_check = []`, 25 tables) |

---

## 28. Tests NOT Executed

| Test | Reason |
|------|--------|
| Browser-level frontend test | CLI-only environment — V3 is backend-only |
| Assignment to customer user rejected | Not tested with a customer user ID specifically — logic verified by code inspection (checks `user_type !== 'internal'`) |

---

## 29. Future Capabilities NOT Implemented

| Item | Status |
|------|--------|
| AI chatbot | NOT IMPLEMENTED |
| LLM integration | NOT IMPLEMENTED |
| Autonomous agents | NOT IMPLEMENTED |
| Automatic customer messaging | NOT IMPLEMENTED |
| WhatsApp/email integration | NOT IMPLEMENTED |
| Campaign automation | NOT IMPLEMENTED |
| Recommendation engine | NOT IMPLEMENTED |
| Predictive ML | NOT IMPLEMENTED |
| External CRM integration | NOT IMPLEMENTED |
| Admin dashboard UI page | NOT IMPLEMENTED |
| Token architecture migration | NOT IMPLEMENTED |
| CSS refactor | NOT IMPLEMENTED |

---

## 30. Recommended Next Phase

Based on V3 completion, the recommended next phase is:

**V4 — Internal Operational Dashboard**
- Add an admin UI page (`/admin/opportunities`) for browsing, filtering, and acting on opportunities
- Show opportunity detail with evidence, status, assignment, and action history
- Integrate with existing admin navigation

This recommendation is based on the V3 backend being complete and the need for a visual interface for internal staff to efficiently review opportunities.

---

V3 STATUS: COMPLETE
