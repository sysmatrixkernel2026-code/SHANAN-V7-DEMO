-- ============================================================
-- SHANAN Engineering Knowledge Platform — SQLite Schema
-- Local persistence layer for the Supply Request workflow
-- and Customer Company foundation.
-- Safe to run repeatedly (every statement uses IF NOT EXISTS
-- or is a 

-- ============================================================
-- Phase A1 — Customer Company Foundation
-- The Customer Company is the primary commercial B2B entity.
-- Future phases will add Customer Users, Contacts, Credit
-- Applications, Purchase Orders — all as children of this table.
-- ============================================================
CREATE TABLE IF NOT EXISTS customer_companies (
  id              TEXT PRIMARY KEY,
  reference       TEXT NOT NULL UNIQUE,
  name_en         TEXT NOT NULL,
  name_ar         TEXT,
  email           TEXT,
  phone           TEXT,
  country         TEXT,
  city            TEXT,
  address         TEXT,
  tax_id          TEXT,
  account_status  TEXT NOT NULL DEFAULT 'pending'
                  CHECK (account_status IN ('pending','active','suspended','rejected','closed')),
  payment_mode    TEXT NOT NULL DEFAULT 'cash'
                  CHECK (payment_mode IN ('cash','credit')),
  created_at      TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at      TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

-- Indexes for customer_companies read paths
CREATE INDEX IF NOT EXISTS idx_customer_companies_reference
  ON customer_companies(reference);
CREATE INDEX IF NOT EXISTS idx_customer_companies_status
  ON customer_companies(account_status);
CREATE INDEX IF NOT EXISTS idx_customer_companies_name
  ON customer_companies(name_en);
CREATE INDEX IF NOT EXISTS idx_customer_companies_created_at
  ON customer_companies(created_at);

-- ============================================================
-- Phase A2 — Users, Roles & Access Foundation
-- Two access domains: internal (SHANAN staff) and customer.
-- Customer users are FK-linked to customer_companies.
-- Internal users have companyId = NULL.
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  email           TEXT NOT NULL UNIQUE,
  password_hash   TEXT,
  user_type       TEXT NOT NULL DEFAULT 'customer'
                  CHECK (user_type IN ('internal','customer','supplier')),
  role            TEXT NOT NULL DEFAULT 'customer_user'
                  CHECK (role IN ('admin','manager','employee','customer_admin','customer_user','supplier_admin','supplier_user')),
  company_id      TEXT,
  supplier_id     TEXT,
  is_active       INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at      TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  FOREIGN KEY (company_id) REFERENCES customer_companies(id) ON DELETE SET NULL,
  CHECK (
    (user_type = 'internal' AND company_id IS NULL AND supplier_id IS NULL) OR
    (user_type = 'customer' AND company_id IS NOT NULL AND supplier_id IS NULL) OR
    (user_type = 'supplier' AND supplier_id IS NOT NULL AND company_id IS NULL)
  )
);
-- The suppliers FK on users is added via ALTER TABLE after the suppliers table is
-- created (circular reference: suppliers.created_by → users.id). See Phase A9 below.

-- Indexes for users read paths
CREATE INDEX IF NOT EXISTS idx_users_email
  ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_user_type
  ON users(user_type);
CREATE INDEX IF NOT EXISTS idx_users_role
  ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_company_id
  ON users(company_id);
CREATE INDEX IF NOT EXISTS idx_users_is_active
  ON users(is_active);

-- ============================================================
-- Phase A4 — Credit Application Foundation
-- Controlled B2B workflow: customer submits → SHANAN reviews →
-- approve / reject / return for correction.
-- ============================================================
CREATE TABLE IF NOT EXISTS credit_applications (
  id                          TEXT PRIMARY KEY,
  customer_company_id         TEXT NOT NULL REFERENCES customer_companies(id) ON DELETE CASCADE,
  application_number          TEXT NOT NULL UNIQUE,
  status                      TEXT NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft','submitted','under_review','returned_for_correction','approved','rejected','cancelled')),
  requested_credit_limit      TEXT,
  requested_payment_terms     TEXT,
  requested_payment_method    TEXT,
  business_activity           TEXT,
  company_registration_number TEXT,
  tax_number                  TEXT,
  authorized_person_name      TEXT NOT NULL,
  authorized_person_title     TEXT,
  authorized_person_phone     TEXT,
  authorized_person_email     TEXT,
  requested_by_user_id        TEXT REFERENCES users(id) ON DELETE SET NULL,
  submitted_at                TEXT,
  reviewed_at                 TEXT,
  reviewed_by                 TEXT REFERENCES users(id) ON DELETE SET NULL,
  approval_notes              TEXT,
  rejection_reason            TEXT,
  created_at                  TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at                  TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

-- Indexes for credit_applications
CREATE INDEX IF NOT EXISTS idx_credit_applications_customer_company_id
  ON credit_applications(customer_company_id);
CREATE INDEX IF NOT EXISTS idx_credit_applications_application_number
  ON credit_applications(application_number);
CREATE INDEX IF NOT EXISTS idx_credit_applications_status
  ON credit_applications(status);
CREATE INDEX IF NOT EXISTS idx_credit_applications_created_at
  ON credit_applications(created_at);

-- ============================================================
-- Supply Request tables (Phase 1–5, unchanged)
-- ============================================================

-- Parent table: supply_requests
-- Phase A3: Added customer_company_id (nullable FK), customer_po_number, credit_application_id
-- These columns are added via ALTER TABLE for existing databases (see below).
CREATE TABLE IF NOT EXISTS supply_requests (
  id                  TEXT PRIMARY KEY,
  reference           TEXT NOT NULL UNIQUE,
  requester_name      TEXT NOT NULL,
  company_name        TEXT NOT NULL,
  email               TEXT NOT NULL,
  phone               TEXT NOT NULL,
  country             TEXT NOT NULL,
  city                TEXT NOT NULL,
  message             TEXT,
  status              TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','draft','submitted','under_review','processing','ready_for_commercial_action','reviewing','quoted','fulfilled','rejected','closed')),
  customer_company_id TEXT REFERENCES customer_companies(id) ON DELETE SET NULL,
  customer_po_number  TEXT,
  credit_application_id TEXT,
  official_doc_reference TEXT,
  closed_at           TEXT,
  closed_by           TEXT REFERENCES users(id) ON DELETE SET NULL,
  delivery_date       TEXT,
  created_at          TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at          TEXT
);

-- A3: Add columns to existing supply_requests table if they don't exist yet
-- (safe idempotent migration — ALTER TABLE ADD COLUMN is a no-op if the column already exists
-- because we catch the error and continue)
-- This runs at API startup after the schema file is executed.
-- The FK is enforced logically by the API validation layer, not by a SQLite FK constraint
-- on the ALTER TABLE column (SQLite doesn't support adding FK columns via ALTER TABLE).

-- Child table: supply_request_items
CREATE TABLE IF NOT EXISTS supply_request_items (
  id            BIGSERIAL PRIMARY KEY,
  request_id    TEXT NOT NULL,
  product_id    TEXT NOT NULL,
  product_name  TEXT NOT NULL,
  sku           TEXT NOT NULL,
  quantity      INTEGER NOT NULL CHECK (quantity > 0),
  notes         TEXT,
  FOREIGN KEY (request_id) REFERENCES supply_requests(id) ON DELETE CASCADE
);

-- Indexes for the most common read paths
CREATE INDEX IF NOT EXISTS idx_supply_request_items_request_id
  ON supply_request_items(request_id);
CREATE INDEX IF NOT EXISTS idx_supply_requests_reference
  ON supply_requests(reference);
CREATE INDEX IF NOT EXISTS idx_supply_requests_status
  ON supply_requests(status);
CREATE INDEX IF NOT EXISTS idx_supply_requests_created_at
  ON supply_requests(created_at);

-- Note: The idx_supply_requests_customer_company_id index is created by the
-- API server's A3 migration runner AFTER the ALTER TABLE ADD COLUMN statements
-- complete. This avoids a "no such column" error during schema initialization
-- on databases that already had supply_requests before Phase A3.

-- ============================================================
-- Phase A8 — Financial Account Records & Official Documents
-- SHANAN-controlled authoritative financial records.
-- Customers can only READ their own company's records.
-- ============================================================
CREATE TABLE IF NOT EXISTS customer_account_records (
  id                  TEXT PRIMARY KEY,
  customer_company_id TEXT NOT NULL REFERENCES customer_companies(id) ON DELETE CASCADE,
  supply_request_id   TEXT REFERENCES supply_requests(id) ON DELETE SET NULL,
  record_type         TEXT NOT NULL CHECK (record_type IN ('invoice','payment','adjustment')),
  reference           TEXT NOT NULL UNIQUE,
  description         TEXT,
  amount              DOUBLE PRECISION NOT NULL DEFAULT 0,
  due_date            TEXT,
  status              TEXT NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open','paid','partial','cancelled')),
  created_by          TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at          TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at          TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX IF NOT EXISTS idx_customer_account_records_company_id
  ON customer_account_records(customer_company_id);
CREATE INDEX IF NOT EXISTS idx_customer_account_records_supply_request_id
  ON customer_account_records(supply_request_id);
CREATE INDEX IF NOT EXISTS idx_customer_account_records_status
  ON customer_account_records(status);
CREATE INDEX IF NOT EXISTS idx_customer_account_records_reference
  ON customer_account_records(reference);

-- ============================================================
-- Phase A9 — Supplier Agreements & Product Mapping
-- INTERNAL SHANAN CONFIDENTIAL DATA — never exposed to customers.
--
-- Canonical sourcing relationship:
--   SUPPLIER
--     → SUPPLIER AGREEMENT
--       → AGREEMENT PRODUCT TERMS
--         → SHANAN APPROVED PRODUCT MASTER (canonical product_id)
--           → Price / Availability / Lead Time / Trade Terms / Credit Terms
--
-- The SHANAN product master lives in the in-memory catalog (src/data/mockData.ts).
-- agreement_product_terms.product_id is validated at the API layer against that
-- catalog (logical FK, mirroring the A3-FIX pattern for credit_application_id).
-- A SQLite FK is NOT used here because the products table is not persisted in SQLite.
-- ============================================================

-- --- A9.1 — Suppliers -----------------------------------------------------
-- Minimum internal supplier identity. No customer-facing endpoints expose this.
CREATE TABLE IF NOT EXISTS suppliers (
  id              TEXT PRIMARY KEY,
  reference       TEXT NOT NULL UNIQUE,             -- SUP-YYYY-NNNNNN
  name_en         TEXT NOT NULL,
  name_ar         TEXT,
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('pending','under_review','active','suspended','terminated')),
  country         TEXT,
  city            TEXT,
  address         TEXT,
  website         TEXT,
  contact_name    TEXT,
  contact_email   TEXT,
  contact_phone   TEXT,
  tax_id          TEXT,
  notes           TEXT,
  created_by      TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at      TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at      TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

-- Circular FK enforcement after both tables exist:
-- users.supplier_id → suppliers.id (added by migration 0002-era schema).
ALTER TABLE users
  ADD CONSTRAINT fk_users_supplier_id
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_suppliers_reference ON suppliers(reference);
CREATE INDEX IF NOT EXISTS idx_suppliers_status     ON suppliers(status);
CREATE INDEX IF NOT EXISTS idx_suppliers_name       ON suppliers(name_en);
CREATE INDEX IF NOT EXISTS idx_suppliers_created_at  ON suppliers(created_at);

-- --- A9.2 — Supplier Agreements -------------------------------------------
-- An agreement belongs to exactly one supplier. Stores trade terms,
-- payment/credit terms, and validity period at the agreement level.
CREATE TABLE IF NOT EXISTS supplier_agreements (
  id                      TEXT PRIMARY KEY,
  agreement_number        TEXT NOT NULL UNIQUE,    -- AGR-YYYYMMDD-XXXXXX
  supplier_id             TEXT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  status                  TEXT NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft','active','suspended','expired','terminated')),
  effective_from          TEXT,
  effective_to            TEXT,
  currency                TEXT NOT NULL DEFAULT 'JOD',
  payment_terms_days      INTEGER,                 -- e.g. 60 = Net 60
  supplier_credit_limit   TEXT,                    -- e.g. "50,000 JOD" (text — no fake numeric balances)
  trade_terms_notes       TEXT,
  internal_notes          TEXT,
  created_by              TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at              TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at              TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX IF NOT EXISTS idx_supplier_agreements_supplier_id     ON supplier_agreements(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_agreements_agreement_number ON supplier_agreements(agreement_number);
CREATE INDEX IF NOT EXISTS idx_supplier_agreements_status          ON supplier_agreements(status);
CREATE INDEX IF NOT EXISTS idx_supplier_agreements_created_at      ON supplier_agreements(created_at);

-- --- A9.3 — Agreement Product Terms ---------------------------------------
-- Maps a supplier's commercial terms to an existing SHANAN approved product.
-- product_id is validated at the API layer against the in-memory product master
-- (canonical product identity). It is NOT a second product catalog.
CREATE TABLE IF NOT EXISTS agreement_product_terms (
  id                       TEXT PRIMARY KEY,
  agreement_id             TEXT NOT NULL REFERENCES supplier_agreements(id) ON DELETE CASCADE,
  product_id                TEXT NOT NULL,           -- validated against in-memory catalog
  supplier_product_code     TEXT,                   -- supplier's own SKU/model code (internal mapping)
  supplier_product_name     TEXT,
  unit_price                DOUBLE PRECISION NOT NULL DEFAULT 0,
  currency                  TEXT,                   -- NULL inherits agreement.currency
  minimum_order_quantity    INTEGER,
  price_valid_from          TEXT,
  price_valid_to            TEXT,
  availability_status       TEXT NOT NULL DEFAULT 'available'
                           CHECK (availability_status IN ('available','limited','unavailable','expected')),
  available_quantity        INTEGER,
  availability_updated_at  TEXT,
  expected_available_date   TEXT,
  lead_time_days            INTEGER,
  status                    TEXT NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active','inactive')),
  internal_notes            TEXT,
  created_at                TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at                TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX IF NOT EXISTS idx_agreement_product_terms_agreement_id ON agreement_product_terms(agreement_id);
CREATE INDEX IF NOT EXISTS idx_agreement_product_terms_product_id  ON agreement_product_terms(product_id);
CREATE INDEX IF NOT EXISTS idx_agreement_product_terms_status       ON agreement_product_terms(status);

-- ============================================================
-- Phase A10 — Internal RFQ / Supplier Sourcing Workflow
-- INTERNAL SHANAN CONFIDENTIAL DATA — never exposed to customers.
--
-- Canonical sourcing chain:
--   SUPPLY REQUEST (existing)
--     → SUPPLY REQUEST ITEMS (existing)
--       → RFQ (one sourcing case per request, may be many)
--         → RFQ SUPPLIERS (recipients — must exist in A9 suppliers)
--         → RFQ ITEMS (originates from supply_request_items)
--           → RFQ SUPPLIER OFFERS (per-item per-supplier commercial response)
--
-- A10 deliberately does NOT implement supplier ranking, automatic winner
-- selection, scoring, or commercial quotation generation. A10 only stores
-- structured sourcing data for future evaluation.
-- ============================================================

-- --- A10.1 — RFQ header / sourcing case ----------------------------------
-- An RFQ belongs to exactly one existing supply_request (FK enforced).
-- It is created deliberately by an internal user — never auto-created.
CREATE TABLE IF NOT EXISTS rfqs (
  id                  TEXT PRIMARY KEY,
  reference           TEXT NOT NULL UNIQUE,             -- RFQ-YYYYMMDD-XXXXXX
  supply_request_id   TEXT NOT NULL REFERENCES supply_requests(id) ON DELETE CASCADE,
  status              TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','ready_to_send','sent','partially_responded','responded','closed','cancelled')),
  sent_at             TEXT,
  closed_at           TEXT,
  internal_notes      TEXT,
  created_by          TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at          TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at          TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX IF NOT EXISTS idx_rfqs_reference          ON rfqs(reference);
CREATE INDEX IF NOT EXISTS idx_rfqs_supply_request_id  ON rfqs(supply_request_id);
CREATE INDEX IF NOT EXISTS idx_rfqs_status             ON rfqs(status);
CREATE INDEX IF NOT EXISTS idx_rfqs_created_at         ON rfqs(created_at);

-- --- A10.2 — RFQ suppliers (recipients) -----------------------------------
-- Each row links one RFQ to one supplier. A supplier may appear at most once
-- per RFQ (UNIQUE constraint). The supplier MUST exist in A9 suppliers.
CREATE TABLE IF NOT EXISTS rfq_suppliers (
  id            TEXT PRIMARY KEY,
  rfq_id        TEXT NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
  supplier_id   TEXT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  -- Per-recipient workflow state: pending (default) | responded | declined
  response_state TEXT NOT NULL DEFAULT 'pending'
                 CHECK (response_state IN ('pending','responded','declined')),
  responded_at  TEXT,
  created_at    TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  UNIQUE (rfq_id, supplier_id)
);

CREATE INDEX IF NOT EXISTS idx_rfq_suppliers_rfq_id       ON rfq_suppliers(rfq_id);
CREATE INDEX IF NOT EXISTS idx_rfq_suppliers_supplier_id  ON rfq_suppliers(supplier_id);
CREATE INDEX IF NOT EXISTS idx_rfq_suppliers_response_state ON rfq_suppliers(response_state);

-- --- A10.3 — RFQ items ---------------------------------------------------
-- Each row sources one supply_request_item through this RFQ. The originating
-- request_item_id is preserved for traceability. The product_id is also stored
-- (canonical product identity, validated against the in-memory product master
-- by the API — same pattern as A9 agreement_product_terms).
CREATE TABLE IF NOT EXISTS rfq_items (
  id                  TEXT PRIMARY KEY,
  rfq_id              TEXT NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
  supply_request_item_id INTEGER NOT NULL REFERENCES supply_request_items(id) ON DELETE CASCADE,
  product_id          TEXT NOT NULL,                      -- validated at API layer
  product_name        TEXT NOT NULL,
  sku                 TEXT NOT NULL,
  requested_quantity  INTEGER NOT NULL CHECK (requested_quantity > 0),
  customer_notes      TEXT,                                -- copied from request item notes
  rfq_notes           TEXT,                                -- internal RFQ-specific notes
  created_at          TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  UNIQUE (rfq_id, supply_request_item_id)
);

CREATE INDEX IF NOT EXISTS idx_rfq_items_rfq_id                  ON rfq_items(rfq_id);
CREATE INDEX IF NOT EXISTS idx_rfq_items_supply_request_item_id ON rfq_items(supply_request_item_id);
CREATE INDEX IF NOT EXISTS idx_rfq_items_product_id              ON rfq_items(product_id);

-- --- A10.4 — RFQ supplier offers (per-item responses) --------------------
-- One row per (rfq_supplier, rfq_item). Stores structured commercial facts
-- needed for later internal evaluation. Currency/payment terms follow the
-- A9 convention (text strings, no fake numeric balances).
CREATE TABLE IF NOT EXISTS rfq_supplier_offers (
  id                  TEXT PRIMARY KEY,
  rfq_supplier_id     TEXT NOT NULL REFERENCES rfq_suppliers(id) ON DELETE CASCADE,
  rfq_item_id         TEXT NOT NULL REFERENCES rfq_items(id) ON DELETE CASCADE,
  -- Per-item offer status
  offer_status        TEXT NOT NULL DEFAULT 'pending'
                      CHECK (offer_status IN ('pending','quoted','declined','unavailable')),
  quoted_unit_price   DOUBLE PRECISION,                                -- nullable: only set when offer_status='quoted'
  currency            TEXT,                                -- e.g. 'JOD', 'USD'
  offered_quantity    INTEGER,                             -- may differ from requested_quantity
  lead_time_days      INTEGER,                             -- supplier's lead time for this item
  validity_date       TEXT,                                -- offer validity date
  minimum_order_quantity INTEGER,                           -- if different from agreement
  payment_terms      TEXT,                                 -- if provided
  commercial_notes   TEXT,                                 -- supplier's commercial notes
  responded_at       TEXT,                                -- when this offer was recorded
  created_at         TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at         TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  UNIQUE (rfq_supplier_id, rfq_item_id)
);

CREATE INDEX IF NOT EXISTS idx_rfq_supplier_offers_rfq_supplier_id ON rfq_supplier_offers(rfq_supplier_id);
CREATE INDEX IF NOT EXISTS idx_rfq_supplier_offers_rfq_item_id     ON rfq_supplier_offers(rfq_item_id);
CREATE INDEX IF NOT EXISTS idx_rfq_supplier_offers_offer_status    ON rfq_supplier_offers(offer_status);

-- ============================================================
-- Phase A11 — Internal Sourcing Evaluation & Decision
-- INTERNAL SHANAN CONFIDENTIAL DATA — never exposed to customers.
--
-- A11 is primarily a runtime evaluation engine: sourcing options are
-- derived on-the-fly from existing A9 (agreement_product_terms +
-- supplier_agreements) and A10 (rfq_supplier_offers + rfq_items +
-- rfq_suppliers) data. The evaluation itself is stateless.
--
-- Only the HUMAN-CONTROLLED final decision is persisted, so decisions
-- survive evaluation refreshes and are never silently overwritten when
-- underlying source data changes.
--
-- Multiple decisions per supply_request are allowed (audit history).
-- The latest decision by decided_at is the active one.
--
-- A11 does NOT auto-select suppliers. A recommendation is a suggestion
-- only; the final decision always requires an explicit internal action.
-- ============================================================

CREATE TABLE IF NOT EXISTS sourcing_decisions (
  id                          TEXT PRIMARY KEY,
  reference                   TEXT NOT NULL UNIQUE,             -- DEC-YYYYMMDD-XXXXXX
  supply_request_id           TEXT NOT NULL REFERENCES supply_requests(id) ON DELETE CASCADE,
  -- Decision state (controlled enum)
  decision_state              TEXT NOT NULL
                              CHECK (decision_state IN ('not_decided','recommended_for_review','selected','needs_more_sourcing','rejected')),
  -- Selected source — NULL when decision_state != 'selected'.
  -- The source_type discriminator determines which FK column is populated.
  selected_source_type        TEXT
                              CHECK (selected_source_type IS NULL OR selected_source_type IN ('agreement_term','rfq_offer')),
  -- Agreement-term source (only when selected_source_type='agreement_term')
  selected_agreement_term_id  TEXT REFERENCES agreement_product_terms(id) ON DELETE SET NULL,
  -- RFQ-offer source (only when selected_source_type='rfq_offer')
  selected_rfq_offer_id       TEXT REFERENCES rfq_supplier_offers(id) ON DELETE SET NULL,
  selected_rfq_item_id        TEXT REFERENCES rfq_items(id) ON DELETE SET NULL,
  -- Audit-safe decision snapshot — minimum immutable facts captured at decision time
  -- (so the decision remains meaningful even if source data later changes)
  snapshot_supplier_id       TEXT,                              -- the chosen supplier at decision time
  snapshot_product_id         TEXT,                              -- the canonical product
  snapshot_unit_price         DOUBLE PRECISION,                              -- price at decision time
  snapshot_currency           TEXT,                              -- currency at decision time
  snapshot_lead_time_days     INTEGER,                           -- lead time at decision time
  -- Human decision audit
  decision_notes              TEXT,
  decided_by                  TEXT NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  decided_at                  TEXT NOT NULL,
  created_at                  TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX IF NOT EXISTS idx_sourcing_decisions_supply_request_id ON sourcing_decisions(supply_request_id);
CREATE INDEX IF NOT EXISTS idx_sourcing_decisions_reference        ON sourcing_decisions(reference);
CREATE INDEX IF NOT EXISTS idx_sourcing_decisions_decision_state   ON sourcing_decisions(decision_state);
CREATE INDEX IF NOT EXISTS idx_sourcing_decisions_decided_by       ON sourcing_decisions(decided_by);
CREATE INDEX IF NOT EXISTS idx_sourcing_decisions_decided_at       ON sourcing_decisions(decided_at);

-- ============================================================
-- Phase P1 — Persistent Product Master
-- Replaces the in-memory mockData.ts product master with a
-- SQLite-backed canonical product catalog.
--
-- Tables:
--   categories          — product categories (bilingual)
--   brands              — product brands/manufacturers (bilingual)
--   products            — canonical product master (bilingual)
--   product_images      — image metadata (storage abstraction)
--   product_specifications  — product spec key/value pairs (bilingual)
--   product_technical_metadata — technical metadata key/value pairs
--   product_documents   — downloadable documents (PDFs, datasheets)
--
-- Design principles:
--   - Products are the single canonical source of truth
--   - product_id references in agreement_product_terms, rfq_items,
--     supply_request_items, and sourcing_decisions now validate
--     against the persisted products table (via API layer)
--   - Image binaries are NEVER stored in SQLite — only metadata
--   - Storage is abstracted via storage_provider + storage_key
-- ============================================================

-- --- P1.1 — Categories --------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
  id              TEXT PRIMARY KEY,
  slug            TEXT NOT NULL UNIQUE,
  name_en         TEXT NOT NULL,
  name_ar         TEXT,
  description_en  TEXT,
  description_ar  TEXT,
  parent_id       TEXT REFERENCES categories(id) ON DELETE SET NULL,
  image_url       TEXT,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  is_active       INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at      TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX IF NOT EXISTS idx_categories_slug      ON categories(slug);
CREATE INDEX IF NOT EXISTS idx_categories_parent_id  ON categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_categories_active     ON categories(is_active);
CREATE INDEX IF NOT EXISTS idx_categories_sort_order ON categories(sort_order);

-- --- P1.2 — Brands -------------------------------------------------------
CREATE TABLE IF NOT EXISTS brands (
  id              TEXT PRIMARY KEY,
  slug            TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  name_ar         TEXT,
  description_en  TEXT,
  description_ar  TEXT,
  logo_url        TEXT,
  country         TEXT,
  is_active       INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at      TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX IF NOT EXISTS idx_brands_slug   ON brands(slug);
CREATE INDEX IF NOT EXISTS idx_brands_active ON brands(is_active);
CREATE INDEX IF NOT EXISTS idx_brands_name   ON brands(name);

-- --- P1.3 — Products (canonical master) ---------------------------------
CREATE TABLE IF NOT EXISTS products (
  id              TEXT PRIMARY KEY,
  sku             TEXT NOT NULL UNIQUE,
  product_code    TEXT NOT NULL UNIQUE,
  slug            TEXT NOT NULL UNIQUE,
  name_en         TEXT NOT NULL,
  name_ar         TEXT,
  description_en  TEXT,
  description_ar  TEXT,
  category_id     TEXT REFERENCES categories(id) ON DELETE SET NULL,
  brand_id        TEXT REFERENCES brands(id) ON DELETE SET NULL,
  manufacturer    TEXT,
  availability    TEXT NOT NULL DEFAULT 'in_stock'
                  CHECK (availability IN ('in_stock','limited','out_of_stock','on_request')),
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','inactive','discontinued')),
  is_sample_data  INTEGER NOT NULL DEFAULT 0,    -- 1 = demo/sample, 0 = verified DOUBLE PRECISION product
  metadata_json   TEXT,                          -- flexible JSON for future extensions
  created_at      TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at      TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  sell_price      DOUBLE PRECISION,              -- retail sell price (JOD)
  currency        TEXT,                          -- price currency (e.g. 'JOD')
  stock_quantity  DOUBLE PRECISION               -- on-hand stock quantity
);

CREATE INDEX IF NOT EXISTS idx_products_sku         ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_product_code ON products(product_code);
CREATE INDEX IF NOT EXISTS idx_products_slug         ON products(slug);
CREATE INDEX IF NOT EXISTS idx_products_category_id  ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_brand_id     ON products(brand_id);
CREATE INDEX IF NOT EXISTS idx_products_availability ON products(availability);
CREATE INDEX IF NOT EXISTS idx_products_status       ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_name_en      ON products(name_en);
CREATE INDEX IF NOT EXISTS idx_products_created_at  ON products(created_at);

-- --- P1.4 — Product Images (storage abstraction) ------------------------
-- Stores image METADATA only. Binary data lives in the storage provider
-- (local filesystem for dev, S3-compatible object storage for production).
-- Designed for ~16,000 images with efficient batch lookup by product_id.
CREATE TABLE IF NOT EXISTS product_images (
  id              TEXT PRIMARY KEY,
  product_id      TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  storage_provider TEXT NOT NULL DEFAULT 'local'
                   CHECK (storage_provider IN ('local','s3','azure','gcs')),
  storage_key     TEXT NOT NULL,              -- path/key in the storage provider
  public_url      TEXT,                        -- pre-signed or CDN URL (nullable for local dev)
  filename        TEXT NOT NULL,
  mime_type       TEXT,                        -- e.g. 'image/jpeg', 'image/png'
  file_size       INTEGER,                    -- bytes
  width           INTEGER,                    -- pixels
  height          INTEGER,                    -- pixels
  checksum        TEXT,                       -- sha256 hash for dedup
  alt_en          TEXT,
  alt_ar          TEXT,
  is_primary      INTEGER NOT NULL DEFAULT 0,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at      TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX IF NOT EXISTS idx_product_images_product_id   ON product_images(product_id);
CREATE INDEX IF NOT EXISTS idx_product_images_storage_key  ON product_images(storage_key);
CREATE INDEX IF NOT EXISTS idx_product_images_is_primary   ON product_images(is_primary);
CREATE INDEX IF NOT EXISTS idx_product_images_sort_order   ON product_images(sort_order);
CREATE INDEX IF NOT EXISTS idx_product_images_checksum     ON product_images(checksum);

-- --- P1.5 — Product Specifications --------------------------------------
CREATE TABLE IF NOT EXISTS product_specifications (
  id              TEXT PRIMARY KEY,
  product_id      TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  label_en        TEXT NOT NULL,
  label_ar        TEXT,
  value_en        TEXT NOT NULL,
  value_ar        TEXT,
  group_en        TEXT,
  group_ar        TEXT,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX IF NOT EXISTS idx_product_specifications_product_id ON product_specifications(product_id);
CREATE INDEX IF NOT EXISTS idx_product_specifications_sort_order  ON product_specifications(sort_order);

-- --- P1.6 — Product Technical Metadata ---------------------------------
CREATE TABLE IF NOT EXISTS product_technical_metadata (
  id              TEXT PRIMARY KEY,
  product_id      TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  key_en          TEXT NOT NULL,
  key_ar          TEXT,
  value           TEXT NOT NULL,
  unit            TEXT,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX IF NOT EXISTS idx_product_technical_metadata_product_id ON product_technical_metadata(product_id);
CREATE INDEX IF NOT EXISTS idx_product_technical_metadata_sort_order  ON product_technical_metadata(sort_order);

-- --- P1.7 — Product Documents -------------------------------------------
CREATE TABLE IF NOT EXISTS product_documents (
  id              TEXT PRIMARY KEY,
  product_id      TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  title_en        TEXT NOT NULL,
  title_ar        TEXT,
  storage_provider TEXT NOT NULL DEFAULT 'local',
  storage_key     TEXT NOT NULL,
  public_url      TEXT,
  filename        TEXT NOT NULL,
  file_type       TEXT NOT NULL DEFAULT 'other'
                   CHECK (file_type IN ('pdf','doc','docx','xls','xlsx','dwg','other')),
  file_size       INTEGER,
  mime_type       TEXT,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX IF NOT EXISTS idx_product_documents_product_id  ON product_documents(product_id);
CREATE INDEX IF NOT EXISTS idx_product_documents_sort_order  ON product_documents(sort_order);

-- --- P1.8 — Import tracking (for bulk import audit) --------------------
CREATE TABLE IF NOT EXISTS import_jobs (
  id              TEXT PRIMARY KEY,
  job_type        TEXT NOT NULL
                   CHECK (job_type IN ('products','categories','brands','images','specifications','documents','technical_metadata')),
  status          TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','running','completed','failed','partial')),
  total_rows     INTEGER NOT NULL DEFAULT 0,
  created_count   INTEGER NOT NULL DEFAULT 0,
  updated_count   INTEGER NOT NULL DEFAULT 0,
  skipped_count   INTEGER NOT NULL DEFAULT 0,
  failed_count    INTEGER NOT NULL DEFAULT 0,
  error_log       TEXT,                        -- JSON array of errors
  started_at      TEXT,
  completed_at    TEXT,
  created_by      TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at      TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX IF NOT EXISTS idx_import_jobs_status    ON import_jobs(status);
CREATE INDEX IF NOT EXISTS idx_import_jobs_job_type  ON import_jobs(job_type);
CREATE INDEX IF NOT EXISTS idx_import_jobs_created_at ON import_jobs(created_at);

-- ============================================================
-- V1 — Procurement Engagement & Activity Intelligence
-- Records meaningful business events for analytics.
-- All identity comes from server-side auth context (never client-supplied).
-- No passwords, tokens, or secrets are stored.
-- ============================================================

CREATE TABLE IF NOT EXISTS activity_events (
  id              TEXT PRIMARY KEY,
  event_type      TEXT NOT NULL
                  CHECK (event_type IN (
                    'PLATFORM_SESSION_STARTED',
                    'CATALOG_VIEWED',
                    'PRODUCT_VIEWED',
                    'PRODUCT_SEARCHED',
                    'CATEGORY_VIEWED',
                    'SUPPLY_REQUEST_STARTED',
                    'SUPPLY_REQUEST_SUBMITTED',
                    'AGREEMENT_VIEWED',
                    'RFQ_CREATED',
                    'OFFER_RECORDED',
                    'EVALUATION_VIEWED',
                    'DECISION_RECORDED'
                  )),
  user_id         TEXT REFERENCES users(id) ON DELETE SET NULL,
  user_type       TEXT,
  company_id      TEXT,
  -- Optional workflow entity references (all nullable)
  product_id      TEXT,
  category_id     TEXT,
  supply_request_id TEXT,
  agreement_id    TEXT,
  rfq_id          TEXT,
  -- Optional metadata (size-limited, allowlisted by API)
  metadata        TEXT,
  -- Server timestamp (never client-supplied)
  created_at      TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX IF NOT EXISTS idx_activity_events_event_type ON activity_events(event_type);
CREATE INDEX IF NOT EXISTS idx_activity_events_user_id ON activity_events(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_events_company_id ON activity_events(company_id);
CREATE INDEX IF NOT EXISTS idx_activity_events_product_id ON activity_events(product_id);
CREATE INDEX IF NOT EXISTS idx_activity_events_category_id ON activity_events(category_id);
CREATE INDEX IF NOT EXISTS idx_activity_events_supply_request_id ON activity_events(supply_request_id);
CREATE INDEX IF NOT EXISTS idx_activity_events_created_at ON activity_events(created_at);

-- ============================================================
-- V3 — Internal Opportunity Action Layer
-- Persists V2-generated opportunities for employee action tracking.
-- Supports: status lifecycle, assignment, action history, dedup.
-- ============================================================

CREATE TABLE IF NOT EXISTS opportunities (
  id              TEXT PRIMARY KEY,
  opportunity_type TEXT NOT NULL
                  CHECK (opportunity_type IN (
                    'STARTED_REQUEST_NOT_SUBMITTED',
                    'REPEATED_PRODUCT_VIEWS_NO_SUBMISSION',
                    'PRODUCT_INTEREST_NO_CONVERSION'
                  )),
  -- Stable dedup key: prevents duplicate work items for the same underlying issue
  dedup_key       TEXT NOT NULL UNIQUE,
  -- Evidence snapshot at creation time
  rule            TEXT NOT NULL,
  user_id         TEXT REFERENCES users(id) ON DELETE SET NULL,
  company_id      TEXT,
  product_id      TEXT,
  reason          TEXT NOT NULL,
  evidence_json   TEXT,
  -- Operational status
  status          TEXT NOT NULL DEFAULT 'NEW'
                  CHECK (status IN ('NEW','UNDER_REVIEW','CONTACTED','CONVERTED','DISMISSED')),
  assigned_to     TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_by      TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at      TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at      TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX IF NOT EXISTS idx_opportunities_status ON opportunities(status);
CREATE INDEX IF NOT EXISTS idx_opportunities_assigned_to ON opportunities(assigned_to);
CREATE INDEX IF NOT EXISTS idx_opportunities_user_id ON opportunities(user_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_product_id ON opportunities(product_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_dedup_key ON opportunities(dedup_key);

CREATE TABLE IF NOT EXISTS opportunity_actions (
  id              TEXT PRIMARY KEY,
  opportunity_id  TEXT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  action_type     TEXT NOT NULL
                  CHECK (action_type IN (
                    'REVIEWED','CONTACT_ATTEMPTED','CUSTOMER_CONTACTED',
                    'FOLLOW_UP_REQUIRED','QUOTE_REQUESTED','CONVERTED','DISMISSED',
                    'ASSIGNED','REASSIGNED','STATUS_CHANGED'
                  )),
  actor_id        TEXT NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  note            TEXT,
  previous_status TEXT,
  new_status      TEXT,
  created_at      TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX IF NOT EXISTS idx_opportunity_actions_opportunity_id ON opportunity_actions(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_opportunity_actions_actor_id ON opportunity_actions(actor_id);
CREATE INDEX IF NOT EXISTS idx_opportunity_actions_action_type ON opportunity_actions(action_type);
CREATE INDEX IF NOT EXISTS idx_opportunity_actions_created_at ON opportunity_actions(created_at);

-- ============================================================
-- V6 — Internal Follow-up Task Queue
-- Discrete operational tasks derived from opportunities.
-- Distinct from opportunity_actions (which is an audit trail):
--   - follow_up_tasks are actionable work items (employee-controlled)
--   - opportunity_actions are historical records (system + employee)
-- Each task links to exactly one opportunity (CASCADE on opportunity delete).
-- dedup_key prevents accidental duplicate tasks for the same opportunity + title.
-- Priority values are compatible with V5 levels (CRITICAL/HIGH/MEDIUM/LOW).
-- ============================================================

CREATE TABLE IF NOT EXISTS follow_up_tasks (
  id                TEXT PRIMARY KEY,
  opportunity_id    TEXT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  -- dedup_key = sha-like stable hash of (opportunity_id + ':' + normalized title)
  -- prevents accidental re-creation of the same task on the same opportunity.
  dedup_key         TEXT NOT NULL UNIQUE,
  title             TEXT NOT NULL,
  description       TEXT,
  -- Controlled status lifecycle: PENDING → IN_PROGRESS → COMPLETED | CANCELLED
  status            TEXT NOT NULL DEFAULT 'PENDING'
                    CHECK (status IN ('PENDING','IN_PROGRESS','COMPLETED','CANCELLED')),
  -- Priority compatible with V5 deterministic levels (manual employee-set; not auto-derived)
  priority          TEXT NOT NULL DEFAULT 'MEDIUM'
                    CHECK (priority IN ('CRITICAL','HIGH','MEDIUM','LOW')),
  -- assignee (internal user; nullable = unassigned). Mirrors V3 assignment model.
  assignee_user_id  TEXT REFERENCES users(id) ON DELETE SET NULL,
  -- Actor who created the task (always from server-side auth, never client-supplied)
  created_by        TEXT REFERENCES users(id) ON DELETE SET NULL,
  due_date          TEXT,
  created_at        TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at        TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX IF NOT EXISTS idx_follow_up_tasks_opportunity_id ON follow_up_tasks(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_follow_up_tasks_assignee_user_id ON follow_up_tasks(assignee_user_id);
CREATE INDEX IF NOT EXISTS idx_follow_up_tasks_status ON follow_up_tasks(status);
CREATE INDEX IF NOT EXISTS idx_follow_up_tasks_priority ON follow_up_tasks(priority);
CREATE INDEX IF NOT EXISTS idx_follow_up_tasks_dedup_key ON follow_up_tasks(dedup_key);
CREATE INDEX IF NOT EXISTS idx_follow_up_tasks_created_at ON follow_up_tasks(created_at);

-- ============================================================
-- Phase B1 — Purchase Request & Purchase Order
-- Extends the sourcing chain into procurement execution.
--
-- Business chain:
--   SORCING DECISION (A11, decision_state='selected')
--     → PURCHASE REQUEST (B1)
--       → APPROVED
--         → PURCHASE ORDER (B1)
--           → ISSUED TO SUPPLIER
--
-- Design rules:
--   - UUID TEXT PKs (matches all existing Bun DB tables)
--   - FK to sourcing_decisions for audit traceability
--   - FK to suppliers (Bun DB A9 suppliers table)
--   - FK to rfq_supplier_offers when source is RFQ-based
--   - Products referenced via products table (Bun DB P1)
--   - No duplicate procurement concepts
-- ============================================================

-- --- B1.1 — Purchase Requests --------------------------------------------
-- Created from a sourcing decision with decision_state='selected'.
-- Each PR is for exactly one sourcing decision (one supplier, one product).
-- Multiple items per PR when the decision covers multiple products.
CREATE TABLE IF NOT EXISTS purchase_requests (
  id                      TEXT PRIMARY KEY,
  reference               TEXT NOT NULL UNIQUE,          -- PRR-YYYYMMDD-XXXXXX
  supply_request_id       TEXT NOT NULL REFERENCES supply_requests(id) ON DELETE CASCADE,
  sourcing_decision_id    TEXT NOT NULL REFERENCES sourcing_decisions(id) ON DELETE CASCADE,
  supplier_id             TEXT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  status                  TEXT NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft','submitted','approved','rejected','cancelled')),
  total_amount            DOUBLE PRECISION,
  currency                TEXT NOT NULL DEFAULT 'JOD',
  notes                   TEXT,
  approved_by             TEXT REFERENCES users(id) ON DELETE SET NULL,
  approved_at             TEXT,
  rejected_reason         TEXT,
  created_by              TEXT NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at              TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at              TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX IF NOT EXISTS idx_purchase_requests_reference       ON purchase_requests(reference);
CREATE INDEX IF NOT EXISTS idx_purchase_requests_supply_request_id ON purchase_requests(supply_request_id);
CREATE INDEX IF NOT EXISTS idx_purchase_requests_sourcing_decision_id ON purchase_requests(sourcing_decision_id);
CREATE INDEX IF NOT EXISTS idx_purchase_requests_supplier_id     ON purchase_requests(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_requests_status          ON purchase_requests(status);
CREATE INDEX IF NOT EXISTS idx_purchase_requests_created_at      ON purchase_requests(created_at);

-- --- B1.2 — Purchase Request Items ----------------------------------------
-- Line items on a purchase request. One row per product.
-- Preserves the product, quantity, price, and source reference at decision time.
CREATE TABLE IF NOT EXISTS purchase_request_items (
  id                      BIGSERIAL PRIMARY KEY,
  pr_id                   TEXT NOT NULL REFERENCES purchase_requests(id) ON DELETE CASCADE,
  product_id              TEXT NOT NULL,
  product_name            TEXT NOT NULL,
  sku                     TEXT NOT NULL,
  quantity                INTEGER NOT NULL CHECK (quantity > 0),
  unit_price              DOUBLE PRECISION,
  currency                TEXT,
  total_price             DOUBLE PRECISION,
  -- Source traceability (nullable: populated when source is RFQ offer)
  rfq_offer_id            TEXT REFERENCES rfq_supplier_offers(id) ON DELETE SET NULL,
  rfq_item_id             TEXT REFERENCES rfq_items(id) ON DELETE SET NULL,
  -- Snapshot from decision time (immutable audit trail)
  source_type             TEXT CHECK (source_type IN ('agreement_term','rfq_offer')),
  snapshot_lead_time_days INTEGER,
  notes                   TEXT,
  created_at              TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX IF NOT EXISTS idx_purchase_request_items_pr_id       ON purchase_request_items(pr_id);
CREATE INDEX IF NOT EXISTS idx_purchase_request_items_product_id  ON purchase_request_items(product_id);

-- --- B1.3 — Purchase Orders ----------------------------------------------
-- Created from an approved purchase request.
-- One PO per PR (1:1 relationship via purchase_request_id UNIQUE).
-- Issued to the supplier identified in the PR.
CREATE TABLE IF NOT EXISTS purchase_orders (
  id                      TEXT PRIMARY KEY,
  reference               TEXT NOT NULL UNIQUE,          -- PO-YYYYMMDD-XXXXXX
  purchase_request_id     TEXT NOT NULL UNIQUE REFERENCES purchase_requests(id) ON DELETE CASCADE,
  supply_request_id       TEXT NOT NULL REFERENCES supply_requests(id) ON DELETE CASCADE,
  supplier_id             TEXT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  status                  TEXT NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft','issued','confirmed','partially_received','received','cancelled')),
  total_amount            DOUBLE PRECISION,
  currency                TEXT NOT NULL DEFAULT 'JOD',
  issue_date              TEXT,
  expected_delivery       TEXT,
  actual_delivery         TEXT,
  notes                   TEXT,
  created_by              TEXT NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at              TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at              TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_reference            ON purchase_orders(reference);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_purchase_request_id  ON purchase_orders(purchase_request_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supply_request_id    ON purchase_orders(supply_request_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier_id          ON purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status               ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_created_at           ON purchase_orders(created_at);

-- --- B1.4 — Purchase Order Items -----------------------------------------
-- Line items on a purchase order. One row per product.
-- Mirrors the PR items but is a separate table for independent lifecycle.
CREATE TABLE IF NOT EXISTS purchase_order_items (
  id                      BIGSERIAL PRIMARY KEY,
  po_id                   TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  pr_item_id              INTEGER REFERENCES purchase_request_items(id) ON DELETE SET NULL,
  product_id              TEXT NOT NULL,
  product_name            TEXT NOT NULL,
  sku                     TEXT NOT NULL,
  quantity                INTEGER NOT NULL CHECK (quantity > 0),
  received_quantity       INTEGER NOT NULL DEFAULT 0 CHECK (received_quantity >= 0),
  unit_price              DOUBLE PRECISION,
  currency                TEXT,
  total_price             DOUBLE PRECISION,
  notes                   TEXT,
  created_at              TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX IF NOT EXISTS idx_purchase_order_items_po_id       ON purchase_order_items(po_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_product_id  ON purchase_order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_pr_item_id  ON purchase_order_items(pr_item_id);

-- ============================================================
-- STEP 17 — Supplier Product Catalog
-- Allows suppliers to maintain their own commercial relationship
-- with existing SHANAN master products without duplicating them.
-- ============================================================
CREATE TABLE IF NOT EXISTS supplier_products (
  id                       TEXT PRIMARY KEY,
  supplier_id              TEXT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  product_id               TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  supplier_sku             TEXT,
  supplier_product_name    TEXT,
  unit_price               DOUBLE PRECISION,
  currency                 TEXT NOT NULL DEFAULT 'JOD',
  minimum_order_quantity   INTEGER CHECK (minimum_order_quantity IS NULL OR minimum_order_quantity > 0),
  lead_time_days           INTEGER CHECK (lead_time_days IS NULL OR lead_time_days >= 0),
  availability_status      TEXT NOT NULL DEFAULT 'available'
                           CHECK (availability_status IN ('available','limited','unavailable','expected')),
  payment_terms            TEXT,
  notes                    TEXT,
  is_active                INTEGER NOT NULL DEFAULT 1,
  created_at               TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at               TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  UNIQUE (supplier_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_supplier_products_supplier_id      ON supplier_products(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_products_product_id       ON supplier_products(product_id);
CREATE INDEX IF NOT EXISTS idx_supplier_products_is_active        ON supplier_products(is_active);
CREATE INDEX IF NOT EXISTS idx_supplier_products_availability     ON supplier_products(availability_status);

-- ============================================================
-- STEP 17 PHASE 2 — Notifications
-- Lightweight in-app notification system for supplier workflow events.
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type      TEXT NOT NULL,
  title_en        TEXT NOT NULL,
  title_ar        TEXT,
  body_en         TEXT,
  body_ar         TEXT,
  entity_type     TEXT,
  entity_id       TEXT,
  is_read         INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id      ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read      ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_event_type   ON notifications(event_type);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at   ON notifications(created_at);
