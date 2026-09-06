// ============================================================
// SHANAN Engineering Knowledge Platform Ã¢â‚¬â€ Local Supply Request API
// Runtime: Bun (built-in Bun.serve + bun:sqlite, no extra deps)
// Port: 3001  (Vite preview stays on 3000)
// ============================================================

import { Database } from 'bun:sqlite';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, join, sep } from 'node:path';
import PDFDocument from 'pdfkit';
// P1: Storage abstraction + bulk import + seed modules
import { getStorageProvider, generateImageStorageKey, getStorageConfig, getStorageBasePath, isValidStorageKey } from './storage';
import { importProducts, importCategories, importBrands, importImages, importSpecifications, importTechnicalMetadata, importDocuments } from './importer';
import { seedProductMaster } from './seed';
// A9: Import the canonical in-memory product master so the API can validate
// agreement_product_terms.product_id against the authoritative product identity.
// This is the same module the frontend catalog uses Ã¢â‚¬â€ single source of truth.

// --- Configuration -------------------------------------------------------
const DB_PATH = (process.env.DATABASE_URL || resolve(import.meta.dir, '../db/custom.db')).replace(/^file:/, '');
const SCHEMA_PATH = resolve(import.meta.dir, '../db/schema.sql');
const PORT = Number(process.env.PORT) || 3001;

// P2 alt: Demo/sample seeding is opt-in ONLY. Production MUST NOT auto-create demo data.
// Explicitly set SEED_DEMO_DATA=1 to enable demo product-master seeding on startup.
// On-demand seeding remains available via POST /api/admin/seed (requireInternal).
const SEED_DEMO_DATA = process.env.SEED_DEMO_DATA === '1';

// Environment-scoped CORS. Production MUST NOT auto-allow localhost/127.0.0.1/preview-*.z.ai.
// Development keeps the existing defaults + Z.ai preview. Production allow-list comes ONLY
// from EXTRA_CORS_ORIGINS. No wildcard ever added; no Access-Control-Allow-Credentials.
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const EXTRA_ORIGINS = (process.env.EXTRA_CORS_ORIGINS || '')
  .split(',').map((s) => s.trim()).filter(Boolean);

const DEV_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  // Caddy proxy on port 81 is what the browser actually sees as its origin
  // when the user views the live preview pane in Z.ai
  'http://127.0.0.1:81',
  'http://localhost:81',
];

const ALLOWED_ORIGINS = [...(IS_PRODUCTION ? [] : DEV_ORIGINS), ...EXTRA_ORIGINS];

// Z.ai preview domain is development-only (production must not auto-allow it).
const PREVIEW_ORIGIN_PATTERN = IS_PRODUCTION ? null : /^https?:\/\/preview-[a-f0-9-]+\.z\.ai$/;

// --- Database bootstrap -------------------------------------------------
if (!existsSync(dirname(DB_PATH))) mkdirSync(dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH, { create: true });
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');

if (!existsSync(SCHEMA_PATH)) {
  console.error(`[shanan-api] FATAL: schema file not found at ${SCHEMA_PATH}`);
  process.exit(1);
}

const schemaSql = readFileSync(SCHEMA_PATH, 'utf8');
// bun:sqlite's exec() runs the whole script (CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS, PRAGMA Ã¢â‚¬â€ all idempotent)
db.exec(schemaSql);

// --- A3: Migration for existing databases --------------------------------
// The schema.sql CREATE TABLE IF NOT EXISTS creates the full table for new
// databases. But for databases that already had supply_requests BEFORE Phase A3,
// we need to ALTER TABLE ADD COLUMN to add the new nullable columns.
// Each statement is wrapped in try/catch because SQLite throws if the column
// already exists (which it does on subsequent startups Ã¢â‚¬â€ that's expected).
const A3_MIGRATIONS = [
  'ALTER TABLE supply_requests ADD COLUMN customer_company_id TEXT',
  'ALTER TABLE supply_requests ADD COLUMN customer_po_number TEXT',
  'ALTER TABLE supply_requests ADD COLUMN credit_application_id TEXT',
  'CREATE INDEX IF NOT EXISTS idx_supply_requests_customer_company_id ON supply_requests(customer_company_id)',
];
for (const sql of A3_MIGRATIONS) {
  try {
    db.exec(sql);
    console.log(`[shanan-api] A3 migration applied: ${sql}`);
  } catch {
    // Column/index already exists Ã¢â‚¬â€ expected on subsequent startups
  }
}

// --- A5: Migration for password_hash column on users ----------------------
try {
  db.exec('ALTER TABLE users ADD COLUMN password_hash TEXT');
  console.log('[shanan-api] A5 migration applied: ALTER TABLE users ADD COLUMN password_hash');
} catch {
  // Column already exists Ã¢â‚¬â€ expected on subsequent startups
}

// --- A6: Migration for updated_at column on supply_requests ---------------
try {
  db.exec('ALTER TABLE supply_requests ADD COLUMN updated_at TEXT');
  console.log('[shanan-api] A6 migration applied: ALTER TABLE supply_requests ADD COLUMN updated_at');
} catch {
  // Column already exists Ã¢â‚¬â€ expected on subsequent startups
}

// --- A8: Migration for closure + official doc columns on supply_requests --
for (const col of ['official_doc_reference TEXT', 'closed_at TEXT', 'closed_by TEXT']) {
  try {
    db.exec(`ALTER TABLE supply_requests ADD COLUMN ${col}`);
    console.log(`[shanan-api] A8 migration applied: ALTER TABLE supply_requests ADD COLUMN ${col}`);
  } catch {}
}

// --- A5: Session table (simple token-based sessions) ---------------------
db.exec(`
  CREATE TABLE IF NOT EXISTS user_sessions (
    token          TEXT PRIMARY KEY,
    user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at     TEXT NOT NULL,
    created_at     TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);
`);

// --- STEP 17: Supplier Product Catalog ------------------------------------
// Additive migration — creates the supplier_products table if it does not exist.
db.exec(`
  CREATE TABLE IF NOT EXISTS supplier_products (
    id                       TEXT PRIMARY KEY,
    supplier_id              TEXT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    product_id               TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    supplier_sku             TEXT,
    supplier_product_name    TEXT,
    unit_price               REAL,
    currency                 TEXT NOT NULL DEFAULT 'JOD',
    minimum_order_quantity   INTEGER CHECK (minimum_order_quantity IS NULL OR minimum_order_quantity > 0),
    lead_time_days           INTEGER CHECK (lead_time_days IS NULL OR lead_time_days >= 0),
    availability_status      TEXT NOT NULL DEFAULT 'available'
                             CHECK (availability_status IN ('available','limited','unavailable','expected')),
    payment_terms            TEXT,
    notes                    TEXT,
    is_active                INTEGER NOT NULL DEFAULT 1,
    created_at               TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at               TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (supplier_id, product_id)
  );
  CREATE INDEX IF NOT EXISTS idx_supplier_products_supplier_id      ON supplier_products(supplier_id);
  CREATE INDEX IF NOT EXISTS idx_supplier_products_product_id       ON supplier_products(product_id);
  CREATE INDEX IF NOT EXISTS idx_supplier_products_is_active        ON supplier_products(is_active);
  CREATE INDEX IF NOT EXISTS idx_supplier_products_availability     ON supplier_products(availability_status);
`);
console.log('[shanan-api] STEP 17: supplier_products table ready');

// --- STEP 17 PHASE 2: Notifications table ---------------------------------
db.exec(`
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
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_notifications_user_id      ON notifications(user_id);
  CREATE INDEX IF NOT EXISTS idx_notifications_is_read      ON notifications(is_read);
  CREATE INDEX IF NOT EXISTS idx_notifications_event_type   ON notifications(event_type);
  CREATE INDEX IF NOT EXISTS idx_notifications_created_at   ON notifications(created_at);
`);
console.log('[shanan-api] STEP 17 PHASE 2: notifications table ready');

// --- STEP 18 PHASE 1: delivery_date column on supply_requests ---------------
try {
  db.exec('ALTER TABLE supply_requests ADD COLUMN delivery_date TEXT');
  console.log('[shanan-api] STEP 18 PHASE 1 migration applied: ALTER TABLE supply_requests ADD COLUMN delivery_date');
} catch {
  // Column already exists — expected on subsequent startups
}

console.log(`[shanan-api] Database ready at ${DB_PATH}`);
console.log(`[shanan-api] Schema applied from ${SCHEMA_PATH}`);

// P1: Auto-seed demo product master data on first run (idempotent — safe on restart).
// Guarded so production does not auto-create demo/sample data. Enabled only when SEED_DEMO_DATA=1.
if (SEED_DEMO_DATA) {
  try {
    const seedResult = seedProductMaster(db);
    if (seedResult.products > 0 || seedResult.categories > 0) {
      console.log(`[shanan-api] Product master seeded: ${seedResult.categories} categories, ${seedResult.brands} brands, ${seedResult.products} products (SAMPLE/DEMO data)`);
    }
  } catch (e) {
    console.warn('[shanan-api] Seed skipped:', e);
  }
}

// --- Helpers -------------------------------------------------------------
function originAllowed(origin: string | null): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  // PREVIEW_ORIGIN_PATTERN is null in production (dev-only Z.ai preview).
  if (PREVIEW_ORIGIN_PATTERN && PREVIEW_ORIGIN_PATTERN.test(origin)) return true;
  return false;
}

function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    // A9 adds PATCH and DELETE for supplier/agreement/product-term management
    'Access-Control-Allow-Methods': 'POST, GET, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    // STEP 19-A C3: minimal safe production security headers (applied to every API response).
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    // P3-1: Content-Security-Policy (Stage 2). Minimum safe policy for the
    // application's actual dependency graph. Every non-'self' source below is
    // required by the current frontend (see P3-1 report Phase B):
    //   - images.pexels.com   -> <img> on Home/HeroShowcase
    //   - fonts.googleapis.com-> <link> stylesheet (style-src) for Inter/Noto
    //     Sans Arabic; font files themselves come from fonts.gstatic.com (font-src)
    //   - style-src/'unsafe-inline' + style-src-attr -> CSS injected as <style>
    //     at runtime and pervasive React inline style= attributes (no nonce/hash
    //     infrastructure exists; 'unsafe-inline' is the app's real requirement).
    //   - script-src 'self'   -> no inline/external scripts (index.html has only
    //     an external module script; verified no eval/Function/dangerouslySet-)
    //   - object-src 'none'   -> no <object>/<embed>/<applet>
    //   - base-uri 'self'     -> no <base> elements
    //   - frame-ancestors 'self' -> framing lockdown (documented: enforced here on
    //     any document the API serves; the SPA served by a static host relies on
    //     that host's equivalent header/frame-ancestors for the document).
    //   - form-action 'self'  -> all forms submit via fetch (no native form action).
    'Content-Security-Policy':
      "default-src 'self'; script-src 'self'; " +
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "style-src-attr 'unsafe-inline'; img-src 'self' data: https://images.pexels.com; " +
      "font-src 'self' https://fonts.gstatic.com; " +
      "connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'; form-action 'self'",
  };
  if (originAllowed(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Vary'] = 'Origin';
  }
  return headers;
}

function jsonResponse(data: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders(origin),
    },
  });
}

function errorResponse(
  message: string,
  status: number,
  origin: string | null = null,
  extra: Record<string, unknown> = {},
) {
  // Never leak stack traces or internal error details to the frontend.
  return jsonResponse({ error: message, ...extra }, status, origin);
}

// --- A5: Authentication infrastructure ------------------------------------
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

// Simple password hashing using Bun's built-in crypto (PBKDF2).
// NOT plain text. The hash includes a random salt.
async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'],
  );
  const hash = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial, 256,
  );
  const combined = new Uint8Array(salt.length + hash.byteLength);
  combined.set(salt, 0);
  combined.set(new Uint8Array(hash), salt.length);
  return `pbkdf2$100000$${btoa(String.fromCharCode(...combined))}`;
}

async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (!storedHash || !storedHash.startsWith('pbkdf2$')) return false;
  const parts = storedHash.split('$');
  if (parts.length !== 3) return false;
  const iterations = parseInt(parts[1], 10);
  const combined = Uint8Array.from(atob(parts[2]), c => c.charCodeAt(0));
  const salt = combined.slice(0, 16);
  const expectedHash = combined.slice(16);
  const keyMaterial = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'],
  );
  const hash = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial, 256,
  );
  const hashBytes = new Uint8Array(hash);
  if (hashBytes.length !== expectedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < hashBytes.length; i++) diff |= hashBytes[i] ^ expectedHash[i];
  return diff === 0;
}

function generateSessionToken(): string {
  return crypto.randomUUID() + '-' + crypto.randomUUID();
}

interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  user_type: string;
  role: string;
  company_id: string | null;
  supplier_id: string | null;
  is_active: number;
}

// Extract and validate the session token from the Authorization header.
// Returns the authenticated user record, or null if not authenticated.
function getAuthenticatedUser(req: Request): AuthenticatedUser | null {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  if (!token) return null;
  try {
    const session = db.prepare(
      `SELECT s.user_id, s.expires_at, u.id, u.name, u.email, u.user_type, u.role, u.company_id, u.supplier_id, u.is_active
       FROM user_sessions s
       JOIN users u ON s.user_id = u.id
       WHERE s.token = ?`,
    ).get(token) as AuthenticatedUser & { expires_at: string } | null;
    if (!session) return null;
    // Check expiry
    if (new Date(session.expires_at) < new Date()) {
      db.prepare('DELETE FROM user_sessions WHERE token = ?').run(token);
      return null;
    }
    // Check if user is still active
    if (!session.is_active) return null;
    return session;
  } catch {
    return null;
  }
}

// Auth middleware: returns (user, errorResponse) Ã¢â‚¬â€ one is always null.
type AuthResult =
  | { user: AuthenticatedUser; error: null }
  | { user: null; error: Response };

function requireAuth(req: Request, origin: string | null): AuthResult {
  const user = getAuthenticatedUser(req);
  if (!user) {
    return {
      user: null,
      error: errorResponse('Authentication required', 401, origin),
    };
  }
  return { user, error: null };
}

// Require the user to be a SHANAN internal user (any internal role).
function requireInternal(req: Request, origin: string | null): AuthResult {
  const result = requireAuth(req, origin);
  if (result.error) return result;
  if (result.user.user_type !== 'internal') {
    return {
      user: null,
      error: errorResponse('Forbidden: internal access required', 403, origin),
    };
  }
  return result;
}

// Require a specific internal role (e.g., 'admin' for approval actions).
function requireInternalRole(req: Request, origin: string | null, roles: string[]): AuthResult {
  const result = requireInternal(req, origin);
  if (result.error) return result;
  if (!roles.includes(result.user.role)) {
    return {
      user: null,
      error: errorResponse(`Forbidden: requires one of roles: ${roles.join(', ')}`, 403, origin),
    };
  }
  return result;
}

// Require the user to be a supplier user (user_type = 'supplier') with a valid supplier link.
// Returns the authenticated user plus the supplier_id for downstream isolation checks.
type SupplierAuthResult =
  | { user: AuthenticatedUser; supplierId: string; error: null }
  | { user: null; supplierId: null; error: Response };

function requireSupplier(req: Request, origin: string | null): SupplierAuthResult {
  const result = requireAuth(req, origin);
  if (result.error) return { user: null, supplierId: null, error: result.error };
  if (result.user.user_type !== 'supplier') {
    return { user: null, supplierId: null, error: errorResponse('Forbidden: supplier access required', 403, origin) };
  }
  if (!result.user.supplier_id) {
    return { user: null, supplierId: null, error: errorResponse('Forbidden: supplier account not linked', 403, origin) };
  }
  // Verify supplier exists and is active
  const supplier = db.prepare('SELECT id, status FROM suppliers WHERE id = ?').get(result.user.supplier_id) as { id: string; status: string } | null;
  if (!supplier) {
    return { user: null, supplierId: null, error: errorResponse('Supplier account not found', 403, origin) };
  }
  if (supplier.status === 'suspended' || supplier.status === 'terminated') {
    return { user: null, supplierId: null, error: errorResponse('Supplier account is not active', 403, origin) };
  }
  if (supplier.status === 'pending' || supplier.status === 'under_review') {
    return { user: null, supplierId: null, error: errorResponse('Supplier account is pending approval', 403, origin) };
  }
  return { user: result.user, supplierId: result.user.supplier_id, error: null };
}

// Lighter supplier auth: allows pending/under_review suppliers (for profile + registration).
function requireSupplierAnyStatus(req: Request, origin: string | null): SupplierAuthResult {
  const result = requireAuth(req, origin);
  if (result.error) return { user: null, supplierId: null, error: result.error };
  if (result.user.user_type !== 'supplier') {
    return { user: null, supplierId: null, error: errorResponse('Forbidden: supplier access required', 403, origin) };
  }
  if (!result.user.supplier_id) {
    return { user: null, supplierId: null, error: errorResponse('Forbidden: supplier account not linked', 403, origin) };
  }
  const supplier = db.prepare('SELECT id, status FROM suppliers WHERE id = ?').get(result.user.supplier_id) as { id: string; status: string } | null;
  if (!supplier) {
    return { user: null, supplierId: null, error: errorResponse('Supplier account not found', 403, origin) };
  }
  if (supplier.status === 'suspended' || supplier.status === 'terminated') {
    return { user: null, supplierId: null, error: errorResponse('Supplier account is not active', 403, origin) };
  }
  return { user: result.user, supplierId: result.user.supplier_id, error: null };
}

function requireNotSupplier(req: Request, auth: AuthenticatedUser, origin: string | null): Response | null {
  if (auth.user_type === 'supplier') {
    return errorResponse('Forbidden: suppliers cannot access this resource', 403, origin);
  }
  return null;
}

// --- STEP 17 PHASE 2: Helper functions for RFQ state management + notifications ---

// Recompute a supplier's response_state based on their offers vs RFQ items.
function updateSupplierResponseState(rfqSupplierId: string, rfqId: string): void {
  const totalItems = (db.prepare('SELECT COUNT(*) AS cnt FROM rfq_items WHERE rfq_id = ?').get(rfqId) as { cnt: number }).cnt;
  const answeredItems = (db.prepare(
    `SELECT COUNT(*) AS cnt FROM rfq_supplier_offers WHERE rfq_supplier_id = ? AND offer_status IN ('quoted','declined','unavailable')`,
  ).get(rfqSupplierId) as { cnt: number }).cnt;
  const now = new Date().toISOString();
  if (totalItems > 0 && answeredItems >= totalItems) {
    db.prepare('UPDATE rfq_suppliers SET response_state = ?, responded_at = ? WHERE id = ?').run('responded', now, rfqSupplierId);
  } else if (answeredItems > 0) {
    db.prepare('UPDATE rfq_suppliers SET response_state = ?, responded_at = NULL WHERE id = ?').run('pending', rfqSupplierId);
  } else {
    db.prepare('UPDATE rfq_suppliers SET response_state = ?, responded_at = NULL WHERE id = ?').run('pending', rfqSupplierId);
  }
}

// Recompute RFQ aggregate status based on all suppliers' response states.
function updateRfqAggregateStatus(rfqId: string, now: string): void {
  const rfq = db.prepare('SELECT status FROM rfqs WHERE id = ?').get(rfqId) as { status: string } | null;
  if (!rfq || !['sent', 'partially_responded', 'responded'].includes(rfq.status)) return;
  const totalSuppliers = (db.prepare('SELECT COUNT(*) AS cnt FROM rfq_suppliers WHERE rfq_id = ?').get(rfqId) as { cnt: number }).cnt;
  const respondedSuppliers = (db.prepare(
    `SELECT COUNT(*) AS cnt FROM rfq_suppliers WHERE rfq_id = ? AND response_state = 'responded'`,
  ).get(rfqId) as { cnt: number }).cnt;
  const totalItems = (db.prepare('SELECT COUNT(*) AS cnt FROM rfq_items WHERE rfq_id = ?').get(rfqId) as { cnt: number }).cnt;
  const coveredItems = (db.prepare(
    `SELECT COUNT(DISTINCT rso.rfq_item_id) AS cnt FROM rfq_supplier_offers rso
      JOIN rfq_suppliers rs ON rso.rfq_supplier_id = rs.id WHERE rs.rfq_id = ?`,
  ).get(rfqId) as { cnt: number }).cnt;
  let newStatus: string | null = null;
  if (respondedSuppliers >= totalSuppliers && totalSuppliers > 0) {
    newStatus = 'responded';
  } else if (coveredItems > 0 && coveredItems < totalItems) {
    newStatus = 'partially_responded';
  } else if (coveredItems >= totalItems && totalItems > 0) {
    // All items have at least one offer — but check if all suppliers have responded
    if (respondedSuppliers >= totalSuppliers) {
      newStatus = 'responded';
    } else {
      newStatus = 'partially_responded';
    }
  }
  if (newStatus && newStatus !== rfq.status) {
    db.prepare('UPDATE rfqs SET status = ?, updated_at = ? WHERE id = ?').run(newStatus, now, rfqId);
  }
}

// Create an in-app notification for a user.
function createNotification(
  userId: string,
  eventType: string,
  titleEn: string,
  titleAr: string,
  bodyEn: string,
  bodyAr: string,
  entityType: string | null,
  entityId: string | null,
): void {
  try {
    const id = generateId();
    db.prepare(
      `INSERT INTO notifications (id, user_id, event_type, title_en, title_ar, body_en, body_ar, entity_type, entity_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, userId, eventType, titleEn, titleAr, bodyEn, bodyAr, entityType, entityId, new Date().toISOString());
  } catch (err) {
    console.error('[shanan-api] Notification create failed:', err);
  }
}

// Safe user info for /api/auth/me (no password_hash, no sensitive fields).
function safeUserInfo(user: AuthenticatedUser) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    userType: user.user_type,
    role: user.role,
    companyId: user.company_id,
    supplierId: user.supplier_id,
    isActive: !!user.is_active,
  };
}

// Reference: SHN-YYYYMMDD-XXXXXX (6 hex chars => ~16M combos per day)
function generateReference(): string {
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const random = Math.random().toString(16).slice(2, 8).toUpperCase().padStart(6, '0');
  return `SHN-${ymd}-${random}`;
}

function generateId(): string {
  return crypto.randomUUID();
}

// --- P1: Canonical product master (SQLite-backed) ------------------------
// The SHANAN product master now lives in SQLite (products table).
// All product validation queries the persisted database — no more in-memory
// mockProducts. This is the single canonical product identity source.
function isValidProductId(productId: string): boolean {
  const row = db.prepare('SELECT id FROM products WHERE id = ? AND status = ?').get(productId, 'active') as any;
  return !!row;
}
function getProductSummary(productId: string): { id: string; sku: string; productCode: string; nameEn: string } | null {
  const p = db.prepare('SELECT id, sku, product_code, name_en FROM products WHERE id = ?').get(productId) as any;
  if (!p) return null;
  return { id: p.id, sku: p.sku, productCode: p.product_code, nameEn: p.name_en || '' };
}

// --- A9: Reference generators (suppliers + agreements) -------------------
// Format: SUP-YYYY-NNNNNN (year + 6-char alphanumeric) Ã¢â‚¬â€ matches existing
// customer reference (CUS-YYYY-NNNNNN) convention.
function generateSupplierReference(): string {
  const year = new Date().getFullYear();
  const random = Math.random().toString(36).slice(2, 8).toUpperCase().padStart(6, '0');
  return `SUP-${year}-${random}`;
}
// Format: AGR-YYYYMMDD-XXXXXX Ã¢â‚¬â€ matches existing supply-request SHN-YYYYMMDD-XXXXXX convention.
function generateAgreementNumber(): string {
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const random = Math.random().toString(36).slice(2, 8).toUpperCase().padStart(6, '0');
  return `AGR-${ymd}-${random}`;
}
// --- A10: RFQ reference generator -----------------------------------------
// Format: RFQ-YYYYMMDD-XXXXXX Ã¢â‚¬â€ same convention as SHN/AGR.
function generateRfqReference(): string {
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const random = Math.random().toString(36).slice(2, 8).toUpperCase().padStart(6, '0');
  return `RFQ-${ymd}-${random}`;
}
// --- A11: Sourcing decision reference generator ---------------------------
// Format: DEC-YYYYMMDD-XXXXXX Ã¢â‚¬â€ same convention as SHN/AGR/RFQ.
function generateSourcingDecisionReference(): string {
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const random = Math.random().toString(36).slice(2, 8).toUpperCase().padStart(6, '0');
  return `DEC-${ymd}-${random}`;
}
// --- B1: Purchase Request reference generator ------------------------------
// Format: PRR-YYYYMMDD-XXXXXX
function generatePrReference(): string {
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const random = Math.random().toString(36).slice(2, 8).toUpperCase().padStart(6, '0');
  return `PRR-${ymd}-${random}`;
}
// --- B1: Purchase Order reference generator --------------------------------
// Format: PO-YYYYMMDD-XXXXXX
function generatePoReference(): string {
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const random = Math.random().toString(36).slice(2, 8).toUpperCase().padStart(6, '0');
  return `PO-${ymd}-${random}`;
}

// --- A11: Deterministic sourcing evaluation engine -----------------------
// Stateless Ã¢â‚¬â€ recomputed each call from live A9/A10 data. Never persists
// evaluation results; only the human decision is persisted.
//
// Returns one evaluation per supply_request_item, with a list of candidate
// sourcing options drawn from:
//   (a) A9 agreement_product_terms (where parent agreement is active + term is active)
//   (b) A10 rfq_supplier_offers (where offer_status='quoted', linked via rfq_items)
//
// Each option is classified:
//   ELIGIBLE               Ã¢â‚¬â€ all critical data present, no blocking conditions
//   ELIGIBLE_WITH_WARNINGS  Ã¢â‚¬â€ eligible but missing some non-critical data
//   NOT_ELIGIBLE            Ã¢â‚¬â€ known blocking condition
//   INSUFFICIENT_DATA       Ã¢â‚¬â€ cannot make a reliable determination
//
// Recommendation logic (deterministic, explainable, never auto-selects):
//   1. Exclude NOT_ELIGIBLE options
//   2. Within the same currency: lowest unit_price = "Recommended"
//   3. Across different currencies: NO price ranking Ã¢â‚¬â€ mark "requires_review"
//   4. If no eligible options: "requires_review" or "insufficient_data"
type SourcingOptionSource = 'agreement_term' | 'rfq_offer';
type EligibilityResult = 'ELIGIBLE' | 'ELIGIBLE_WITH_WARNINGS' | 'NOT_ELIGIBLE' | 'INSUFFICIENT_DATA';
type RecommendationTag = 'recommended' | 'alternative' | 'requires_review' | 'not_eligible' | 'insufficient_data';

interface SourcingOptionFlag {
  type: 'blocking' | 'warning' | 'info';
  code: string;
  message: string;
}

interface SourcingOption {
  // Identity
  source_type: SourcingOptionSource;
  source_id: string;                  // agreement_product_terms.id OR rfq_supplier_offers.id
  rfq_item_id: string | null;          // only for rfq_offer source
  // Internal supplier (never exposed to customers Ã¢â‚¬â€ A11 responses are internal-only)
  supplier_id: string;
  supplier_reference: string | null;
  supplier_name_en: string | null;
  supplier_status: string | null;
  // Originating agreement (for agreement_term source)
  agreement_id: string | null;
  agreement_number: string | null;
  agreement_status: string | null;
  agreement_effective_from: string | null;
  agreement_effective_to: string | null;
  agreement_currency: string | null;
  agreement_payment_terms_days: number | null;
  agreement_supplier_credit_limit: string | null;
  // Originating RFQ (for rfq_offer source)
  rfq_id: string | null;
  rfq_reference: string | null;
  rfq_status: string | null;
  rfq_supplier_response_state: string | null;
  // Product / commercial facts
  product_id: string;
  canonical_product_sku: string | null;
  canonical_product_code: string | null;
  canonical_product_name_en: string | null;
  unit_price: number | null;
  currency: string | null;
  minimum_order_quantity: number | null;
  price_valid_from: string | null;
  price_valid_to: string | null;
  availability_status: string | null;     // available | limited | unavailable | expected
  available_quantity: number | null;
  expected_available_date: string | null;
  lead_time_days: number | null;
  payment_terms: string | null;            // text or "Net N"
  offer_status: string | null;             // for rfq_offer: pending|quoted|declined|unavailable
  // Evaluation results
  eligibility: EligibilityResult;
  flags: SourcingOptionFlag[];
  data_completeness: 'complete' | 'partial' | 'missing_critical';
  recommendation: RecommendationTag;
}

interface ItemEvaluation {
  request_item_id: number;
  product_id: string;
  product_name: string;
  sku: string;
  requested_quantity: number;
  options: SourcingOption[];
  recommendation_summary: {
    recommended_option_id: string | null;
    recommendation_tag: RecommendationTag;
    note: string;
  };
}

interface SourcingEvaluation {
  supply_request_id: string;
  supply_request_reference: string | null;
  supply_request_status: string | null;
  customer_company_id: string | null;
  customer_company_name: string | null;
  customer_po_number: string | null;
  items: ItemEvaluation[];
  evaluated_at: string;
  has_eligible_options: boolean;
  has_any_options: boolean;
  currencies_present: string[];
}

function isAgreementActive(status: string | null, effectiveFrom: string | null, effectiveTo: string | null): { active: boolean; reason: string | null } {
  if (status !== 'active') return { active: false, reason: `Agreement status is '${status}' (not 'active')` };
  const now = new Date().toISOString();
  if (effectiveFrom && effectiveFrom > now) return { active: false, reason: `Agreement not yet effective (effective_from=${effectiveFrom})` };
  if (effectiveTo && effectiveTo < now) return { active: false, reason: `Agreement expired (effective_to=${effectiveTo})` };
  return { active: true, reason: null };
}

function isPriceValid(priceValidFrom: string | null, priceValidTo: string | null): { valid: boolean; reason: string | null } {
  const now = new Date().toISOString();
  if (priceValidFrom && priceValidFrom > now) return { valid: false, reason: `Price not yet valid (valid_from=${priceValidFrom})` };
  if (priceValidTo && priceValidTo < now) return { valid: false, reason: `Price expired (valid_to=${priceValidTo})` };
  return { valid: true, reason: null };
}

// Core evaluation function Ã¢â‚¬â€ deterministic, server-side, stateless.
function evaluateSourcingForRequest(supplyRequestId: string): SourcingEvaluation | null {
  // Fetch the supply request
  const sr = db.prepare(
    `SELECT sr.id, sr.reference, sr.status, sr.customer_company_id, sr.customer_po_number,
            cc.name_en AS customer_company_name
       FROM supply_requests sr
       LEFT JOIN customer_companies cc ON sr.customer_company_id = cc.id
      WHERE sr.id = ?`,
  ).get(supplyRequestId) as any;
  if (!sr) return null;

  // Fetch supply request items
  const items = db.query(
    `SELECT id, product_id, product_name, sku, quantity, notes
       FROM supply_request_items
      WHERE request_id = ?
      ORDER BY id ASC`,
  ).all(supplyRequestId) as any[];

  const itemEvaluations: ItemEvaluation[] = [];
  const allCurrencies = new Set<string>();

  for (const item of items) {
    const options: SourcingOption[] = [];

    // ---- Source A: A9 agreement_product_terms (active agreements + active terms matching this product) ----
    const terms = db.query(
      `SELECT apt.*, sa.agreement_number, sa.status AS agreement_status, sa.effective_from, sa.effective_to,
              sa.currency AS agreement_currency, sa.payment_terms_days, sa.supplier_credit_limit,
              s.id AS supplier_id, s.reference AS supplier_reference, s.name_en AS supplier_name_en, s.status AS supplier_status
         FROM agreement_product_terms apt
         JOIN supplier_agreements sa ON apt.agreement_id = sa.id
         JOIN suppliers s ON sa.supplier_id = s.id
        WHERE apt.product_id = ? AND apt.status = 'active'
        ORDER BY apt.unit_price ASC`,
    ).all(item.product_id) as any[];

    for (const t of terms) {
      const agreementCheck = isAgreementActive(t.agreement_status, t.effective_from, t.effective_to);
      const priceCheck = isPriceValid(t.price_valid_from, t.price_valid_to);
      const product = getProductSummary(t.product_id);
      const currency = t.currency || t.agreement_currency || null;
      if (currency) allCurrencies.add(currency);

      const flags: SourcingOptionFlag[] = [];
      let eligibility: EligibilityResult = 'ELIGIBLE';
      let dataCompleteness: 'complete' | 'partial' | 'missing_critical' = 'complete';

      // Blocking checks
      if (!agreementCheck.active) {
        flags.push({ type: 'blocking', code: 'AGREEMENT_INACTIVE', message: agreementCheck.reason || 'Agreement not active' });
        eligibility = 'NOT_ELIGIBLE';
      }
      if (t.supplier_status && t.supplier_status !== 'active') {
        flags.push({ type: 'blocking', code: 'SUPPLIER_INACTIVE', message: `Supplier status is '${t.supplier_status}'` });
        eligibility = 'NOT_ELIGIBLE';
      }
      if (t.availability_status === 'unavailable') {
        flags.push({ type: 'blocking', code: 'UNAVAILABLE', message: 'Product is unavailable per agreement term' });
        eligibility = 'NOT_ELIGIBLE';
      }
      // Quantity check: only block if quantity is KNOWN to be insufficient
      if (t.available_quantity !== null && t.available_quantity !== undefined && t.available_quantity < item.quantity) {
        flags.push({ type: 'blocking', code: 'QUANTITY_INSUFFICIENT', message: `Available ${t.available_quantity} < requested ${item.quantity}` });
        eligibility = 'NOT_ELIGIBLE';
      }
      // MOQ conflict: MOQ > requested quantity
      if (t.minimum_order_quantity !== null && t.minimum_order_quantity !== undefined && t.minimum_order_quantity > item.quantity) {
        flags.push({ type: 'blocking', code: 'MOQ_CONFLICT', message: `MOQ ${t.minimum_order_quantity} > requested ${item.quantity}` });
        eligibility = 'NOT_ELIGIBLE';
      }
      if (!priceCheck.valid && eligibility !== 'NOT_ELIGIBLE') {
        flags.push({ type: 'blocking', code: 'PRICE_EXPIRED', message: priceCheck.reason || 'Price not valid' });
        eligibility = 'NOT_ELIGIBLE';
      }

      // Critical missing data Ã¢â€ â€™ INSUFFICIENT_DATA (only if not already NOT_ELIGIBLE)
      if (eligibility !== 'NOT_ELIGIBLE') {
        if (t.unit_price === null || t.unit_price === undefined) {
          flags.push({ type: 'blocking', code: 'PRICE_MISSING', message: 'Unit price is missing' });
          eligibility = 'INSUFFICIENT_DATA';
          dataCompleteness = 'missing_critical';
        }
      }

      // Warnings (non-blocking)
      if (eligibility === 'ELIGIBLE') {
        if (t.lead_time_days === null || t.lead_time_days === undefined) {
          flags.push({ type: 'warning', code: 'LEAD_TIME_MISSING', message: 'Lead time not specified' });
          dataCompleteness = 'partial';
        }
        if (t.availability_status === null) {
          flags.push({ type: 'warning', code: 'AVAILABILITY_UNKNOWN', message: 'Availability status unknown' });
          dataCompleteness = 'partial';
        } else if (t.availability_status === 'limited') {
          flags.push({ type: 'warning', code: 'AVAILABILITY_LIMITED', message: 'Availability is limited' });
        } else if (t.availability_status === 'expected') {
          flags.push({ type: 'warning', code: 'AVAILABILITY_EXPECTED', message: `Availability expected${t.expected_available_date ? ' on ' + t.expected_available_date : ''}` });
        }
        if (t.available_quantity === null && t.availability_status !== 'unavailable') {
          flags.push({ type: 'warning', code: 'QUANTITY_UNKNOWN', message: 'Available quantity unknown' });
          dataCompleteness = 'partial';
        }
        if (t.price_valid_from === null && t.price_valid_to === null) {
          flags.push({ type: 'warning', code: 'PRICE_VALIDITY_MISSING', message: 'Price validity period not specified' });
        }
        if (t.agreement_payment_terms_days === null && !t.supplier_credit_limit) {
          flags.push({ type: 'warning', code: 'PAYMENT_TERMS_MISSING', message: 'Payment terms / credit limit not specified' });
        }
      }
      if (eligibility === 'ELIGIBLE' && flags.some(f => f.type === 'warning')) {
        eligibility = 'ELIGIBLE_WITH_WARNINGS';
      }

      options.push({
        source_type: 'agreement_term',
        source_id: t.id,
        rfq_item_id: null,
        supplier_id: t.supplier_id,
        supplier_reference: t.supplier_reference,
        supplier_name_en: t.supplier_name_en,
        supplier_status: t.supplier_status,
        agreement_id: t.agreement_id,
        agreement_number: t.agreement_number,
        agreement_status: t.agreement_status,
        agreement_effective_from: t.effective_from,
        agreement_effective_to: t.effective_to,
        agreement_currency: t.agreement_currency,
        agreement_payment_terms_days: t.payment_terms_days ?? null,
        agreement_supplier_credit_limit: t.supplier_credit_limit,
        rfq_id: null,
        rfq_reference: null,
        rfq_status: null,
        rfq_supplier_response_state: null,
        product_id: t.product_id,
        canonical_product_sku: product?.sku ?? null,
        canonical_product_code: product?.productCode ?? null,
        canonical_product_name_en: product?.nameEn ?? null,
        unit_price: t.unit_price,
        currency,
        minimum_order_quantity: t.minimum_order_quantity ?? null,
        price_valid_from: t.price_valid_from,
        price_valid_to: t.price_valid_to,
        availability_status: t.availability_status,
        available_quantity: t.available_quantity ?? null,
        expected_available_date: t.expected_available_date,
        lead_time_days: t.lead_time_days ?? null,
        payment_terms: t.agreement_payment_terms_days != null ? `Net ${t.agreement_payment_terms_days}` : null,
        offer_status: null,
        eligibility,
        flags,
        data_completeness: dataCompleteness,
        recommendation: 'requires_review', // set below in recommendation pass
      });
    }

    // ---- Source B: A10 rfq_supplier_offers (quoted offers linked to this request item via rfq_items) ----
    const offers = db.query(
      `SELECT o.*, ri.id AS rfq_item_id, ri.product_id AS ri_product_id, ri.requested_quantity,
              ri.supply_request_item_id, rs.supplier_id, rs.response_state AS rfq_supplier_response_state,
              s.reference AS supplier_reference, s.name_en AS supplier_name_en, s.status AS supplier_status,
              r.id AS rfq_id, r.reference AS rfq_reference, r.status AS rfq_status
         FROM rfq_supplier_offers o
         JOIN rfq_suppliers rs ON o.rfq_supplier_id = rs.id
         JOIN suppliers s ON rs.supplier_id = s.id
         JOIN rfq_items ri ON o.rfq_item_id = ri.id
         JOIN rfqs r ON ri.rfq_id = r.id
        WHERE ri.supply_request_item_id = ? AND o.offer_status = 'quoted'
        ORDER BY o.quoted_unit_price ASC`,
    ).all(item.id) as any[];

    for (const o of offers) {
      const product = getProductSummary(o.ri_product_id);
      const currency = o.currency || null;
      if (currency) allCurrencies.add(currency);

      const flags: SourcingOptionFlag[] = [];
      let eligibility: EligibilityResult = 'ELIGIBLE';
      let dataCompleteness: 'complete' | 'partial' | 'missing_critical' = 'complete';

      // Blocking checks
      if (o.supplier_status && o.supplier_status !== 'active') {
        flags.push({ type: 'blocking', code: 'SUPPLIER_INACTIVE', message: `Supplier status is '${o.supplier_status}'` });
        eligibility = 'NOT_ELIGIBLE';
      }
      // Offer validity check (if validity_date is in the past)
      if (o.validity_date && o.validity_date < new Date().toISOString()) {
        flags.push({ type: 'blocking', code: 'OFFER_EXPIRED', message: `Offer expired (validity_date=${o.validity_date})` });
        eligibility = 'NOT_ELIGIBLE';
      }
      // Quantity check
      if (o.offered_quantity !== null && o.offered_quantity !== undefined && o.offered_quantity < item.quantity) {
        flags.push({ type: 'blocking', code: 'QUANTITY_INSUFFICIENT', message: `Offered ${o.offered_quantity} < requested ${item.quantity}` });
        eligibility = 'NOT_ELIGIBLE';
      }
      // MOQ conflict
      if (o.minimum_order_quantity !== null && o.minimum_order_quantity !== undefined && o.minimum_order_quantity > item.quantity) {
        flags.push({ type: 'blocking', code: 'MOQ_CONFLICT', message: `MOQ ${o.minimum_order_quantity} > requested ${item.quantity}` });
        eligibility = 'NOT_ELIGIBLE';
      }

      // Critical missing data
      if (eligibility !== 'NOT_ELIGIBLE') {
        if (o.quoted_unit_price === null || o.quoted_unit_price === undefined) {
          flags.push({ type: 'blocking', code: 'PRICE_MISSING', message: 'Quoted unit price is missing' });
          eligibility = 'INSUFFICIENT_DATA';
          dataCompleteness = 'missing_critical';
        }
      }

      // Warnings
      if (eligibility === 'ELIGIBLE') {
        if (o.lead_time_days === null || o.lead_time_days === undefined) {
          flags.push({ type: 'warning', code: 'LEAD_TIME_MISSING', message: 'Lead time not specified' });
          dataCompleteness = 'partial';
        }
        if (o.offered_quantity === null) {
          flags.push({ type: 'warning', code: 'QUANTITY_UNKNOWN', message: 'Offered quantity unknown' });
          dataCompleteness = 'partial';
        }
        if (!o.validity_date) {
          flags.push({ type: 'warning', code: 'OFFER_VALIDITY_MISSING', message: 'Offer validity date not specified' });
        }
        if (!o.payment_terms) {
          flags.push({ type: 'warning', code: 'PAYMENT_TERMS_MISSING', message: 'Payment terms not specified' });
        }
      }
      if (eligibility === 'ELIGIBLE' && flags.some(f => f.type === 'warning')) {
        eligibility = 'ELIGIBLE_WITH_WARNINGS';
      }

      options.push({
        source_type: 'rfq_offer',
        source_id: o.id,
        rfq_item_id: o.rfq_item_id,
        supplier_id: o.supplier_id,
        supplier_reference: o.supplier_reference,
        supplier_name_en: o.supplier_name_en,
        supplier_status: o.supplier_status,
        agreement_id: null,
        agreement_number: null,
        agreement_status: null,
        agreement_effective_from: null,
        agreement_effective_to: null,
        agreement_currency: null,
        agreement_payment_terms_days: null,
        agreement_supplier_credit_limit: null,
        rfq_id: o.rfq_id,
        rfq_reference: o.rfq_reference,
        rfq_status: o.rfq_status,
        rfq_supplier_response_state: o.rfq_supplier_response_state,
        product_id: o.ri_product_id,
        canonical_product_sku: product?.sku ?? null,
        canonical_product_code: product?.productCode ?? null,
        canonical_product_name_en: product?.nameEn ?? null,
        unit_price: o.quoted_unit_price,
        currency,
        minimum_order_quantity: o.minimum_order_quantity ?? null,
        price_valid_from: null,
        price_valid_to: o.validity_date,
        availability_status: o.offered_quantity != null ? 'available' : null,
        available_quantity: o.offered_quantity ?? null,
        expected_available_date: null,
        lead_time_days: o.lead_time_days ?? null,
        payment_terms: o.payment_terms,
        offer_status: o.offer_status,
        eligibility,
        flags,
        data_completeness: dataCompleteness,
        recommendation: 'requires_review', // set below
      });
    }

    // ---- Recommendation pass (deterministic) ----
    // 1. Separate eligible (ELIGIBLE + ELIGIBLE_WITH_WARNINGS) from the rest
    const eligible = options.filter(o => o.eligibility === 'ELIGIBLE' || o.eligibility === 'ELIGIBLE_WITH_WARNINGS');
    const notEligible = options.filter(o => o.eligibility === 'NOT_ELIGIBLE');
    const insufficient = options.filter(o => o.eligibility === 'INSUFFICIENT_DATA');

    // Mark NOT_ELIGIBLE options
    for (const o of notEligible) o.recommendation = 'not_eligible';
    for (const o of insufficient) o.recommendation = 'insufficient_data';

    let recommendationTag: RecommendationTag = 'requires_review';
    let recommendedOptionId: string | null = null;
    let note = '';

    if (eligible.length === 0) {
      if (insufficient.length > 0 && notEligible.length === 0) {
        recommendationTag = 'insufficient_data';
        note = 'No eligible options Ã¢â‚¬â€ insufficient data prevents a reliable determination.';
      } else if (notEligible.length > 0 && insufficient.length === 0) {
        recommendationTag = 'not_eligible';
        note = 'All available options are not eligible.';
      } else if (options.length === 0) {
        recommendationTag = 'requires_review';
        note = 'No sourcing options available for this item. Consider creating an RFQ (A10).';
      } else {
        recommendationTag = 'requires_review';
        note = 'No eligible options Ã¢â‚¬â€ manual review required.';
      }
    } else {
      // 2. Check currency consistency for price ranking
      const eligibleCurrencies = new Set(eligible.map(o => o.currency).filter(Boolean) as string[]);
      if (eligibleCurrencies.size > 1) {
        // Mixed currencies Ã¢â‚¬â€ do NOT rank by price. Mark all as requires_review.
        for (const o of eligible) o.recommendation = 'requires_review';
        recommendationTag = 'requires_review';
        note = `${eligibleCurrencies.size} different currencies present (${Array.from(eligibleCurrencies).join(', ')}). Direct price comparison not available Ã¢â‚¬â€ manual review required.`;
      } else {
        // 3. Within same currency: lowest unit_price = recommended, others = alternative
        //    (already sorted by unit_price ASC from the SQL queries, but re-sort to be safe)
        eligible.sort((a, b) => (a.unit_price ?? Infinity) - (b.unit_price ?? Infinity));
        const recommended = eligible[0];
        recommended.recommendation = 'recommended';
        recommendedOptionId = recommended.source_id;
        for (let i = 1; i < eligible.length; i++) eligible[i].recommendation = 'alternative';
        recommendationTag = 'recommended';
        note = `Lowest-price eligible option in ${recommended.currency}.`;
      }
    }

    itemEvaluations.push({
      request_item_id: item.id,
      product_id: item.product_id,
      product_name: item.product_name,
      sku: item.sku,
      requested_quantity: item.quantity,
      options,
      recommendation_summary: {
        recommended_option_id: recommendedOptionId,
        recommendation_tag: recommendationTag,
        note,
      },
    });
  }

  const hasAnyOptions = itemEvaluations.some(e => e.options.length > 0);
  const hasEligibleOptions = itemEvaluations.some(e =>
    e.options.some(o => o.eligibility === 'ELIGIBLE' || o.eligibility === 'ELIGIBLE_WITH_WARNINGS'));

  return {
    supply_request_id: sr.id,
    supply_request_reference: sr.reference,
    supply_request_status: sr.status,
    customer_company_id: sr.customer_company_id,
    customer_company_name: sr.customer_company_name,
    customer_po_number: sr.customer_po_number,
    items: itemEvaluations,
    evaluated_at: new Date().toISOString(),
    has_eligible_options: hasEligibleOptions,
    has_any_options: hasAnyOptions,
    currencies_present: Array.from(allCurrencies).sort(),
  };
}

// Helper for A11 decision recording: validate that the selected option
// belongs to the request AND is currently evaluated as eligible.
function validateSelectedOption(
  supplyRequestId: string,
  selectedSourceType: 'agreement_term' | 'rfq_offer',
  selectedSourceId: string,
): { ok: true; option: SourcingOption } | { ok: false; reason: string } {
  const evaluation = evaluateSourcingForRequest(supplyRequestId);
  if (!evaluation) return { ok: false, reason: 'Supply Request not found' };
  for (const item of evaluation.items) {
    const match = item.options.find(o => o.source_type === selectedSourceType && o.source_id === selectedSourceId);
    if (match) {
      if (match.eligibility === 'NOT_ELIGIBLE') {
        return { ok: false, reason: `Cannot select a NOT_ELIGIBLE option (blocking: ${match.flags.filter(f => f.type === 'blocking').map(f => f.code).join(', ')})` };
      }
      if (match.eligibility === 'INSUFFICIENT_DATA') {
        return { ok: false, reason: `Cannot select an INSUFFICIENT_DATA option (missing critical data)` };
      }
      return { ok: true, option: match };
    }
  }
  return { ok: false, reason: `Selected option does not belong to this Supply Request's evaluation` };
}

// --- A10: RFQ status workflow (legal transitions) -------------------------
// Controlled by validated `action` parameter Ã¢â‚¬â€ never arbitrary client-supplied status.
//   draft Ã¢â€ â€™ ready_to_send (validate: Ã¢â€°Â¥1 item, Ã¢â€°Â¥1 supplier)
//   ready_to_send Ã¢â€ â€™ sent (validate: Ã¢â€°Â¥1 item, Ã¢â€°Â¥1 supplier)
//   ready_to_send Ã¢â€ â€™ cancelled
//   sent Ã¢â€ â€™ partially_responded | responded (auto-set by offer recording)
//   sent Ã¢â€ â€™ cancelled
//   partially_responded Ã¢â€ â€™ responded (auto-set by offer recording)
//   partially_responded Ã¢â€ â€™ closed | cancelled
//   responded Ã¢â€ â€™ closed | cancelled
//   closed/cancelled are terminal Ã¢â‚¬â€ no further mutation
const RFQ_ACTIONS: Record<string, { from: string[]; to: string }> = {
  mark_ready:    { from: ['draft'],           to: 'ready_to_send' },
  send:          { from: ['ready_to_send'],  to: 'sent' },
  close:         { from: ['partially_responded', 'responded'], to: 'closed' },
  cancel:        { from: ['draft', 'ready_to_send', 'sent', 'partially_responded', 'responded'], to: 'cancelled' },
};
function rfqSendReadinessErrors(hasItems: boolean, hasSuppliers: boolean): string | null {
  if (!hasItems) return 'RFQ must have at least one item before it can be sent';
  if (!hasSuppliers) return 'RFQ must have at least one supplier recipient before it can be sent';
  return null;
}

// --- Validation ----------------------------------------------------------
interface RequestItem {
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  notes?: string;
}
interface RequestBody {
  requesterName?: unknown;
  companyName?: unknown;
  email?: unknown;
  phone?: unknown;
  country?: unknown;
  city?: unknown;
  message?: unknown;
  items?: unknown;
  // A3: Optional commercial ownership fields
  customerCompanyId?: unknown;
  customerPoNumber?: unknown;
  // A8-FIX: Optional Credit Application linkage (string | null)
  // Resolved server-side — never trusted as authoritative company identity.
  creditApplicationId?: unknown;
  // STEP 18 PHASE 2: Optional delivery date
  deliveryDate?: unknown;
}

interface ValidationOk {
  ok: true;
  data: {
    requesterName: string;
    companyName: string;
    email: string;
    phone: string;
    country: string;
    city: string;
    message: string;
    items: RequestItem[];
    // A3: Optional commercial linking fields (null when not provided)
    customerCompanyId: string | null;
    customerPoNumber: string | null;
    // A8-FIX: Optional Credit Application linkage (null when not provided/unlinking)
    creditApplicationId: string | null;
    // STEP 18 PHASE 2: Optional delivery date (null when not provided)
    deliveryDate: string | null;
  };
}
interface ValidationFail {
  ok: false;
  field: string;
  reason: string;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

// --- A8-FIX: Credit Application linkage validation ------------------------
// Validates an optional Credit Application Ã¢â€ â€™ Supply Request linkage.
//
// Business rule (from actual A4 model):
//   - The 7 A4 statuses are: draft, submitted, under_review,
//     returned_for_correction, approved, rejected, cancelled.
//   - Only the explicit `approved` status represents approved credit.
//   - Pending (draft/submitted/under_review/returned_for_correction),
//     rejected, and cancelled applications MUST NOT be treated as approved.
//
// Ownership rule:
//   - The Credit Application must belong to the same Customer Company as the
//     Supply Request. Cross-company linkage is rejected.
//   - For customer users, ownerCompanyId is always derived from auth identity
//     (set by the POST handler before calling validate()). Client-supplied
//     company ids are never trusted.
//
// Returns:
//   - { ok: true, id: null }        Ã¢â€ â€™ unlink (no linkage)
//   - { ok: true, id: '<uuid>' }   Ã¢â€ â€™ link to this credit application
//   - { ok: false, reason }         Ã¢â€ â€™ validation failure (caller maps to HTTP 400/422)
type CreditLinkResult = { ok: true; id: string | null } | { ok: false; reason: string };
function validateCreditApplicationLink(
  creditAppId: unknown,
  ownerCompanyId: string | null,
): CreditLinkResult {
  // Unlink (null/empty/undefined) Ã¢â‚¬â€ always allowed.
  if (creditAppId === undefined || creditAppId === null || creditAppId === '') {
    return { ok: true, id: null };
  }
  if (typeof creditAppId !== 'string') {
    return { ok: false, reason: 'creditApplicationId must be a string or null' };
  }
  const trimmed = creditAppId.trim();
  if (trimmed === '') return { ok: true, id: null };

  // The Supply Request must have a customer company before it can be linked.
  if (!ownerCompanyId) {
    return { ok: false, reason: 'Supply Request has no customer company; cannot link a Credit Application' };
  }

  // Look up the credit application by id OR application_number.
  const ca = db.prepare(
    'SELECT id, customer_company_id, status FROM credit_applications WHERE id = ? OR application_number = ?',
  ).get(trimmed, trimmed) as { id: string; customer_company_id: string; status: string } | null;
  if (!ca) {
    return { ok: false, reason: 'Credit Application not found' };
  }

  // Ownership: must belong to the SAME customer company as the Supply Request.
  // Cross-company linkage is rejected (Customer A cannot link to Customer B's Credit Application).
  if (ca.customer_company_id !== ownerCompanyId) {
    // Safe 404-style rejection Ã¢â‚¬â€ do not leak the existence of another company's record.
    return { ok: false, reason: 'Credit Application not found' };
  }

  // Eligibility: only `approved` (explicit A4 approved state) can be linked.
  if (ca.status !== 'approved') {
    return { ok: false, reason: `Credit Application is not eligible (status: ${ca.status}). Only approved applications can be linked.` };
  }

  return { ok: true, id: ca.id };
}

function validate(body: RequestBody): ValidationOk | ValidationFail {
  if (!isNonEmptyString(body.requesterName)) {
    return { ok: false, field: 'requesterName', reason: 'required' };
  }
  if (!isNonEmptyString(body.companyName)) {
    return { ok: false, field: 'companyName', reason: 'required' };
  }
  if (typeof body.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
    return { ok: false, field: 'email', reason: 'invalid email' };
  }
  if (!isNonEmptyString(body.phone)) {
    return { ok: false, field: 'phone', reason: 'required' };
  }
  if (!isNonEmptyString(body.country)) {
    return { ok: false, field: 'country', reason: 'required' };
  }
  if (!isNonEmptyString(body.city)) {
    return { ok: false, field: 'city', reason: 'required' };
  }
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return { ok: false, field: 'items', reason: 'must contain at least one item' };
  }
  for (let i = 0; i < body.items.length; i++) {
    const item = (body.items as unknown[])[i] as Partial<RequestItem>;
    if (typeof item?.productId !== 'string' || !item.productId) {
      return { ok: false, field: `items[${i}].productId`, reason: 'required' };
    }
    if (typeof item?.productName !== 'string' || !item.productName) {
      return { ok: false, field: `items[${i}].productName`, reason: 'required' };
    }
    if (typeof item?.sku !== 'string' || !item.sku) {
      return { ok: false, field: `items[${i}].sku`, reason: 'required' };
    }
    if (
      typeof item?.quantity !== 'number' ||
      !Number.isInteger(item.quantity) ||
      item.quantity < 1
    ) {
      return { ok: false, field: `items[${i}].quantity`, reason: 'must be a positive integer' };
    }
    if (item.notes !== undefined && item.notes !== null && typeof item.notes !== 'string') {
      return { ok: false, field: `items[${i}].notes`, reason: 'must be a string' };
    }
  }
  // A3: Validate optional customerCompanyId
  let customerCompanyId: string | null = null;
  if (body.customerCompanyId !== undefined && body.customerCompanyId !== null && body.customerCompanyId !== '') {
    if (typeof body.customerCompanyId !== 'string' || body.customerCompanyId.trim() === '') {
      return { ok: false, field: 'customerCompanyId', reason: 'must be a non-empty string or omitted' };
    }
    // Verify the company exists in customer_companies
    const company = db
      .prepare('SELECT id FROM customer_companies WHERE id = ?')
      .get(body.customerCompanyId.trim()) as { id: string } | null;
    if (!company) {
      return { ok: false, field: 'customerCompanyId', reason: 'references a non-existent customer company' };
    }
    customerCompanyId = company.id;
  }

  // A3: Validate optional customerPoNumber (string, reasonable length, does NOT replace SHN reference)
  let customerPoNumber: string | null = null;
  if (body.customerPoNumber !== undefined && body.customerPoNumber !== null && body.customerPoNumber !== '') {
    if (typeof body.customerPoNumber !== 'string') {
      return { ok: false, field: 'customerPoNumber', reason: 'must be a string or omitted' };
    }
    const trimmed = body.customerPoNumber.trim();
    if (trimmed.length > 100) {
      return { ok: false, field: 'customerPoNumber', reason: 'must be 100 characters or fewer' };
    }
    customerPoNumber = trimmed;
  }

  // A8-FIX: Validate optional Credit Application linkage.
  // ownerCompanyId is the resolved customerCompanyId (for customer users, this
  // was already overridden to auth.user.company_id by the POST handler).
  // The helper enforces: same company ownership + status === 'approved'.
  const creditLink = validateCreditApplicationLink(body.creditApplicationId, customerCompanyId);
  if (!creditLink.ok) {
    return { ok: false, field: 'creditApplicationId', reason: creditLink.reason };
  }

  // STEP 18 PHASE 2: Validate optional deliveryDate (ISO date string or null)
  let deliveryDate: string | null = null;
  if (body.deliveryDate !== undefined && body.deliveryDate !== null && body.deliveryDate !== '') {
    if (typeof body.deliveryDate !== 'string') {
      return { ok: false, field: 'deliveryDate', reason: 'must be a string or omitted' };
    }
    const trimmed = body.deliveryDate.trim();
    if (trimmed.length > 10) {
      return { ok: false, field: 'deliveryDate', reason: 'must be a valid date string (YYYY-MM-DD)' };
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return { ok: false, field: 'deliveryDate', reason: 'must be in YYYY-MM-DD format' };
    }
    deliveryDate = trimmed;
  }

  return {
    ok: true,
    data: {
      requesterName: (body.requesterName as string).trim(),
      companyName: (body.companyName as string).trim(),
      email: (body.email as string).trim(),
      phone: (body.phone as string).trim(),
      country: (body.country as string).trim(),
      city: (body.city as string).trim(),
      message: typeof body.message === 'string' ? body.message.trim() : '',
      items: (body.items as RequestItem[]).map((it) => ({
        productId: it.productId,
        productName: it.productName,
        sku: it.sku,
        quantity: it.quantity,
        notes: typeof it.notes === 'string' ? it.notes : '',
      })),
      customerCompanyId,
      customerPoNumber,
      creditApplicationId: creditLink.id,
      deliveryDate,
    },
  };
}

// --- Insert (single transaction) -----------------------------------------
function insertSupplyRequest(data: ValidationOk['data']): {
  id: string;
  reference: string;
  createdAt: string;
} {
  const id = generateId();
  const reference = generateReference();
  const createdAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO supply_requests
         (id, reference, requester_name, company_name, email, phone, country, city, message,
          status, customer_company_id, customer_po_number, credit_application_id, delivery_date, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)`,
    ).run(
      id,
      reference,
      data.requesterName,
      data.companyName,
      data.email,
      data.phone,
      data.country,
      data.city,
      data.message || null,
      data.customerCompanyId,
      data.customerPoNumber,
      // A8-FIX: Optional Credit Application linkage (null when not provided)
      data.creditApplicationId,
      data.deliveryDate,
      createdAt,
    );

    const itemStmt = db.prepare(
      `INSERT INTO supply_request_items
         (request_id, product_id, product_name, sku, quantity, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    for (const item of data.items) {
      itemStmt.run(
        id,
        item.productId,
        item.productName,
        item.sku,
        item.quantity,
        item.notes || null,
      );
    }
  });
  tx(); // execute atomically Ã¢â‚¬â€ rolls back if any insert fails

  return { id, reference, createdAt };
}

// --- HTTP server ---------------------------------------------------------
// --- V1: Activity event recording helper -------------------------------
// Called inline from existing API handlers to record server-side business events.
// Identity is always derived from the authenticated user — never client-supplied.
function recordActivityEvent(
  eventType: string,
  authUser: { id: string; user_type: string; company_id: string | null } | null,
  context?: {
    productId?: string | null;
    categoryId?: string | null;
    supplyRequestId?: string | null;
    agreementId?: string | null;
    rfqId?: string | null;
    metadata?: string | null;
  },
): void {
  try {
    db.prepare(
      `INSERT INTO activity_events (id, event_type, user_id, user_type, company_id,
         product_id, category_id, supply_request_id, agreement_id, rfq_id, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      crypto.randomUUID(), eventType,
      authUser?.id ?? null, authUser?.user_type ?? null, authUser?.company_id ?? null,
      context?.productId ?? null, context?.categoryId ?? null,
      context?.supplyRequestId ?? null, context?.agreementId ?? null,
      context?.rfqId ?? null, context?.metadata ?? null,
      new Date().toISOString(),
    );
  } catch (err) {
    // Non-blocking — activity recording should never break the main workflow
    console.error('[shanan-api] Activity event recording failed:', err);
  }
}

// --- A13-2: Rate Limiting (in-memory, single-instance) ----------------
// Simple sliding-window rate limiter for the current single-server architecture.
// For multi-instance/cloud deployment, replace with a shared store (Redis, etc.).
//
// Configuration:
//   - LOGIN_MAX_REQUESTS: max auth attempts per window (default: 10)
//   - LOGIN_WINDOW_MS: time window for auth attempts (default: 5 min = 300000)
//   - GENERAL_MAX_REQUESTS: max general API requests per window (default: 100)
//   - GENERAL_WINDOW_MS: time window for general requests (default: 1 min = 60000)
//   - RATE_LIMIT_EXEMPT_PATHS: paths exempt from rate limiting (health check)

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

interface RateLimitBucket {
  entries: Map<string, RateLimitEntry>;
  maxRequests: number;
  windowMs: number;
}

const LOGIN_MAX_REQUESTS = Number(process.env.LOGIN_MAX_REQUESTS || '10');
const LOGIN_WINDOW_MS = Number(process.env.LOGIN_WINDOW_MS || '300000'); // 5 minutes
const GENERAL_MAX_REQUESTS = Number(process.env.GENERAL_MAX_REQUESTS || '100');
const GENERAL_WINDOW_MS = Number(process.env.GENERAL_WINDOW_MS || '60000'); // 1 minute

const loginBucket: RateLimitBucket = {
  entries: new Map(),
  maxRequests: LOGIN_MAX_REQUESTS,
  windowMs: LOGIN_WINDOW_MS,
};

const generalBucket: RateLimitBucket = {
  entries: new Map(),
  maxRequests: GENERAL_MAX_REQUESTS,
  windowMs: GENERAL_WINDOW_MS,
};

// Paths exempt from ALL rate limiting
const RATE_LIMIT_EXEMPT_PATHS = new Set(['/api/health']);

// Paths subject to stricter login rate limiting
const LOGIN_RATE_LIMITED_PATHS = new Set(['/api/auth/login', '/api/auth/register-admin', '/api/auth/register-supplier']);

// Last cleanup timestamp
let lastCleanup = Date.now();
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // cleanup every 10 minutes

// STEP 19-A D2: Minimal structural type for the Bun server surface we rely on.
// Bun.serve's server object exposes requestIP(request): SocketAddress | null.
// Declared inline so we do not depend on the uninstalled @types/bun package.
type ClientIpSource = { requestIP(req: Request): { address: string } | null };

function getClientIdentifier(req: Request, srv?: ClientIpSource): string {
  // STEP 19-A D2: Prefer the real connection (socket) peer address so an attacker
  // cannot forge X-Forwarded-For / X-Real-IP to obtain a fresh rate-limit bucket.
  // This is topology-agnostic: directly-exposed or behind any reverse proxy, the key
  // is the actual TCP peer (the client, or the proxy) — never a client-controlled header.
  // Proxy headers are used ONLY as a defensive fallback when no socket address exists.
  if (srv && typeof srv.requestIP === 'function') {
    const peer = srv.requestIP(req);
    if (peer && peer.address) {
      return `ip:${peer.address}`;
    }
  }
  // Legacy fallback: X-Forwarded-For (first IP) — only reached when socket IP unavailable.
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  // Fallback: Bun doesn't expose remote address directly in Request
  // Use a hash of the Origin + User-Agent as a weak fallback identifier
  const origin = req.headers.get('origin') || '';
  const ua = req.headers.get('user-agent') || '';
  return `fallback:${origin}:${ua}`.slice(0, 100);
}

function checkRateLimit(bucket: RateLimitBucket, key: string): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();

  // Periodic cleanup of expired entries
  if (now - lastCleanup > CLEANUP_INTERVAL_MS) {
    for (const [k, entry] of bucket.entries) {
      if (now - entry.windowStart > bucket.windowMs * 2) {
        bucket.entries.delete(k);
      }
    }
    lastCleanup = now;
  }

  const existing = bucket.entries.get(key);
  if (!existing || now - existing.windowStart > bucket.windowMs) {
    // New window
    bucket.entries.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: bucket.maxRequests - 1, resetAt: now + bucket.windowMs };
  }

  existing.count++;
  if (existing.count > bucket.maxRequests) {
    return { allowed: false, remaining: 0, resetAt: existing.windowStart + bucket.windowMs };
  }

  return { allowed: true, remaining: bucket.maxRequests - existing.count, resetAt: existing.windowStart + bucket.windowMs };
}

function rateLimitResponse(resetAt: number, origin: string | null): Response {
  const retryAfter = Math.ceil((resetAt - Date.now()) / 1000);
  return new Response(
    JSON.stringify({ error: 'Too many requests. Please try again later.' }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Retry-After': String(Math.max(1, retryAfter)),
        ...corsHeaders(origin),
      },
    },
  );
}

// Rate limiting middleware — call at the start of fetch()
function applyRateLimit(req: Request, url: URL, origin: string | null, srv?: ClientIpSource): Response | null {
  const path = url.pathname;

  // Exempt health checks
  if (RATE_LIMIT_EXEMPT_PATHS.has(path)) {
    return null;
  }

  const clientId = getClientIdentifier(req, srv);

  // Apply stricter limits to auth endpoints
  if (LOGIN_RATE_LIMITED_PATHS.has(path)) {
    const result = checkRateLimit(loginBucket, clientId);
    if (!result.allowed) {
      return rateLimitResponse(result.resetAt, origin);
    }
  }

  // Apply general limits to all other API endpoints
  const generalResult = checkRateLimit(generalBucket, clientId);
  if (!generalResult.allowed) {
    return rateLimitResponse(generalResult.resetAt, origin);
  }

  return null;
}

const server = Bun.serve({
  port: PORT,
  async fetch(req: Request, srv: ClientIpSource): Promise<Response> {
    const url = new URL(req.url);
    const origin = req.headers.get('Origin');

    // CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    // A13-2: Rate limiting — applied to all API requests (health check exempt)
    const rateLimitResponse = applyRateLimit(req, url, origin, srv);
    if (rateLimitResponse) return rateLimitResponse;

    // ============================================================
    // A5 Ã¢â‚¬â€ Authentication endpoints
    // ============================================================

    // POST /api/auth/login Ã¢â‚¬â€ authenticate user, create session
    if (url.pathname === '/api/auth/login' && req.method === 'POST') {
      let body: unknown;
      try { body = await req.json(); } catch { return errorResponse('Invalid JSON body', 400, origin); }
      const b = body as Record<string, unknown>;
      if (typeof b.email !== 'string' || typeof b.password !== 'string') {
        return errorResponse('Email and password are required', 422, origin);
      }
      const email = b.email.trim().toLowerCase();
      try {
        const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as AuthenticatedUser & { password_hash: string | null } | null;
        if (!user || !user.password_hash) {
          return errorResponse('Invalid email or password', 401, origin);
        }
        if (!user.is_active) {
          return errorResponse('Account is inactive', 403, origin);
        }
        const valid = await verifyPassword(b.password, user.password_hash);
        if (!valid) {
          return errorResponse('Invalid email or password', 401, origin);
        }
        // Create session
        const token = generateSessionToken();
        const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();
        db.prepare('INSERT INTO user_sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, user.id, expiresAt);
        return jsonResponse({ token, user: safeUserInfo(user) }, 200, origin);
      } catch (err) {
        console.error('[shanan-api] Login failed:', err);
        return errorResponse('Authentication failed', 500, origin);
      }
    }

    // GET /api/auth/me Ã¢â‚¬â€ current authenticated user
    if (url.pathname === '/api/auth/me' && req.method === 'GET') {
      const auth = requireAuth(req, origin);
      if (auth.error) return auth.error;
      return jsonResponse({ user: safeUserInfo(auth.user) }, 200, origin);
    }

    // POST /api/auth/logout Ã¢â‚¬â€ invalidate current session
    if (url.pathname === '/api/auth/logout' && req.method === 'POST') {
      const authHeader = req.headers.get('Authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        try { db.prepare('DELETE FROM user_sessions WHERE token = ?').run(token); } catch {}
      }
      return jsonResponse({ ok: true }, 200, origin);
    }

    // POST /api/auth/register-admin Ã¢â‚¬â€ bootstrap initial SHANAN admin (only if no admin exists)
    if (url.pathname === '/api/auth/register-admin' && req.method === 'POST') {
      // Check if any internal admin already exists
      const existingAdmin = db.prepare("SELECT id FROM users WHERE user_type = 'internal' AND role = 'admin' LIMIT 1").get();
      if (existingAdmin) {
        return errorResponse('An admin account already exists. Use login.', 409, origin);
      }
      let body: unknown;
      try { body = await req.json(); } catch { return errorResponse('Invalid JSON body', 400, origin); }
      const b = body as Record<string, unknown>;
      if (typeof b.name !== 'string' || b.name.trim() === '') return errorResponse('Name is required', 422, origin);
      if (typeof b.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email)) return errorResponse('Valid email is required', 422, origin);
      if (typeof b.password !== 'string' || b.password.length < 8) return errorResponse('Password must be at least 8 characters', 422, origin);
      const email = b.email.trim().toLowerCase();
      const dup = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
      if (dup) return errorResponse('Email already in use', 409, origin);
      const id = generateId();
      const hash = await hashPassword(b.password);
      const now = new Date().toISOString();
      db.prepare('INSERT INTO users (id, name, email, password_hash, user_type, role, company_id, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NULL, 1, ?, ?)').run(id, b.name, email, hash, 'internal', 'admin', now, now);
      return jsonResponse({ id, message: 'Admin account created' }, 201, origin);
    }

    // Health check
    if (url.pathname === '/api/health' && req.method === 'GET') {
      // STEP 19-A C4 Finding B: public health is operational-only — never disclose
      // internal storage/database/config to anonymous callers. Detailed diagnostics
      // are available only to authenticated internal users.
      const auth = requireInternal(req, origin);
      if (auth.error) {
        // Anonymous (no token) still gets the public health probe (200, no secrets).
        // Customer/supplier (authenticated but not internal) get 403 with no disclosure.
        if (auth.error.status === 401) {
          return jsonResponse(
            { ok: true, service: 'shanan-supply-api', version: '1.0.0' },
            200,
            origin,
          );
        }
        return auth.error;
      }
      return jsonResponse(
        {
          ok: true,
          service: 'shanan-supply-api',
          version: '1.0.0',
          storage: getStorageConfig(),
          database: DB_PATH,
        },
        200,
        origin,
      );
    }

    // GET /api/supply-requests Ã¢â‚¬â€ list (A6: auth + ownership filtering)
    if (url.pathname === '/api/supply-requests' && req.method === 'GET') {
      const auth = requireAuth(req, origin);
      if (auth.error) return auth.error;
      if (auth.user.user_type === 'supplier') {
        return errorResponse('Forbidden: suppliers cannot access supply requests', 403, origin);
      }
      try {
        let rows;
        if (auth.user.user_type === 'customer') {
          // Customer: only see own company's linked requests
          rows = db.query(
            `SELECT sr.id, sr.reference, sr.requester_name, sr.company_name, sr.email, sr.phone,
                    sr.country, sr.city, sr.message, sr.status, sr.created_at,
                    sr.customer_company_id, sr.customer_po_number, sr.credit_application_id,
                    sr.delivery_date,
                    cc.reference AS customer_company_reference, cc.name_en AS customer_company_name,
                    (SELECT COUNT(*) FROM supply_request_items sri WHERE sri.request_id = sr.id) AS item_count
             FROM supply_requests sr
             LEFT JOIN customer_companies cc ON sr.customer_company_id = cc.id
             WHERE sr.customer_company_id = ?
             ORDER BY sr.created_at DESC
             LIMIT 50`,
          ).all(auth.user.company_id);
        } else {
          // Internal: see all (or filter by status)
          const filterStatus = url.searchParams.get('status');
          if (filterStatus) {
            rows = db.query(
              `SELECT sr.id, sr.reference, sr.requester_name, sr.company_name, sr.email, sr.phone,
                      sr.country, sr.city, sr.message, sr.status, sr.created_at,
                      sr.customer_company_id, sr.customer_po_number, sr.credit_application_id,
                      sr.delivery_date,
                      cc.reference AS customer_company_reference, cc.name_en AS customer_company_name,
                      (SELECT COUNT(*) FROM supply_request_items sri WHERE sri.request_id = sr.id) AS item_count
               FROM supply_requests sr
               LEFT JOIN customer_companies cc ON sr.customer_company_id = cc.id
               WHERE sr.status = ?
               ORDER BY sr.created_at DESC
               LIMIT 50`,
            ).all(filterStatus);
          } else {
            rows = db.query(
              `SELECT sr.id, sr.reference, sr.requester_name, sr.company_name, sr.email, sr.phone,
                      sr.country, sr.city, sr.message, sr.status, sr.created_at,
                      sr.customer_company_id, sr.customer_po_number, sr.credit_application_id,
                      sr.delivery_date,
                      cc.reference AS customer_company_reference, cc.name_en AS customer_company_name,
                      (SELECT COUNT(*) FROM supply_request_items sri WHERE sri.request_id = sr.id) AS item_count
               FROM supply_requests sr
               LEFT JOIN customer_companies cc ON sr.customer_company_id = cc.id
               ORDER BY sr.created_at DESC
               LIMIT 50`,
            ).all();
          }
        }
        return jsonResponse({ requests: rows, count: rows.length }, 200, origin);
      } catch (err) {
        console.error('[shanan-api] Query failed:', err);
        return errorResponse('Could not retrieve requests.', 500, origin);
      }
    }

    // GET /api/supply-requests/:id Ã¢â‚¬â€ fetch single (A6: auth + ownership check)
    const match = url.pathname.match(/^\/api\/supply-requests\/([^/]+)$/);
    if (match && req.method === 'GET') {
      const auth = requireAuth(req, origin);
      if (auth.error) return auth.error;
      const supplierBlock = requireNotSupplier(req, auth.user, origin);
      if (supplierBlock) return supplierBlock;
      const requestId = decodeURIComponent(match[1]);
      try {
        const parent = db
          .prepare(
            `SELECT sr.id, sr.reference, sr.requester_name, sr.company_name, sr.email, sr.phone,
                    sr.country, sr.city, sr.message, sr.status, sr.created_at,
                    sr.customer_company_id, sr.customer_po_number, sr.credit_application_id,
                    sr.delivery_date,
                    cc.reference AS customer_company_reference, cc.name_en AS customer_company_name
             FROM supply_requests sr
             LEFT JOIN customer_companies cc ON sr.customer_company_id = cc.id
             WHERE sr.id = ? OR sr.reference = ?`,
          )
          .get(requestId, requestId) as { id: string; customer_company_id: string | null } | null;
        if (!parent) {
          return errorResponse('Request not found', 404, origin);
        }
        // Customer ownership check
        if (auth.user.user_type === 'customer' && parent.customer_company_id !== auth.user.company_id) {
          return errorResponse('Request not found', 404, origin);
        }
        const items = db
          .prepare(
            `SELECT id, request_id, product_id, product_name, sku, quantity, notes
             FROM supply_request_items WHERE request_id = ?
             ORDER BY id ASC`,
          )
          .all(parent.id);
        return jsonResponse({ request: parent, items }, 200, origin);
      } catch (err) {
        console.error('[shanan-api] Single-query failed:', err);
        return errorResponse('Could not retrieve request.', 500, origin);
      }
    }

    // POST /api/supply-requests Ã¢â‚¬â€ create (A6: auth + ownership derivation + draft status)
    if (url.pathname === '/api/supply-requests' && req.method === 'POST') {
      const auth = requireAuth(req, origin);
      if (auth.error) return auth.error;
      const supplierBlock = requireNotSupplier(req, auth.user, origin);
      if (supplierBlock) return supplierBlock;
      let body: unknown;
      try { body = await req.json(); } catch { return errorResponse('Invalid JSON body', 400, origin); }

      // A6: Override validate to inject ownership from authenticated identity
      const requestBody = body as RequestBody;

      // Determine customerCompanyId from authenticated identity:
      // - Customer users: ALWAYS use their own company_id (ignore client-supplied value)
      // - Internal users: use client-supplied customerCompanyId (validated) or NULL
      if (auth.user.user_type === 'customer') {
        requestBody.customerCompanyId = auth.user.company_id;
      }

      const result = validate(requestBody);
      if (!result.ok) {
        return errorResponse(`Validation failed: ${result.field} Ã¢â‚¬â€ ${result.reason}`, 422, origin);
      }

      // A6: New requests from authenticated customers get 'draft' status.
      // Historical/anonymous requests (no auth or internal-created) keep 'pending' default.
      // We override the status to 'draft' for customer-created requests.
      if (auth.user.user_type === 'customer') {
        // Force draft status for customer-created requests
        result.data = { ...result.data };
      }

      try {
        const created = insertSupplyRequest(result.data);
        // V1: Record server-side business event
        recordActivityEvent('SUPPLY_REQUEST_SUBMITTED', auth.user, {
          supplyRequestId: created.id,
        });
        return jsonResponse(created, 201, origin);
      } catch (err) {
        console.error('[shanan-api] Insert failed:', err);
        return errorResponse('Could not persist your request. Please try again later.', 500, origin);
      }
    }

    // PATCH /api/supply-requests/:id — A6: status workflow + customer editing
    if (match && req.method === 'PATCH') {
      const auth = requireAuth(req, origin);
      if (auth.error) return auth.error;
      const supplierBlock = requireNotSupplier(req, auth.user, origin);
      if (supplierBlock) return supplierBlock;
      const requestId = decodeURIComponent(match[1]);
      let body: unknown;
      try { body = await req.json(); } catch { return errorResponse('Invalid JSON body', 400, origin); }
      const b = body as Record<string, unknown>;
      const now = new Date().toISOString();

      // Find the request
      const existing = db.prepare('SELECT * FROM supply_requests WHERE id = ? OR reference = ?').get(requestId, requestId) as Record<string, unknown> | null;
      if (!existing) return errorResponse('Request not found', 404, origin);

      // Customer ownership check
      if (auth.user.user_type === 'customer' && existing.customer_company_id !== auth.user.company_id) {
        return errorResponse('Request not found', 404, origin);
      }

      const currentStatus = existing.status as string;

      // Handle customer actions
      if (b.action === 'submit') {
        // Customer submits draft Ã¢â€ â€™ submitted
        if (auth.user.user_type === 'customer' && existing.customer_company_id !== auth.user.company_id) {
          return errorResponse('Request not found', 404, origin);
        }
        if (currentStatus !== 'draft' && currentStatus !== 'pending') {
          return errorResponse(`Cannot submit: current status is '${currentStatus}' (must be 'draft' or 'pending')`, 400, origin);
        }
        // Verify request has items
        const itemCount = db.prepare('SELECT COUNT(*) as n FROM supply_request_items WHERE request_id = ?').get(existing.id) as { n: number };
        if (itemCount.n === 0) {
          return errorResponse('Cannot submit: request has no items', 422, origin);
        }
        db.prepare('UPDATE supply_requests SET status = ?, updated_at = ? WHERE id = ?').run('submitted', now, existing.id);
        return jsonResponse({ request: db.prepare('SELECT * FROM supply_requests WHERE id = ?').get(existing.id) }, 200, origin);
      }

      // Handle SHANAN internal status transitions
      const INTERNAL_TRANSITIONS: Record<string, string[]> = {
        'start_review': ['submitted'],
        'mark_processing': ['under_review'],
        'mark_ready': ['processing'],
        'close': ['ready_for_commercial_action', 'fulfilled', 'quoted'],
      };
      const TARGET_STATUS: Record<string, string> = {
        'start_review': 'under_review',
        'mark_processing': 'processing',
        'mark_ready': 'ready_for_commercial_action',
        'close': 'closed',
      };

      if (INTERNAL_TRANSITIONS[b.action as string]) {
        // Requires internal access
        if (auth.user.user_type !== 'internal') {
          return errorResponse('Forbidden: SHANAN internal access required for this action', 403, origin);
        }
        // Close action requires admin/manager
        if (b.action === 'close' && auth.user.role !== 'admin' && auth.user.role !== 'manager') {
          return errorResponse('Forbidden: admin or manager role required to close requests', 403, origin);
        }
        const action = b.action as string;
        const allowedFrom = INTERNAL_TRANSITIONS[action];
        if (!allowedFrom.includes(currentStatus)) {
          return errorResponse(`Cannot ${action}: current status is '${currentStatus}' (must be one of: ${allowedFrom.join(', ')})`, 400, origin);
        }
        if (action === 'close') {
          // Generate official doc reference and set closure fields
          const docRef = `DOC-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
          db.prepare('UPDATE supply_requests SET status = ?, official_doc_reference = ?, closed_at = ?, closed_by = ?, updated_at = ? WHERE id = ?').run('closed', docRef, now, auth.user.id, now, existing.id);
        } else {
          db.prepare('UPDATE supply_requests SET status = ?, updated_at = ? WHERE id = ?').run(TARGET_STATUS[action], now, existing.id);
        }
        return jsonResponse({ request: db.prepare('SELECT * FROM supply_requests WHERE id = ?').get(existing.id) }, 200, origin);
      }

      // Handle field updates (customer PO number, message, credit application link) Ã¢â‚¬â€ only in draft/pending
      // A6: This window is the only legitimate customer-editable window.
      // A8-FIX: creditApplicationId can be set/unset here, subject to:
      //   - same-company ownership (server-derived from auth identity, not client)
      //   - credit application status === 'approved' (eligible)
      if (currentStatus !== 'draft' && currentStatus !== 'pending') {
        return errorResponse(`Cannot edit: request status is '${currentStatus}'. Only draft or pending requests can be edited.`, 400, origin);
      }

      const updates: string[] = [];
      const values: (string | null)[] = [];

      if (b.customerPoNumber !== undefined) {
        if (typeof b.customerPoNumber !== 'string' || b.customerPoNumber.length > 100) {
          return errorResponse('Validation failed: customerPoNumber Ã¢â‚¬â€ must be a string of 100 characters or fewer', 400, origin);
        }
        updates.push('customer_po_number = ?');
        values.push(b.customerPoNumber.trim() || null);
      }
      if (typeof b.message === 'string') {
        updates.push('message = ?');
        values.push(b.message.trim() || null);
      }
      // STEP 18 PHASE 2: Optional delivery_date update
      if (b.deliveryDate !== undefined) {
        if (b.deliveryDate !== null && b.deliveryDate !== '') {
          if (typeof b.deliveryDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(b.deliveryDate.trim())) {
            return errorResponse('Validation failed: deliveryDate — must be in YYYY-MM-DD format or omitted', 400, origin);
          }
          updates.push('delivery_date = ?');
          values.push(b.deliveryDate.trim());
        } else {
          updates.push('delivery_date = ?');
          values.push(null);
        }
      }

      // A8-FIX: Optional Credit Application linkage (set or unlink).
      // The ownerCompanyId is the Supply Request's existing customer_company_id
      // (NOT a client-supplied field). For customer users, A6 ownership check
      // above already verified they own this Supply Request.
      if (b.creditApplicationId !== undefined) {
        // The Supply Request's customer_company_id is the authoritative owner.
        // If the Supply Request has no customer_company_id (historical record),
        // linking is rejected Ã¢â‚¬â€ historical records must not be retroactively
        // assigned fake ownership.
        const ownerCompanyId = (existing.customer_company_id as string | null) ?? null;
        // For customer users, additionally verify the customer owns this Supply
        // Request's company (already done above, but double-check defensively).
        if (auth.user.user_type === 'customer' && ownerCompanyId !== auth.user.company_id) {
          return errorResponse('Request not found', 404, origin);
        }
        const creditLink = validateCreditApplicationLink(b.creditApplicationId, ownerCompanyId);
        if (!creditLink.ok) {
          return errorResponse(`Validation failed: creditApplicationId Ã¢â‚¬â€ ${creditLink.reason}`, 400, origin);
        }
        updates.push('credit_application_id = ?');
        values.push(creditLink.id);
      }

      if (updates.length === 0) {
        return errorResponse('No valid fields to update', 422, origin);
      }

      // A6: Also set status to 'draft' if currently 'pending' (first edit by customer)
      if (currentStatus === 'pending' && auth.user.user_type === 'customer') {
        updates.push('status = ?');
        values.push('draft');
      }

      updates.push('updated_at = ?');
      values.push(now);
      values.push(existing.id as string);

      try {
        db.prepare(`UPDATE supply_requests SET ${updates.join(', ')} WHERE id = ?`).run(...values);
        return jsonResponse({ request: db.prepare('SELECT * FROM supply_requests WHERE id = ?').get(existing.id) }, 200, origin);
      } catch (err) {
        console.error('[shanan-api] Supply request update failed:', err);
        return errorResponse('Could not update request.', 500, origin);
      }
    }

    // ============================================================
    // Phase A1 Ã¢â‚¬â€ Customer Company endpoints
    // ============================================================

    // GET /api/customers Ã¢â‚¬â€ list all customer companies
    if (url.pathname === '/api/customers' && req.method === 'GET') {
      const auth = requireInternal(req, origin);
      if (auth.error) return auth.error;
      try {
        const rows = db
          .query(
            `SELECT id, reference, name_en, name_ar, email, phone, country, city, address, tax_id,
                    account_status, payment_mode, created_at, updated_at
             FROM customer_companies
             ORDER BY created_at DESC`,
          )
          .all();
        return jsonResponse({ customers: rows, count: rows.length }, 200, origin);
      } catch (err) {
        console.error('[shanan-api] Customer query failed:', err);
        return errorResponse('Could not retrieve customers.', 500, origin);
      }
    }

    // POST /api/customers Ã¢â‚¬â€ create a new customer company
    if (url.pathname === '/api/customers' && req.method === 'POST') {
      const auth = requireInternal(req, origin);
      if (auth.error) return auth.error;
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return errorResponse('Invalid JSON body', 400, origin);
      }

      // Validate required fields
      const b = body as Record<string, unknown>;
      if (typeof b.nameEn !== 'string' || b.nameEn.trim() === '') {
        return errorResponse('Validation failed: nameEn Ã¢â‚¬â€ required', 422, origin);
      }

      // Validate optional controlled enum fields Ã¢â‚¬â€ reject invalid explicit values (HTTP 400).
      // Missing fields use the documented default.
      let paymentMode: 'cash' | 'credit' = 'cash';
      if (b.paymentMode !== undefined && b.paymentMode !== null) {
        if (typeof b.paymentMode === 'string' && ['cash', 'credit'].includes(b.paymentMode)) {
          paymentMode = b.paymentMode as 'cash' | 'credit';
        } else {
          return errorResponse(`Validation failed: paymentMode Ã¢â‚¬â€ must be 'cash' or 'credit' (got: ${String(b.paymentMode)})`, 400, origin);
        }
      }

      let accountStatus: 'pending' | 'active' | 'suspended' | 'rejected' | 'closed' = 'pending';
      if (b.accountStatus !== undefined && b.accountStatus !== null) {
        if (typeof b.accountStatus === 'string' && ['pending', 'active', 'suspended', 'rejected', 'closed'].includes(b.accountStatus)) {
          accountStatus = b.accountStatus as 'pending' | 'active' | 'suspended' | 'rejected' | 'closed';
        } else {
          return errorResponse(`Validation failed: accountStatus Ã¢â‚¬â€ must be one of: pending, active, suspended, rejected, closed (got: ${String(b.accountStatus)})`, 400, origin);
        }
      }

      // Generate stable ID + official reference (server-controlled, never from client)
      const id = generateId();
      const reference = generateCustomerReference();
      const now = new Date().toISOString();

      try {
        db.prepare(
          `INSERT INTO customer_companies
             (id, reference, name_en, name_ar, email, phone, country, city, address, tax_id,
              account_status, payment_mode, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          id,
          reference,
          b.nameEn as string,
          (typeof b.nameAr === 'string' ? b.nameAr : null) as string | null,
          (typeof b.email === 'string' ? b.email.trim() : null) as string | null,
          (typeof b.phone === 'string' ? b.phone.trim() : null) as string | null,
          (typeof b.country === 'string' ? b.country.trim() : null) as string | null,
          (typeof b.city === 'string' ? b.city.trim() : null) as string | null,
          (typeof b.address === 'string' ? b.address.trim() : null) as string | null,
          (typeof b.taxId === 'string' ? b.taxId.trim() : null) as string | null,
          accountStatus,
          paymentMode,
          now,
          now,
        );
        return jsonResponse({ id, reference, createdAt: now }, 201, origin);
      } catch (err) {
        console.error('[shanan-api] Customer insert failed:', err);
        return errorResponse('Could not create customer company.', 500, origin);
      }
    }

    // GET /api/customers/:id Ã¢â‚¬â€ fetch a single customer company by ID or reference
    const customerMatch = url.pathname.match(/^\/api\/customers\/([^/]+)$/);
    if (customerMatch && req.method === 'GET') {
      const auth = requireInternal(req, origin);
      if (auth.error) return auth.error;
      const customerId = decodeURIComponent(customerMatch[1]);
      try {
        const customer = db
          .prepare(
            `SELECT id, reference, name_en, name_ar, email, phone, country, city, address, tax_id,
                    account_status, payment_mode, created_at, updated_at
             FROM customer_companies WHERE id = ? OR reference = ?`,
          )
          .get(customerId, customerId);
        if (!customer) {
          return errorResponse('Customer not found', 404, origin);
        }
        return jsonResponse({ customer }, 200, origin);
      } catch (err) {
        console.error('[shanan-api] Customer lookup failed:', err);
        return errorResponse('Could not retrieve customer.', 500, origin);
      }
    }

    // PATCH /api/customers/:id Ã¢â‚¬â€ update account status or payment mode (server-controlled)
    if (customerMatch && req.method === 'PATCH') {
      const auth = requireInternal(req, origin);
      if (auth.error) return auth.error;
      const customerId = decodeURIComponent(customerMatch[1]);
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return errorResponse('Invalid JSON body', 400, origin);
      }

      // Find the customer
      const existing = db
        .prepare('SELECT id FROM customer_companies WHERE id = ? OR reference = ?')
        .get(customerId, customerId) as { id: string } | null;
      if (!existing) {
        return errorResponse('Customer not found', 404, origin);
      }

      // Only allow updating specific fields (account_status, payment_mode, and basic contact info)
      const b = body as Record<string, unknown>;
      const updates: string[] = [];
      const values: (string | null)[] = [];

      // Validate + collect allowed field updates Ã¢â‚¬â€ reject invalid explicit values (HTTP 400)
      if (b.accountStatus !== undefined && b.accountStatus !== null) {
        if (typeof b.accountStatus === 'string' && ['pending', 'active', 'suspended', 'rejected', 'closed'].includes(b.accountStatus)) {
          updates.push('account_status = ?');
          values.push(b.accountStatus);
        } else {
          return errorResponse(`Validation failed: accountStatus Ã¢â‚¬â€ must be one of: pending, active, suspended, rejected, closed (got: ${String(b.accountStatus)})`, 400, origin);
        }
      }
      if (b.paymentMode !== undefined && b.paymentMode !== null) {
        if (typeof b.paymentMode === 'string' && ['cash', 'credit'].includes(b.paymentMode)) {
          updates.push('payment_mode = ?');
          values.push(b.paymentMode);
        } else {
          return errorResponse(`Validation failed: paymentMode Ã¢â‚¬â€ must be 'cash' or 'credit' (got: ${String(b.paymentMode)})`, 400, origin);
        }
      }
      // Allow updating basic contact fields
      for (const [field, col] of [
        ['nameEn', 'name_en'], ['nameAr', 'name_ar'], ['email', 'email'],
        ['phone', 'phone'], ['country', 'country'], ['city', 'city'],
        ['address', 'address'], ['taxId', 'tax_id'],
      ] as const) {
        if (typeof b[field] === 'string') {
          updates.push(`${col} = ?`);
          values.push((b[field] as string).trim());
        }
      }

      if (updates.length === 0) {
        return errorResponse('No valid fields to update', 422, origin);
      }

      // Always update updated_at
      updates.push('updated_at = ?');
      values.push(new Date().toISOString());
      values.push(existing.id); // WHERE clause

      try {
        db.prepare(
          `UPDATE customer_companies SET ${updates.join(', ')} WHERE id = ?`,
        ).run(...values);
        const updated = db
          .prepare(
            `SELECT id, reference, name_en, name_ar, email, phone, country, city, address, tax_id,
                    account_status, payment_mode, created_at, updated_at
             FROM customer_companies WHERE id = ?`,
          )
          .get(existing.id);
        return jsonResponse({ customer: updated }, 200, origin);
      } catch (err) {
        console.error('[shanan-api] Customer update failed:', err);
        return errorResponse('Could not update customer.', 500, origin);
      }
    }

    // ============================================================
    // Phase A2 Ã¢â‚¬â€ Users, Roles & Access Foundation endpoints
    // ============================================================

    // GET /api/users Ã¢â‚¬â€ list all users
    if (url.pathname === '/api/users' && req.method === 'GET') {
      const auth = requireInternal(req, origin);
      if (auth.error) return auth.error;
      try {
        const rows = db
          .query(
            `SELECT u.id, u.name, u.email, u.user_type, u.role, u.company_id,
                    u.is_active, u.created_at, u.updated_at,
                    cc.reference AS company_reference, cc.name_en AS company_name_en
             FROM users u
             LEFT JOIN customer_companies cc ON u.company_id = cc.id
             ORDER BY u.created_at DESC`,
          )
          .all();
        return jsonResponse({ users: rows, count: rows.length }, 200, origin);
      } catch (err) {
        console.error('[shanan-api] User query failed:', err);
        return errorResponse('Could not retrieve users.', 500, origin);
      }
    }

    // POST /api/users — create a new login-capable user (A5-FIX: auth + password hashing)
    if (url.pathname === '/api/users' && req.method === 'POST') {
      const auth = requireAuth(req, origin);
      if (auth.error) return auth.error;
      const supplierBlock = requireNotSupplier(req, auth.user, origin);
      if (supplierBlock) return supplierBlock;
      // - internal admin/manager: can create any user type
      // - internal employee: can create customer users only
      // - customer_admin: can create customer users for their OWN company only
      // - customer_user: cannot create users
      if (auth.user.user_type === 'customer' && auth.user.role !== 'customer_admin') {
        return errorResponse('Forbidden: insufficient permissions to create users', 403, origin);
      }

      let body: unknown;
      try { body = await req.json(); } catch { return errorResponse('Invalid JSON body', 400, origin); }
      const b = body as Record<string, unknown>;

      // Validate required fields
      if (typeof b.name !== 'string' || b.name.trim() === '') {
        return errorResponse('Validation failed: name Ã¢â‚¬â€ required', 422, origin);
      }
      if (typeof b.email !== 'string' || b.email.trim() === '' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email)) {
        return errorResponse('Validation failed: email Ã¢â‚¬â€ valid email required', 422, origin);
      }
      // A5-FIX: Password is now required for login-capable users
      if (typeof b.password !== 'string' || b.password.length < 8) {
        return errorResponse('Validation failed: password Ã¢â‚¬â€ must be at least 8 characters', 422, origin);
      }

      // Validate userType (controlled enum Ã¢â‚¬â€ reject invalid explicit values)
      const VALID_USER_TYPES = ['internal', 'customer'];
      let userType: 'internal' | 'customer' = 'customer';
      if (b.userType !== undefined && b.userType !== null) {
        if (typeof b.userType === 'string' && VALID_USER_TYPES.includes(b.userType)) {
          userType = b.userType as 'internal' | 'customer';
        } else {
          return errorResponse(`Validation failed: userType Ã¢â‚¬â€ must be 'internal' or 'customer' (got: ${String(b.userType)})`, 400, origin);
        }
      }

      // Authorization: customer_admin can only create customer users; employee can only create customer users
      if (auth.user.user_type === 'customer' && userType !== 'customer') {
        return errorResponse('Forbidden: customer users can only create customer-type users', 403, origin);
      }
      if (auth.user.user_type === 'internal' && auth.user.role === 'employee' && userType !== 'customer') {
        return errorResponse('Forbidden: employees can only create customer-type users', 403, origin);
      }

      // Validate role (controlled enum Ã¢â‚¬â€ reject invalid explicit values)
      const VALID_INTERNAL_ROLES = ['admin', 'manager', 'employee'];
      const VALID_CUSTOMER_ROLES = ['customer_admin', 'customer_user'];
      const ALL_VALID_ROLES = [...VALID_INTERNAL_ROLES, ...VALID_CUSTOMER_ROLES];
      let role: string = userType === 'internal' ? 'employee' : 'customer_user';
      if (b.role !== undefined && b.role !== null) {
        if (typeof b.role === 'string' && ALL_VALID_ROLES.includes(b.role)) {
          role = b.role;
        } else {
          return errorResponse(`Validation failed: role Ã¢â‚¬â€ must be one of: ${ALL_VALID_ROLES.join(', ')} (got: ${String(b.role)})`, 400, origin);
        }
      }

      // Cross-validate: internal roles only for internal users; customer roles only for customer users
      if (userType === 'internal' && !VALID_INTERNAL_ROLES.includes(role)) {
        return errorResponse(`Validation failed: role Ã¢â‚¬â€ internal users must have role: ${VALID_INTERNAL_ROLES.join(', ')} (got: ${role})`, 400, origin);
      }
      if (userType === 'customer' && !VALID_CUSTOMER_ROLES.includes(role)) {
        return errorResponse(`Validation failed: role Ã¢â‚¬â€ customer users must have role: ${VALID_CUSTOMER_ROLES.join(', ')} (got: ${role})`, 400, origin);
      }

      // Privilege escalation prevention: cannot create a user with higher privileges than yourself
      if (auth.user.user_type === 'internal' && auth.user.role === 'employee' && role === 'admin') {
        return errorResponse('Forbidden: cannot create users with admin role', 403, origin);
      }
      if (auth.user.user_type === 'customer' && role === 'customer_admin' && auth.user.role !== 'customer_admin') {
        return errorResponse('Forbidden: insufficient permissions', 403, origin);
      }

      // Validate company relationship:
      // - Internal users: company_id MUST be null (ignored if client sends one)
      // - Customer users: company_id MUST reference an existing customer_companies.id
      // - Customer_admin creating users: can ONLY create users for their OWN company
      let companyId: string | null = null;
      if (userType === 'internal') {
        companyId = null;
      } else {
        if (auth.user.user_type === 'customer') {
          // Customer admin: MUST use their own company (ignore client-supplied companyId)
          companyId = auth.user.company_id;
        } else {
          // Internal user creating a customer user: use client-supplied companyId (validated)
          if (typeof b.companyId !== 'string' || b.companyId.trim() === '') {
            return errorResponse('Validation failed: companyId Ã¢â‚¬â€ required for customer users', 422, origin);
          }
          const company = db
            .prepare('SELECT id FROM customer_companies WHERE id = ?')
            .get(b.companyId) as { id: string } | null;
          if (!company) {
            return errorResponse('Validation failed: companyId Ã¢â‚¬â€ references a non-existent customer company', 422, origin);
          }
          companyId = company.id;
        }
      }

      // Check email uniqueness
      const existing = db
        .prepare('SELECT id FROM users WHERE email = ?')
        .get(b.email.trim().toLowerCase()) as { id: string } | null;
      if (existing) {
        return errorResponse('Validation failed: email Ã¢â‚¬â€ already in use', 409, origin);
      }

      const id = generateId();
      const passwordHash = await hashPassword(b.password);
      const now = new Date().toISOString();

      try {
        db.prepare(
          `INSERT INTO users
             (id, name, email, password_hash, user_type, role, company_id, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        ).run(
          id,
          b.name as string,
          (b.email as string).trim().toLowerCase(),
          passwordHash,
          userType,
          role,
          companyId,
          now,
          now,
        );
        // Never return password_hash in the response
        return jsonResponse({ id, createdAt: now }, 201, origin);
      } catch (err) {
        console.error('[shanan-api] User insert failed:', err);
        return errorResponse('Could not create user.', 500, origin);
      }
    }

    // GET /api/users/:id Ã¢â‚¬â€ fetch a single user by ID
    const userMatch = url.pathname.match(/^\/api\/users\/([^/]+)$/);
    if (userMatch && req.method === 'GET') {
      const auth = requireAuth(req, origin);
      if (auth.error) return auth.error;
      const supplierBlock = requireNotSupplier(req, auth.user, origin);
      if (supplierBlock) return supplierBlock;
      const userId = decodeURIComponent(userMatch[1]);
      try {
        const user = db
          .prepare(
            `SELECT u.id, u.name, u.email, u.user_type, u.role, u.company_id,
                    u.is_active, u.created_at, u.updated_at,
                    cc.reference AS company_reference, cc.name_en AS company_name_en
             FROM users u
             LEFT JOIN customer_companies cc ON u.company_id = cc.id
             WHERE u.id = ?`,
          )
          .get(userId);
        if (!user) {
          return errorResponse('User not found', 404, origin);
        }
        // A13-1: Customer users can only view their own record; internal users can view any
        if (auth.user.user_type === 'customer' && user.id !== auth.user.id) {
          return errorResponse('User not found', 404, origin);
        }
        return jsonResponse({ user }, 200, origin);
      } catch (err) {
        console.error('[shanan-api] User lookup failed:', err);
        return errorResponse('Could not retrieve user.', 500, origin);
      }
    }

    // PATCH /api/users/:id Ã¢â‚¬â€ update user fields (role, isActive, name)
    if (userMatch && req.method === 'PATCH') {
      const auth = requireAuth(req, origin);
      if (auth.error) return auth.error;
      const supplierBlock = requireNotSupplier(req, auth.user, origin);
      if (supplierBlock) return supplierBlock;
      const userId = decodeURIComponent(userMatch[1]);
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return errorResponse('Invalid JSON body', 400, origin);
      }

      const existing = db
        .prepare('SELECT id, user_type, role, company_id FROM users WHERE id = ?')
        .get(userId) as { id: string; user_type: string; role: string; company_id: string | null } | null;
      if (!existing) {
        return errorResponse('User not found', 404, origin);
      }

      const b = body as Record<string, unknown>;
      const updates: string[] = [];
      const values: (string | number)[] = [];

      // A13-1: Authorization rules for PATCH /api/users/:id
      const isInternal = auth.user.user_type === 'internal';
      const isInternalAdminOrManager = isInternal && (auth.user.role === 'admin' || auth.user.role === 'manager');
      const isSelf = auth.user.id === existing.id;
      const isSameCompany = auth.user.company_id === existing.company_id;

      // Name update - allowed for: internal users, customer_admin for same-company users, or self
      if (typeof b.name === 'string' && b.name.trim() !== '') {
        if (!(isInternal || (auth.user.user_type === 'customer' && auth.user.role === 'customer_admin' && isSameCompany) || isSelf)) {
          return errorResponse('Forbidden: insufficient permissions to update this user', 403, origin);
        }
        updates.push('name = ?');
        values.push(b.name.trim());
      }

      // Role update Ã¢â‚¬â€ must be valid for the user's type
      if (b.role !== undefined && b.role !== null) {
        // A13-1: only internal admin/manager can change roles
        if (!isInternalAdminOrManager) {
          return errorResponse('Forbidden: only internal admin or manager can change user roles', 403, origin);
        }
        const VALID_INTERNAL_ROLES = ['admin', 'manager', 'employee'];
        const VALID_CUSTOMER_ROLES = ['customer_admin', 'customer_user'];
        const validForType = existing.user_type === 'internal' ? VALID_INTERNAL_ROLES : VALID_CUSTOMER_ROLES;
        if (typeof b.role === 'string' && validForType.includes(b.role)) {
          updates.push('role = ?');
          values.push(b.role);
        } else {
          return errorResponse(`Validation failed: role Ã¢â‚¬â€ must be one of: ${validForType.join(', ')} for userType '${existing.user_type}' (got: ${String(b.role)})`, 400, origin);
        }
      }

      // isActive update - A13-1: only internal admin/manager can change active status
      if (b.isActive !== undefined && b.isActive !== null) {
        if (!isInternalAdminOrManager) {
          return errorResponse('Forbidden: only internal admin or manager can change user active status', 403, origin);
        }
        if (typeof b.isActive === 'boolean') {
          updates.push('is_active = ?');
          values.push(b.isActive ? 1 : 0);
        } else {
          return errorResponse('Validation failed: isActive Ã¢â‚¬â€ must be boolean', 400, origin);
        }
      }

      if (updates.length === 0) {
        return errorResponse('No valid fields to update', 422, origin);
      }

      updates.push('updated_at = ?');
      values.push(new Date().toISOString());
      values.push(existing.id);

      try {
        db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);
        const updated = db
          .prepare(
            `SELECT u.id, u.name, u.email, u.user_type, u.role, u.company_id,
                    u.is_active, u.created_at, u.updated_at,
                    cc.reference AS company_reference, cc.name_en AS company_name_en
             FROM users u
             LEFT JOIN customer_companies cc ON u.company_id = cc.id
             WHERE u.id = ?`,
          )
          .get(existing.id);
        return jsonResponse({ user: updated }, 200, origin);
      } catch (err) {
        console.error('[shanan-api] User update failed:', err);
        return errorResponse('Could not update user.', 500, origin);
      }
    }

    // ============================================================
    // Phase A4 Ã¢â‚¬â€ Credit Application endpoints
    // ============================================================

    // GET /api/credit-applications Ã¢â‚¬â€ list (auth required; customer sees own only)
    if (url.pathname === '/api/credit-applications' && req.method === 'GET') {
      const auth = requireAuth(req, origin);
      if (auth.error) return auth.error;
      const supplierBlock = requireNotSupplier(req, auth.user, origin);
      if (supplierBlock) return supplierBlock;
      try {
        let rows;
        if (auth.user.user_type === 'customer') {
          // Customer: can only see own company's applications
          rows = db.query(
            `SELECT ca.*, cc.reference AS customer_company_reference, cc.name_en AS customer_company_name
             FROM credit_applications ca
             LEFT JOIN customer_companies cc ON ca.customer_company_id = cc.id
             WHERE ca.customer_company_id = ?
             ORDER BY ca.created_at DESC`,
          ).all(auth.user.company_id);
        } else {
          // Internal: can see all (or filter by customerCompanyId)
          const filterCompany = url.searchParams.get('customerCompanyId');
          if (filterCompany) {
            rows = db.query(
              `SELECT ca.*, cc.reference AS customer_company_reference, cc.name_en AS customer_company_name
               FROM credit_applications ca
               LEFT JOIN customer_companies cc ON ca.customer_company_id = cc.id
               WHERE ca.customer_company_id = ?
               ORDER BY ca.created_at DESC`,
            ).all(filterCompany);
          } else {
            rows = db.query(
              `SELECT ca.*, cc.reference AS customer_company_reference, cc.name_en AS customer_company_name
               FROM credit_applications ca
               LEFT JOIN customer_companies cc ON ca.customer_company_id = cc.id
               ORDER BY ca.created_at DESC`,
            ).all();
          }
        }
        return jsonResponse({ applications: rows, count: rows.length }, 200, origin);
      } catch (err) {
        console.error('[shanan-api] Credit application query failed:', err);
        return errorResponse('Could not retrieve credit applications.', 500, origin);
      }
    }

    // POST /api/credit-applications Ã¢â‚¬â€ create (auth required; customer uses own companyId)
    if (url.pathname === '/api/credit-applications' && req.method === 'POST') {
      const auth = requireAuth(req, origin);
      if (auth.error) return auth.error;
      const supplierBlock = requireNotSupplier(req, auth.user, origin);
      if (supplierBlock) return supplierBlock;
      let body: unknown;
      try { body = await req.json(); } catch { return errorResponse('Invalid JSON body', 400, origin); }
      const b = body as Record<string, unknown>;

      // Determine customerCompanyId:
      // - Customer users: ALWAYS use their own company_id (ignore client-supplied value)
      // - Internal users: use the client-supplied customerCompanyId (with validation)
      let customerCompanyId: string;
      if (auth.user.user_type === 'customer') {
        customerCompanyId = auth.user.company_id!;
      } else {
        if (typeof b.customerCompanyId !== 'string' || b.customerCompanyId.trim() === '') {
          return errorResponse('Validation failed: customerCompanyId Ã¢â‚¬â€ required', 422, origin);
        }
        customerCompanyId = b.customerCompanyId;
      }

      if (typeof b.authorizedPersonName !== 'string' || b.authorizedPersonName.trim() === '') {
        return errorResponse('Validation failed: authorizedPersonName Ã¢â‚¬â€ required', 422, origin);
      }

      // Verify customer company exists
      const company = db.prepare('SELECT id FROM customer_companies WHERE id = ?').get(customerCompanyId) as { id: string } | null;
      if (!company) {
        return errorResponse('Validation failed: customerCompanyId Ã¢â‚¬â€ references a non-existent customer company', 422, origin);
      }

      // Customer cannot set status directly Ã¢â‚¬â€ always starts as 'draft'
      // Customer cannot set approved/rejected/reviewed fields
      const id = generateId();
      const applicationNumber = generateCreditApplicationNumber();
      const now = new Date().toISOString();

      try {
        db.prepare(
          `INSERT INTO credit_applications
             (id, customer_company_id, application_number, status,
              requested_credit_limit, requested_payment_terms, requested_payment_method,
              business_activity, company_registration_number, tax_number,
              authorized_person_name, authorized_person_title, authorized_person_phone, authorized_person_email,
              requested_by_user_id, submitted_at, reviewed_at, reviewed_by,
              approval_notes, rejection_reason, created_at, updated_at)
           VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?)`,
        ).run(
          id,
          company.id,
          applicationNumber,
          (typeof b.requestedCreditLimit === 'string' ? b.requestedCreditLimit : null) as string | null,
          (typeof b.requestedPaymentTerms === 'string' ? b.requestedPaymentTerms : null) as string | null,
          (typeof b.requestedPaymentMethod === 'string' ? b.requestedPaymentMethod : null) as string | null,
          (typeof b.businessActivity === 'string' ? b.businessActivity : null) as string | null,
          (typeof b.companyRegistrationNumber === 'string' ? b.companyRegistrationNumber : null) as string | null,
          (typeof b.taxNumber === 'string' ? b.taxNumber : null) as string | null,
          b.authorizedPersonName as string,
          (typeof b.authorizedPersonTitle === 'string' ? b.authorizedPersonTitle : null) as string | null,
          (typeof b.authorizedPersonPhone === 'string' ? b.authorizedPersonPhone : null) as string | null,
          (typeof b.authorizedPersonEmail === 'string' ? b.authorizedPersonEmail : null) as string | null,
          now,
          now,
        );
        return jsonResponse({ id, applicationNumber, status: 'draft', createdAt: now }, 201, origin);
      } catch (err) {
        console.error('[shanan-api] Credit application insert failed:', err);
        return errorResponse('Could not create credit application.', 500, origin);
      }
    }

    // GET /api/credit-applications/:id Ã¢â‚¬â€ fetch single (auth required; customer sees own only)
    const creditMatch = url.pathname.match(/^\/api\/credit-applications\/([^/]+)$/);
    if (creditMatch && req.method === 'GET') {
      const auth = requireAuth(req, origin);
      if (auth.error) return auth.error;
      const supplierBlock = requireNotSupplier(req, auth.user, origin);
      if (supplierBlock) return supplierBlock;
      const appId = decodeURIComponent(creditMatch[1]);
      try {
        const app = db.prepare(
          `SELECT ca.*, cc.reference AS customer_company_reference, cc.name_en AS customer_company_name
           FROM credit_applications ca
           LEFT JOIN customer_companies cc ON ca.customer_company_id = cc.id
           WHERE ca.id = ? OR ca.application_number = ?`,
        ).get(appId, appId) as { customer_company_id: string } | null;
        if (!app) return errorResponse('Credit application not found', 404, origin);
        // Customer ownership check
        if (auth.user.user_type === 'customer' && app.customer_company_id !== auth.user.company_id) {
          return errorResponse('Credit application not found', 404, origin);
        }
        return jsonResponse({ application: app }, 200, origin);
      } catch (err) {
        console.error('[shanan-api] Credit application lookup failed:', err);
        return errorResponse('Could not retrieve credit application.', 500, origin);
      }
    }

    // PATCH /api/credit-applications/:id (auth required; ownership + role enforced)
    if (creditMatch && req.method === 'PATCH') {
      const auth = requireAuth(req, origin);
      if (auth.error) return auth.error;
      const supplierBlock = requireNotSupplier(req, auth.user, origin);
      if (supplierBlock) return supplierBlock;
      const appId = decodeURIComponent(creditMatch[1]);
      let body: unknown;
      try { body = await req.json(); } catch { return errorResponse('Invalid JSON body', 400, origin); }

      const existing = db.prepare('SELECT * FROM credit_applications WHERE id = ? OR application_number = ?').get(appId, appId) as Record<string, unknown> | null;
      if (!existing) return errorResponse('Credit application not found', 404, origin);

      // Customer ownership check
      if (auth.user.user_type === 'customer' && existing.customer_company_id !== auth.user.company_id) {
        return errorResponse('Credit application not found', 404, origin);
      }

      const b = body as Record<string, unknown>;
      const currentStatus = existing.status as string;
      const now = new Date().toISOString();

      // SHANAN administrative actions require internal role (admin or manager)
      const ADMIN_ACTIONS = ['start_review', 'approve', 'reject', 'return_for_correction'];
      if (ADMIN_ACTIONS.includes(b.action)) {
        if (auth.user.user_type !== 'internal') {
          return errorResponse('Forbidden: SHANAN internal access required for this action', 403, origin);
        }
        if (b.action !== 'start_review' && auth.user.role !== 'admin' && auth.user.role !== 'manager') {
          return errorResponse('Forbidden: admin or manager role required for this action', 403, origin);
        }
      }

      // Handle SHANAN administrative actions (status transitions)
      if (b.action === 'submit') {
        // Customer submits draft Ã¢â€ â€™ submitted
        if (currentStatus !== 'draft' && currentStatus !== 'returned_for_correction') {
          return errorResponse(`Cannot submit: current status is '${currentStatus}' (must be 'draft' or 'returned_for_correction')`, 400, origin);
        }
        db.prepare('UPDATE credit_applications SET status = ?, submitted_at = ?, updated_at = ? WHERE id = ?').run('submitted', now, now, existing.id);
        return jsonResponse({ application: db.prepare('SELECT * FROM credit_applications WHERE id = ?').get(existing.id) }, 200, origin);
      }

      if (b.action === 'start_review') {
        // SHANAN moves submitted Ã¢â€ â€™ under_review
        if (currentStatus !== 'submitted') {
          return errorResponse(`Cannot start review: current status is '${currentStatus}' (must be 'submitted')`, 400, origin);
        }
        db.prepare('UPDATE credit_applications SET status = ?, updated_at = ? WHERE id = ?').run('under_review', now, existing.id);
        return jsonResponse({ application: db.prepare('SELECT * FROM credit_applications WHERE id = ?').get(existing.id) }, 200, origin);
      }

      if (b.action === 'approve') {
        if (currentStatus !== 'under_review') {
          return errorResponse(`Cannot approve: current status is '${currentStatus}' (must be 'under_review')`, 400, origin);
        }
        const notes = typeof b.approvalNotes === 'string' ? b.approvalNotes : null;
        const reviewer = typeof b.reviewedBy === 'string' ? b.reviewedBy : null;
        db.prepare('UPDATE credit_applications SET status = ?, approval_notes = ?, reviewed_at = ?, reviewed_by = ?, updated_at = ? WHERE id = ?').run('approved', notes, now, reviewer, now, existing.id);
        return jsonResponse({ application: db.prepare('SELECT * FROM credit_applications WHERE id = ?').get(existing.id) }, 200, origin);
      }

      if (b.action === 'reject') {
        if (currentStatus !== 'under_review') {
          return errorResponse(`Cannot reject: current status is '${currentStatus}' (must be 'under_review')`, 400, origin);
        }
        const reason = typeof b.rejectionReason === 'string' ? b.rejectionReason : null;
        const reviewer = typeof b.reviewedBy === 'string' ? b.reviewedBy : null;
        db.prepare('UPDATE credit_applications SET status = ?, rejection_reason = ?, reviewed_at = ?, reviewed_by = ?, updated_at = ? WHERE id = ?').run('rejected', reason, now, reviewer, now, existing.id);
        return jsonResponse({ application: db.prepare('SELECT * FROM credit_applications WHERE id = ?').get(existing.id) }, 200, origin);
      }

      if (b.action === 'return_for_correction') {
        if (currentStatus !== 'under_review') {
          return errorResponse(`Cannot return: current status is '${currentStatus}' (must be 'under_review')`, 400, origin);
        }
        db.prepare('UPDATE credit_applications SET status = ?, updated_at = ? WHERE id = ?').run('returned_for_correction', now, existing.id);
        return jsonResponse({ application: db.prepare('SELECT * FROM credit_applications WHERE id = ?').get(existing.id) }, 200, origin);
      }

      if (b.action === 'cancel') {
        if (currentStatus !== 'draft' && currentStatus !== 'returned_for_correction') {
          return errorResponse(`Cannot cancel: current status is '${currentStatus}'`, 400, origin);
        }
        db.prepare('UPDATE credit_applications SET status = ?, updated_at = ? WHERE id = ?').run('cancelled', now, existing.id);
        return jsonResponse({ application: db.prepare('SELECT * FROM credit_applications WHERE id = ?').get(existing.id) }, 200, origin);
      }

      // Handle field updates (customer edit Ã¢â‚¬â€ only allowed in DRAFT or RETURNED_FOR_CORRECTION)
      if (currentStatus !== 'draft' && currentStatus !== 'returned_for_correction') {
        return errorResponse(`Cannot edit: application status is '${currentStatus}'. Only 'draft' or 'returned_for_correction' applications can be edited.`, 400, origin);
      }

      const updates: string[] = [];
      const values: (string | null)[] = [];

      const editableFields: [string, string][] = [
        ['requestedCreditLimit', 'requested_credit_limit'],
        ['requestedPaymentTerms', 'requested_payment_terms'],
        ['requestedPaymentMethod', 'requested_payment_method'],
        ['businessActivity', 'business_activity'],
        ['companyRegistrationNumber', 'company_registration_number'],
        ['taxNumber', 'tax_number'],
        ['authorizedPersonName', 'authorized_person_name'],
        ['authorizedPersonTitle', 'authorized_person_title'],
        ['authorizedPersonPhone', 'authorized_person_phone'],
        ['authorizedPersonEmail', 'authorized_person_email'],
      ];

      for (const [field, col] of editableFields) {
        if (b[field] !== undefined) {
          if (typeof b[field] === 'string') {
            updates.push(`${col} = ?`);
            values.push((b[field] as string).trim());
          } else if (b[field] === null) {
            updates.push(`${col} = ?`);
            values.push(null);
          } else {
            return errorResponse(`Validation failed: ${field} Ã¢â‚¬â€ must be a string or null`, 400, origin);
          }
        }
      }

      if (updates.length === 0) {
        return errorResponse('No valid fields to update', 422, origin);
      }

      updates.push('updated_at = ?');
      values.push(now);
      values.push(existing.id as string);

      try {
        db.prepare(`UPDATE credit_applications SET ${updates.join(', ')} WHERE id = ?`).run(...values);
        return jsonResponse({ application: db.prepare('SELECT * FROM credit_applications WHERE id = ?').get(existing.id) }, 200, origin);
      } catch (err) {
        console.error('[shanan-api] Credit application update failed:', err);
        return errorResponse('Could not update credit application.', 500, origin);
      }
    }

    // ============================================================
    // Phase A8 Ã¢â‚¬â€ Account Records, Closure, Credit Customer View, PDF
    // ============================================================

    // GET /api/account-records?customerCompanyId=X Ã¢â‚¬â€ list financial records (auth + ownership)
    if (url.pathname === '/api/account-records' && req.method === 'GET') {
      const auth = requireAuth(req, origin);
      if (auth.error) return auth.error;
      const supplierBlock = requireNotSupplier(req, auth.user, origin);
      if (supplierBlock) return supplierBlock;
      try {
        let rows;
        if (auth.user.user_type === 'customer') {
          rows = db.query('SELECT * FROM customer_account_records WHERE customer_company_id = ? ORDER BY created_at DESC').all(auth.user.company_id);
        } else {
          const filterCompany = url.searchParams.get('customerCompanyId');
          if (filterCompany) {
            rows = db.query('SELECT * FROM customer_account_records WHERE customer_company_id = ? ORDER BY created_at DESC').all(filterCompany);
          } else {
            rows = db.query('SELECT * FROM customer_account_records ORDER BY created_at DESC').all();
          }
        }
        return jsonResponse({ records: rows, count: rows.length }, 200, origin);
      } catch (err) {
        console.error('[shanan-api] Account records query failed:', err);
        return errorResponse('Could not retrieve account records.', 500, origin);
      }
    }

    // POST /api/account-records Ã¢â‚¬â€ create financial record (internal only)
    if (url.pathname === '/api/account-records' && req.method === 'POST') {
      const auth = requireInternal(req, origin);
      if (auth.error) return auth.error;
      let body: unknown;
      try { body = await req.json(); } catch { return errorResponse('Invalid JSON', 400, origin); }
      const b = body as Record<string, unknown>;
      if (typeof b.customerCompanyId !== 'string' || typeof b.recordType !== 'string' || typeof b.amount !== 'number') {
        return errorResponse('customerCompanyId, recordType, amount required', 422, origin);
      }
      const id = generateId();
      const ref = `ACC-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      const now = new Date().toISOString();
      try {
        db.prepare('INSERT INTO customer_account_records (id, customer_company_id, supply_request_id, record_type, reference, description, amount, due_date, status, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(id, b.customerCompanyId, (typeof b.supplyRequestId === 'string' ? b.supplyRequestId : null) as string | null, b.recordType as string, ref, (typeof b.description === 'string' ? b.description : null) as string | null, b.amount as number, (typeof b.dueDate === 'string' ? b.dueDate : null) as string | null, 'open', auth.user.id, now, now);
        return jsonResponse({ id, reference: ref, createdAt: now }, 201, origin);
      } catch (err) {
        console.error('[shanan-api] Account record insert failed:', err);
        return errorResponse('Could not create account record.', 500, origin);
      }
    }

    // GET /api/account-summary Ã¢â‚¬â€ customer's financial summary (auth + ownership)
    if (url.pathname === '/api/account-summary' && req.method === 'GET') {
      const auth = requireAuth(req, origin);
      if (auth.error) return auth.error;
      const supplierBlock = requireNotSupplier(req, auth.user, origin);
      if (supplierBlock) return supplierBlock;
      const companyId = auth.user.user_type === 'customer' ? auth.user.company_id : url.searchParams.get('customerCompanyId');
      if (!companyId) return errorResponse('customerCompanyId required for internal users', 422, origin);
      try {
        const records = db.query('SELECT amount, status, record_type, due_date FROM customer_account_records WHERE customer_company_id = ?').all(companyId);
        let outstanding = 0, paid = 0;
        for (const r of records) {
          if (r.record_type === 'invoice' && r.status === 'open') outstanding += r.amount;
          if (r.status === 'paid') paid += r.amount;
        }
        const remaining = outstanding - paid;
        const openInvoices = records.filter((r: any) => r.record_type === 'invoice' && r.status === 'open');
        let oldestDays = 0;
        if (openInvoices.length > 0) {
          const oldest = openInvoices.reduce((min: any, r: any) => r.due_date && (!min || r.due_date < min) ? r.due_date : min, null);
          if (oldest) oldestDays = Math.max(0, Math.floor((Date.now() - new Date(oldest).getTime()) / 86400000));
        }
        return jsonResponse({ outstanding: Math.max(0, outstanding), paid, remaining: Math.max(0, remaining), agingDays: oldestDays, totalRecords: records.length }, 200, origin);
      } catch (err) {
        console.error('[shanan-api] Account summary failed:', err);
        return errorResponse('Could not retrieve account summary.', 500, origin);
      }
    }

    // GET /api/credit-applications Ã¢â‚¬â€ already exists with auth, but we need to ensure customer-safe view
    // (The A4/A5 endpoint already filters by company_id for customers Ã¢â‚¬â€ no change needed)

    // PATCH /api/supply-requests/:id Ã¢â‚¬â€ A8: internal closure action
    // (The A6 PATCH handler already exists; we add the 'close' action via a new check before the existing handler)
    // This is handled by checking for action === 'close' in the existing PATCH handler
    // We need to add it to the INTERNAL_TRANSITIONS in the existing PATCH handler

    // GET /api/supply-requests/:id/pdf Ã¢â‚¬â€ generate official PDF document (auth + ownership)
    // A8-FIX: Real server-generated PDF binary (Content-Type: application/pdf).
    // Reuses A5 authentication and A6 ownership isolation. Cross-company access
    // returns safe 404. No internal notes / approval data is exposed.
    const pdfMatch = url.pathname.match(/^\/api\/supply-requests\/([^/]+)\/pdf$/);
    if (pdfMatch && req.method === 'GET') {
      const auth = requireAuth(req, origin);
      if (auth.error) return auth.error;
      const supplierBlock = requireNotSupplier(req, auth.user, origin);
      if (supplierBlock) return supplierBlock;
      const requestId = decodeURIComponent(pdfMatch[1]);
      try {
        // Fetch authoritative request data + customer company (server-side source of truth)
        const req_data = db.prepare(
          `SELECT sr.id, sr.reference, sr.requester_name, sr.company_name, sr.email, sr.phone,
                  sr.country, sr.city, sr.message, sr.status, sr.created_at, sr.customer_po_number,
                  sr.customer_company_id, sr.credit_application_id,
                  sr.official_doc_reference, sr.closed_at,
                  cc.reference AS cc_ref, cc.name_en AS cc_name
             FROM supply_requests sr
             LEFT JOIN customer_companies cc ON sr.customer_company_id = cc.id
            WHERE sr.id = ? OR sr.reference = ?`
        ).get(requestId, requestId) as any;
        if (!req_data) return errorResponse('Request not found', 404, origin);
        // A6 ownership protection: customer may only download their own company's documents.
        // Safe 404 (no leak) when cross-company.
        if (auth.user.user_type === 'customer' && req_data.customer_company_id !== auth.user.company_id) {
          return errorResponse('Request not found', 404, origin);
        }
        const items = db.query(
          'SELECT product_id, product_name, sku, quantity, notes FROM supply_request_items WHERE request_id = ? ORDER BY id ASC'
        ).all(req_data.id) as any[];

        // A8-FIX (Step 4): Include the linked Credit Application reference ONLY when
        // a real relationship exists AND the application is approved (eligible).
        // Customer-safe information only Ã¢â‚¬â€ never expose internal reviewer notes,
        // approval_notes, rejection_reason, or reviewed_by.
        let creditAppRef: string | null = null;
        if (req_data.credit_application_id) {
          const ca = db.prepare(
            `SELECT application_number, status FROM credit_applications WHERE id = ?`
          ).get(req_data.credit_application_id) as any | undefined;
          if (ca && ca.status === 'approved') {
            creditAppRef = ca.application_number;
          }
        }

        const pdfBytes = await generateOfficialDocumentPDF(req_data, items, creditAppRef);
        const filename = `SHANAN-${req_data.reference}.pdf`;
        return new Response(pdfBytes, {
          status: 200,
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Content-Length': String(pdfBytes.byteLength),
            'Cache-Control': 'private, no-store',
            ...corsHeaders(origin),
          },
        });
      } catch (err) {
        console.error('[shanan-api] PDF generation failed:', err);
        return errorResponse('Could not generate document.', 500, origin);
      }
    }

    // ============================================================
    // STEP 17 PHASE 3 — Supplier-Facing Agreement Endpoints
    // Every query is scoped by the authenticated supplier_id.
    // A supplier can ONLY see/manage its own agreements and terms.
    // ============================================================

    // GET /api/supplier/agreements — supplier lists its own agreements
    if (url.pathname === '/api/supplier/agreements' && req.method === 'GET') {
      const auth = requireSupplier(req, origin);
      if (auth.error) return auth.error;
      try {
        const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
        const pageSize = Math.min(50, Math.max(1, parseInt(url.searchParams.get('pageSize') || '20', 10)));
        const statusFilter = url.searchParams.get('status');
        const search = url.searchParams.get('search')?.trim() || '';

        let where = ['sa.supplier_id = ?'];
        const params: any[] = [auth.supplierId];
        if (statusFilter) { where.push('sa.status = ?'); params.push(statusFilter); }
        if (search) { where.push('(sa.agreement_number LIKE ? OR sa.trade_terms_notes LIKE ?)'); const q = `%${search}%`; params.push(q, q); }
        const whereClause = where.join(' AND ');

        const total = (db.prepare(`SELECT COUNT(*) as n FROM supplier_agreements sa WHERE ${whereClause}`).get(...params) as any).n;
        const totalPages = Math.ceil(total / pageSize) || 1;
        const offset = (page - 1) * pageSize;

        const agreements = db.query(
          `SELECT sa.id, sa.agreement_number, sa.status, sa.effective_from, sa.effective_to,
                  sa.currency, sa.payment_terms_days, sa.supplier_credit_limit,
                  sa.trade_terms_notes, sa.created_at, sa.updated_at,
                  (SELECT COUNT(*) FROM agreement_product_terms apt WHERE apt.agreement_id = sa.id) AS term_count,
                  (SELECT COUNT(*) FROM agreement_product_terms apt WHERE apt.agreement_id = sa.id AND apt.status = 'active') AS active_term_count
             FROM supplier_agreements sa
            WHERE ${whereClause}
            ORDER BY sa.created_at DESC
            LIMIT ? OFFSET ?`,
        ).all(...params, pageSize, offset);

        return jsonResponse({ agreements, total, page, pageSize, totalPages }, 200, origin);
      } catch (err) {
        console.error('[shanan-api] Supplier agreements list failed:', err);
        return errorResponse('Could not load agreements.', 500, origin);
      }
    }

    // GET /api/supplier/agreements/:id — supplier views one agreement with product terms
    const supplierAgrMatch = url.pathname.match(/^\/api\/supplier\/agreements\/([^/]+)$/);
    if (supplierAgrMatch && req.method === 'GET') {
      const auth = requireSupplier(req, origin);
      if (auth.error) return auth.error;
      const agrId = decodeURIComponent(supplierAgrMatch[1]);
      try {
        const agreement = db.prepare(
          `SELECT sa.* FROM supplier_agreements sa WHERE sa.id = ? AND sa.supplier_id = ?`,
        ).get(agrId, auth.supplierId) as any;
        if (!agreement) return errorResponse('Agreement not found', 404, origin);

        const terms = db.query(
          `SELECT apt.* FROM agreement_product_terms apt WHERE apt.agreement_id = ? ORDER BY apt.created_at ASC`,
        ).all(agreement.id) as any[];
        const enrichedTerms = terms.map((t: any) => {
          const product = getProductSummary(t.product_id);
          return {
            ...t,
            canonical_product_sku: product?.sku ?? null,
            canonical_product_name_en: product?.nameEn ?? null,
          };
        });
        return jsonResponse({ agreement, productTerms: enrichedTerms, productTermsCount: enrichedTerms.length }, 200, origin);
      } catch (err) {
        console.error('[shanan-api] Supplier agreement detail failed:', err);
        return errorResponse('Could not load agreement.', 500, origin);
      }
    }

    // POST /api/supplier/agreements/:id/terms — supplier adds a product term to its own agreement
    const supplierTermsMatch = url.pathname.match(/^\/api\/supplier\/agreements\/([^/]+)\/terms$/);
    if (supplierTermsMatch && req.method === 'POST') {
      const auth = requireSupplier(req, origin);
      if (auth.error) return auth.error;
      const agrId = decodeURIComponent(supplierTermsMatch[1]);
      const agreement = db.prepare('SELECT id, currency FROM supplier_agreements WHERE id = ? AND supplier_id = ?').get(agrId, auth.supplierId) as any;
      if (!agreement) return errorResponse('Agreement not found', 404, origin);

      let body: unknown;
      try { body = await req.json(); } catch { return errorResponse('Invalid JSON body', 400, origin); }
      const b = body as Record<string, unknown>;

      if (typeof b.productId !== 'string' || b.productId.trim() === '') return errorResponse('Validation failed: productId required', 422, origin);
      if (!isValidProductId(b.productId)) return errorResponse('Validation failed: productId references a non-existent product', 422, origin);
      if (typeof b.unitPrice !== 'number' || b.unitPrice < 0 || !isFinite(b.unitPrice)) return errorResponse('Validation failed: unitPrice must be a non-negative number', 422, origin);

      let availabilityStatus = 'available';
      if (b.availabilityStatus && typeof b.availabilityStatus === 'string' && ['available', 'limited', 'unavailable', 'expected'].includes(b.availabilityStatus)) availabilityStatus = b.availabilityStatus;

      let moq: number | null = null;
      if (typeof b.minimumOrderQuantity === 'number' && Number.isInteger(b.minimumOrderQuantity) && b.minimumOrderQuantity >= 0) moq = b.minimumOrderQuantity;
      let leadTime: number | null = null;
      if (typeof b.leadTimeDays === 'number' && Number.isInteger(b.leadTimeDays) && b.leadTimeDays >= 0) leadTime = b.leadTimeDays;

      const id = generateId();
      const now = new Date().toISOString();
      try {
        db.prepare(
          `INSERT INTO agreement_product_terms
             (id, agreement_id, product_id, supplier_product_code, supplier_product_name,
              unit_price, currency, minimum_order_quantity, price_valid_from, price_valid_to,
              availability_status, available_quantity, availability_updated_at, expected_available_date,
              lead_time_days, status, internal_notes, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
        ).run(
          id, agreement.id, b.productId,
          typeof b.supplierProductCode === 'string' ? b.supplierProductCode.trim() : null,
          typeof b.supplierProductName === 'string' ? b.supplierProductName.trim() : null,
          b.unitPrice,
          typeof b.currency === 'string' && b.currency.trim() ? b.currency.trim() : null,
          moq,
          typeof b.priceValidFrom === 'string' ? b.priceValidFrom : null,
          typeof b.priceValidTo === 'string' ? b.priceValidTo : null,
          availabilityStatus,
          typeof b.availableQuantity === 'number' ? b.availableQuantity : null,
          now,
          typeof b.expectedAvailableDate === 'string' ? b.expectedAvailableDate : null,
          leadTime,
          typeof b.internalNotes === 'string' ? b.internalNotes.trim() : null,
          now, now,
        );
        return jsonResponse({ id, createdAt: now }, 201, origin);
      } catch (err) {
        console.error('[shanan-api] Supplier product term insert failed:', err);
        return errorResponse('Could not create product term.', 500, origin);
      }
    }

    // PATCH /api/supplier/agreements/:id/terms/:termId — supplier updates its own term
    const supplierTermMatch = url.pathname.match(/^\/api\/supplier\/agreements\/([^/]+)\/terms\/([^/]+)$/);
    if (supplierTermMatch && req.method === 'PATCH') {
      const auth = requireSupplier(req, origin);
      if (auth.error) return auth.error;
      const agrId = decodeURIComponent(supplierTermMatch[1]);
      const termId = decodeURIComponent(supplierTermMatch[2]);

      const agreement = db.prepare('SELECT id FROM supplier_agreements WHERE id = ? AND supplier_id = ?').get(agrId, auth.supplierId) as { id: string } | null;
      if (!agreement) return errorResponse('Agreement not found', 404, origin);
      const existing = db.prepare('SELECT * FROM agreement_product_terms WHERE id = ? AND agreement_id = ?').get(termId, agreement.id) as any;
      if (!existing) return errorResponse('Product term not found', 404, origin);

      let body: unknown;
      try { body = await req.json(); } catch { return errorResponse('Invalid JSON body', 400, origin); }
      const b = body as Record<string, unknown>;
      const updates: string[] = [];
      const values: (string | number | null)[] = [];

      if (b.unitPrice !== undefined) { if (typeof b.unitPrice === 'number' && b.unitPrice >= 0 && isFinite(b.unitPrice)) { updates.push('unit_price = ?'); values.push(b.unitPrice); } else return errorResponse('unitPrice must be a non-negative number', 400, origin); }
      if (b.currency !== undefined) { updates.push('currency = ?'); values.push(typeof b.currency === 'string' && b.currency.trim() ? b.currency.trim() : null); }
      if (b.supplierProductCode !== undefined) { updates.push('supplier_product_code = ?'); values.push(typeof b.supplierProductCode === 'string' ? b.supplierProductCode.trim() : null); }
      if (b.supplierProductName !== undefined) { updates.push('supplier_product_name = ?'); values.push(typeof b.supplierProductName === 'string' ? b.supplierProductName.trim() : null); }
      if (b.minimumOrderQuantity !== undefined) { updates.push('minimum_order_quantity = ?'); values.push(typeof b.minimumOrderQuantity === 'number' ? b.minimumOrderQuantity : null); }
      if (b.leadTimeDays !== undefined) { updates.push('lead_time_days = ?'); values.push(typeof b.leadTimeDays === 'number' ? b.leadTimeDays : null); }
      if (b.availabilityStatus !== undefined && typeof b.availabilityStatus === 'string' && ['available', 'limited', 'unavailable', 'expected'].includes(b.availabilityStatus)) { updates.push('availability_status = ?'); updates.push('availability_updated_at = ?'); values.push(b.availabilityStatus); values.push(new Date().toISOString()); }
      if (b.priceValidFrom !== undefined) { updates.push('price_valid_from = ?'); values.push(typeof b.priceValidFrom === 'string' ? b.priceValidFrom : null); }
      if (b.priceValidTo !== undefined) { updates.push('price_valid_to = ?'); values.push(typeof b.priceValidTo === 'string' ? b.priceValidTo : null); }
      if (b.status !== undefined && typeof b.status === 'string' && ['active', 'inactive'].includes(b.status)) { updates.push('status = ?'); values.push(b.status); }
      if (b.internalNotes !== undefined) { updates.push('internal_notes = ?'); values.push(typeof b.internalNotes === 'string' ? b.internalNotes.trim() : null); }

      if (updates.length === 0) return errorResponse('No valid fields to update', 422, origin);
      updates.push('updated_at = ?');
      values.push(new Date().toISOString());
      values.push(existing.id);
      try {
        db.prepare(`UPDATE agreement_product_terms SET ${updates.join(', ')} WHERE id = ?`).run(...values);
        const updated = db.prepare('SELECT * FROM agreement_product_terms WHERE id = ?').get(existing.id);
        return jsonResponse({ productTerm: updated }, 200, origin);
      } catch (err) {
        console.error('[shanan-api] Supplier product term update failed:', err);
        return errorResponse('Could not update product term.', 500, origin);
      }
    }

    // DELETE /api/supplier/agreements/:id/terms/:termId — supplier deactivates its own term
    if (supplierTermMatch && req.method === 'DELETE') {
      const auth = requireSupplier(req, origin);
      if (auth.error) return auth.error;
      const agrId = decodeURIComponent(supplierTermMatch[1]);
      const termId = decodeURIComponent(supplierTermMatch[2]);
      const agreement = db.prepare('SELECT id FROM supplier_agreements WHERE id = ? AND supplier_id = ?').get(agrId, auth.supplierId) as { id: string } | null;
      if (!agreement) return errorResponse('Agreement not found', 404, origin);
      const existing = db.prepare('SELECT id FROM agreement_product_terms WHERE id = ? AND agreement_id = ?').get(termId, agreement.id) as { id: string } | null;
      if (!existing) return errorResponse('Product term not found', 404, origin);
      try {
        db.prepare(`UPDATE agreement_product_terms SET status = 'inactive', updated_at = ? WHERE id = ?`).run(new Date().toISOString(), existing.id);
        return jsonResponse({ ok: true, deactivated: true, id: existing.id }, 200, origin);
      } catch (err) {
        console.error('[shanan-api] Supplier product term deactivation failed:', err);
        return errorResponse('Could not deactivate product term.', 500, origin);
      }
    }

    // ============================================================
    // Phase A10 — Internal RFQ / Supplier Sourcing Workflow
    // INTERNAL SHANAN CONFIDENTIAL DATA.
    // Every endpoint below requires `requireInternal` Ã¢â‚¬â€ customer users are
    // rejected with HTTP 403 at the API layer (not just hidden UI).
    // No supplier/price/credit/availability data is exposed to customers.
    // ============================================================

    // --- A9.1 Suppliers --------------------------------------------------

    // GET /api/suppliers Ã¢â‚¬â€ list all suppliers (internal only)
    if (url.pathname === '/api/suppliers' && req.method === 'GET') {
      const auth = requireInternal(req, origin);
      if (auth.error) return auth.error;
      try {
        const rows = db.query(
          `SELECT s.*, u.name AS created_by_name
             FROM suppliers s
             LEFT JOIN users u ON s.created_by = u.id
            ORDER BY s.created_at DESC`,
        ).all();
        return jsonResponse({ suppliers: rows, count: rows.length }, 200, origin);
      } catch (err) {
        console.error('[shanan-api] Suppliers query failed:', err);
        return errorResponse('Could not retrieve suppliers.', 500, origin);
      }
    }

    // POST /api/suppliers Ã¢â‚¬â€ create a new supplier (internal only)
    if (url.pathname === '/api/suppliers' && req.method === 'POST') {
      const auth = requireInternal(req, origin);
      if (auth.error) return auth.error;
      let body: unknown;
      try { body = await req.json(); } catch { return errorResponse('Invalid JSON body', 400, origin); }
      const b = body as Record<string, unknown>;
      if (typeof b.nameEn !== 'string' || b.nameEn.trim() === '') {
        return errorResponse('Validation failed: nameEn Ã¢â‚¬â€ required', 422, origin);
      }
      // Controlled status enum
      let status: 'pending' | 'under_review' | 'active' | 'suspended' | 'terminated' = 'pending';
      if (b.status !== undefined && b.status !== null) {
        if (typeof b.status === 'string' && ['pending', 'under_review', 'active', 'suspended', 'terminated'].includes(b.status)) {
          status = b.status as 'pending' | 'under_review' | 'active' | 'suspended' | 'terminated';
        } else {
          return errorResponse(`Validation failed: status — must be one of: pending, under_review, active, suspended, terminated (got: ${String(b.status)})`, 400, origin);
        }
      }
      const id = generateId();
      const reference = generateSupplierReference();
      const now = new Date().toISOString();
      try {
        db.prepare(
          `INSERT INTO suppliers
             (id, reference, name_en, name_ar, status, country, contact_name, contact_email,
              contact_phone, tax_id, notes, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          id, reference,
          b.nameEn as string,
          (typeof b.nameAr === 'string' ? b.nameAr : null) as string | null,
          status,
          (typeof b.country === 'string' ? b.country.trim() : null) as string | null,
          (typeof b.contactName === 'string' ? b.contactName.trim() : null) as string | null,
          (typeof b.contactEmail === 'string' ? b.contactEmail.trim() : null) as string | null,
          (typeof b.contactPhone === 'string' ? b.contactPhone.trim() : null) as string | null,
          (typeof b.taxId === 'string' ? b.taxId.trim() : null) as string | null,
          (typeof b.notes === 'string' ? b.notes.trim() : null) as string | null,
          auth.user.id, now, now,
        );
        return jsonResponse({ id, reference, createdAt: now }, 201, origin);
      } catch (err) {
        console.error('[shanan-api] Supplier insert failed:', err);
        return errorResponse('Could not create supplier.', 500, origin);
      }
    }

    // GET /api/suppliers/:id Ã¢â‚¬â€ fetch single supplier + its agreements (internal only)
    const supplierMatch = url.pathname.match(/^\/api\/suppliers\/([^/]+)$/);
    if (supplierMatch && req.method === 'GET') {
      const auth = requireInternal(req, origin);
      if (auth.error) return auth.error;
      const supplierIdOrRef = decodeURIComponent(supplierMatch[1]);
      try {
        const supplier = db.prepare(
          `SELECT s.*, u.name AS created_by_name
             FROM suppliers s
             LEFT JOIN users u ON s.created_by = u.id
            WHERE s.id = ? OR s.reference = ?`,
        ).get(supplierIdOrRef, supplierIdOrRef) as any;
        if (!supplier) return errorResponse('Supplier not found', 404, origin);
        // Also fetch agreements summary
        const agreements = db.query(
          `SELECT id, agreement_number, status, effective_from, effective_to, currency,
                  payment_terms_days, supplier_credit_limit, created_at
             FROM supplier_agreements
            WHERE supplier_id = ?
            ORDER BY created_at DESC`,
        ).all(supplier.id);
        return jsonResponse({ supplier, agreements, agreementsCount: agreements.length }, 200, origin);
      } catch (err) {
        console.error('[shanan-api] Supplier lookup failed:', err);
        return errorResponse('Could not retrieve supplier.', 500, origin);
      }
    }

    // PATCH /api/suppliers/:id Ã¢â‚¬â€ update supplier (internal only)
    if (supplierMatch && req.method === 'PATCH') {
      const auth = requireInternal(req, origin);
      if (auth.error) return auth.error;
      const supplierIdOrRef = decodeURIComponent(supplierMatch[1]);
      let body: unknown;
      try { body = await req.json(); } catch { return errorResponse('Invalid JSON body', 400, origin); }
      const existing = db.prepare('SELECT id FROM suppliers WHERE id = ? OR reference = ?').get(supplierIdOrRef, supplierIdOrRef) as { id: string } | null;
      if (!existing) return errorResponse('Supplier not found', 404, origin);
      const b = body as Record<string, unknown>;
      const updates: string[] = [];
      const values: (string | null)[] = [];
      // Controlled field updates
      const editableFields: [string, string][] = [
        ['nameEn', 'name_en'], ['nameAr', 'name_ar'], ['country', 'country'],
        ['contactName', 'contact_name'], ['contactEmail', 'contact_email'],
        ['contactPhone', 'contact_phone'], ['taxId', 'tax_id'], ['notes', 'notes'],
      ];
      for (const [field, col] of editableFields) {
        if (b[field] !== undefined) {
          if (typeof b[field] === 'string') {
            updates.push(`${col} = ?`);
            values.push((b[field] as string).trim());
          } else if (b[field] === null) {
            updates.push(`${col} = ?`);
            values.push(null);
          } else {
            return errorResponse(`Validation failed: ${field} Ã¢â‚¬â€ must be a string or null`, 400, origin);
          }
        }
      }
      if (b.status !== undefined && b.status !== null) {
        if (typeof b.status === 'string' && ['pending', 'under_review', 'active', 'suspended', 'terminated'].includes(b.status)) {
          updates.push('status = ?');
          values.push(b.status);
        } else {
          return errorResponse(`Validation failed: status — must be one of: pending, under_review, active, suspended, terminated`, 400, origin);
        }
      }
      if (updates.length === 0) return errorResponse('No valid fields to update', 422, origin);
      updates.push('updated_at = ?');
      values.push(new Date().toISOString());
      values.push(existing.id);
      try {
        db.prepare(`UPDATE suppliers SET ${updates.join(', ')} WHERE id = ?`).run(...values);
        const updated = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(existing.id);
        return jsonResponse({ supplier: updated }, 200, origin);
      } catch (err) {
        console.error('[shanan-api] Supplier update failed:', err);
        return errorResponse('Could not update supplier.', 500, origin);
      }
    }

    // --- A9.1a Supplier Registration (public) ------------------------------

    // POST /api/auth/register-supplier — public supplier registration
    if (url.pathname === '/api/auth/register-supplier' && req.method === 'POST') {
      let body: unknown;
      try { body = await req.json(); } catch { return errorResponse('Invalid JSON body', 400, origin); }
      const b = body as Record<string, unknown>;
      if (typeof b.companyName !== 'string' || b.companyName.trim() === '') return errorResponse('Company name is required', 422, origin);
      if (typeof b.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email)) return errorResponse('Valid email is required', 422, origin);
      if (typeof b.password !== 'string' || b.password.length < 8) return errorResponse('Password must be at least 8 characters', 422, origin);
      if (typeof b.contactName !== 'string' || b.contactName.trim() === '') return errorResponse('Contact name is required', 422, origin);
      const email = b.email.trim().toLowerCase();
      const dup = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
      if (dup) return errorResponse('Email already in use', 409, origin);
      try {
        // Create supplier record (pending status)
        const supplierId = generateId();
        const supplierRef = generateSupplierReference();
        const now = new Date().toISOString();
        db.prepare(
          `INSERT INTO suppliers (id, reference, name_en, name_ar, status, country, city, address, website, contact_name, contact_email, contact_phone, tax_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          supplierId, supplierRef,
          (b.companyName as string).trim(),
          (typeof b.companyNameAr === 'string' ? (b.companyNameAr as string).trim() : null) as string | null,
          (typeof b.country === 'string' ? (b.country as string).trim() : null) as string | null,
          (typeof b.city === 'string' ? (b.city as string).trim() : null) as string | null,
          (typeof b.address === 'string' ? (b.address as string).trim() : null) as string | null,
          (typeof b.website === 'string' ? (b.website as string).trim() : null) as string | null,
          (b.contactName as string).trim(),
          email,
          (typeof b.contactPhone === 'string' ? (b.contactPhone as string).trim() : null) as string | null,
          (typeof b.taxId === 'string' ? (b.taxId as string).trim() : null) as string | null,
          now, now,
        );
        // Create supplier admin user
        const userId = generateId();
        const hash = await hashPassword(b.password as string);
        db.prepare(
          `INSERT INTO users (id, name, email, password_hash, user_type, role, company_id, supplier_id, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'supplier', 'supplier_admin', NULL, ?, 1, ?, ?)`,
        ).run(userId, (b.contactName as string).trim(), email, hash, supplierId, now, now);
        // H1: No session token is issued for a pending supplier. The PENDING supplier
        // must NOT receive an active session at registration; they can only log in and
        // access the supplier portal once an internal user has approved/activated them.
        // Operational supplier APIs remain blocked (403) while status is pending/under_review.
        return jsonResponse(
          {
            supplier: { id: supplierId, reference: supplierRef },
            status: 'pending',
            message: 'Supplier registration submitted for approval. You will be able to log in once your account is activated.',
          },
          201,
          origin,
        );
      } catch (err) {
        console.error('[shanan-api] Supplier registration failed:', err);
        return errorResponse('Registration failed', 500, origin);
      }
    }

    // --- A9.1b Supplier Portal Endpoints (supplier-auth required) ----------

    // GET /api/supplier/profile — supplier views own profile
    if (url.pathname === '/api/supplier/profile' && req.method === 'GET') {
      const auth = requireSupplierAnyStatus(req, origin);
      if (auth.error) return auth.error;
      try {
        const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(auth.supplierId);
        return jsonResponse({ supplier }, 200, origin);
      } catch (err) {
        return errorResponse('Could not load supplier profile.', 500, origin);
      }
    }

    // PATCH /api/supplier/profile — supplier updates permitted profile fields
    if (url.pathname === '/api/supplier/profile' && req.method === 'PATCH') {
      const auth = requireSupplierAnyStatus(req, origin);
      if (auth.error) return auth.error;
      let body: unknown;
      try { body = await req.json(); } catch { return errorResponse('Invalid JSON body', 400, origin); }
      const b = body as Record<string, unknown>;
      const updates: string[] = [];
      const values: (string | null)[] = [];
      const editableFields: [string, string][] = [
        ['nameAr', 'name_ar'], ['country', 'country'], ['city', 'city'],
        ['address', 'address'], ['website', 'website'],
        ['contactName', 'contact_name'], ['contactPhone', 'contact_phone'],
        ['taxId', 'tax_id'], ['notes', 'notes'],
      ];
      for (const [field, col] of editableFields) {
        if (b[field] !== undefined) {
          if (typeof b[field] === 'string') {
            updates.push(`${col} = ?`);
            values.push((b[field] as string).trim());
          } else if (b[field] === null) {
            updates.push(`${col} = ?`);
            values.push(null);
          }
        }
      }
      if (updates.length === 0) return errorResponse('No valid fields to update', 422, origin);
      updates.push('updated_at = ?');
      values.push(new Date().toISOString());
      values.push(auth.supplierId);
      try {
        db.prepare(`UPDATE suppliers SET ${updates.join(', ')} WHERE id = ?`).run(...values);
        const updated = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(auth.supplierId);
        return jsonResponse({ supplier: updated }, 200, origin);
      } catch (err) {
        return errorResponse('Could not update profile.', 500, origin);
      }
    }

    // GET /api/supplier/rfqs — supplier views only RFQs assigned to them
    if (url.pathname === '/api/supplier/rfqs' && req.method === 'GET') {
      const auth = requireSupplier(req, origin);
      if (auth.error) return auth.error;
      try {
        const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
        const pageSize = Math.min(50, Math.max(1, parseInt(url.searchParams.get('pageSize') || '20', 10)));
        const statusFilter = url.searchParams.get('status');
        const search = url.searchParams.get('search')?.trim() || '';

        let where = ['rs.supplier_id = ?'];
        const params: any[] = [auth.supplierId];

        if (statusFilter) {
          where.push('rfq.status = ?');
          params.push(statusFilter);
        }
        if (search) {
          where.push('(rfq.reference LIKE ? OR sr.reference LIKE ?)');
          const q = `%${search}%`;
          params.push(q, q);
        }

        const whereClause = where.join(' AND ');
        const total = (db.prepare(
          `SELECT COUNT(*) as n FROM rfq_suppliers rs JOIN rfqs rfq ON rs.rfq_id = rfq.id LEFT JOIN supply_requests sr ON rfq.supply_request_id = sr.id WHERE ${whereClause}`,
        ).get(...params) as any).n;
        const totalPages = Math.ceil(total / pageSize) || 1;
        const offset = (page - 1) * pageSize;

        const rfqs = db.query(
          `SELECT rfq.id, rfq.reference, rfq.status, rfq.sent_at, rfq.created_at, rfq.updated_at,
                  rs.response_state, rs.responded_at,
                  sr.reference AS supply_request_reference,
                  (SELECT COUNT(*) FROM rfq_items WHERE rfq_id = rfq.id) AS item_count,
                  (SELECT COUNT(DISTINCT rso.rfq_item_id) FROM rfq_supplier_offers rso
                    JOIN rfq_suppliers rs2 ON rso.rfq_supplier_id = rs2.id
                    WHERE rs2.rfq_id = rfq.id AND rs2.supplier_id = ?) AS offer_count
             FROM rfq_suppliers rs
             JOIN rfqs rfq ON rs.rfq_id = rfq.id
             LEFT JOIN supply_requests sr ON rfq.supply_request_id = sr.id
            WHERE ${whereClause}
            ORDER BY rfq.created_at DESC
            LIMIT ? OFFSET ?`,
        ).all(auth.supplierId, ...params, pageSize, offset);

        return jsonResponse({ rfqs, total, page, pageSize, totalPages }, 200, origin);
      } catch (err) {
        console.error('[shanan-api] Supplier RFQ list failed:', err);
        return errorResponse('Could not load RFQs.', 500, origin);
      }
    }

    // GET /api/supplier/rfqs/:id — supplier views one RFQ (only if assigned)
    const supplierRfqMatch = url.pathname.match(/^\/api\/supplier\/rfqs\/([^/]+)$/);
    if (supplierRfqMatch && req.method === 'GET') {
      const auth = requireSupplier(req, origin);
      if (auth.error) return auth.error;
      const rfqId = decodeURIComponent(supplierRfqMatch[1]);
      try {
        // Verify supplier is assigned to this RFQ
        const assignment = db.prepare('SELECT id FROM rfq_suppliers WHERE rfq_id = ? AND supplier_id = ?').get(rfqId, auth.supplierId) as { id: string } | null;
        if (!assignment) return errorResponse('RFQ not found or not assigned to you', 404, origin);
        const rfq = db.prepare('SELECT id, reference, status, sent_at, created_at, updated_at FROM rfqs WHERE id = ?').get(rfqId);
        if (!rfq) return errorResponse('RFQ not found', 404, origin);
        // Get items for this RFQ
        const items = db.query(
          `SELECT ri.id, ri.rfq_id, ri.supply_request_item_id,
                  sri.product_id, sri.product_name, sri.sku, sri.quantity AS requested_quantity,
                  ri.customer_notes, ri.rfq_notes
             FROM rfq_items ri
             JOIN supply_request_items sri ON ri.supply_request_item_id = sri.id
            WHERE ri.rfq_id = ?`,
        ).all(rfqId);
        // Get this supplier's existing offer for each item (if any)
        const existingOffers = db.query(
          `SELECT rso.* FROM rfq_supplier_offers rso WHERE rso.rfq_supplier_id = ?`,
        ).all(assignment.id);
        // Attach existing offer to each item
        const itemsWithOffers = (items as any[]).map((item: any) => {
          const offer = (existingOffers as any[]).find((o: any) => o.rfq_item_id === item.id);
          return {
            ...item,
            existing_offer: offer ? {
              id: offer.id,
              offer_status: offer.offer_status,
              quoted_unit_price: offer.quoted_unit_price,
              currency: offer.currency,
              offered_quantity: offer.offered_quantity,
              lead_time_days: offer.lead_time_days,
              validity_date: offer.validity_date,
              minimum_order_quantity: offer.minimum_order_quantity,
              payment_terms: offer.payment_terms,
              commercial_notes: offer.commercial_notes,
              responded_at: offer.responded_at,
            } : null,
          };
        });
        return jsonResponse({ rfq, items: itemsWithOffers }, 200, origin);
      } catch (err) {
        console.error('[shanan-api] Supplier RFQ detail failed:', err);
        return errorResponse('Could not load RFQ details.', 500, origin);
      }
    }

    // POST /api/supplier/rfqs/:id/offers — supplier submits offer (only for assigned RFQ)
    const supplierRfqOfferMatch = url.pathname.match(/^\/api\/supplier\/rfqs\/([^/]+)\/offers$/);
    if (supplierRfqOfferMatch && req.method === 'POST') {
      const auth = requireSupplier(req, origin);
      if (auth.error) return auth.error;
      const rfqId = decodeURIComponent(supplierRfqOfferMatch[1]);
      // Verify supplier is assigned
      const assignment = db.prepare('SELECT id FROM rfq_suppliers WHERE rfq_id = ? AND supplier_id = ?').get(rfqId, auth.supplierId) as { id: string } | null;
      if (!assignment) return errorResponse('RFQ not found or not assigned to you', 404, origin);
      // PHASE F: RFQ status guard — only allow offers on sent or partially_responded RFQs
      const rfqRecord = db.prepare('SELECT status FROM rfqs WHERE id = ?').get(rfqId) as { status: string } | null;
      if (!rfqRecord) return errorResponse('RFQ not found', 404, origin);
      if (!['sent', 'partially_responded'].includes(rfqRecord.status)) {
        return errorResponse(`RFQ is ${rfqRecord.status} and does not accept offers`, 409, origin);
      }
      let body: unknown;
      try { body = await req.json(); } catch { return errorResponse('Invalid JSON body', 400, origin); }
      const b = body as Record<string, unknown>;
      // PHASE G: Validation
      if (typeof b.rfqItemId !== 'string') return errorResponse('rfqItemId is required', 422, origin);
      if (typeof b.unitPrice !== 'number' || b.unitPrice <= 0) return errorResponse('unitPrice must be greater than 0', 422, origin);
      if (typeof b.currency !== 'string' || !['JOD', 'USD', 'EUR', 'GBP', 'SAR', 'AED'].includes(b.currency.trim())) {
        return errorResponse('Valid currency is required (JOD, USD, EUR, GBP, SAR, AED)', 422, origin);
      }
      // Verify rfqItemId belongs to this RFQ
      const rfqItem = db.prepare('SELECT id FROM rfq_items WHERE id = ? AND rfq_id = ?').get(b.rfqItemId, rfqId);
      if (!rfqItem) return errorResponse('Invalid rfqItemId for this RFQ', 422, origin);
      if (b.leadTimeDays !== undefined && b.leadTimeDays !== null && (typeof b.leadTimeDays !== 'number' || b.leadTimeDays < 0)) {
        return errorResponse('leadTimeDays must be a non-negative number', 422, origin);
      }
      try {
        // Check for existing offer on this item for this supplier
        const existing = db.prepare(
          'SELECT id FROM rfq_supplier_offers WHERE rfq_supplier_id = ? AND rfq_item_id = ?',
        ).get(assignment.id, b.rfqItemId);
        if (existing) return errorResponse('An offer already exists for this item. Use PUT to update.', 409, origin);
        const offerId = generateId();
        const now = new Date().toISOString();
        db.prepare(
          `INSERT INTO rfq_supplier_offers (id, rfq_supplier_id, rfq_item_id, offer_status, quoted_unit_price, currency, offered_quantity, lead_time_days, validity_date, minimum_order_quantity, payment_terms, commercial_notes, responded_at, created_at, updated_at)
           VALUES (?, ?, ?, 'quoted', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          offerId, assignment.id, b.rfqItemId,
          b.unitPrice, (b.currency as string).trim(),
          typeof b.offeredQuantity === 'number' ? b.offeredQuantity : null,
          typeof b.leadTimeDays === 'number' ? b.leadTimeDays : null,
          typeof b.validityDate === 'string' ? b.validityDate : null,
          typeof b.minimumOrderQuantity === 'number' ? b.minimumOrderQuantity : null,
          typeof b.paymentTerms === 'string' ? b.paymentTerms.trim() : null,
          typeof b.notes === 'string' ? b.notes.trim() : null,
          now, now, now,
        );
        // Update supplier response_state
        updateSupplierResponseState(assignment.id, rfqId);
        // Auto-update RFQ status
        updateRfqAggregateStatus(rfqId, now);
        // Create notification
        createNotification(auth.user.id, 'SUPPLIER_OFFER_SUBMITTED',
          'Offer Submitted', 'تم تقديم العرض',
          `Your offer for RFQ ${rfqRecord.status === 'sent' ? '' : ''}has been submitted.`,
          `تم تقديم عرضك لطلب التسعير.`,
          'rfq', rfqId);
        return jsonResponse({ id: offerId, message: 'Offer submitted' }, 201, origin);
      } catch (err) {
        console.error('[shanan-api] Supplier offer submit failed:', err);
        return errorResponse('Could not submit offer.', 500, origin);
      }
    }

    // PUT /api/supplier/rfqs/:id/offers/:offerId — supplier updates an existing offer
    const supplierOfferPutMatch = url.pathname.match(/^\/api\/supplier\/rfqs\/([^/]+)\/offers\/([^/]+)$/);
    if (supplierOfferPutMatch && req.method === 'PUT') {
      const auth = requireSupplier(req, origin);
      if (auth.error) return auth.error;
      const rfqId = decodeURIComponent(supplierOfferPutMatch[1]);
      const offerId = decodeURIComponent(supplierOfferPutMatch[2]);
      // Verify supplier is assigned
      const assignment = db.prepare('SELECT id FROM rfq_suppliers WHERE rfq_id = ? AND supplier_id = ?').get(rfqId, auth.supplierId) as { id: string } | null;
      if (!assignment) return errorResponse('RFQ not found or not assigned to you', 404, origin);
      // Verify offer belongs to this supplier
      const offer = db.prepare(
        'SELECT id, rfq_item_id FROM rfq_supplier_offers WHERE id = ? AND rfq_supplier_id = ?',
      ).get(offerId, assignment.id) as { id: string; rfq_item_id: string } | null;
      if (!offer) return errorResponse('Offer not found', 404, origin);
      // PHASE F: RFQ status guard
      const rfqRecord = db.prepare('SELECT status FROM rfqs WHERE id = ?').get(rfqId) as { status: string } | null;
      if (!rfqRecord) return errorResponse('RFQ not found', 404, origin);
      if (!['sent', 'partially_responded', 'responded'].includes(rfqRecord.status)) {
        return errorResponse(`RFQ is ${rfqRecord.status} and does not accept offer updates`, 409, origin);
      }
      let body: unknown;
      try { body = await req.json(); } catch { return errorResponse('Invalid JSON body', 400, origin); }
      const b = body as Record<string, unknown>;
      // PHASE G: Validation
      if (b.unitPrice !== undefined && (typeof b.unitPrice !== 'number' || b.unitPrice <= 0)) {
        return errorResponse('unitPrice must be greater than 0', 422, origin);
      }
      if (b.currency !== undefined && (typeof b.currency !== 'string' || !['JOD', 'USD', 'EUR', 'GBP', 'SAR', 'AED'].includes(b.currency.trim()))) {
        return errorResponse('Valid currency is required', 422, origin);
      }
      if (b.leadTimeDays !== undefined && b.leadTimeDays !== null && (typeof b.leadTimeDays !== 'number' || b.leadTimeDays < 0)) {
        return errorResponse('leadTimeDays must be a non-negative number', 422, origin);
      }
      try {
        const updates: string[] = [];
        const values: any[] = [];
        if (typeof b.unitPrice === 'number') { updates.push('quoted_unit_price = ?'); values.push(b.unitPrice); }
        if (typeof b.currency === 'string') { updates.push('currency = ?'); values.push(b.currency.trim()); }
        if (typeof b.offeredQuantity === 'number') { updates.push('offered_quantity = ?'); values.push(b.offeredQuantity); }
        else if (b.offeredQuantity === null) { updates.push('offered_quantity = ?'); values.push(null); }
        if (typeof b.leadTimeDays === 'number') { updates.push('lead_time_days = ?'); values.push(b.leadTimeDays); }
        else if (b.leadTimeDays === null) { updates.push('lead_time_days = ?'); values.push(null); }
        if (typeof b.validityDate === 'string') { updates.push('validity_date = ?'); values.push(b.validityDate); }
        else if (b.validityDate === null) { updates.push('validity_date = ?'); values.push(null); }
        if (typeof b.minimumOrderQuantity === 'number') { updates.push('minimum_order_quantity = ?'); values.push(b.minimumOrderQuantity); }
        else if (b.minimumOrderQuantity === null) { updates.push('minimum_order_quantity = ?'); values.push(null); }
        if (typeof b.paymentTerms === 'string') { updates.push('payment_terms = ?'); values.push(b.paymentTerms.trim()); }
        else if (b.paymentTerms === null) { updates.push('payment_terms = ?'); values.push(null); }
        if (typeof b.notes === 'string') { updates.push('commercial_notes = ?'); values.push(b.notes.trim()); }
        else if (b.notes === null) { updates.push('commercial_notes = ?'); values.push(null); }
        if (updates.length === 0) return errorResponse('No fields to update', 422, origin);
        updates.push('updated_at = ?');
        values.push(new Date().toISOString());
        values.push(offerId);
        db.prepare(`UPDATE rfq_supplier_offers SET ${updates.join(', ')} WHERE id = ?`).run(...values);
        // Update supplier response_state
        updateSupplierResponseState(assignment.id, rfqId);
        // Auto-update RFQ status
        updateRfqAggregateStatus(rfqId, new Date().toISOString());
        // Notification
        createNotification(auth.user.id, 'SUPPLIER_OFFER_UPDATED',
          'Offer Updated', 'تم تحديث العرض',
          `Your offer has been updated.`,
          `تم تحديث عرضك.`,
          'rfq', rfqId);
        return jsonResponse({ message: 'Offer updated' }, 200, origin);
      } catch (err) {
        console.error('[shanan-api] Supplier offer update failed:', err);
        return errorResponse('Could not update offer.', 500, origin);
      }
    }

    // DELETE /api/supplier/rfqs/:id/offers/:offerId — supplier withdraws an offer
    if (supplierOfferPutMatch && req.method === 'DELETE') {
      const auth = requireSupplier(req, origin);
      if (auth.error) return auth.error;
      const rfqId = decodeURIComponent(supplierOfferPutMatch[1]);
      const offerId = decodeURIComponent(supplierOfferPutMatch[2]);
      // Verify supplier is assigned
      const assignment = db.prepare('SELECT id FROM rfq_suppliers WHERE rfq_id = ? AND supplier_id = ?').get(rfqId, auth.supplierId) as { id: string } | null;
      if (!assignment) return errorResponse('RFQ not found or not assigned to you', 404, origin);
      // Verify offer belongs to this supplier
      const offer = db.prepare(
        'SELECT id FROM rfq_supplier_offers WHERE id = ? AND rfq_supplier_id = ?',
      ).get(offerId, assignment.id);
      if (!offer) return errorResponse('Offer not found', 404, origin);
      // PHASE F: RFQ status guard
      const rfqRecord = db.prepare('SELECT status FROM rfqs WHERE id = ?').get(rfqId) as { status: string } | null;
      if (!rfqRecord) return errorResponse('RFQ not found', 404, origin);
      if (!['sent', 'partially_responded', 'responded'].includes(rfqRecord.status)) {
        return errorResponse(`RFQ is ${rfqRecord.status} and does not allow offer withdrawal`, 409, origin);
      }
      try {
        db.prepare('DELETE FROM rfq_supplier_offers WHERE id = ?').run(offerId);
        // Update supplier response_state
        updateSupplierResponseState(assignment.id, rfqId);
        // Auto-update RFQ status (may revert from responded to partially_responded)
        updateRfqAggregateStatus(rfqId, new Date().toISOString());
        // Notification
        createNotification(auth.user.id, 'SUPPLIER_OFFER_WITHDRAWN',
          'Offer Withdrawn', 'تم سحب العرض',
          `Your offer has been withdrawn.`,
          `تم سحب عرضك.`,
          'rfq', rfqId);
        return jsonResponse({ message: 'Offer withdrawn' }, 200, origin);
      } catch (err) {
        console.error('[shanan-api] Supplier offer withdraw failed:', err);
        return errorResponse('Could not withdraw offer.', 500, origin);
      }
    }

    // --- STEP 17: Supplier Product Catalog ----------------------------------

    // GET /api/supplier/products — supplier lists their own products (with master catalog data)
    if (url.pathname === '/api/supplier/products' && req.method === 'GET') {
      const auth = requireSupplier(req, origin);
      if (auth.error) return auth.error;
      try {
        const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
        const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get('pageSize') || '24', 10)));
        const search = url.searchParams.get('search')?.trim() || '';
        const categoryId = url.searchParams.get('categoryId');
        const brandId = url.searchParams.get('brandId');
        const availability = url.searchParams.get('availability');
        const activeOnly = url.searchParams.get('activeOnly');
        const withPrice = url.searchParams.get('withPrice');

        let where = ['sp.supplier_id = ?'];
        const params: any[] = [auth.supplierId];

        if (search) {
          where.push("(p.name_en LIKE ? OR p.name_ar LIKE ? OR p.sku LIKE ? OR p.product_code LIKE ? OR sp.supplier_sku LIKE ? OR sp.supplier_product_name LIKE ?)");
          const q = `%${search}%`;
          params.push(q, q, q, q, q, q);
        }
        if (categoryId) { where.push('p.category_id = ?'); params.push(categoryId); }
        if (brandId) { where.push('p.brand_id = ?'); params.push(brandId); }
        if (availability) { where.push('sp.availability_status = ?'); params.push(availability); }
        if (activeOnly === '1') { where.push('sp.is_active = 1'); }
        if (withPrice === '1') { where.push('sp.unit_price IS NOT NULL'); }
        if (withPrice === '0') { where.push('sp.unit_price IS NULL'); }

        const whereClause = where.join(' AND ');

        const total = (db.prepare(`SELECT COUNT(*) as n FROM supplier_products sp JOIN products p ON sp.product_id = p.id WHERE ${whereClause}`).get(...params) as any).n;
        const totalPages = Math.ceil(total / pageSize) || 1;
        const offset = (page - 1) * pageSize;

        const rows = db.query(
          `SELECT sp.id, sp.supplier_id, sp.product_id, sp.supplier_sku, sp.supplier_product_name,
                  sp.unit_price, sp.currency, sp.minimum_order_quantity, sp.lead_time_days,
                  sp.availability_status, sp.payment_terms, sp.notes, sp.is_active,
                  sp.created_at, sp.updated_at,
                  p.sku, p.product_code, p.name_en, p.name_ar, p.category_id, p.brand_id,
                  p.availability AS master_availability, p.sell_price AS master_sell_price,
                  p.currency AS master_currency, p.stock_quantity,
                  c.name_en AS category_name_en, c.name_ar AS category_name_ar,
                  b.name AS brand_name,
                  (SELECT pi.storage_key FROM product_images pi WHERE pi.product_id = p.id AND pi.is_primary = 1 LIMIT 1) AS primary_image_key
             FROM supplier_products sp
             JOIN products p ON sp.product_id = p.id
             LEFT JOIN categories c ON p.category_id = c.id
             LEFT JOIN brands b ON p.brand_id = b.id
            WHERE ${whereClause}
            ORDER BY sp.created_at DESC
            LIMIT ? OFFSET ?`,
        ).all(...params, pageSize, offset) as any[];

        const items = rows.map((r: any) => ({
          id: r.id,
          supplierId: r.supplier_id,
          productId: r.product_id,
          supplierSku: r.supplier_sku,
          supplierProductName: r.supplier_product_name,
          unitPrice: r.unit_price,
          currency: r.currency,
          minimumOrderQuantity: r.minimum_order_quantity,
          leadTimeDays: r.lead_time_days,
          availabilityStatus: r.availability_status,
          paymentTerms: r.payment_terms,
          notes: r.notes,
          isActive: r.is_active === 1,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
          masterProduct: {
            id: r.product_id,
            sku: r.sku,
            productCode: r.product_code,
            name: { en: r.name_en, ar: r.name_ar || r.name_en },
            categoryId: r.category_id,
            brandId: r.brand_id,
            brandName: r.brand_name,
            categoryName: r.category_name_en ? { en: r.category_name_en, ar: r.category_name_ar || r.category_name_en } : null,
            availability: r.master_availability,
            sellPrice: r.master_sell_price,
            currency: r.master_currency,
            stockQuantity: r.stock_quantity,
            primaryImage: r.primary_image_key ? `/api/storage/${r.primary_image_key}` : null,
          },
        }));

        return jsonResponse({ items, total, page, pageSize, totalPages }, 200, origin);
      } catch (err) {
        console.error('[shanan-api] Supplier products list failed:', err);
        return errorResponse('Could not load supplier products.', 500, origin);
      }
    }

    // GET /api/supplier/products/summary — dashboard counters
    if (url.pathname === '/api/supplier/products/summary' && req.method === 'GET') {
      const auth = requireSupplier(req, origin);
      if (auth.error) return auth.error;
      try {
        const stats = db.prepare(
          `SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN sp.is_active = 1 THEN 1 ELSE 0 END) AS active,
            SUM(CASE WHEN sp.unit_price IS NOT NULL THEN 1 ELSE 0 END) AS with_price,
            SUM(CASE WHEN sp.unit_price IS NULL THEN 1 ELSE 0 END) AS without_price
           FROM supplier_products sp WHERE sp.supplier_id = ?`,
        ).get(auth.supplierId) as any;
        const rfqCount = (db.prepare(
          `SELECT COUNT(*) AS cnt FROM rfq_suppliers rs JOIN rfqs rfq ON rs.rfq_id = rfq.id
            WHERE rs.supplier_id = ? AND rfq.status IN ('sent','partially_responded')`,
        ).get(auth.supplierId) as any).cnt;
        return jsonResponse({
          totalProducts: stats?.total || 0,
          activeProducts: stats?.active || 0,
          withPrice: stats?.with_price || 0,
          withoutPrice: stats?.without_price || 0,
          activeRfqs: rfqCount || 0,
        }, 200, origin);
      } catch (err) {
        console.error('[shanan-api] Supplier products summary failed:', err);
        return errorResponse('Could not load summary.', 500, origin);
      }
    }

    // GET /api/supplier/products/:id — supplier views one product with master + supplier data
    const supplierProductGetMatch = url.pathname.match(/^\/api\/supplier\/products\/([^/]+)$/);
    if (supplierProductGetMatch && req.method === 'GET') {
      const auth = requireSupplier(req, origin);
      if (auth.error) return auth.error;
      const spId = decodeURIComponent(supplierProductGetMatch[1]);
      try {
        const row = db.prepare(
          `SELECT sp.id, sp.supplier_id, sp.product_id, sp.supplier_sku, sp.supplier_product_name,
                  sp.unit_price, sp.currency, sp.minimum_order_quantity, sp.lead_time_days,
                  sp.availability_status, sp.payment_terms, sp.notes, sp.is_active,
                  sp.created_at, sp.updated_at,
                  p.sku, p.product_code, p.name_en, p.name_ar, p.description_en, p.description_ar,
                  p.category_id, p.brand_id, p.manufacturer, p.availability, p.sell_price,
                  p.currency AS master_currency, p.stock_quantity,
                  c.name_en AS category_name_en, c.name_ar AS category_name_ar, c.slug AS category_slug,
                  b.name AS brand_name, b.slug AS brand_slug
             FROM supplier_products sp
             JOIN products p ON sp.product_id = p.id
             LEFT JOIN categories c ON p.category_id = c.id
             LEFT JOIN brands b ON p.brand_id = b.id
            WHERE sp.id = ? AND sp.supplier_id = ?`,
        ).get(spId, auth.supplierId) as any;
        if (!row) return errorResponse('Supplier product not found', 404, origin);
        const images = db.query(
          `SELECT * FROM product_images WHERE product_id = ? ORDER BY is_primary DESC, sort_order ASC`,
        ).all(row.product_id) as any[];
        const specs = db.query(
          `SELECT * FROM product_specifications WHERE product_id = ? ORDER BY sort_order ASC`,
        ).all(row.product_id) as any[];
        return jsonResponse({
          id: row.id,
          supplierId: row.supplier_id,
          productId: row.product_id,
          supplierSku: row.supplier_sku,
          supplierProductName: row.supplier_product_name,
          unitPrice: row.unit_price,
          currency: row.currency,
          minimumOrderQuantity: row.minimum_order_quantity,
          leadTimeDays: row.lead_time_days,
          availabilityStatus: row.availability_status,
          paymentTerms: row.payment_terms,
          notes: row.notes,
          isActive: row.is_active === 1,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          masterProduct: {
            id: row.product_id,
            sku: row.sku,
            productCode: row.product_code,
            name: { en: row.name_en, ar: row.name_ar || row.name_en },
            description: { en: row.description_en || '', ar: row.description_ar || '' },
            manufacturer: row.manufacturer,
            categoryId: row.category_id,
            brandId: row.brand_id,
            brandName: row.brand_name,
            brandSlug: row.brand_slug,
            categoryName: row.category_name_en ? { en: row.category_name_en, ar: row.category_name_ar || row.category_name_en } : null,
            categorySlug: row.category_slug,
            availability: row.availability,
            sellPrice: row.sell_price,
            currency: row.master_currency,
            stockQuantity: row.stock_quantity,
            images: images.map((img: any) => ({
              id: img.id,
              url: img.public_url || `/api/storage/${img.storage_key}`,
              alt: { en: img.alt_en || '', ar: img.alt_ar || '' },
              isPrimary: img.is_primary === 1,
              sortOrder: img.sort_order,
            })),
            specifications: specs.map((s: any) => ({
              label: { en: s.label_en, ar: s.label_ar || s.label_en },
              value: { en: s.value_en, ar: s.value_ar || s.value_en },
              group: { en: s.group_en || '', ar: s.group_ar || '' },
            })),
          },
        }, 200, origin);
      } catch (err) {
        console.error('[shanan-api] Supplier product detail failed:', err);
        return errorResponse('Could not load product.', 500, origin);
      }
    }

    // POST /api/supplier/products — add a product to supplier's catalog
    if (url.pathname === '/api/supplier/products' && req.method === 'POST') {
      const auth = requireSupplier(req, origin);
      if (auth.error) return auth.error;
      let body: unknown;
      try { body = await req.json(); } catch { return errorResponse('Invalid JSON body', 400, origin); }
      const b = body as Record<string, unknown>;
      if (typeof b.productId !== 'string' || !b.productId.trim()) return errorResponse('productId is required', 422, origin);
      // Validate product exists and is active
      if (!isValidProductId(b.productId.trim())) return errorResponse('Product not found or inactive', 422, origin);
      // Check duplicate
      const existing = db.prepare('SELECT id FROM supplier_products WHERE supplier_id = ? AND product_id = ?').get(auth.supplierId, b.productId.trim());
      if (existing) return errorResponse('Product already in your catalog', 409, origin);
      const id = generateId();
      const now = new Date().toISOString();
      try {
        db.prepare(
          `INSERT INTO supplier_products (id, supplier_id, product_id, supplier_sku, supplier_product_name, unit_price, currency, minimum_order_quantity, lead_time_days, availability_status, payment_terms, notes, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        ).run(
          id, auth.supplierId, b.productId.trim(),
          typeof b.supplierSku === 'string' ? b.supplierSku.trim() : null,
          typeof b.supplierProductName === 'string' ? b.supplierProductName.trim() : null,
          typeof b.unitPrice === 'number' ? b.unitPrice : null,
          typeof b.currency === 'string' && b.currency.trim() ? b.currency.trim() : 'JOD',
          typeof b.minimumOrderQuantity === 'number' && b.minimumOrderQuantity > 0 ? b.minimumOrderQuantity : null,
          typeof b.leadTimeDays === 'number' && b.leadTimeDays >= 0 ? b.leadTimeDays : null,
          typeof b.availabilityStatus === 'string' ? b.availabilityStatus : 'available',
          typeof b.paymentTerms === 'string' ? b.paymentTerms.trim() : null,
          typeof b.notes === 'string' ? b.notes.trim() : null,
          now, now,
        );
        return jsonResponse({ id, message: 'Product added to catalog' }, 201, origin);
      } catch (err) {
        console.error('[shanan-api] Supplier product create failed:', err);
        return errorResponse('Could not add product.', 500, origin);
      }
    }

    // PATCH /api/supplier/products/:id — update supplier-specific fields
    const supplierProductPatchMatch = url.pathname.match(/^\/api\/supplier\/products\/([^/]+)$/);
    if (supplierProductPatchMatch && req.method === 'PATCH') {
      const auth = requireSupplier(req, origin);
      if (auth.error) return auth.error;
      const spId = decodeURIComponent(supplierProductPatchMatch[1]);
      // Verify ownership
      const owned = db.prepare('SELECT id FROM supplier_products WHERE id = ? AND supplier_id = ?').get(spId, auth.supplierId);
      if (!owned) return errorResponse('Supplier product not found', 404, origin);
      let body: unknown;
      try { body = await req.json(); } catch { return errorResponse('Invalid JSON body', 400, origin); }
      const b = body as Record<string, unknown>;
      const updates: string[] = [];
      const values: (string | number | null)[] = [];
      const editable: [string, string, string][] = [
        ['supplierSku', 'supplier_sku', 'string'],
        ['supplierProductName', 'supplier_product_name', 'string'],
        ['unitPrice', 'unit_price', 'number'],
        ['currency', 'currency', 'string'],
        ['minimumOrderQuantity', 'minimum_order_quantity', 'number'],
        ['leadTimeDays', 'lead_time_days', 'number'],
        ['availabilityStatus', 'availability_status', 'string'],
        ['paymentTerms', 'payment_terms', 'string'],
        ['notes', 'notes', 'string'],
        ['isActive', 'is_active', 'boolean'],
      ];
      for (const [field, col, type] of editable) {
        if (b[field] !== undefined) {
          if (type === 'string' && typeof b[field] === 'string') {
            updates.push(`${col} = ?`);
            values.push(b[field].trim());
          } else if (type === 'number' && typeof b[field] === 'number') {
            updates.push(`${col} = ?`);
            values.push(b[field]);
          } else if (type === 'boolean' && typeof b[field] === 'boolean') {
            updates.push(`${col} = ?`);
            values.push(b[field] ? 1 : 0);
          } else if (b[field] === null) {
            updates.push(`${col} = ?`);
            values.push(null);
          }
        }
      }
      if (updates.length === 0) return errorResponse('No valid fields to update', 422, origin);
      updates.push('updated_at = ?');
      values.push(new Date().toISOString());
      values.push(spId);
      try {
        db.prepare(`UPDATE supplier_products SET ${updates.join(', ')} WHERE id = ?`).run(...values);
        return jsonResponse({ message: 'Updated' }, 200, origin);
      } catch (err) {
        console.error('[shanan-api] Supplier product update failed:', err);
        return errorResponse('Could not update product.', 500, origin);
      }
    }

    // DELETE /api/supplier/products/:id — deactivate (not master delete)
    const supplierProductDeleteMatch = url.pathname.match(/^\/api\/supplier\/products\/([^/]+)$/);
    if (supplierProductDeleteMatch && req.method === 'DELETE') {
      const auth = requireSupplier(req, origin);
      if (auth.error) return auth.error;
      const spId = decodeURIComponent(supplierProductDeleteMatch[1]);
      const owned = db.prepare('SELECT id FROM supplier_products WHERE id = ? AND supplier_id = ?').get(spId, auth.supplierId);
      if (!owned) return errorResponse('Supplier product not found', 404, origin);
      try {
        db.prepare('UPDATE supplier_products SET is_active = 0, updated_at = ? WHERE id = ?').run(new Date().toISOString(), spId);
        return jsonResponse({ message: 'Product deactivated from catalog' }, 200, origin);
      } catch (err) {
        return errorResponse('Could not deactivate product.', 500, origin);
      }
    }

    // --- STEP 17 PHASE 2: Supplier Notifications ---------------------------

    // GET /api/supplier/notifications — supplier lists their notifications
    if (url.pathname === '/api/supplier/notifications' && req.method === 'GET') {
      const auth = requireSupplier(req, origin);
      if (auth.error) return auth.error;
      try {
        const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
        const pageSize = Math.min(50, Math.max(1, parseInt(url.searchParams.get('pageSize') || '20', 10)));
        const unreadOnly = url.searchParams.get('unreadOnly') === '1';

        let where = 'n.user_id = ?';
        const params: any[] = [auth.user.id];
        if (unreadOnly) { where += ' AND n.is_read = 0'; }

        const total = (db.prepare(`SELECT COUNT(*) as n FROM notifications n WHERE ${where}`).get(...params) as any).n;
        const totalPages = Math.ceil(total / pageSize) || 1;
        const offset = (page - 1) * pageSize;

        const notifications = db.query(
          `SELECT n.id, n.event_type, n.title_en, n.title_ar, n.body_en, n.body_ar,
                  n.entity_type, n.entity_id, n.is_read, n.created_at
             FROM notifications n
            WHERE ${where}
            ORDER BY n.created_at DESC
            LIMIT ? OFFSET ?`,
        ).all(...params, pageSize, offset);

        const unreadCount = (db.prepare(
          'SELECT COUNT(*) as n FROM notifications WHERE user_id = ? AND is_read = 0',
        ).get(auth.user.id) as any).n;

        return jsonResponse({ notifications, total, page, pageSize, totalPages, unreadCount }, 200, origin);
      } catch (err) {
        console.error('[shanan-api] Notifications list failed:', err);
        return errorResponse('Could not load notifications.', 500, origin);
      }
    }

    // PATCH /api/supplier/notifications/:id/read — mark one as read
    const notifReadMatch = url.pathname.match(/^\/api\/supplier\/notifications\/([^/]+)\/read$/);
    if (notifReadMatch && req.method === 'PATCH') {
      const auth = requireSupplier(req, origin);
      if (auth.error) return auth.error;
      const notifId = decodeURIComponent(notifReadMatch[1]);
      try {
        const notif = db.prepare('SELECT id FROM notifications WHERE id = ? AND user_id = ?').get(notifId, auth.user.id);
        if (!notif) return errorResponse('Notification not found', 404, origin);
        db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').run(notifId);
        return jsonResponse({ message: 'Marked as read' }, 200, origin);
      } catch (err) {
        return errorResponse('Could not update notification.', 500, origin);
      }
    }

    // PATCH /api/supplier/notifications/read-all — mark all as read
    if (url.pathname === '/api/supplier/notifications/read-all' && req.method === 'PATCH') {
      const auth = requireSupplier(req, origin);
      if (auth.error) return auth.error;
      try {
        db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0').run(auth.user.id);
        return jsonResponse({ message: 'All notifications marked as read' }, 200, origin);
      } catch (err) {
        return errorResponse('Could not update notifications.', 500, origin);
      }
    }

    // --- A9.2 Supplier Agreements ----------------------------------------

    // GET /api/supplier-agreements Ã¢â‚¬â€ list agreements (optional ?supplierId=X filter)
    if (url.pathname === '/api/supplier-agreements' && req.method === 'GET') {
      const auth = requireInternal(req, origin);
      if (auth.error) return auth.error;
      try {
        const supplierFilter = url.searchParams.get('supplierId');
        let rows;
        if (supplierFilter) {
          rows = db.query(
            `SELECT sa.*, s.name_en AS supplier_name, s.reference AS supplier_reference
               FROM supplier_agreements sa
               LEFT JOIN suppliers s ON sa.supplier_id = s.id
              WHERE sa.supplier_id = ?
              ORDER BY sa.created_at DESC`,
          ).all(supplierFilter);
        } else {
          rows = db.query(
            `SELECT sa.*, s.name_en AS supplier_name, s.reference AS supplier_reference
               FROM supplier_agreements sa
               LEFT JOIN suppliers s ON sa.supplier_id = s.id
              ORDER BY sa.created_at DESC`,
          ).all();
        }
        return jsonResponse({ agreements: rows, count: rows.length }, 200, origin);
      } catch (err) {
        console.error('[shanan-api] Agreements query failed:', err);
        return errorResponse('Could not retrieve agreements.', 500, origin);
      }
    }

    // POST /api/supplier-agreements Ã¢â‚¬â€ create a new agreement (internal only)
    if (url.pathname === '/api/supplier-agreements' && req.method === 'POST') {
      const auth = requireInternal(req, origin);
      if (auth.error) return auth.error;
      let body: unknown;
      try { body = await req.json(); } catch { return errorResponse('Invalid JSON body', 400, origin); }
      const b = body as Record<string, unknown>;
      if (typeof b.supplierId !== 'string' || b.supplierId.trim() === '') {
        return errorResponse('Validation failed: supplierId Ã¢â‚¬â€ required', 422, origin);
      }
      // Verify supplier exists
      const supplier = db.prepare('SELECT id FROM suppliers WHERE id = ? OR reference = ?').get(b.supplierId, b.supplierId) as { id: string } | null;
      if (!supplier) {
        return errorResponse('Validation failed: supplierId Ã¢â‚¬â€ references a non-existent supplier', 422, origin);
      }
      // Controlled status enum
      let status: string = 'draft';
      if (b.status !== undefined && b.status !== null) {
        if (typeof b.status === 'string' && ['draft', 'active', 'suspended', 'expired', 'terminated'].includes(b.status)) {
          status = b.status;
        } else {
          return errorResponse(`Validation failed: status Ã¢â‚¬â€ must be one of: draft, active, suspended, expired, terminated`, 400, origin);
        }
      }
      // Validate payment_terms_days if provided
      let paymentTermsDays: number | null = null;
      if (b.paymentTermsDays !== undefined && b.paymentTermsDays !== null) {
        if (typeof b.paymentTermsDays === 'number' && Number.isInteger(b.paymentTermsDays) && b.paymentTermsDays >= 0) {
          paymentTermsDays = b.paymentTermsDays;
        } else {
          return errorResponse('Validation failed: paymentTermsDays Ã¢â‚¬â€ must be a non-negative integer', 400, origin);
        }
      }
      const id = generateId();
      const agreementNumber = generateAgreementNumber();
      const now = new Date().toISOString();
      try {
        db.prepare(
          `INSERT INTO supplier_agreements
             (id, agreement_number, supplier_id, status, effective_from, effective_to,
              currency, payment_terms_days, supplier_credit_limit, trade_terms_notes,
              internal_notes, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          id, agreementNumber, supplier.id, status,
          (typeof b.effectiveFrom === 'string' ? b.effectiveFrom : null) as string | null,
          (typeof b.effectiveTo === 'string' ? b.effectiveTo : null) as string | null,
          (typeof b.currency === 'string' && b.currency.trim() ? b.currency.trim() : 'JOD') as string,
          paymentTermsDays,
          (typeof b.supplierCreditLimit === 'string' ? b.supplierCreditLimit.trim() : null) as string | null,
          (typeof b.tradeTermsNotes === 'string' ? b.tradeTermsNotes.trim() : null) as string | null,
          (typeof b.internalNotes === 'string' ? b.internalNotes.trim() : null) as string | null,
          auth.user.id, now, now,
        );
        // V1: Record server-side business event
        recordActivityEvent('AGREEMENT_VIEWED', auth.user, { agreementId: id });
        return jsonResponse({ id, agreementNumber, createdAt: now }, 201, origin);
      } catch (err) {
        console.error('[shanan-api] Agreement insert failed:', err);
        return errorResponse('Could not create agreement.', 500, origin);
      }
    }

    // GET /api/supplier-agreements/:id Ã¢â‚¬â€ fetch single agreement + product terms (internal only)
    const agreementMatch = url.pathname.match(/^\/api\/supplier-agreements\/([^/]+)$/);
    if (agreementMatch && req.method === 'GET') {
      const auth = requireInternal(req, origin);
      if (auth.error) return auth.error;
      const agrIdOrNum = decodeURIComponent(agreementMatch[1]);
      try {
        const agreement = db.prepare(
          `SELECT sa.*, s.name_en AS supplier_name, s.reference AS supplier_reference
             FROM supplier_agreements sa
             LEFT JOIN suppliers s ON sa.supplier_id = s.id
            WHERE sa.id = ? OR sa.agreement_number = ?`,
        ).get(agrIdOrNum, agrIdOrNum) as any;
        if (!agreement) return errorResponse('Agreement not found', 404, origin);
        // Fetch product terms with canonical product enrichment (read-only lookup)
        const terms = db.query(
          `SELECT * FROM agreement_product_terms WHERE agreement_id = ? ORDER BY created_at ASC`,
        ).all(agreement.id) as any[];
        // Enrich with canonical product info from the in-memory master
        const enrichedTerms = terms.map(t => {
          const product = getProductSummary(t.product_id);
          return {
            ...t,
            canonical_product_sku: product?.sku ?? null,
            canonical_product_code: product?.productCode ?? null,
            canonical_product_name_en: product?.nameEn ?? null,
          };
        });
        return jsonResponse({ agreement, productTerms: enrichedTerms, productTermsCount: enrichedTerms.length }, 200, origin);
      } catch (err) {
        console.error('[shanan-api] Agreement lookup failed:', err);
        return errorResponse('Could not retrieve agreement.', 500, origin);
      }
    }

    // PATCH /api/supplier-agreements/:id Ã¢â‚¬â€ update agreement (internal only)
    if (agreementMatch && req.method === 'PATCH') {
      const auth = requireInternal(req, origin);
      if (auth.error) return auth.error;
      const agrIdOrNum = decodeURIComponent(agreementMatch[1]);
      let body: unknown;
      try { body = await req.json(); } catch { return errorResponse('Invalid JSON body', 400, origin); }
      const existing = db.prepare('SELECT * FROM supplier_agreements WHERE id = ? OR agreement_number = ?').get(agrIdOrNum, agrIdOrNum) as any;
      if (!existing) return errorResponse('Agreement not found', 404, origin);
      const b = body as Record<string, unknown>;
      const updates: string[] = [];
      const values: (string | number | null)[] = [];
      // status (controlled enum)
      if (b.status !== undefined && b.status !== null) {
        if (typeof b.status === 'string' && ['draft', 'active', 'suspended', 'expired', 'terminated'].includes(b.status)) {
          updates.push('status = ?');
          values.push(b.status);
        } else {
          return errorResponse(`Validation failed: status Ã¢â‚¬â€ must be one of: draft, active, suspended, expired, terminated`, 400, origin);
        }
      }
      if (b.effectiveFrom !== undefined) {
        if (typeof b.effectiveFrom === 'string' || b.effectiveFrom === null) {
          updates.push('effective_from = ?');
          values.push(b.effectiveFrom);
        } else {
          return errorResponse('Validation failed: effectiveFrom Ã¢â‚¬â€ must be a string or null', 400, origin);
        }
      }
      if (b.effectiveTo !== undefined) {
        if (typeof b.effectiveTo === 'string' || b.effectiveTo === null) {
          updates.push('effective_to = ?');
          values.push(b.effectiveTo);
        } else {
          return errorResponse('Validation failed: effectiveTo Ã¢â‚¬â€ must be a string or null', 400, origin);
        }
      }
      if (b.currency !== undefined) {
        if (typeof b.currency === 'string' && b.currency.trim()) {
          updates.push('currency = ?');
          values.push(b.currency.trim());
        } else if (b.currency === null) {
          // do not null out (NOT NULL column with default JOD)
        } else {
          return errorResponse('Validation failed: currency Ã¢â‚¬â€ must be a non-empty string', 400, origin);
        }
      }
      if (b.paymentTermsDays !== undefined) {
        if (b.paymentTermsDays === null) {
          updates.push('payment_terms_days = ?');
          values.push(null);
        } else if (typeof b.paymentTermsDays === 'number' && Number.isInteger(b.paymentTermsDays) && b.paymentTermsDays >= 0) {
          updates.push('payment_terms_days = ?');
          values.push(b.paymentTermsDays);
        } else {
          return errorResponse('Validation failed: paymentTermsDays Ã¢â‚¬â€ must be a non-negative integer or null', 400, origin);
        }
      }
      if (b.supplierCreditLimit !== undefined) {
        if (typeof b.supplierCreditLimit === 'string' || b.supplierCreditLimit === null) {
          updates.push('supplier_credit_limit = ?');
          values.push(typeof b.supplierCreditLimit === 'string' ? b.supplierCreditLimit.trim() : null);
        } else {
          return errorResponse('Validation failed: supplierCreditLimit Ã¢â‚¬â€ must be a string or null', 400, origin);
        }
      }
      if (b.tradeTermsNotes !== undefined) {
        if (typeof b.tradeTermsNotes === 'string' || b.tradeTermsNotes === null) {
          updates.push('trade_terms_notes = ?');
          values.push(typeof b.tradeTermsNotes === 'string' ? b.tradeTermsNotes.trim() : null);
        } else {
          return errorResponse('Validation failed: tradeTermsNotes Ã¢â‚¬â€ must be a string or null', 400, origin);
        }
      }
      if (b.internalNotes !== undefined) {
        if (typeof b.internalNotes === 'string' || b.internalNotes === null) {
          updates.push('internal_notes = ?');
          values.push(typeof b.internalNotes === 'string' ? b.internalNotes.trim() : null);
        } else {
          return errorResponse('Validation failed: internalNotes Ã¢â‚¬â€ must be a string or null', 400, origin);
        }
      }
      if (updates.length === 0) return errorResponse('No valid fields to update', 422, origin);
      updates.push('updated_at = ?');
      values.push(new Date().toISOString());
      values.push(existing.id);
      try {
        db.prepare(`UPDATE supplier_agreements SET ${updates.join(', ')} WHERE id = ?`).run(...values);
        const updated = db.prepare('SELECT * FROM supplier_agreements WHERE id = ?').get(existing.id);
        return jsonResponse({ agreement: updated }, 200, origin);
      } catch (err) {
        console.error('[shanan-api] Agreement update failed:', err);
        return errorResponse('Could not update agreement.', 500, origin);
      }
    }

    // --- A9.3 Agreement Product Terms -----------------------------------

    // GET /api/supplier-agreements/:id/product-terms Ã¢â‚¬â€ list product terms (internal only)
    const productTermsMatch = url.pathname.match(/^\/api\/supplier-agreements\/([^/]+)\/product-terms$/);
    if (productTermsMatch && req.method === 'GET') {
      const auth = requireInternal(req, origin);
      if (auth.error) return auth.error;
      const agrIdOrNum = decodeURIComponent(productTermsMatch[1]);
      const existing = db.prepare('SELECT id FROM supplier_agreements WHERE id = ? OR agreement_number = ?').get(agrIdOrNum, agrIdOrNum) as { id: string } | null;
      if (!existing) return errorResponse('Agreement not found', 404, origin);
      try {
        const terms = db.query(
          `SELECT * FROM agreement_product_terms WHERE agreement_id = ? ORDER BY created_at ASC`,
        ).all(existing.id) as any[];
        // Enrich with canonical product info
        const enriched = terms.map(t => {
          const product = getProductSummary(t.product_id);
          return {
            ...t,
            canonical_product_sku: product?.sku ?? null,
            canonical_product_code: product?.productCode ?? null,
            canonical_product_name_en: product?.nameEn ?? null,
          };
        });
        return jsonResponse({ productTerms: enriched, count: enriched.length }, 200, origin);
      } catch (err) {
        console.error('[shanan-api] Product terms query failed:', err);
        return errorResponse('Could not retrieve product terms.', 500, origin);
      }
    }

    // POST /api/supplier-agreements/:id/product-terms Ã¢â‚¬â€ add product term (internal only)
    if (productTermsMatch && req.method === 'POST') {
      const auth = requireInternal(req, origin);
      if (auth.error) return auth.error;
      const agrIdOrNum = decodeURIComponent(productTermsMatch[1]);
      let body: unknown;
      try { body = await req.json(); } catch { return errorResponse('Invalid JSON body', 400, origin); }
      const existing = db.prepare('SELECT id, currency FROM supplier_agreements WHERE id = ? OR agreement_number = ?').get(agrIdOrNum, agrIdOrNum) as any;
      if (!existing) return errorResponse('Agreement not found', 404, origin);
      const b = body as Record<string, unknown>;
      // A9 critical: product_id MUST reference an existing canonical product in the SHANAN master.
      if (typeof b.productId !== 'string' || b.productId.trim() === '') {
        return errorResponse('Validation failed: productId Ã¢â‚¬â€ required', 422, origin);
      }
      if (!isValidProductId(b.productId)) {
        return errorResponse('Validation failed: productId Ã¢â‚¬â€ references a non-existent SHANAN product', 422, origin);
      }
      // unit_price required (numeric, >= 0)
      if (typeof b.unitPrice !== 'number' || b.unitPrice < 0 || !isFinite(b.unitPrice)) {
        return errorResponse('Validation failed: unitPrice Ã¢â‚¬â€ must be a non-negative number', 422, origin);
      }
      // availability_status controlled enum
      let availabilityStatus = 'available';
      if (b.availabilityStatus !== undefined && b.availabilityStatus !== null) {
        if (typeof b.availabilityStatus === 'string' && ['available', 'limited', 'unavailable', 'expected'].includes(b.availabilityStatus)) {
          availabilityStatus = b.availabilityStatus;
        } else {
          return errorResponse(`Validation failed: availabilityStatus Ã¢â‚¬â€ must be one of: available, limited, unavailable, expected`, 400, origin);
        }
      }
      // term status enum
      let termStatus = 'active';
      if (b.status !== undefined && b.status !== null) {
        if (typeof b.status === 'string' && ['active', 'inactive'].includes(b.status)) {
          termStatus = b.status;
        } else {
          return errorResponse(`Validation failed: status Ã¢â‚¬â€ must be one of: active, inactive`, 400, origin);
        }
      }
      // Optional integers
      let moq: number | null = null;
      if (b.minimumOrderQuantity !== undefined && b.minimumOrderQuantity !== null) {
        if (typeof b.minimumOrderQuantity === 'number' && Number.isInteger(b.minimumOrderQuantity) && b.minimumOrderQuantity >= 0) {
          moq = b.minimumOrderQuantity;
        } else {
          return errorResponse('Validation failed: minimumOrderQuantity Ã¢â‚¬â€ must be a non-negative integer', 400, origin);
        }
      }
      let availableQty: number | null = null;
      if (b.availableQuantity !== undefined && b.availableQuantity !== null) {
        if (typeof b.availableQuantity === 'number' && Number.isInteger(b.availableQuantity) && b.availableQuantity >= 0) {
          availableQty = b.availableQuantity;
        } else {
          return errorResponse('Validation failed: availableQuantity Ã¢â‚¬â€ must be a non-negative integer', 400, origin);
        }
      }
      let leadTime: number | null = null;
      if (b.leadTimeDays !== undefined && b.leadTimeDays !== null) {
        if (typeof b.leadTimeDays === 'number' && Number.isInteger(b.leadTimeDays) && b.leadTimeDays >= 0) {
          leadTime = b.leadTimeDays;
        } else {
          return errorResponse('Validation failed: leadTimeDays Ã¢â‚¬â€ must be a non-negative integer', 400, origin);
        }
      }
      const id = generateId();
      const now = new Date().toISOString();
      try {
        db.prepare(
          `INSERT INTO agreement_product_terms
             (id, agreement_id, product_id, supplier_product_code, supplier_product_name,
              unit_price, currency, minimum_order_quantity, price_valid_from, price_valid_to,
              availability_status, available_quantity, availability_updated_at, expected_available_date,
              lead_time_days, status, internal_notes, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          id, existing.id, b.productId,
          (typeof b.supplierProductCode === 'string' ? b.supplierProductCode.trim() : null) as string | null,
          (typeof b.supplierProductName === 'string' ? b.supplierProductName.trim() : null) as string | null,
          b.unitPrice as number,
          (typeof b.currency === 'string' && b.currency.trim() ? b.currency.trim() : null) as string | null,
          moq,
          (typeof b.priceValidFrom === 'string' ? b.priceValidFrom : null) as string | null,
          (typeof b.priceValidTo === 'string' ? b.priceValidTo : null) as string | null,
          availabilityStatus, availableQty, now,
          (typeof b.expectedAvailableDate === 'string' ? b.expectedAvailableDate : null) as string | null,
          leadTime, termStatus,
          (typeof b.internalNotes === 'string' ? b.internalNotes.trim() : null) as string | null,
          now, now,
        );
        return jsonResponse({ id, createdAt: now }, 201, origin);
      } catch (err) {
        console.error('[shanan-api] Product term insert failed:', err);
        return errorResponse('Could not create product term.', 500, origin);
      }
    }

    // PATCH /api/supplier-agreements/:id/product-terms/:termId Ã¢â‚¬â€ update term (internal only)
    const singleTermMatch = url.pathname.match(/^\/api\/supplier-agreements\/([^/]+)\/product-terms\/([^/]+)$/);
    if (singleTermMatch && req.method === 'PATCH') {
      const auth = requireInternal(req, origin);
      if (auth.error) return auth.error;
      const agrIdOrNum = decodeURIComponent(singleTermMatch[1]);
      const termId = decodeURIComponent(singleTermMatch[2]);
      // Verify agreement exists
      const agr = db.prepare('SELECT id FROM supplier_agreements WHERE id = ? OR agreement_number = ?').get(agrIdOrNum, agrIdOrNum) as { id: string } | null;
      if (!agr) return errorResponse('Agreement not found', 404, origin);
      // Verify term exists and belongs to this agreement
      const existing = db.prepare('SELECT * FROM agreement_product_terms WHERE id = ? AND agreement_id = ?').get(termId, agr.id) as any;
      if (!existing) return errorResponse('Product term not found', 404, origin);
      let body: unknown;
      try { body = await req.json(); } catch { return errorResponse('Invalid JSON body', 400, origin); }
      const b = body as Record<string, unknown>;
      const updates: string[] = [];
      const values: (string | number | null)[] = [];
      // Allow updating supplier mapping fields
      if (b.supplierProductCode !== undefined) {
        if (typeof b.supplierProductCode === 'string' || b.supplierProductCode === null) {
          updates.push('supplier_product_code = ?');
          values.push(typeof b.supplierProductCode === 'string' ? b.supplierProductCode.trim() : null);
        } else {
          return errorResponse('Validation failed: supplierProductCode Ã¢â‚¬â€ must be a string or null', 400, origin);
        }
      }
      if (b.supplierProductName !== undefined) {
        if (typeof b.supplierProductName === 'string' || b.supplierProductName === null) {
          updates.push('supplier_product_name = ?');
          values.push(typeof b.supplierProductName === 'string' ? b.supplierProductName.trim() : null);
        } else {
          return errorResponse('Validation failed: supplierProductName Ã¢â‚¬â€ must be a string or null', 400, origin);
        }
      }
      if (b.unitPrice !== undefined) {
        if (typeof b.unitPrice === 'number' && b.unitPrice >= 0 && isFinite(b.unitPrice)) {
          updates.push('unit_price = ?');
          values.push(b.unitPrice);
        } else {
          return errorResponse('Validation failed: unitPrice Ã¢â‚¬â€ must be a non-negative number', 400, origin);
        }
      }
      if (b.currency !== undefined) {
        if (typeof b.currency === 'string' && b.currency.trim() || b.currency === null) {
          updates.push('currency = ?');
          values.push(typeof b.currency === 'string' ? b.currency.trim() : null);
        } else {
          return errorResponse('Validation failed: currency Ã¢â‚¬â€ must be a non-empty string or null', 400, origin);
        }
      }
      if (b.minimumOrderQuantity !== undefined) {
        if (b.minimumOrderQuantity === null || (typeof b.minimumOrderQuantity === 'number' && Number.isInteger(b.minimumOrderQuantity) && b.minimumOrderQuantity >= 0)) {
          updates.push('minimum_order_quantity = ?');
          values.push(b.minimumOrderQuantity);
        } else {
          return errorResponse('Validation failed: minimumOrderQuantity Ã¢â‚¬â€ must be a non-negative integer or null', 400, origin);
        }
      }
      if (b.priceValidFrom !== undefined) {
        if (typeof b.priceValidFrom === 'string' || b.priceValidFrom === null) {
          updates.push('price_valid_from = ?');
          values.push(b.priceValidFrom);
        } else {
          return errorResponse('Validation failed: priceValidFrom Ã¢â‚¬â€ must be a string or null', 400, origin);
        }
      }
      if (b.priceValidTo !== undefined) {
        if (typeof b.priceValidTo === 'string' || b.priceValidTo === null) {
          updates.push('price_valid_to = ?');
          values.push(b.priceValidTo);
        } else {
          return errorResponse('Validation failed: priceValidTo Ã¢â‚¬â€ must be a string or null', 400, origin);
        }
      }
      if (b.availabilityStatus !== undefined) {
        if (typeof b.availabilityStatus === 'string' && ['available', 'limited', 'unavailable', 'expected'].includes(b.availabilityStatus)) {
          updates.push('availability_status = ?');
          updates.push('availability_updated_at = ?');
          values.push(b.availabilityStatus);
          values.push(new Date().toISOString());
        } else {
          return errorResponse(`Validation failed: availabilityStatus Ã¢â‚¬â€ must be one of: available, limited, unavailable, expected`, 400, origin);
        }
      }
      if (b.availableQuantity !== undefined) {
        if (b.availableQuantity === null || (typeof b.availableQuantity === 'number' && Number.isInteger(b.availableQuantity) && b.availableQuantity >= 0)) {
          updates.push('available_quantity = ?');
          updates.push('availability_updated_at = ?');
          values.push(b.availableQuantity);
          values.push(new Date().toISOString());
        } else {
          return errorResponse('Validation failed: availableQuantity Ã¢â‚¬â€ must be a non-negative integer or null', 400, origin);
        }
      }
      if (b.expectedAvailableDate !== undefined) {
        if (typeof b.expectedAvailableDate === 'string' || b.expectedAvailableDate === null) {
          updates.push('expected_available_date = ?');
          values.push(b.expectedAvailableDate);
        } else {
          return errorResponse('Validation failed: expectedAvailableDate Ã¢â‚¬â€ must be a string or null', 400, origin);
        }
      }
      if (b.leadTimeDays !== undefined) {
        if (b.leadTimeDays === null || (typeof b.leadTimeDays === 'number' && Number.isInteger(b.leadTimeDays) && b.leadTimeDays >= 0)) {
          updates.push('lead_time_days = ?');
          values.push(b.leadTimeDays);
        } else {
          return errorResponse('Validation failed: leadTimeDays Ã¢â‚¬â€ must be a non-negative integer or null', 400, origin);
        }
      }
      if (b.status !== undefined) {
        if (typeof b.status === 'string' && ['active', 'inactive'].includes(b.status)) {
          updates.push('status = ?');
          values.push(b.status);
        } else {
          return errorResponse(`Validation failed: status Ã¢â‚¬â€ must be one of: active, inactive`, 400, origin);
        }
      }
      if (b.internalNotes !== undefined) {
        if (typeof b.internalNotes === 'string' || b.internalNotes === null) {
          updates.push('internal_notes = ?');
          values.push(typeof b.internalNotes === 'string' ? b.internalNotes.trim() : null);
        } else {
          return errorResponse('Validation failed: internalNotes Ã¢â‚¬â€ must be a string or null', 400, origin);
        }
      }
      if (updates.length === 0) return errorResponse('No valid fields to update', 422, origin);
      updates.push('updated_at = ?');
      values.push(new Date().toISOString());
      values.push(existing.id);
      try {
        db.prepare(`UPDATE agreement_product_terms SET ${updates.join(', ')} WHERE id = ?`).run(...values);
        const updated = db.prepare('SELECT * FROM agreement_product_terms WHERE id = ?').get(existing.id);
        return jsonResponse({ productTerm: updated }, 200, origin);
      } catch (err) {
        console.error('[shanan-api] Product term update failed:', err);
        return errorResponse('Could not update product term.', 500, origin);
      }
    }

    // DELETE /api/supplier-agreements/:id/product-terms/:termId Ã¢â‚¬â€ deactivate (controlled)
    // We use soft-deactivation (status='inactive') rather than hard delete to preserve
    // historical integrity. Hard delete would damage historical records if the term
    // were referenced by future procurement data.
    if (singleTermMatch && req.method === 'DELETE') {
      const auth = requireInternal(req, origin);
      if (auth.error) return auth.error;
      const agrIdOrNum = decodeURIComponent(singleTermMatch[1]);
      const termId = decodeURIComponent(singleTermMatch[2]);
      const agr = db.prepare('SELECT id FROM supplier_agreements WHERE id = ? OR agreement_number = ?').get(agrIdOrNum, agrIdOrNum) as { id: string } | null;
      if (!agr) return errorResponse('Agreement not found', 404, origin);
      const existing = db.prepare('SELECT id FROM agreement_product_terms WHERE id = ? AND agreement_id = ?').get(termId, agr.id) as { id: string } | null;
      if (!existing) return errorResponse('Product term not found', 404, origin);
      try {
        // Soft-deactivate by setting status='inactive'
        db.prepare(`UPDATE agreement_product_terms SET status = 'inactive', updated_at = ? WHERE id = ?`).run(new Date().toISOString(), existing.id);
        return jsonResponse({ ok: true, deactivated: true, id: existing.id }, 200, origin);
      } catch (err) {
        console.error('[shanan-api] Product term deactivation failed:', err);
        return errorResponse('Could not deactivate product term.', 500, origin);
      }
    }

    // ============================================================
    // Phase A10 Ã¢â‚¬â€ Internal RFQ / Supplier Sourcing Workflow
    // INTERNAL SHANAN CONFIDENTIAL DATA.
    // Every endpoint below requires `requireInternal` Ã¢â‚¬â€ customer users are
    // rejected with HTTP 403 at the API layer (not just hidden UI).
    // No RFQ / supplier identity / offer data is ever exposed to customers.
    // ============================================================

    // --- A10.1 RFQ header / list / detail / state ------------------------

    // GET /api/rfqs — list RFQs (internal OR customer with ownership check; optional ?supplyRequestId= filter)
    if (url.pathname === '/api/rfqs' && req.method === 'GET') {
      const auth = requireAuth(req, origin);
      if (auth.error) return auth.error;
      // Authorization guard: only internal (full) and customer (safe, ownership-checked) access.
      // Suppliers are explicitly blocked here — they must use /api/supplier/rfqs to prevent
      // exposure of internal RFQ fields (P1-02).
      const rfqUserType = auth.user.user_type;
      if (rfqUserType !== 'customer' && rfqUserType !== 'internal') {
        return errorResponse('Forbidden: access denied', 403, origin);
      }
      const isCustomer = auth.user.user_type === 'customer';
      try {
        const filterSR = url.searchParams.get('supplyRequestId');

        // Customer: require supplyRequestId filter and verify ownership
        if (isCustomer) {
          if (!filterSR) {
            return errorResponse('supplyRequestId is required for customer access', 400, origin);
          }
          // Verify the supply request belongs to this customer's company
          const sr = db.prepare('SELECT id, customer_company_id FROM supply_requests WHERE id = ? OR reference = ?')
            .get(filterSR, filterSR) as { id: string; customer_company_id: string | null } | null;
          if (!sr || sr.customer_company_id !== auth.user.company_id) {
            return errorResponse('Request not found', 404, origin);
          }
          // Customer-safe: return only safe fields, no internal data
          const rows = db.query(
            `SELECT r.id, r.reference, r.status, r.sent_at, r.created_at,
                    (SELECT COUNT(*) FROM rfq_suppliers rs WHERE rs.rfq_id = r.id) AS supplier_count,
                    (SELECT COUNT(*) FROM rfq_suppliers rs WHERE rs.rfq_id = r.id AND rs.response_state = 'responded') AS responded_count,
                    (SELECT COUNT(*) FROM rfq_supplier_offers o
                       JOIN rfq_suppliers rs ON o.rfq_supplier_id = rs.id
                       WHERE rs.rfq_id = r.id) AS offer_count,
                    (SELECT COUNT(*) FROM rfq_items ri WHERE ri.rfq_id = r.id) AS items_count
               FROM rfqs r
              WHERE r.supply_request_id = ?
              ORDER BY r.created_at DESC`,
          ).all(sr.id);
          return jsonResponse({ rfqs: rows, count: rows.length }, 200, origin);
        }

        // Internal: full access (existing behavior)
        let rows;
        if (filterSR) {
          rows = db.query(
            `SELECT r.*, sr.reference AS supply_request_reference, sr.status AS supply_request_status,
                    (SELECT COUNT(*) FROM rfq_suppliers rs WHERE rs.rfq_id = r.id) AS suppliers_count,
                    (SELECT COUNT(*) FROM rfq_suppliers rs WHERE rs.rfq_id = r.id AND rs.response_state = 'responded') AS responded_count,
                    (SELECT COUNT(*) FROM rfq_items ri WHERE ri.rfq_id = r.id) AS items_count
               FROM rfqs r
               LEFT JOIN supply_requests sr ON r.supply_request_id = sr.id
              WHERE r.supply_request_id = ?
              ORDER BY r.created_at DESC`,
          ).all(filterSR);
        } else {
          rows = db.query(
            `SELECT r.*, sr.reference AS supply_request_reference, sr.status AS supply_request_status,
                    (SELECT COUNT(*) FROM rfq_suppliers rs WHERE rs.rfq_id = r.id) AS suppliers_count,
                    (SELECT COUNT(*) FROM rfq_suppliers rs WHERE rs.rfq_id = r.id AND rs.response_state = 'responded') AS responded_count,
                    (SELECT COUNT(*) FROM rfq_items ri WHERE ri.rfq_id = r.id) AS items_count
               FROM rfqs r
               LEFT JOIN supply_requests sr ON r.supply_request_id = sr.id
              ORDER BY r.created_at DESC`,
          ).all();
        }
        return jsonResponse({ rfqs: rows, count: rows.length }, 200, origin);
      } catch (err) {
        console.error('[shanan-api] RFQ query failed:', err);
        return errorResponse('Could not retrieve RFQs.', 500, origin);
      }
    }

    // POST /api/rfqs Ã¢â‚¬â€ create a new RFQ from an existing Supply Request (internal only)
    // Validation:
    //   - supplyRequestId must reference an existing supply_request
    //   - items must be non-empty and each must reference an existing supply_request_item of that request
    //   - suppliers (optional at creation) must each reference an existing supplier
    //   - duplicate suppliers are rejected
    //   - duplicate request items within this RFQ are rejected (UNIQUE constraint)
    if (url.pathname === '/api/rfqs' && req.method === 'POST') {
      const auth = requireInternal(req, origin);
      if (auth.error) return auth.error;
      let body: unknown;
      try { body = await req.json(); } catch { return errorResponse('Invalid JSON body', 400, origin); }
      const b = body as Record<string, unknown>;
      if (typeof b.supplyRequestId !== 'string' || b.supplyRequestId.trim() === '') {
        return errorResponse('Validation failed: supplyRequestId Ã¢â‚¬â€ required', 422, origin);
      }
      // Verify supply_request exists
      const sr = db.prepare('SELECT id FROM supply_requests WHERE id = ? OR reference = ?').get(b.supplyRequestId, b.supplyRequestId) as { id: string } | null;
      if (!sr) {
        return errorResponse('Validation failed: supplyRequestId Ã¢â‚¬â€ references a non-existent Supply Request', 422, origin);
      }
      // Items: must be array of request item IDs, each must belong to this request
      const itemIds = b.itemIds;
      if (!Array.isArray(itemIds) || itemIds.length === 0) {
        return errorResponse('Validation failed: itemIds Ã¢â‚¬â€ at least one request item is required', 422, origin);
      }
      // Validate each item belongs to this supply request + gather authoritative item data
      type PendingItem = { id: number; request_id: string; product_id: string; product_name: string; sku: string; quantity: number; notes: string | null };
      const pendingItems: PendingItem[] = [];
      const seenItemIds = new Set<number>();
      for (let i = 0; i < itemIds.length; i++) {
        const rid = itemIds[i];
        if (typeof rid !== 'number' || !Number.isInteger(rid) || rid <= 0) {
          return errorResponse(`Validation failed: itemIds[${i}] Ã¢â‚¬â€ must be a positive integer (supply_request_item.id)`, 422, origin);
        }
        if (seenItemIds.has(rid)) {
          return errorResponse(`Validation failed: itemIds[${i}] Ã¢â‚¬â€ duplicate request item ${rid}`, 422, origin);
        }
        seenItemIds.add(rid);
        const item = db.prepare('SELECT id, request_id, product_id, product_name, sku, quantity, notes FROM supply_request_items WHERE id = ?').get(rid) as PendingItem | null;
        if (!item) {
          return errorResponse(`Validation failed: itemIds[${i}] Ã¢â‚¬â€ request item ${rid} does not exist`, 422, origin);
        }
        if (item.request_id !== sr.id) {
          return errorResponse(`Validation failed: itemIds[${i}] Ã¢â‚¬â€ request item ${rid} does not belong to this Supply Request`, 422, origin);
        }
        // Validate canonical product_id against in-memory master (defense in depth)
        if (!isValidProductId(item.product_id)) {
          return errorResponse(`Validation failed: itemIds[${i}] Ã¢â‚¬â€ request item ${rid} references a non-existent SHANAN product`, 422, origin);
        }
        pendingItems.push(item);
      }

      // Optional suppliers list at creation time
      const supplierIds = b.supplierIds;
      const pendingSupplierIds: string[] = [];
      if (supplierIds !== undefined && supplierIds !== null) {
        if (!Array.isArray(supplierIds)) {
          return errorResponse('Validation failed: supplierIds Ã¢â‚¬â€ must be an array', 422, origin);
        }
        const seenSup = new Set<string>();
        for (let i = 0; i < supplierIds.length; i++) {
          const sid = supplierIds[i];
          if (typeof sid !== 'string' || sid.trim() === '') {
            return errorResponse(`Validation failed: supplierIds[${i}] Ã¢â‚¬â€ must be a non-empty string`, 422, origin);
          }
          if (seenSup.has(sid)) {
            return errorResponse(`Validation failed: supplierIds[${i}] Ã¢â‚¬â€ duplicate supplier ${sid}`, 422, origin);
          }
          seenSup.add(sid);
          const sup = db.prepare('SELECT id FROM suppliers WHERE id = ? OR reference = ?').get(sid, sid) as { id: string } | null;
          if (!sup) {
            return errorResponse(`Validation failed: supplierIds[${i}] Ã¢â‚¬â€ references a non-existent supplier`, 422, origin);
          }
          pendingSupplierIds.push(sup.id);
        }
      }

      const id = generateId();
      const reference = generateRfqReference();
      const now = new Date().toISOString();
      const internalNotes = typeof b.internalNotes === 'string' ? b.internalNotes.trim() || null : null;
      try {
        const tx = db.transaction(() => {
          db.prepare(
            `INSERT INTO rfqs (id, reference, supply_request_id, status, internal_notes, created_by, created_at, updated_at)
             VALUES (?, ?, ?, 'draft', ?, ?, ?, ?)`,
          ).run(id, reference, sr.id, internalNotes, auth.user.id, now, now);
          for (const it of pendingItems) {
            db.prepare(
              `INSERT INTO rfq_items (id, rfq_id, supply_request_item_id, product_id, product_name, sku, requested_quantity, customer_notes, rfq_notes, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
            ).run(generateId(), id, it.id, it.product_id, it.product_name, it.sku, it.quantity, it.notes, now);
          }
          for (const sid of pendingSupplierIds) {
            db.prepare(
              `INSERT INTO rfq_suppliers (id, rfq_id, supplier_id, response_state, created_at)
               VALUES (?, ?, ?, 'pending', ?)`,
            ).run(generateId(), id, sid, now);
          }
        });
        tx();
        // V1: Record server-side business event
        recordActivityEvent('RFQ_CREATED', auth.user, { rfqId: id });
        return jsonResponse({ id, reference, createdAt: now, status: 'draft' }, 201, origin);
      } catch (err) {
        console.error('[shanan-api] RFQ insert failed:', err);
        return errorResponse('Could not create RFQ.', 500, origin);
      }
    }

    // GET /api/rfqs/:id Ã¢â‚¬â€ fetch single RFQ with full detail (internal only)
    const rfqMatch = url.pathname.match(/^\/api\/rfqs\/([^/]+)$/);
    if (rfqMatch && req.method === 'GET') {
      const auth = requireInternal(req, origin);
      if (auth.error) return auth.error;
      const rfqIdOrRef = decodeURIComponent(rfqMatch[1]);
      try {
        const rfq = db.prepare(
          `SELECT r.*, sr.reference AS supply_request_reference, sr.status AS supply_request_status,
                  sr.customer_company_id AS supply_request_customer_company_id,
                  u.name AS created_by_name
             FROM rfqs r
             LEFT JOIN supply_requests sr ON r.supply_request_id = sr.id
             LEFT JOIN users u ON r.created_by = u.id
            WHERE r.id = ? OR r.reference = ?`,
        ).get(rfqIdOrRef, rfqIdOrRef) as any;
        if (!rfq) return errorResponse('RFQ not found', 404, origin);

        // Fetch suppliers (recipients) Ã¢â‚¬â€ enriched with supplier name
        const suppliers = db.query(
          `SELECT rs.id, rs.rfq_id, rs.supplier_id, rs.response_state, rs.responded_at, rs.created_at,
                  s.reference AS supplier_reference, s.name_en AS supplier_name_en, s.status AS supplier_status
             FROM rfq_suppliers rs
             LEFT JOIN suppliers s ON rs.supplier_id = s.id
            WHERE rs.rfq_id = ?
            ORDER BY rs.created_at ASC`,
        ).all(rfq.id) as any[];

        // Fetch items Ã¢â‚¬â€ enriched with canonical product lookup
        const items = db.query(
          `SELECT ri.*, ri.supply_request_item_id AS request_item_id
             FROM rfq_items ri
            WHERE ri.rfq_id = ?
            ORDER BY ri.created_at ASC`,
        ).all(rfq.id) as any[];
        const enrichedItems = items.map(it => {
          const product = getProductSummary(it.product_id);
          return {
            ...it,
            canonical_product_sku: product?.sku ?? null,
            canonical_product_code: product?.productCode ?? null,
            canonical_product_name_en: product?.nameEn ?? null,
          };
        });

        // Fetch offers Ã¢â‚¬â€ joined with rfq_supplier_id and rfq_item_id
        const offers = db.query(
          `SELECT o.*, rs.supplier_id AS supplier_id, ri.product_id AS product_id
             FROM rfq_supplier_offers o
             JOIN rfq_suppliers rs ON o.rfq_supplier_id = rs.id
             JOIN rfq_items ri ON o.rfq_item_id = ri.id
            WHERE rs.rfq_id = ?
            ORDER BY o.updated_at ASC`,
        ).all(rfq.id) as any[];

        // Compute response progress
        const totalSuppliers = suppliers.length;
        const respondedSuppliers = suppliers.filter(s => s.response_state === 'responded').length;

        return jsonResponse({
          rfq,
          supplyRequestReference: rfq.supply_request_reference,
          items: enrichedItems,
          itemsCount: enrichedItems.length,
          suppliers,
          suppliersCount: totalSuppliers,
          respondedCount: respondedSuppliers,
          offers,
          offersCount: offers.length,
        }, 200, origin);
      } catch (err) {
        console.error('[shanan-api] RFQ lookup failed:', err);
        return errorResponse('Could not retrieve RFQ.', 500, origin);
      }
    }

    // PATCH /api/rfqs/:id Ã¢â‚¬â€ state transition + edit (internal only)
    //   - action: mark_ready | send | close | cancel (validated via RFQ_ACTIONS)
    //   - internalNotes: free text update (only while in draft/ready_to_send)
    if (rfqMatch && req.method === 'PATCH') {
      const auth = requireInternal(req, origin);
      if (auth.error) return auth.error;
      const rfqIdOrRef = decodeURIComponent(rfqMatch[1]);
      let body: unknown;
      try { body = await req.json(); } catch { return errorResponse('Invalid JSON body', 400, origin); }
      const b = body as Record<string, unknown>;
      const existing = db.prepare('SELECT * FROM rfqs WHERE id = ? OR reference = ?').get(rfqIdOrRef, rfqIdOrRef) as any;
      if (!existing) return errorResponse('RFQ not found', 404, origin);
      const now = new Date().toISOString();
      const currentStatus = existing.status as string;

      // Action-based state transitions
      if (typeof b.action === 'string') {
        const action = b.action;
        if (!RFQ_ACTIONS[action]) {
          return errorResponse(`Validation failed: action Ã¢â‚¬â€ must be one of: ${Object.keys(RFQ_ACTIONS).join(', ')}`, 400, origin);
        }
        const rule = RFQ_ACTIONS[action];
        if (!rule.from.includes(currentStatus)) {
          return errorResponse(`Cannot ${action}: current status is '${currentStatus}' (must be one of: ${rule.from.join(', ')})`, 400, origin);
        }
        // Send-readiness validation for mark_ready and send
        if (action === 'mark_ready' || action === 'send') {
          const itemCount = db.prepare('SELECT COUNT(*) as n FROM rfq_items WHERE rfq_id = ?').get(existing.id) as { n: number };
          const supCount = db.prepare('SELECT COUNT(*) as n FROM rfq_suppliers WHERE rfq_id = ?').get(existing.id) as { n: number };
          const err = rfqSendReadinessErrors(itemCount.n > 0, supCount.n > 0);
          if (err) return errorResponse(err, 400, origin);
        }
        // Apply transition
        const newStatus = rule.to;
        if (action === 'send') {
          db.prepare('UPDATE rfqs SET status = ?, sent_at = ?, updated_at = ? WHERE id = ?').run(newStatus, now, now, existing.id);
        } else if (action === 'close') {
          db.prepare('UPDATE rfqs SET status = ?, closed_at = ?, updated_at = ? WHERE id = ?').run(newStatus, now, now, existing.id);
        } else {
          db.prepare('UPDATE rfqs SET status = ?, updated_at = ? WHERE id = ?').run(newStatus, now, existing.id);
        }
        const updated = db.prepare('SELECT * FROM rfqs WHERE id = ?').get(existing.id);
        return jsonResponse({ rfq: updated }, 200, origin);
      }

      // Non-action field updates Ã¢â‚¬â€ only allowed while in draft/ready_to_send
      if (currentStatus !== 'draft' && currentStatus !== 'ready_to_send') {
        return errorResponse(`Cannot edit: RFQ status is '${currentStatus}'. Only draft or ready_to_send RFQs can be edited.`, 400, origin);
      }
      const updates: string[] = [];
      const values: (string | null)[] = [];
      if (b.internalNotes !== undefined) {
        if (typeof b.internalNotes === 'string' || b.internalNotes === null) {
          updates.push('internal_notes = ?');
          values.push(typeof b.internalNotes === 'string' ? b.internalNotes.trim() || null : null);
        } else {
          return errorResponse('Validation failed: internalNotes Ã¢â‚¬â€ must be a string or null', 400, origin);
        }
      }
      if (updates.length === 0) return errorResponse('No valid fields to update', 422, origin);
      updates.push('updated_at = ?');
      values.push(now);
      values.push(existing.id);
      try {
        db.prepare(`UPDATE rfqs SET ${updates.join(', ')} WHERE id = ?`).run(...values);
        const updated = db.prepare('SELECT * FROM rfqs WHERE id = ?').get(existing.id);
        return jsonResponse({ rfq: updated }, 200, origin);
      } catch (err) {
        console.error('[shanan-api] RFQ update failed:', err);
        return errorResponse('Could not update RFQ.', 500, origin);
      }
    }

    // --- A10.2 RFQ suppliers (recipients) --------------------------------

    // POST /api/rfqs/:id/suppliers Ã¢â‚¬â€ add a supplier to an RFQ (internal only, editable states only)
    const rfqSupplierMatch = url.pathname.match(/^\/api\/rfqs\/([^/]+)\/suppliers$/);
    if (rfqSupplierMatch && req.method === 'POST') {
      const auth = requireInternal(req, origin);
      if (auth.error) return auth.error;
      const rfqIdOrRef = decodeURIComponent(rfqSupplierMatch[1]);
      let body: unknown;
      try { body = await req.json(); } catch { return errorResponse('Invalid JSON body', 400, origin); }
      const b = body as Record<string, unknown>;
      const existing = db.prepare('SELECT id, status FROM rfqs WHERE id = ? OR reference = ?').get(rfqIdOrRef, rfqIdOrRef) as any;
      if (!existing) return errorResponse('RFQ not found', 404, origin);
      if (existing.status !== 'draft' && existing.status !== 'ready_to_send') {
        return errorResponse(`Cannot modify suppliers: RFQ status is '${existing.status}'. Only draft or ready_to_send RFQs can be modified.`, 400, origin);
      }
      if (typeof b.supplierId !== 'string' || b.supplierId.trim() === '') {
        return errorResponse('Validation failed: supplierId Ã¢â‚¬â€ required', 422, origin);
      }
      // Verify supplier exists in A9 suppliers table
      const sup = db.prepare('SELECT id FROM suppliers WHERE id = ? OR reference = ?').get(b.supplierId, b.supplierId) as { id: string } | null;
      if (!sup) {
        return errorResponse('Validation failed: supplierId Ã¢â‚¬â€ references a non-existent supplier', 422, origin);
      }
      // Verify not already a recipient (UNIQUE constraint, but check first for friendlier error)
      const existingRecip = db.prepare('SELECT id FROM rfq_suppliers WHERE rfq_id = ? AND supplier_id = ?').get(existing.id, sup.id) as { id: string } | null;
      if (existingRecip) {
        return errorResponse('Validation failed: supplierId Ã¢â‚¬â€ this supplier is already a recipient of this RFQ', 409, origin);
      }
      const id = generateId();
      const now = new Date().toISOString();
      try {
        db.prepare(
          `INSERT INTO rfq_suppliers (id, rfq_id, supplier_id, response_state, created_at)
           VALUES (?, ?, ?, 'pending', ?)`,
        ).run(id, existing.id, sup.id, now);
        return jsonResponse({ id, rfqId: existing.id, supplierId: sup.id, createdAt: now, responseState: 'pending' }, 201, origin);
      } catch (err) {
        console.error('[shanan-api] RFQ supplier insert failed:', err);
        return errorResponse('Could not add supplier to RFQ.', 500, origin);
      }
    }

    // DELETE /api/rfqs/:id/suppliers/:supplierId Ã¢â‚¬â€ remove a supplier from an RFQ (editable states only)
    const rfqSingleSupplierMatch = url.pathname.match(/^\/api\/rfqs\/([^/]+)\/suppliers\/([^/]+)$/);
    if (rfqSingleSupplierMatch && req.method === 'DELETE') {
      const auth = requireInternal(req, origin);
      if (auth.error) return auth.error;
      const rfqIdOrRef = decodeURIComponent(rfqSingleSupplierMatch[1]);
      const supplierIdOrRef = decodeURIComponent(rfqSingleSupplierMatch[2]);
      const existing = db.prepare('SELECT id, status FROM rfqs WHERE id = ? OR reference = ?').get(rfqIdOrRef, rfqIdOrRef) as any;
      if (!existing) return errorResponse('RFQ not found', 404, origin);
      if (existing.status !== 'draft' && existing.status !== 'ready_to_send') {
        return errorResponse(`Cannot remove supplier: RFQ status is '${existing.status}'. Only draft or ready_to_send RFQs can be modified.`, 400, origin);
      }
      const sup = db.prepare('SELECT id FROM suppliers WHERE id = ? OR reference = ?').get(supplierIdOrRef, supplierIdOrRef) as { id: string } | null;
      if (!sup) return errorResponse('Supplier not found', 404, origin);
      try {
        const r = db.prepare('DELETE FROM rfq_suppliers WHERE rfq_id = ? AND supplier_id = ?').run(existing.id, sup.id);
        if (r.changes === 0) return errorResponse('Supplier is not a recipient of this RFQ', 404, origin);
        return jsonResponse({ ok: true, removed: true }, 200, origin);
      } catch (err) {
        console.error('[shanan-api] RFQ supplier remove failed:', err);
        return errorResponse('Could not remove supplier from RFQ.', 500, origin);
      }
    }

    // --- A10.3 RFQ items ------------------------------------------------

    // POST /api/rfqs/:id/items Ã¢â‚¬â€ add a request item to an RFQ (editable states only)
    const rfqItemsMatch = url.pathname.match(/^\/api\/rfqs\/([^/]+)\/items$/);
    if (rfqItemsMatch && req.method === 'POST') {
      const auth = requireInternal(req, origin);
      if (auth.error) return auth.error;
      const rfqIdOrRef = decodeURIComponent(rfqItemsMatch[1]);
      let body: unknown;
      try { body = await req.json(); } catch { return errorResponse('Invalid JSON body', 400, origin); }
      const b = body as Record<string, unknown>;
      const existing = db.prepare('SELECT id, status, supply_request_id FROM rfqs WHERE id = ? OR reference = ?').get(rfqIdOrRef, rfqIdOrRef) as any;
      if (!existing) return errorResponse('RFQ not found', 404, origin);
      if (existing.status !== 'draft' && existing.status !== 'ready_to_send') {
        return errorResponse(`Cannot modify items: RFQ status is '${existing.status}'. Only draft or ready_to_send RFQs can be modified.`, 400, origin);
      }
      if (typeof b.requestItemId !== 'number' || !Number.isInteger(b.requestItemId) || b.requestItemId <= 0) {
        return errorResponse('Validation failed: requestItemId Ã¢â‚¬â€ must be a positive integer (supply_request_item.id)', 422, origin);
      }
      // Verify item exists and belongs to the SAME supply request as the RFQ
      const item = db.prepare('SELECT id, request_id, product_id, product_name, sku, quantity, notes FROM supply_request_items WHERE id = ?').get(b.requestItemId) as any;
      if (!item) {
        return errorResponse('Validation failed: requestItemId Ã¢â‚¬â€ request item does not exist', 422, origin);
      }
      if (item.request_id !== existing.supply_request_id) {
        return errorResponse('Validation failed: requestItemId Ã¢â‚¬â€ request item does not belong to this RFQ\'s supply request', 422, origin);
      }
      if (!isValidProductId(item.product_id)) {
        return errorResponse('Validation failed: requestItemId Ã¢â‚¬â€ request item references a non-existent SHANAN product', 422, origin);
      }
      // Verify not already in this RFQ (UNIQUE constraint)
      const existingItem = db.prepare('SELECT id FROM rfq_items WHERE rfq_id = ? AND supply_request_item_id = ?').get(existing.id, item.id) as { id: string } | null;
      if (existingItem) {
        return errorResponse('Validation failed: requestItemId Ã¢â‚¬â€ this request item is already in this RFQ', 409, origin);
      }
      const id = generateId();
      const now = new Date().toISOString();
      const rfqNotes = typeof b.rfqNotes === 'string' ? b.rfqNotes.trim() || null : null;
      try {
        db.prepare(
          `INSERT INTO rfq_items (id, rfq_id, supply_request_item_id, product_id, product_name, sku, requested_quantity, customer_notes, rfq_notes, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(id, existing.id, item.id, item.product_id, item.product_name, item.sku, item.quantity, item.notes, rfqNotes, now);
        return jsonResponse({ id, createdAt: now }, 201, origin);
      } catch (err) {
        console.error('[shanan-api] RFQ item insert failed:', err);
        return errorResponse('Could not add item to RFQ.', 500, origin);
      }
    }

    // --- A10.4 RFQ supplier offers (responses) --------------------------

    // POST /api/rfqs/:id/offers Ã¢â‚¬â€ record a supplier offer for one item (internal only)
    // Validation:
    //   - RFQ must exist and be in a state that accepts responses (sent | partially_responded | responded)
    //   - supplier must be a recipient of this RFQ (rfq_suppliers row)
    //   - rfqItemId must belong to this RFQ
    //   - offer_status: pending | quoted | declined | unavailable
    //   - if offer_status='quoted': quoted_unit_price (numeric Ã¢â€°Â¥ 0) is required
    //   - offered_quantity / lead_time_days / minimum_order_quantity (non-negative integers if provided)
    const rfqOfferMatch = url.pathname.match(/^\/api\/rfqs\/([^/]+)\/offers$/);
    if (rfqOfferMatch && req.method === 'POST') {
      const auth = requireInternal(req, origin);
      if (auth.error) return auth.error;
      const rfqIdOrRef = decodeURIComponent(rfqOfferMatch[1]);
      let body: unknown;
      try { body = await req.json(); } catch { return errorResponse('Invalid JSON body', 400, origin); }
      const b = body as Record<string, unknown>;
      const existing = db.prepare('SELECT id, status FROM rfqs WHERE id = ? OR reference = ?').get(rfqIdOrRef, rfqIdOrRef) as any;
      if (!existing) return errorResponse('RFQ not found', 404, origin);
      if (!['sent', 'partially_responded', 'responded'].includes(existing.status)) {
        return errorResponse(`Cannot record offer: RFQ status is '${existing.status}'. Offers can only be recorded against sent, partially_responded, or responded RFQs.`, 400, origin);
      }
      // Validate supplier is a recipient
      if (typeof b.supplierId !== 'string' || b.supplierId.trim() === '') {
        return errorResponse('Validation failed: supplierId Ã¢â‚¬â€ required', 422, origin);
      }
      const sup = db.prepare('SELECT id FROM suppliers WHERE id = ? OR reference = ?').get(b.supplierId, b.supplierId) as { id: string } | null;
      if (!sup) return errorResponse('Validation failed: supplierId Ã¢â‚¬â€ references a non-existent supplier', 422, origin);
      const rfqSup = db.prepare('SELECT id FROM rfq_suppliers WHERE rfq_id = ? AND supplier_id = ?').get(existing.id, sup.id) as { id: string } | null;
      if (!rfqSup) {
        return errorResponse('Validation failed: supplierId Ã¢â‚¬â€ this supplier is not a recipient of this RFQ', 422, origin);
      }
      // Validate rfqItemId belongs to this RFQ
      if (typeof b.rfqItemId !== 'string' || b.rfqItemId.trim() === '') {
        return errorResponse('Validation failed: rfqItemId Ã¢â‚¬â€ required', 422, origin);
      }
      const rfqItem = db.prepare('SELECT id FROM rfq_items WHERE id = ? AND rfq_id = ?').get(b.rfqItemId, existing.id) as { id: string } | null;
      if (!rfqItem) {
        return errorResponse('Validation failed: rfqItemId Ã¢â‚¬â€ item does not belong to this RFQ', 422, origin);
      }
      // Validate offer_status
      let offerStatus = 'pending';
      if (b.offerStatus !== undefined && b.offerStatus !== null) {
        if (typeof b.offerStatus === 'string' && ['pending', 'quoted', 'declined', 'unavailable'].includes(b.offerStatus)) {
          offerStatus = b.offerStatus;
        } else {
          return errorResponse(`Validation failed: offerStatus Ã¢â‚¬â€ must be one of: pending, quoted, declined, unavailable`, 400, origin);
        }
      }
      // If offer_status='quoted', quoted_unit_price is required
      let quotedUnitPrice: number | null = null;
      if (b.quotedUnitPrice !== undefined && b.quotedUnitPrice !== null) {
        if (typeof b.quotedUnitPrice !== 'number' || b.quotedUnitPrice < 0 || !isFinite(b.quotedUnitPrice)) {
          return errorResponse('Validation failed: quotedUnitPrice Ã¢â‚¬â€ must be a non-negative number', 400, origin);
        }
        quotedUnitPrice = b.quotedUnitPrice;
      }
      if (offerStatus === 'quoted' && quotedUnitPrice === null) {
        return errorResponse('Validation failed: quotedUnitPrice Ã¢â‚¬â€ required when offerStatus is "quoted"', 400, origin);
      }
      // Optional integers
      let offeredQty: number | null = null;
      if (b.offeredQuantity !== undefined && b.offeredQuantity !== null) {
        if (typeof b.offeredQuantity === 'number' && Number.isInteger(b.offeredQuantity) && b.offeredQuantity >= 0) {
          offeredQty = b.offeredQuantity;
        } else {
          return errorResponse('Validation failed: offeredQuantity Ã¢â‚¬â€ must be a non-negative integer', 400, origin);
        }
      }
      let leadTime: number | null = null;
      if (b.leadTimeDays !== undefined && b.leadTimeDays !== null) {
        if (typeof b.leadTimeDays === 'number' && Number.isInteger(b.leadTimeDays) && b.leadTimeDays >= 0) {
          leadTime = b.leadTimeDays;
        } else {
          return errorResponse('Validation failed: leadTimeDays Ã¢â‚¬â€ must be a non-negative integer', 400, origin);
        }
      }
      let moq: number | null = null;
      if (b.minimumOrderQuantity !== undefined && b.minimumOrderQuantity !== null) {
        if (typeof b.minimumOrderQuantity === 'number' && Number.isInteger(b.minimumOrderQuantity) && b.minimumOrderQuantity >= 0) {
          moq = b.minimumOrderQuantity;
        } else {
          return errorResponse('Validation failed: minimumOrderQuantity Ã¢â‚¬â€ must be a non-negative integer', 400, origin);
        }
      }
      const currency = (typeof b.currency === 'string' && b.currency.trim()) ? b.currency.trim() : null;
      const validityDate = (typeof b.validityDate === 'string') ? b.validityDate : null;
      const paymentTerms = (typeof b.paymentTerms === 'string' && b.paymentTerms.trim()) ? b.paymentTerms.trim() : null;
      const commercialNotes = (typeof b.commercialNotes === 'string' && b.commercialNotes.trim()) ? b.commercialNotes.trim() : null;
      const now = new Date().toISOString();

      try {
        const tx = db.transaction(() => {
          // Upsert: if (rfq_supplier_id, rfq_item_id) exists, update; otherwise insert.
          const existingOffer = db.prepare('SELECT id FROM rfq_supplier_offers WHERE rfq_supplier_id = ? AND rfq_item_id = ?').get(rfqSup.id, rfqItem.id) as { id: string } | null;
          let offerId: string;
          if (existingOffer) {
            offerId = existingOffer.id;
            db.prepare(
              `UPDATE rfq_supplier_offers
                  SET offer_status = ?, quoted_unit_price = ?, currency = ?, offered_quantity = ?,
                      lead_time_days = ?, validity_date = ?, minimum_order_quantity = ?,
                      payment_terms = ?, commercial_notes = ?, responded_at = ?, updated_at = ?
                WHERE id = ?`,
            ).run(offerStatus, quotedUnitPrice, currency, offeredQty, leadTime, validityDate, moq, paymentTerms, commercialNotes, now, now, offerId);
          } else {
            offerId = generateId();
            db.prepare(
              `INSERT INTO rfq_supplier_offers
                 (id, rfq_supplier_id, rfq_item_id, offer_status, quoted_unit_price, currency,
                  offered_quantity, lead_time_days, validity_date, minimum_order_quantity,
                  payment_terms, commercial_notes, responded_at, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            ).run(offerId, rfqSup.id, rfqItem.id, offerStatus, quotedUnitPrice, currency, offeredQty, leadTime, validityDate, moq, paymentTerms, commercialNotes, now, now, now);
          }

          // Recompute aggregate RFQ state:
          //   - Per-supplier response_state: 'responded' if all this supplier's rfq_items have
          //     an offer row that is not in 'pending' state; otherwise 'pending'.
          //   - RFQ-level state:
          //       if all recipients responded Ã¢â€ â€™ 'responded'
          //       else if at least one responded Ã¢â€ â€™ 'partially_responded'
          //       else Ã¢â€ â€™ keep current (sent)
          const allSuppliers = db.query('SELECT id, supplier_id FROM rfq_suppliers WHERE rfq_id = ?').all(existing.id) as any[];
          let respondedCount = 0;
          for (const rs of allSuppliers) {
            const totalItemsForSup = db.prepare('SELECT COUNT(*) as n FROM rfq_items WHERE rfq_id = ?').get(existing.id) as { n: number };
            const answeredItems = db.prepare(
              `SELECT COUNT(*) as n FROM rfq_supplier_offers o
                WHERE o.rfq_supplier_id = ? AND o.offer_status != 'pending'`,
            ).get(rs.id) as { n: number };
            const supResponded = answeredItems.n >= totalItemsForSup.n && totalItemsForSup.n > 0;
            if (supResponded) {
              respondedCount++;
              if (rs.response_state !== 'responded') {
                db.prepare('UPDATE rfq_suppliers SET response_state = ?, responded_at = ? WHERE id = ?').run('responded', now, rs.id);
              }
            } else {
              // Reset to pending if previously marked responded (defensive)
              if (rs.response_state === 'responded') {
                db.prepare('UPDATE rfq_suppliers SET response_state = ? WHERE id = ?').run('pending', rs.id);
              }
            }
          }
          // Update RFQ-level status (only if currently sent or partially_responded Ã¢â‚¬â€ never override closed/cancelled)
          if (existing.status === 'sent' || existing.status === 'partially_responded') {
            let newStatus: string;
            if (respondedCount === 0) {
              newStatus = 'sent';
            } else if (respondedCount >= allSuppliers.length) {
              newStatus = 'responded';
            } else {
              newStatus = 'partially_responded';
            }
            if (newStatus !== existing.status) {
              db.prepare('UPDATE rfqs SET status = ?, updated_at = ? WHERE id = ?').run(newStatus, now, existing.id);
            }
          }
        });
        tx();
        const updatedRfq = db.prepare('SELECT * FROM rfqs WHERE id = ?').get(existing.id);
        // V1: Record server-side business event
        recordActivityEvent('OFFER_RECORDED', auth.user, { rfqId: existing.id });
        return jsonResponse({ rfq: updatedRfq }, 200, origin);
      } catch (err) {
        console.error('[shanan-api] RFQ offer record failed:', err);
        return errorResponse('Could not record supplier offer.', 500, origin);
      }
    }

    // ============================================================
    // Phase A11 Ã¢â‚¬â€ Internal Sourcing Evaluation & Decision
    // INTERNAL SHANAN CONFIDENTIAL DATA.
    // Every endpoint below requires `requireInternal` Ã¢â‚¬â€ customer users are
    // rejected with HTTP 403 at the API layer. No evaluation, recommendation,
    // or decision data is ever exposed to customers.
    // ============================================================

    // GET /api/supply-requests/:id/sourcing-evaluation
    // Returns the runtime-derived evaluation from live A9/A10 data + the latest
    // existing sourcing decision (if any). Stateless Ã¢â‚¬â€ recomputed each call.
    const evaluationMatch = url.pathname.match(/^\/api\/supply-requests\/([^/]+)\/sourcing-evaluation$/);
    if (evaluationMatch && req.method === 'GET') {
      const auth = requireInternal(req, origin);
      if (auth.error) return auth.error;
      const srIdOrRef = decodeURIComponent(evaluationMatch[1]);
      // Resolve supply request by id OR reference
      const sr = db.prepare('SELECT id FROM supply_requests WHERE id = ? OR reference = ?').get(srIdOrRef, srIdOrRef) as { id: string } | null;
      if (!sr) return errorResponse('Supply Request not found', 404, origin);
      try {
        const evaluation = evaluateSourcingForRequest(sr.id);
        if (!evaluation) return errorResponse('Supply Request not found', 404, origin);
        // Fetch latest decision (if any) Ã¢â‚¬â€ do NOT silently overwrite
        const latestDecision = db.prepare(
          `SELECT sd.*, u.name AS decided_by_name
             FROM sourcing_decisions sd
             LEFT JOIN users u ON sd.decided_by = u.id
            WHERE sd.supply_request_id = ?
            ORDER BY sd.decided_at DESC
            LIMIT 1`,
        ).get(sr.id) as any;
        return jsonResponse({ evaluation, latestDecision: latestDecision || null }, 200, origin);
      } catch (err) {
        console.error('[shanan-api] Sourcing evaluation failed:', err);
        return errorResponse('Could not evaluate sourcing options.', 500, origin);
      }
    }

    // POST /api/supply-requests/:id/sourcing-decision
    // Records a NEW human-controlled sourcing decision (audit-safe; never overwrites
    // previous decisions Ã¢â‚¬â€ they remain as historical rows).
    // Validation:
    //   - decision_state: not_decided | recommended_for_review | selected | needs_more_sourcing | rejected
    //   - when decision_state='selected': selectedSourceType + selectedSourceId required,
    //     must belong to this request's evaluation AND be currently eligible
    //   - decided_by derived from auth.user.id (never client-supplied)
    const decisionMatch = url.pathname.match(/^\/api\/supply-requests\/([^/]+)\/sourcing-decision$/);
    if (decisionMatch && req.method === 'POST') {
      const auth = requireInternal(req, origin);
      if (auth.error) return auth.error;
      const srIdOrRef = decodeURIComponent(decisionMatch[1]);
      let body: unknown;
      try { body = await req.json(); } catch { return errorResponse('Invalid JSON body', 400, origin); }
      const b = body as Record<string, unknown>;
      const sr = db.prepare('SELECT id FROM supply_requests WHERE id = ? OR reference = ?').get(srIdOrRef, srIdOrRef) as { id: string } | null;
      if (!sr) return errorResponse('Supply Request not found', 404, origin);
      // Validate decision_state
      const validStates = ['not_decided', 'recommended_for_review', 'selected', 'needs_more_sourcing', 'rejected'];
      let decisionState: string;
      if (typeof b.decisionState === 'string' && validStates.includes(b.decisionState)) {
        decisionState = b.decisionState;
      } else {
        return errorResponse(`Validation failed: decisionState Ã¢â‚¬â€ must be one of: ${validStates.join(', ')}`, 400, origin);
      }
      // If decision_state='selected', validate the selected option
      let selectedSourceType: 'agreement_term' | 'rfq_offer' | null = null;
      let selectedSourceId: string | null = null;
      let snapshot: {
        supplier_id: string; product_id: string; unit_price: number | null;
        currency: string | null; lead_time_days: number | null;
        rfq_item_id: string | null;
      } | null = null;
      if (decisionState === 'selected') {
        if (typeof b.selectedSourceType !== 'string' || !['agreement_term', 'rfq_offer'].includes(b.selectedSourceType)) {
          return errorResponse('Validation failed: selectedSourceType Ã¢â‚¬â€ required (must be agreement_term or rfq_offer) when decisionState is "selected"', 422, origin);
        }
        if (typeof b.selectedSourceId !== 'string' || b.selectedSourceId.trim() === '') {
          return errorResponse('Validation failed: selectedSourceId Ã¢â‚¬â€ required when decisionState is "selected"', 422, origin);
        }
        selectedSourceType = b.selectedSourceType as 'agreement_term' | 'rfq_offer';
        selectedSourceId = b.selectedSourceId.trim();
        const validation = validateSelectedOption(sr.id, selectedSourceType, selectedSourceId);
        if (!validation.ok) {
          return errorResponse(`Validation failed: selectedSourceId Ã¢â‚¬â€ ${validation.reason}`, 400, origin);
        }
        // Capture audit-safe snapshot at decision time
        const opt = validation.option;
        snapshot = {
          supplier_id: opt.supplier_id,
          product_id: opt.product_id,
          unit_price: opt.unit_price,
          currency: opt.currency,
          lead_time_days: opt.lead_time_days,
          rfq_item_id: opt.rfq_item_id,
        };
      }
      const decisionNotes = (typeof b.decisionNotes === 'string') ? b.decisionNotes.trim() || null : null;
      const id = generateId();
      const reference = generateSourcingDecisionReference();
      const now = new Date().toISOString();
      try {
        db.prepare(
          `INSERT INTO sourcing_decisions
             (id, reference, supply_request_id, decision_state,
              selected_source_type, selected_agreement_term_id, selected_rfq_offer_id, selected_rfq_item_id,
              snapshot_supplier_id, snapshot_product_id, snapshot_unit_price, snapshot_currency, snapshot_lead_time_days,
              decision_notes, decided_by, decided_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          id, reference, sr.id, decisionState,
          selectedSourceType,
          selectedSourceType === 'agreement_term' ? selectedSourceId : null,
          selectedSourceType === 'rfq_offer' ? selectedSourceId : null,
          snapshot?.rfq_item_id ?? null,
          snapshot?.supplier_id ?? null,
          snapshot?.product_id ?? null,
          snapshot?.unit_price ?? null,
          snapshot?.currency ?? null,
          snapshot?.lead_time_days ?? null,
          decisionNotes,
          auth.user.id, // derived from auth Ã¢â‚¬â€ never client-supplied
          now, now,
        );
        const created = db.prepare(
          `SELECT sd.*, u.name AS decided_by_name
             FROM sourcing_decisions sd
             LEFT JOIN users u ON sd.decided_by = u.id
            WHERE sd.id = ?`,
        ).get(id);
        // V1: Record server-side business event
        recordActivityEvent('DECISION_RECORDED', auth.user, { supplyRequestId: sr.id });
        return jsonResponse({ decision: created }, 201, origin);
      } catch (err) {
        console.error('[shanan-api] Sourcing decision insert failed:', err);
        return errorResponse('Could not record sourcing decision.', 500, origin);
      }
    }

    // GET /api/supply-requests/:id/sourcing-decisions
    // Returns the decision history for a supply request (internal full; customer safe subset).
    if (url.pathname.match(/^\/api\/supply-requests\/([^/]+)\/sourcing-decisions$/) && req.method === 'GET') {
      const auth = requireAuth(req, origin);
      if (auth.error) return auth.error;
      // Authorization guard: only internal (full) and customer (safe, ownership-checked) access.
      // Suppliers are explicitly blocked to prevent exposure of internal sourcing decision data (P1-01).
      const sdUserType = auth.user.user_type;
      if (sdUserType !== 'customer' && sdUserType !== 'internal') {
        return errorResponse('Forbidden: access denied', 403, origin);
      }
      const isCustomer = auth.user.user_type === 'customer';
      const m = url.pathname.match(/^\/api\/supply-requests\/([^/]+)\/sourcing-decisions$/);
      const srIdOrRef = decodeURIComponent(m![1]);
      const sr = db.prepare('SELECT id, customer_company_id FROM supply_requests WHERE id = ? OR reference = ?').get(srIdOrRef, srIdOrRef) as { id: string; customer_company_id: string | null } | null;
      if (!sr) return errorResponse('Supply Request not found', 404, origin);
      // Customer ownership check
      if (isCustomer && sr.customer_company_id !== auth.user.company_id) {
        return errorResponse('Request not found', 404, origin);
      }
      try {
        if (isCustomer) {
          // Customer-safe: only decision outcome, no supplier identity, no internal data
          const rows = db.query(
            `SELECT sd.id, sd.reference, sd.decision_state, sd.selected_source_type,
                    sd.created_at
               FROM sourcing_decisions sd
              WHERE sd.supply_request_id = ?
              ORDER BY sd.decided_at DESC`,
          ).all(sr.id);
          return jsonResponse({ decisions: rows, count: rows.length }, 200, origin);
        }
        // Internal: full decision history
        const rows = db.query(
          `SELECT sd.*, u.name AS decided_by_name
             FROM sourcing_decisions sd
             LEFT JOIN users u ON sd.decided_by = u.id
            WHERE sd.supply_request_id = ?
            ORDER BY sd.decided_at DESC`,
        ).all(sr.id);
        return jsonResponse({ decisions: rows, count: rows.length }, 200, origin);
      } catch (err) {
        console.error('[shanan-api] Sourcing decisions query failed:', err);
        return errorResponse('Could not retrieve sourcing decisions.', 500, origin);
      }
    }

    // GET /api/supply-requests/:id/procurement-status
    // Customer-safe aggregated procurement status. Returns RFQ, sourcing decision,
    // purchase request, and purchase order data in one call. Ownership-checked.
    const procStatusMatch = url.pathname.match(/^\/api\/supply-requests\/([^/]+)\/procurement-status$/);
    if (procStatusMatch && req.method === 'GET') {
      const auth = requireAuth(req, origin);
      if (auth.error) return auth.error;
      const userType = auth.user.user_type;
      // Suppliers and other non-internal/non-customer users are blocked entirely.
      if (userType !== 'customer' && userType !== 'internal') {
        return errorResponse('Forbidden: access denied', 403, origin);
      }
      const isCustomer = userType === 'customer';
      const srIdOrRef = decodeURIComponent(procStatusMatch[1]);
      const sr = db.prepare('SELECT id, customer_company_id, status AS sr_status FROM supply_requests WHERE id = ? OR reference = ?')
        .get(srIdOrRef, srIdOrRef) as { id: string; customer_company_id: string | null; sr_status: string } | null;
      if (!sr) return errorResponse('Supply Request not found', 404, origin);
      if (isCustomer && sr.customer_company_id !== auth.user.company_id) {
        return errorResponse('Request not found', 404, origin);
      }
      try {
        // RFQ info (latest)
        const rfq = db.query(
          `SELECT r.id, r.reference, r.status, r.sent_at, r.created_at,
                  (SELECT COUNT(*) FROM rfq_suppliers rs WHERE rs.rfq_id = r.id) AS supplier_count,
                  (SELECT COUNT(*) FROM rfq_suppliers rs WHERE rs.rfq_id = r.id AND rs.response_state = 'responded') AS responded_count,
                  (SELECT COUNT(*) FROM rfq_supplier_offers o
                     JOIN rfq_suppliers rs ON o.rfq_supplier_id = rs.id
                     WHERE rs.rfq_id = r.id) AS offer_count,
                  (SELECT COUNT(*) FROM rfq_items ri WHERE ri.rfq_id = r.id) AS items_count
             FROM rfqs r WHERE r.supply_request_id = ? ORDER BY r.created_at DESC LIMIT 1`,
        ).get(sr.id) as any || null;

        // Latest sourcing decision
        const decision = db.query(
          `SELECT sd.id, sd.reference, sd.decision_state, sd.selected_source_type, sd.created_at
             FROM sourcing_decisions sd WHERE sd.supply_request_id = ? ORDER BY sd.decided_at DESC LIMIT 1`,
        ).get(sr.id) as any || null;

        // Purchase request (linked via sourcing_decision_id OR supply_request_id)
        let pr = null;
        if (decision) {
          pr = db.query(
            `SELECT id, reference, status, created_at FROM purchase_requests WHERE sourcing_decision_id = ? LIMIT 1`,
          ).get(decision.id) as any || null;
        }
        if (!pr) {
          pr = db.query(
            `SELECT id, reference, status, created_at FROM purchase_requests WHERE supply_request_id = ? ORDER BY created_at DESC LIMIT 1`,
          ).get(sr.id) as any || null;
        }

        // Purchase order (linked via purchase_request_id OR supply_request_id)
        let po = null;
        if (pr) {
          po = db.query(
            `SELECT id, reference, status, expected_delivery, created_at FROM purchase_orders WHERE purchase_request_id = ? LIMIT 1`,
          ).get(pr.id) as any || null;
        }
        if (!po) {
          po = db.query(
            `SELECT id, reference, status, expected_delivery, created_at FROM purchase_orders WHERE supply_request_id = ? ORDER BY created_at DESC LIMIT 1`,
          ).get(sr.id) as any || null;
        }

        return jsonResponse({
          supplyRequestStatus: sr.sr_status,
          rfq,
          decision,
          purchaseRequest: pr,
          purchaseOrder: po,
        }, 200, origin);
      } catch (err) {
        console.error('[shanan-api] Procurement status query failed:', err);
        return errorResponse('Could not retrieve procurement status.', 500, origin);
      }
    }

    // ============================================================
    // Phase B1 — Purchase Request & Purchase Order API endpoints
    // Extends the sourcing chain into procurement execution.
    // Every endpoint below requires `requireInternal`.
    // ============================================================

    // --- B1: RFQ Comparison endpoint -----------------------------------------
    // GET /api/rfqs/:id/comparison
    // Returns side-by-side supplier comparison data for an RFQ.
    // Aggregates rfq_supplier_offers into a comparison matrix.
    const rfqComparisonMatch = url.pathname.match(/^\/api\/rfqs\/([^/]+)\/comparison$/);
    if (rfqComparisonMatch && req.method === 'GET') {
      const auth = requireInternal(req, origin);
      if (auth.error) return auth.error;
      const rfqIdOrRef = decodeURIComponent(rfqComparisonMatch[1]);
      const rfq = db.prepare('SELECT id, reference, status, supply_request_id FROM rfqs WHERE id = ? OR reference = ?').get(rfqIdOrRef, rfqIdOrRef) as any;
      if (!rfq) return errorResponse('RFQ not found', 404, origin);
      try {
        // Get all items for this RFQ
        const items = db.query(
          `SELECT ri.*, sri.product_id, sri.product_name, sri.sku, sri.quantity AS requested_quantity
             FROM rfq_items ri
             JOIN supply_request_items sri ON ri.supply_request_item_id = sri.id
            WHERE ri.rfq_id = ?`,
        ).all(rfq.id) as any[];
        // Get all suppliers for this RFQ
        const suppliers = db.query(
          `SELECT rs.*, s.id AS supplier_id, s.name_en AS supplier_name, s.reference AS supplier_reference
             FROM rfq_suppliers rs
             JOIN suppliers s ON rs.supplier_id = s.id
            WHERE rs.rfq_id = ?`,
        ).all(rfq.id) as any[];
        // Get all offers
        const offers = db.query(
          `SELECT rso.*
             FROM rfq_supplier_offers rso
             JOIN rfq_suppliers rs ON rso.rfq_supplier_id = rs.id
            WHERE rs.rfq_id = ?`,
        ).all(rfq.id) as any[];
        // Build comparison matrix: for each item, show each supplier's offer
        const comparison = items.map((item: any) => {
          const itemOffers = suppliers.map((sup: any) => {
            const offer = offers.find((o: any) => o.rfq_item_id === item.id && o.rfq_supplier_id === sup.id);
            return {
              supplier_id: sup.supplier_id,
              supplier_name: sup.supplier_name,
              supplier_reference: sup.supplier_reference,
              response_state: sup.response_state,
              offer_status: offer?.offer_status || 'pending',
              quoted_unit_price: offer?.quoted_unit_price ?? null,
              currency: offer?.currency ?? null,
              offered_quantity: offer?.offered_quantity ?? null,
              lead_time_days: offer?.lead_time_days ?? null,
              payment_terms: offer?.payment_terms ?? null,
              commercial_notes: offer?.commercial_notes ?? null,
              offer_id: offer?.id ?? null,
            };
          });
          return {
            rfq_item_id: item.id,
            product_id: item.product_id,
            product_name: item.product_name,
            sku: item.sku,
            requested_quantity: item.requested_quantity,
            offers: itemOffers,
          };
        });
        return jsonResponse({
          rfq: { id: rfq.id, reference: rfq.reference, status: rfq.status },
          items: comparison,
          suppliers,
          evaluated_at: new Date().toISOString(),
        }, 200, origin);
      } catch (err) {
        console.error('[shanan-api] RFQ comparison failed:', err);
        return errorResponse('Could not build RFQ comparison.', 500, origin);
      }
    }

    // --- B1: Purchase Requests -----------------------------------------------

    // GET /api/purchase-requests — list all PRs (with optional status filter)
    if (url.pathname === '/api/purchase-requests' && req.method === 'GET') {
      const auth = requireInternal(req, origin);
      if (auth.error) return auth.error;
      const statusFilter = url.searchParams.get('status');
      try {
        let query = `SELECT pr.*, s.name_en AS supplier_name, s.reference AS supplier_reference,
                            sr.reference AS supply_request_reference,
                            sd.reference AS sourcing_decision_reference,
                            u.name AS created_by_name
                       FROM purchase_requests pr
                       JOIN suppliers s ON pr.supplier_id = s.id
                       JOIN supply_requests sr ON pr.supply_request_id = sr.id
                       JOIN sourcing_decisions sd ON pr.sourcing_decision_id = sd.id
                       LEFT JOIN users u ON pr.created_by = u.id`;
        const params: any[] = [];
        if (statusFilter && statusFilter !== 'all') {
          query += ' WHERE pr.status = ?';
          params.push(statusFilter);
        }
        query += ' ORDER BY pr.created_at DESC';
        const rows = db.query(query).all(...params) as any[];
        // Fetch items count per PR
        const counts = db.query(
          `SELECT pr_id, COUNT(*) AS item_count, SUM(total_price) AS computed_total
             FROM purchase_request_items GROUP BY pr_id`,
        ).all() as any[];
        const countMap = new Map(counts.map((c: any) => [c.pr_id, c]));
        const result = rows.map((r: any) => ({
          ...r,
          item_count: countMap.get(r.id)?.item_count ?? 0,
        }));
        return jsonResponse({ purchaseRequests: result, count: result.length }, 200, origin);
      } catch (err) {
        console.error('[shanan-api] Purchase requests list failed:', err);
        return errorResponse('Could not retrieve purchase requests.', 500, origin);
      }
    }

    // GET /api/purchase-requests/:id — detail with items
    const prDetailMatch = url.pathname.match(/^\/api\/purchase-requests\/([^/]+)$/);
    if (prDetailMatch && req.method === 'GET') {
      const auth = requireInternal(req, origin);
      if (auth.error) return auth.error;
      const prIdOrRef = decodeURIComponent(prDetailMatch[1]);
      try {
        const pr = db.prepare(
          `SELECT pr.*, s.name_en AS supplier_name, s.reference AS supplier_reference, s.contact_name, s.contact_email, s.contact_phone,
                  sr.reference AS supply_request_reference, sr.customer_po_number,
                  sd.reference AS sourcing_decision_reference, sd.snapshot_unit_price, sd.snapshot_currency, sd.snapshot_lead_time_days,
                  u.name AS created_by_name, au.name AS approved_by_name
             FROM purchase_requests pr
             JOIN suppliers s ON pr.supplier_id = s.id
             JOIN supply_requests sr ON pr.supply_request_id = sr.id
             JOIN sourcing_decisions sd ON pr.sourcing_decision_id = sd.id
             LEFT JOIN users u ON pr.created_by = u.id
             LEFT JOIN users au ON pr.approved_by = au.id
            WHERE pr.id = ? OR pr.reference = ?`,
        ).get(prIdOrRef, prIdOrRef) as any;
        if (!pr) return errorResponse('Purchase Request not found', 404, origin);
        const items = db.query(
          `SELECT pri.*, p.name_en AS catalog_product_name, p.sku AS catalog_sku
             FROM purchase_request_items pri
             LEFT JOIN products p ON pri.product_id = p.id
            WHERE pri.pr_id = ?`,
        ).all(pr.id) as any[];
        // Check if a PO exists for this PR
        const po = db.prepare('SELECT id, reference, status FROM purchase_orders WHERE purchase_request_id = ?').get(pr.id) as any;
        return jsonResponse({ purchaseRequest: { ...pr, items, purchaseOrder: po || null } }, 200, origin);
      } catch (err) {
        console.error('[shanan-api] Purchase request detail failed:', err);
        return errorResponse('Could not retrieve purchase request.', 500, origin);
      }
    }

    // POST /api/purchase-requests — create from sourcing decision
    if (url.pathname === '/api/purchase-requests' && req.method === 'POST') {
      const auth = requireInternal(req, origin);
      if (auth.error) return auth.error;
      let body: unknown;
      try { body = await req.json(); } catch { return errorResponse('Invalid JSON body', 400, origin); }
      const b = body as Record<string, unknown>;
      // Validate sourcing_decision_id
      if (typeof b.sourcingDecisionId !== 'string' || b.sourcingDecisionId.trim() === '') {
        return errorResponse('Validation failed: sourcingDecisionId is required', 422, origin);
      }
      const decisionId = b.sourcingDecisionId.trim();
      const decision = db.prepare(
        `SELECT sd.*, sr.id AS sr_id, sr.reference AS sr_reference
           FROM sourcing_decisions sd
           JOIN supply_requests sr ON sd.supply_request_id = sr.id
          WHERE sd.id = ? AND sd.decision_state = 'selected'`,
      ).get(decisionId) as any;
      if (!decision) {
        return errorResponse('Sourcing decision not found or not in "selected" state', 404, origin);
      }
      // Check if PR already exists for this decision
      const existingPr = db.prepare('SELECT id, reference FROM purchase_requests WHERE sourcing_decision_id = ?').get(decisionId) as any;
      if (existingPr) {
        return errorResponse(`Purchase Request already exists for this decision: ${existingPr.reference}`, 409, origin);
      }
      // Validate supplier exists
      if (!decision.snapshot_supplier_id) {
        return errorResponse('Sourcing decision has no supplier snapshot', 422, origin);
      }
      const supplier = db.prepare('SELECT id, name_en FROM suppliers WHERE id = ?').get(decision.snapshot_supplier_id) as any;
      if (!supplier) {
        return errorResponse('Supplier not found', 404, origin);
      }
      const notes = (typeof b.notes === 'string') ? b.notes.trim() || null : null;
      const prId = generateId();
      const prReference = generatePrReference();
      const now = new Date().toISOString();
      try {
        db.exec('BEGIN TRANSACTION');
        // Create PR header
        db.prepare(
          `INSERT INTO purchase_requests
             (id, reference, supply_request_id, sourcing_decision_id, supplier_id,
              status, total_amount, currency, notes, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?)`,
        ).run(
          prId, prReference, decision.supply_request_id, decisionId,
          decision.snapshot_supplier_id,
          decision.snapshot_unit_price ?? null,
          decision.snapshot_currency || 'JOD',
          notes,
          auth.user.id, now, now,
        );
        // Create PR items from the sourcing decision
        // The decision snapshot has one product — but we also need quantity.
        // Get the quantity from the supply request item linked to the decision.
        let quantity = 1;
        let productName = '';
        let sku = '';
        let productId = decision.snapshot_product_id || '';
        if (decision.selected_rfq_item_id) {
          const rfqItem = db.prepare(
            `SELECT ri.*, sri.quantity, sri.product_name, sri.sku
               FROM rfq_items ri
               JOIN supply_request_items sri ON ri.supply_request_item_id = sri.id
              WHERE ri.id = ?`,
          ).get(decision.selected_rfq_item_id) as any;
          if (rfqItem) {
            quantity = rfqItem.quantity;
            productName = rfqItem.product_name;
            sku = rfqItem.sku;
          }
        } else if (decision.selected_agreement_term_id) {
          const apt = db.prepare(
            `SELECT apt.*, p.name_en AS product_name, p.sku
               FROM agreement_product_terms apt
               LEFT JOIN products p ON apt.product_id = p.id
              WHERE apt.id = ?`,
          ).get(decision.selected_agreement_term_id) as any;
          if (apt) {
            productId = apt.product_id;
            productName = apt.product_name || '';
            sku = apt.sku || '';
            quantity = apt.minimum_order_quantity || 1;
          }
        }
        // Also try to get quantity from supply_request_items linked to this supply request
        const sri = db.prepare(
          `SELECT quantity, product_name, sku FROM supply_request_items WHERE request_id = ? AND product_id = ? LIMIT 1`,
        ).get(decision.supply_request_id, productId) as any;
        if (sri) {
          quantity = sri.quantity;
          if (!productName) productName = sri.product_name;
          if (!sku) sku = sri.sku;
        }
        const unitPrice = decision.snapshot_unit_price ?? null;
        const totalPrice = unitPrice ? unitPrice * quantity : null;
        db.prepare(
          `INSERT INTO purchase_request_items
             (pr_id, product_id, product_name, sku, quantity, unit_price, currency, total_price,
              rfq_offer_id, rfq_item_id, source_type, snapshot_lead_time_days, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          prId, productId, productName, sku, quantity,
          unitPrice, decision.snapshot_currency || 'JOD', totalPrice,
          decision.selected_rfq_offer_id || null,
          decision.selected_rfq_item_id || null,
          decision.selected_source_type || null,
          decision.snapshot_lead_time_days || null,
          now,
        );
        // Update PR total
        db.prepare('UPDATE purchase_requests SET total_amount = ? WHERE id = ?').run(totalPrice, prId);
        db.exec('COMMIT');
        const created = db.prepare(
          `SELECT pr.*, s.name_en AS supplier_name, u.name AS created_by_name
             FROM purchase_requests pr
             JOIN suppliers s ON pr.supplier_id = s.id
             LEFT JOIN users u ON pr.created_by = u.id
            WHERE pr.id = ?`,
        ).get(prId);
        const createdItems = db.query('SELECT * FROM purchase_request_items WHERE pr_id = ?').all(prId);
        return jsonResponse({ purchaseRequest: { ...created as any, items: createdItems } }, 201, origin);
      } catch (err) {
        try { db.exec('ROLLBACK'); } catch {}
        console.error('[shanan-api] Purchase request creation failed:', err);
        return errorResponse('Could not create purchase request.', 500, origin);
      }
    }

    // PATCH /api/purchase-requests/:id — update status (approve/reject/cancel)
    const prUpdateMatch = url.pathname.match(/^\/api\/purchase-requests\/([^/]+)$/);
    if (prUpdateMatch && req.method === 'PATCH') {
      const auth = requireInternal(req, origin);
      if (auth.error) return auth.error;
      const prIdOrRef = decodeURIComponent(prUpdateMatch[1]);
      let body: unknown;
      try { body = await req.json(); } catch { return errorResponse('Invalid JSON body', 400, origin); }
      const b = body as Record<string, unknown>;
      const pr = db.prepare('SELECT * FROM purchase_requests WHERE id = ? OR reference = ?').get(prIdOrRef, prIdOrRef) as any;
      if (!pr) return errorResponse('Purchase Request not found', 404, origin);
      const now = new Date().toISOString();
      try {
        if (typeof b.status === 'string') {
          const validTransitions: Record<string, string[]> = {
            draft: ['submitted', 'cancelled'],
            submitted: ['approved', 'rejected', 'cancelled'],
          };
          const allowed = validTransitions[pr.status] || [];
          if (!allowed.includes(b.status)) {
            return errorResponse(`Cannot transition from "${pr.status}" to "${b.status}". Allowed: ${allowed.join(', ') || 'none'}`, 422, origin);
          }
          const updates: string[] = ['status = ?', 'updated_at = ?'];
          const params: any[] = [b.status, now];
          if (b.status === 'approved') {
            updates.push('approved_by = ?', 'approved_at = ?');
            params.push(auth.user.id, now);
          }
          if (b.status === 'rejected' && typeof b.rejectedReason === 'string') {
            updates.push('rejected_reason = ?');
            params.push(b.rejectedReason.trim());
          }
          if (typeof b.notes === 'string') {
            updates.push('notes = ?');
            params.push(b.notes.trim() || null);
          }
          params.push(pr.id);
          db.prepare(`UPDATE purchase_requests SET ${updates.join(', ')} WHERE id = ?`).run(...params);
        } else if (typeof b.notes === 'string') {
          db.prepare('UPDATE purchase_requests SET notes = ?, updated_at = ? WHERE id = ?').run(b.notes.trim() || null, now, pr.id);
        }
        const updated = db.prepare(
          `SELECT pr.*, s.name_en AS supplier_name, u.name AS created_by_name, au.name AS approved_by_name
             FROM purchase_requests pr
             JOIN suppliers s ON pr.supplier_id = s.id
             LEFT JOIN users u ON pr.created_by = u.id
             LEFT JOIN users au ON pr.approved_by = au.id
            WHERE pr.id = ?`,
        ).get(pr.id);
        const items = db.query('SELECT * FROM purchase_request_items WHERE pr_id = ?').all(pr.id);
        return jsonResponse({ purchaseRequest: { ...updated as any, items } }, 200, origin);
      } catch (err) {
        console.error('[shanan-api] Purchase request update failed:', err);
        return errorResponse('Could not update purchase request.', 500, origin);
      }
    }

    // --- B1: Purchase Orders ------------------------------------------------

    // GET /api/purchase-orders — list all POs (with optional status filter)
    if (url.pathname === '/api/purchase-orders' && req.method === 'GET') {
      const auth = requireInternal(req, origin);
      if (auth.error) return auth.error;
      const statusFilter = url.searchParams.get('status');
      try {
        let query = `SELECT po.*, s.name_en AS supplier_name, s.reference AS supplier_reference,
                            pr.reference AS purchase_request_reference,
                            sr.reference AS supply_request_reference,
                            u.name AS created_by_name
                       FROM purchase_orders po
                       JOIN suppliers s ON po.supplier_id = s.id
                       JOIN purchase_requests pr ON po.purchase_request_id = pr.id
                       JOIN supply_requests sr ON po.supply_request_id = sr.id
                       LEFT JOIN users u ON po.created_by = u.id`;
        const params: any[] = [];
        if (statusFilter && statusFilter !== 'all') {
          query += ' WHERE po.status = ?';
          params.push(statusFilter);
        }
        query += ' ORDER BY po.created_at DESC';
        const rows = db.query(query).all(...params) as any[];
        return jsonResponse({ purchaseOrders: rows, count: rows.length }, 200, origin);
      } catch (err) {
        console.error('[shanan-api] Purchase orders list failed:', err);
        return errorResponse('Could not retrieve purchase orders.', 500, origin);
      }
    }

    // GET /api/purchase-orders/:id — detail with items
    const poDetailMatch = url.pathname.match(/^\/api\/purchase-orders\/([^/]+)$/);
    if (poDetailMatch && req.method === 'GET') {
      const auth = requireInternal(req, origin);
      if (auth.error) return auth.error;
      const poIdOrRef = decodeURIComponent(poDetailMatch[1]);
      try {
        const po = db.prepare(
          `SELECT po.*, s.name_en AS supplier_name, s.reference AS supplier_reference,
                  s.contact_name, s.contact_email, s.contact_phone,
                  pr.reference AS purchase_request_reference, pr.sourcing_decision_id,
                  sr.reference AS supply_request_reference,
                  u.name AS created_by_name
             FROM purchase_orders po
             JOIN suppliers s ON po.supplier_id = s.id
             JOIN purchase_requests pr ON po.purchase_request_id = pr.id
             JOIN supply_requests sr ON po.supply_request_id = sr.id
             LEFT JOIN users u ON po.created_by = u.id
            WHERE po.id = ? OR po.reference = ?`,
        ).get(poIdOrRef, poIdOrRef) as any;
        if (!po) return errorResponse('Purchase Order not found', 404, origin);
        const items = db.query(
          `SELECT poi.*, p.name_en AS catalog_product_name, p.sku AS catalog_sku
             FROM purchase_order_items poi
             LEFT JOIN products p ON poi.product_id = p.id
            WHERE poi.po_id = ?`,
        ).all(po.id) as any[];
        return jsonResponse({ purchaseOrder: { ...po, items } }, 200, origin);
      } catch (err) {
        console.error('[shanan-api] Purchase order detail failed:', err);
        return errorResponse('Could not retrieve purchase order.', 500, origin);
      }
    }

    // POST /api/purchase-orders — create from approved PR
    if (url.pathname === '/api/purchase-orders' && req.method === 'POST') {
      const auth = requireInternal(req, origin);
      if (auth.error) return auth.error;
      let body: unknown;
      try { body = await req.json(); } catch { return errorResponse('Invalid JSON body', 400, origin); }
      const b = body as Record<string, unknown>;
      if (typeof b.purchaseRequestId !== 'string' || b.purchaseRequestId.trim() === '') {
        return errorResponse('Validation failed: purchaseRequestId is required', 422, origin);
      }
      const prId = b.purchaseRequestId.trim();
      const pr = db.prepare(
        `SELECT pr.* FROM purchase_requests pr WHERE pr.id = ? AND pr.status = 'approved'`,
      ).get(prId) as any;
      if (!pr) {
        return errorResponse('Purchase Request not found or not in "approved" state', 404, origin);
      }
      // Check if PO already exists for this PR
      const existingPo = db.prepare('SELECT id, reference FROM purchase_orders WHERE purchase_request_id = ?').get(prId) as any;
      if (existingPo) {
        return errorResponse(`Purchase Order already exists for this PR: ${existingPo.reference}`, 409, origin);
      }
      const poId = generateId();
      const poReference = generatePoReference();
      const now = new Date().toISOString();
      const notes = (typeof b.notes === 'string') ? b.notes.trim() || null : null;
      const expectedDelivery = (typeof b.expectedDelivery === 'string') ? b.expectedDelivery.trim() || null : null;
      try {
        db.exec('BEGIN TRANSACTION');
        // Create PO header
        db.prepare(
          `INSERT INTO purchase_orders
             (id, reference, purchase_request_id, supply_request_id, supplier_id,
              status, total_amount, currency, issue_date, expected_delivery,
              notes, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          poId, poReference, pr.id, pr.supply_request_id, pr.supplier_id,
          pr.total_amount, pr.currency, now, expectedDelivery,
          notes, auth.user.id, now, now,
        );
        // Copy PR items to PO items
        const prItems = db.query('SELECT * FROM purchase_request_items WHERE pr_id = ?').all(pr.id) as any[];
        for (const pri of prItems) {
          db.prepare(
            `INSERT INTO purchase_order_items
               (po_id, pr_item_id, product_id, product_name, sku, quantity,
                unit_price, currency, total_price, notes, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ).run(
            poId, pri.id, pri.product_id, pri.product_name, pri.sku, pri.quantity,
            pri.unit_price, pri.currency, pri.total_price, pri.notes, now,
          );
        }
        db.exec('COMMIT');
        const created = db.prepare(
          `SELECT po.*, s.name_en AS supplier_name, u.name AS created_by_name
             FROM purchase_orders po
             JOIN suppliers s ON po.supplier_id = s.id
             LEFT JOIN users u ON po.created_by = u.id
            WHERE po.id = ?`,
        ).get(poId);
        const createdItems = db.query('SELECT * FROM purchase_order_items WHERE po_id = ?').all(poId);
        return jsonResponse({ purchaseOrder: { ...created as any, items: createdItems } }, 201, origin);
      } catch (err) {
        try { db.exec('ROLLBACK'); } catch {}
        console.error('[shanan-api] Purchase order creation failed:', err);
        return errorResponse('Could not create purchase order.', 500, origin);
      }
    }

    // PATCH /api/purchase-orders/:id — update status (issue/confirm/receive/cancel)
    const poUpdateMatch = url.pathname.match(/^\/api\/purchase-orders\/([^/]+)$/);
    if (poUpdateMatch && req.method === 'PATCH') {
      const auth = requireInternal(req, origin);
      if (auth.error) return auth.error;
      const poIdOrRef = decodeURIComponent(poUpdateMatch[1]);
      let body: unknown;
      try { body = await req.json(); } catch { return errorResponse('Invalid JSON body', 400, origin); }
      const b = body as Record<string, unknown>;
      const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ? OR reference = ?').get(poIdOrRef, poIdOrRef) as any;
      if (!po) return errorResponse('Purchase Order not found', 404, origin);
      const now = new Date().toISOString();
      try {
        if (typeof b.status === 'string') {
          const validTransitions: Record<string, string[]> = {
            draft: ['issued', 'cancelled'],
            issued: ['confirmed', 'cancelled'],
            confirmed: ['partially_received', 'received'],
            partially_received: ['received'],
          };
          const allowed = validTransitions[po.status] || [];
          if (!allowed.includes(b.status)) {
            return errorResponse(`Cannot transition from "${po.status}" to "${b.status}". Allowed: ${allowed.join(', ') || 'none'}`, 422, origin);
          }
          const updates: string[] = ['status = ?', 'updated_at = ?'];
          const params: any[] = [b.status, now];
          if (b.status === 'issued') {
            updates.push('issue_date = ?');
            params.push(now);
          }
          if (typeof b.expectedDelivery === 'string') {
            updates.push('expected_delivery = ?');
            params.push(b.expectedDelivery.trim() || null);
          }
          if (typeof b.notes === 'string') {
            updates.push('notes = ?');
            params.push(b.notes.trim() || null);
          }
          params.push(po.id);
          db.prepare(`UPDATE purchase_orders SET ${updates.join(', ')} WHERE id = ?`).run(...params);
        } else if (typeof b.notes === 'string' || typeof b.expectedDelivery === 'string') {
          const updates: string[] = ['updated_at = ?'];
          const params: any[] = [now];
          if (typeof b.notes === 'string') { updates.push('notes = ?'); params.push(b.notes.trim() || null); }
          if (typeof b.expectedDelivery === 'string') { updates.push('expected_delivery = ?'); params.push(b.expectedDelivery.trim() || null); }
          params.push(po.id);
          db.prepare(`UPDATE purchase_orders SET ${updates.join(', ')} WHERE id = ?`).run(...params);
        }
        const updated = db.prepare(
          `SELECT po.*, s.name_en AS supplier_name, u.name AS created_by_name
             FROM purchase_orders po
             JOIN suppliers s ON po.supplier_id = s.id
             LEFT JOIN users u ON po.created_by = u.id
            WHERE po.id = ?`,
        ).get(po.id);
        const items = db.query('SELECT * FROM purchase_order_items WHERE po_id = ?').all(po.id);
        return jsonResponse({ purchaseOrder: { ...updated as any, items } }, 200, origin);
      } catch (err) {
        console.error('[shanan-api] Purchase order update failed:', err);
        return errorResponse('Could not update purchase order.', 500, origin);
      }
    }

    // ============================================================
    // Static file serving — product images from local storage
    // ============================================================
    if (url.pathname.startsWith('/api/storage/')) {
      const relPath = url.pathname.slice('/api/storage/'.length);
      // STEP 19-A C4 Finding A: reject invalid/traversal keys and enforce
      // resolved-path containment so files outside STORAGE_BASE_PATH cannot be served.
      if (!isValidStorageKey(relPath)) {
        return errorResponse('Not found', 404, origin);
      }
      const resolvedBase = resolve(getStorageBasePath());
      const resolvedPath = resolve(join(resolvedBase, relPath));
      if (resolvedPath !== resolvedBase && !resolvedPath.startsWith(resolvedBase + sep)) {
        return errorResponse('Not found', 404, origin);
      }
      // STEP 19-A D1: documents are private/internal — require authentication before
      // serving, and block supplier access. Reuses the existing auth helpers (same model
      // as the documented A13-4 Finding 22 control). Public product images stay unrestricted.
      if (relPath.startsWith('documents/')) {
        const docAuth = requireAuth(req, origin);
        if (docAuth.error) return docAuth.error;
        const supplierBlock = requireNotSupplier(req, docAuth.user, origin);
        if (supplierBlock) return supplierBlock;
      }
      const file = Bun.file(`./storage/${relPath}`);
      if (await file.exists()) {
        const ext = relPath.split('.').pop()?.toLowerCase() || 'jpg';
        const mimeMap: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml' };
        return new Response(file, { headers: { 'Content-Type': mimeMap[ext] || 'application/octet-stream', 'Cache-Control': 'public, max-age=86400' } });
      }
      return errorResponse('Not found', 404, origin);
    }

    // ============================================================
    // Phase P1/P3 — Product Master API endpoints
    // ============================================================

    // --- Public product endpoints (no auth required) ---

    // GET /api/categories — list all active categories with product counts
    if (url.pathname === '/api/categories' && req.method === 'GET') {
      try {
        const rows = db.query(
          `SELECT c.*,
                  (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.status = 'active') AS product_count
             FROM categories c
            WHERE c.is_active = 1
            ORDER BY c.sort_order ASC, c.name_en ASC`,
        ).all();
        // Batch-fetch one representative image per category using a single efficient query
        const catImages = db.query(
          `SELECT p.category_id, COALESCE(pi.public_url, '/api/storage/' || pi.storage_key) AS img_url
             FROM product_images pi
             JOIN products p ON pi.product_id = p.id
            WHERE pi.is_primary = 1 AND p.status = 'active'
            GROUP BY p.category_id`,
        ).all() as Array<{ category_id: string; img_url: string }>;
        const catImageMap: Record<string, string> = {};
        for (const row of catImages) catImageMap[row.category_id] = row.img_url;
        const result = rows.map((r: any) => ({
          id: r.id, slug: r.slug,
          name: { en: r.name_en, ar: r.name_ar || r.name_en },
          description: { en: r.description_en || '', ar: r.description_ar || '' },
          parentId: r.parent_id,
          image: r.image_url || catImageMap[r.id] || null,
          productCount: r.product_count,
        }));
        return jsonResponse({ categories: result, count: result.length }, 200, origin);
      } catch (err) {
        console.error('[shanan-api] Categories query failed:', err);
        return errorResponse('Could not retrieve categories.', 500, origin);
      }
    }

    // GET /api/brands — public brands only
    // Hans/Xcort/MIRROW: stored in brands table, filtered by brand_id FK.
    // DYLLU: products have "DYLLU" embedded in name_en (no brand_id FK).
    //   Counted via name pattern, filtered via name pattern in /api/products.
    if (url.pathname === '/api/brands' && req.method === 'GET') {
      try {
        const PUBLIC_BRANDS: Array<{ id: string; displayName: string; slug: string; namePattern?: string }> = [
          { id: 'brand-hans',   displayName: 'Hans',   slug: 'hans' },
          { id: 'brand-xcort',  displayName: 'Xcort',  slug: 'xcort' },
          { id: 'brand-mirrow', displayName: 'MIRROW', slug: 'mirrow' },
          { id: 'brand-dyllu',  displayName: 'DYLLU',  slug: 'dyllu', namePattern: '%DYLLU%' },
        ];
        const result = PUBLIC_BRANDS.map(pb => {
          let count: number;
          if (pb.namePattern) {
            const row = db.prepare(
              `SELECT COUNT(*) as n FROM products p WHERE p.name_en LIKE ? AND p.status = 'active' AND p.is_sample_data = 0`,
            ).get(pb.namePattern) as any;
            count = row?.n ?? 0;
          } else if (pb.id === 'brand-hans') {
            const row = db.prepare(
              `SELECT COUNT(*) as n FROM products p WHERE p.brand_id = ? AND p.status = 'active' AND p.is_sample_data = 0 AND p.name_en LIKE 'Hans %'`,
            ).get(pb.id) as any;
            count = row?.n ?? 0;
          } else {
            const row = db.prepare(
              `SELECT COUNT(*) as n FROM products p WHERE p.brand_id = ? AND p.status = 'active' AND p.is_sample_data = 0`,
            ).get(pb.id) as any;
            count = row?.n ?? 0;
          }
          return {
            id: pb.id,
            slug: pb.slug,
            name: pb.displayName,
            description: { en: '', ar: '' },
            logo: null,
            productCount: count,
          };
        }).filter(b => b.productCount > 0);
        return jsonResponse({ brands: result, count: result.length }, 200, origin);
      } catch (err) {
        console.error('[shanan-api] Brands query failed:', err);
        return errorResponse('Could not retrieve brands.', 500, origin);
      }
    }

    // GET /api/products — paginated product listing with search + filters
    if (url.pathname === '/api/products' && req.method === 'GET') {
      try {
        const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
        const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get('pageSize') || '24', 10)));
        const search = url.searchParams.get('search')?.trim() || '';
        const categoryId = url.searchParams.get('categoryId');
        const brandId = url.searchParams.get('brandId');
        const availability = url.searchParams.get('availability');
        const sortBy = url.searchParams.get('sortBy') || 'name_asc';

        let where = ["p.status = 'active'", "p.is_sample_data = 0"];
        const params: any[] = [];

        if (search) {
          where.push("(p.name_en LIKE ? OR p.name_ar LIKE ? OR p.sku LIKE ? OR p.product_code LIKE ? OR p.manufacturer LIKE ?)");
          const q = `%${search}%`;
          params.push(q, q, q, q, q);
        }
        if (categoryId) { where.push("p.category_id = ?"); params.push(categoryId); }
        if (brandId) {
          if (brandId === 'brand-dyllu') {
            where.push("p.name_en LIKE '%DYLLU%'");
          } else {
            where.push("p.brand_id = ?");
            params.push(brandId);
            if (brandId === 'brand-hans') {
              where.push("p.name_en NOT LIKE 'Hansطقم%'");
            }
          }
        }
        if (availability) { where.push("p.availability = ?"); params.push(availability); }

        const whereClause = where.join(' AND ');

        let orderBy = 'p.name_en ASC';
        switch (sortBy) {
          case 'name_desc': orderBy = 'p.name_en DESC'; break;
          case 'sku_asc': orderBy = 'p.sku ASC'; break;
          case 'sku_desc': orderBy = 'p.sku DESC'; break;
          case 'newest': orderBy = 'p.created_at DESC'; break;
        }

        const total = (db.prepare(`SELECT COUNT(*) as n FROM products p WHERE ${whereClause}`).get(...params) as any).n;
        const totalPages = Math.ceil(total / pageSize) || 1;
        const offset = (page - 1) * pageSize;

        const rows = db.query(
          `SELECT p.id, p.sku, p.product_code, p.slug, p.name_en, p.name_ar,
                  p.description_en, p.description_ar, p.category_id, p.brand_id,
                  p.manufacturer, p.availability, p.is_sample_data, p.created_at,
                  p.sell_price, p.currency, p.stock_quantity,
                  p.metadata_json,
                  c.name_en AS category_name_en, c.name_ar AS category_name_ar,
                  b.name AS brand_name,
                  (SELECT pi.public_url FROM product_images pi WHERE pi.product_id = p.id AND pi.is_primary = 1 LIMIT 1) AS primary_image_url
             FROM products p
             LEFT JOIN categories c ON p.category_id = c.id
             LEFT JOIN brands b ON p.brand_id = b.id
            WHERE ${whereClause}
            ORDER BY ${orderBy}
            LIMIT ? OFFSET ?`,
        ).all(...params, pageSize, offset) as any[];

        const items = rows.map((r: any) => {
          let meta: any = null;
          try { meta = r.metadata_json ? JSON.parse(r.metadata_json) : null; } catch { meta = null; }
          return {
          id: r.id,
          sku: r.sku,
          slug: r.slug,
          name: { en: r.name_en, ar: r.name_ar || r.name_en },
          description: { en: r.description_en || '', ar: r.description_ar || '' },
          categoryId: r.category_id,
          brandId: r.brand_id,
          manufacturer: r.manufacturer || null,
          availability: r.availability,
          isSampleData: r.is_sample_data === 1,
          primaryImage: r.primary_image_url,
          categoryName: r.category_name_en ? { en: r.category_name_en, ar: r.category_name_ar || r.category_name_en } : null,
          brandName: r.brand_name || null,
          sellPrice: r.sell_price ?? null,
          currency: r.currency || 'JOD',
          createdAt: r.created_at,
          };
        });

        return jsonResponse({
          items, total, page, pageSize, totalPages,
        }, 200, origin);
      } catch (err) {
        console.error('[shanan-api] Products query failed:', err);
        return errorResponse('Could not retrieve products.', 500, origin);
      }
    }

    // GET /api/products/:id — single product with full details (images, specs, etc.)
    const productMatch = url.pathname.match(/^\/api\/products\/([^/]+)$/);
    if (productMatch && req.method === 'GET') {
      try {
        const idOrSlug = decodeURIComponent(productMatch[1]);
        const p = db.prepare(
          `SELECT p.*, c.name_en AS category_name_en, c.name_ar AS category_name_ar, c.slug AS category_slug,
                  b.name AS brand_name, b.slug AS brand_slug
             FROM products p
             LEFT JOIN categories c ON p.category_id = c.id
             LEFT JOIN brands b ON p.brand_id = b.id
            WHERE p.id = ? OR p.slug = ? OR p.sku = ?`,
        ).get(idOrSlug, idOrSlug, idOrSlug) as any;
        if (!p) return errorResponse('Product not found', 404, origin);

        // Fetch images
        const images = db.query(
          `SELECT * FROM product_images WHERE product_id = ? ORDER BY is_primary DESC, sort_order ASC`,
        ).all(p.id) as any[];
        const imageResult = images.map((img: any) => ({
          id: img.id,
          url: img.public_url || `/api/storage/${img.storage_key}`,
          alt: { en: img.alt_en || '', ar: img.alt_ar || '' },
          isPrimary: img.is_primary === 1,
          sortOrder: img.sort_order,
        }));

        // Fetch specifications
        const specs = db.query(
          `SELECT * FROM product_specifications WHERE product_id = ? ORDER BY sort_order ASC`,
        ).all(p.id) as any[];
        const specResult = specs.map((s: any) => ({
          id: s.id,
          label: { en: s.label_en, ar: s.label_ar || s.label_en },
          value: { en: s.value_en, ar: s.value_ar || s.value_en },
          group: s.group_en ? { en: s.group_en, ar: s.group_ar || s.group_en } : undefined,
        }));

        // Fetch technical metadata
        const techMeta = db.query(
          `SELECT * FROM product_technical_metadata WHERE product_id = ? ORDER BY sort_order ASC`,
        ).all(p.id) as any[];
        const techMetaResult = techMeta.map((t: any) => ({
          id: t.id,
          key: { en: t.key_en, ar: t.key_ar || t.key_en },
          value: t.value,
          unit: t.unit || undefined,
        }));

        // Fetch documents
        const docs = db.query(
          `SELECT * FROM product_documents WHERE product_id = ? ORDER BY sort_order ASC`,
        ).all(p.id) as any[];
        const docResult = docs.map((d: any) => ({
          id: d.id,
          title: { en: d.title_en, ar: d.title_ar || d.title_en },
          url: d.public_url || `/api/storage/${d.storage_key}`,
          fileType: d.file_type,
          fileSize: d.file_size,
        }));

        let meta: any = null;
        try { meta = p.metadata_json ? JSON.parse(p.metadata_json) : null; } catch { meta = null; }

        // Extract PUBLIC-SAFE fields from metadata_json
        const safeBarcode = meta?.barcode && String(meta.barcode).trim() !== 'nan'
          ? String(meta.barcode).trim() : null;
        const safeUnit = meta?.unit && String(meta.unit).trim() !== 'nan'
          ? String(meta.unit).trim() : null;
        const safeSubCategory = meta?.subCategory && String(meta.subCategory).trim() !== 'nan'
          ? String(meta.subCategory).trim() : null;

        return jsonResponse({
          product: {
            id: p.id,
            sku: p.sku,
            slug: p.slug,
            name: { en: p.name_en, ar: p.name_ar || p.name_en },
            description: { en: p.description_en || '', ar: p.description_ar || '' },
            categoryId: p.category_id,
            brandId: p.brand_id,
            manufacturer: p.manufacturer || null,
            availability: p.availability,
            isSampleData: p.is_sample_data === 1,
            images: imageResult,
            specifications: specResult,
            technicalMetadata: techMetaResult,
            documents: docResult,
            category: p.category_name_en ? { name: { en: p.category_name_en, ar: p.category_name_ar || p.category_name_en }, slug: p.category_slug } : null,
            brand: p.brand_name ? { name: p.brand_name, slug: p.brand_slug } : null,
            sellPrice: p.sell_price ?? null,
            currency: p.currency || 'JOD',
            productInfo: {
              barcode: safeBarcode,
              unit: safeUnit,
              subCategory: safeSubCategory,
            },
            createdAt: p.created_at,
            updatedAt: p.updated_at,
          },
        }, 200, origin);
      } catch (err) {
        console.error('[shanan-api] Product detail query failed:', err);
        return errorResponse('Could not retrieve product.', 500, origin);
      }
    }

    // --- Storage file serving (for local dev — serves product images/docs) ---
    const storageMatch = url.pathname.match(/^\/api\/storage\/(.+)$/);
    if (storageMatch && req.method === 'GET') {
      try {
        const storageKey = decodeURIComponent(storageMatch[1]);
        // STEP 19-A C4 Finding A: reject traversal / invalid storage keys up front.
        // Must not rely on URL normalization as the security boundary.
        if (!isValidStorageKey(storageKey)) {
          return errorResponse('File not found', 404, origin);
        }
        // A13-4 Finding 22: Require authentication for document storage
        if (storageKey.startsWith('documents/')) {
          const auth = requireAuth(req, origin);
          if (auth.error) return auth.error;
        }
        const provider = getStorageProvider();
        if (provider.name === 'local') {
          // STEP 19-A C4 Finding A: resolved-path containment — ensure the final file
          // path cannot escape STORAGE_BASE_PATH, even if validation is bypassed.
          const resolvedBase = resolve(getStorageBasePath());
          const fullPath = resolve(join(resolvedBase, storageKey));
          if (fullPath !== resolvedBase && !fullPath.startsWith(resolvedBase + sep)) {
            return errorResponse('File not found', 404, origin);
          }
          const file = (provider as any).serveFile(storageKey);
          if (!file) return errorResponse('File not found', 404, origin);
          return new Response(file.data, {
            status: 200,
            headers: {
              'Content-Type': file.mimeType,
              'Cache-Control': 'public, max-age=86400',
              ...corsHeaders(origin),
            },
          });
        }
        return errorResponse('Storage provider does not support direct serving', 400, origin);
      } catch (err) {
        return errorResponse('File not found', 404, origin);
      }
    }

    // --- Internal admin: product management (requireInternal) ---

    // POST /api/admin/products — create a product
    if (url.pathname === '/api/admin/products' && req.method === 'POST') {
      const auth = requireInternal(req, origin);
      if (auth.error) return auth.error;
      let body: unknown;
      try { body = await req.json(); } catch { return errorResponse('Invalid JSON body', 400, origin); }
      const b = body as Record<string, unknown>;
      if (!b.sku || !b.productCode || !b.nameEn) {
        return errorResponse('Validation failed: sku, productCode, nameEn are required', 422, origin);
      }
      const id = b.id as string || `prod-${crypto.randomUUID()}`;
      const slug = (b.slug as string) || (b.sku as string).toLowerCase().replace(/[^a-z0-9-]/g, '-');
      const now = new Date().toISOString();
      try {
        db.prepare(
          `INSERT INTO products (id, sku, product_code, slug, name_en, name_ar, description_en, description_ar,
             category_id, brand_id, manufacturer, availability, status, is_sample_data, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(id, b.sku, b.productCode, slug, b.nameEn, b.nameAr || null,
          b.descriptionEn || null, b.descriptionAr || null,
          b.categoryId || null, b.brandId || null, b.manufacturer || null,
          b.availability || 'in_stock', b.status || 'active', b.isSampleData ? 1 : 0,
          now, now);
        return jsonResponse({ id, slug, createdAt: now }, 201, origin);
      } catch (err) {
        console.error('[shanan-api] Product insert failed:', err);
        return errorResponse('Could not create product.', 500, origin);
      }
    }

    // PATCH /api/admin/products/:id — update a product
    const adminProductMatch = url.pathname.match(/^\/api\/admin\/products\/([^/]+)$/);
    if (adminProductMatch && req.method === 'PATCH') {
      const auth = requireInternal(req, origin);
      if (auth.error) return auth.error;
      const productId = decodeURIComponent(adminProductMatch[1]);
      const existing = db.prepare('SELECT id FROM products WHERE id = ? OR sku = ? OR slug = ?').get(productId, productId, productId) as any;
      if (!existing) return errorResponse('Product not found', 404, origin);
      let body: unknown;
      try { body = await req.json(); } catch { return errorResponse('Invalid JSON body', 400, origin); }
      const b = body as Record<string, unknown>;
      const updates: string[] = [];
      const values: any[] = [];
      const fields: [string, string][] = [
        ['nameEn', 'name_en'], ['nameAr', 'name_ar'], ['descriptionEn', 'description_en'],
        ['descriptionAr', 'description_ar'], ['categoryId', 'category_id'], ['brandId', 'brand_id'],
        ['manufacturer', 'manufacturer'], ['availability', 'availability'], ['status', 'status'],
      ];
      for (const [field, col] of fields) {
        if (b[field] !== undefined) { updates.push(`${col} = ?`); values.push(b[field]); }
      }
      if (updates.length === 0) return errorResponse('No valid fields to update', 422, origin);
      updates.push('updated_at = ?'); values.push(new Date().toISOString());
      values.push(existing.id);
      db.prepare(`UPDATE products SET ${updates.join(', ')} WHERE id = ?`).run(...values);
      return jsonResponse({ product: db.prepare('SELECT * FROM products WHERE id = ?').get(existing.id) }, 200, origin);
    }

    // --- A12-3: Image binary upload (requireInternal) ---

    // POST /api/admin/products/:id/images/upload — upload an image binary
    // Accepts multipart/form-data with fields:
    //   - file: the image binary
    //   - isPrimary: "true" or "false" (optional, default false)
    //   - sortOrder: integer (optional, default 0)
    //   - altEn: string (optional)
    //   - altAr: string (optional)
    const imageUploadMatch = url.pathname.match(/^\/api\/admin\/products\/([^/]+)\/images\/upload$/);
    if (imageUploadMatch && req.method === 'POST') {
      const auth = requireInternal(req, origin);
      if (auth.error) return auth.error;
      const productLookup = decodeURIComponent(imageUploadMatch[1]);
      // Verify product exists
      const product = db.prepare('SELECT id FROM products WHERE id = ? OR sku = ? OR slug = ?').get(productLookup, productLookup, productLookup) as any;
      if (!product) return errorResponse('Product not found', 404, origin);

      try {
        // Parse multipart form data
        const formData = await req.formData();
        const file = formData.get('file');
        if (!file || !(file instanceof File)) {
          return errorResponse('Validation failed: file is required', 422, origin);
        }

        // Validate MIME type
        const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
        const mimeType = file.type || 'application/octet-stream';
        if (!allowedMimeTypes.includes(mimeType)) {
          return errorResponse(`Validation failed: file — unsupported MIME type '${mimeType}'. Allowed: ${allowedMimeTypes.join(', ')}`, 400, origin);
        }

        // Enforce file size limit (default 10MB, configurable via MAX_IMAGE_SIZE_MB env)
        const maxSize = Number(process.env.MAX_IMAGE_SIZE_MB || '10') * 1024 * 1024;
        if (file.size > maxSize) {
          return errorResponse(`Validation failed: file — exceeds maximum size of ${maxSize / 1024 / 1024}MB`, 400, origin);
        }

        // Read file data
        const fileData = new Uint8Array(await file.arrayBuffer());
        const filename = file.name || 'unnamed';

        // Generate safe storage key
        const storageKey = generateImageStorageKey(product.id, filename);
        if (!isValidStorageKey(storageKey)) {
          return errorResponse('Could not generate safe storage key', 500, origin);
        }

        // Save to storage provider
        const provider = getStorageProvider();
        const uploadResult = await provider.save(fileData, storageKey, mimeType);

        // Get form fields
        const isPrimary = formData.get('isPrimary') === 'true';
        const sortOrder = parseInt(formData.get('sortOrder') as string || '0', 10) || 0;
        const altEn = formData.get('altEn') as string || null;
        const altAr = formData.get('altAr') as string || null;

        const now = new Date().toISOString();
        const imageId = crypto.randomUUID();

        // If isPrimary, unset other primary images for this product
        if (isPrimary) {
          db.prepare('UPDATE product_images SET is_primary = 0 WHERE product_id = ?').run(product.id);
        }

        // Insert image metadata
        db.prepare(
          `INSERT INTO product_images (id, product_id, storage_provider, storage_key, public_url,
             filename, mime_type, file_size, width, height, checksum, alt_en, alt_ar,
             is_primary, sort_order, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          imageId, product.id, uploadResult.storageProvider, uploadResult.storageKey,
          uploadResult.publicUrl, uploadResult.filename, uploadResult.mimeType,
          uploadResult.fileSize, null, null, uploadResult.checksum,
          altEn, altAr, isPrimary ? 1 : 0, sortOrder, now, now,
        );

        return jsonResponse({
          id: imageId,
          productId: product.id,
          storageProvider: uploadResult.storageProvider,
          storageKey: uploadResult.storageKey,
          publicUrl: uploadResult.publicUrl,
          filename: uploadResult.filename,
          mimeType: uploadResult.mimeType,
          fileSize: uploadResult.fileSize,
          checksum: uploadResult.checksum,
          isPrimary,
          sortOrder,
          altEn,
          altAr,
          createdAt: now,
        }, 201, origin);
      } catch (err) {
        console.error('[shanan-api] Image upload failed:', err);
        return errorResponse('Could not upload image.', 500, origin);
      }
    }

    // DELETE /api/admin/products/:id/images/:imageId — delete a product image
    const imageDeleteMatch = url.pathname.match(/^\/api\/admin\/products\/([^/]+)\/images\/([^/]+)$/);
    if (imageDeleteMatch && req.method === 'DELETE') {
      const auth = requireInternal(req, origin);
      if (auth.error) return auth.error;
      const productLookup = decodeURIComponent(imageDeleteMatch[1]);
      const imageId = decodeURIComponent(imageDeleteMatch[2]);
      const product = db.prepare('SELECT id FROM products WHERE id = ? OR sku = ? OR slug = ?').get(productLookup, productLookup, productLookup) as any;
      if (!product) return errorResponse('Product not found', 404, origin);
      const img = db.prepare('SELECT * FROM product_images WHERE id = ? AND product_id = ?').get(imageId, product.id) as any;
      if (!img) return errorResponse('Image not found', 404, origin);
      try {
        // Delete from storage provider
        const provider = getStorageProvider();
        await provider.delete(img.storage_key);
        // Delete metadata from DB
        db.prepare('DELETE FROM product_images WHERE id = ?').run(imageId);
        return jsonResponse({ ok: true, deleted: true, id: imageId }, 200, origin);
      } catch (err) {
        console.error('[shanan-api] Image delete failed:', err);
        return errorResponse('Could not delete image.', 500, origin);
      }
    }

    // GET /api/admin/products/:id/images — list all images for a product
    const imageListMatch = url.pathname.match(/^\/api\/admin\/products\/([^/]+)\/images$/);
    if (imageListMatch && req.method === 'GET') {
      const auth = requireInternal(req, origin);
      if (auth.error) return auth.error;
      const productLookup = decodeURIComponent(imageListMatch[1]);
      const product = db.prepare('SELECT id FROM products WHERE id = ? OR sku = ? OR slug = ?').get(productLookup, productLookup, productLookup) as any;
      if (!product) return errorResponse('Product not found', 404, origin);
      const images = db.query('SELECT * FROM product_images WHERE product_id = ? ORDER BY is_primary DESC, sort_order ASC').all(product.id);
      return jsonResponse({ images, count: images.length }, 200, origin);
    }

    // --- Internal admin: bulk import endpoints (requireInternal) ---

    // POST /api/admin/import/:type — bulk import (JSON body with items array)
    const importMatch = url.pathname.match(/^\/api\/admin\/import\/([a-z_]+)$/);
    if (importMatch && req.method === 'POST') {
      const auth = requireInternal(req, origin);
      if (auth.error) return auth.error;
      const importType = importMatch[1];
      let body: unknown;
      try { body = await req.json(); } catch { return errorResponse('Invalid JSON body', 400, origin); }
      const b = body as Record<string, unknown>;
      const items = b.items as any[];
      if (!Array.isArray(items)) {
        return errorResponse('Validation failed: items must be an array', 422, origin);
      }
      try {
        let result;
        switch (importType) {
          case 'products': result = importProducts(db, items); break;
          case 'categories': result = importCategories(db, items); break;
          case 'brands': result = importBrands(db, items); break;
          case 'images': result = importImages(db, items); break;
          case 'specifications': result = importSpecifications(db, items); break;
          case 'technical_metadata': result = importTechnicalMetadata(db, items); break;
          case 'documents': result = importDocuments(db, items); break;
          default: return errorResponse(`Unknown import type: ${importType}`, 400, origin);
        }
        return jsonResponse(result, 200, origin);
      } catch (err) {
        console.error('[shanan-api] Import failed:', err);
        return errorResponse('Import failed.', 500, origin);
      }
    }

    // --- Internal admin: seed demo data (requireInternal) ---
    if (url.pathname === '/api/admin/seed' && req.method === 'POST') {
      const auth = requireInternal(req, origin);
      if (auth.error) return auth.error;
      try {
        const result = seedProductMaster(db);
        return jsonResponse({ ok: true, seeded: result }, 200, origin);
      } catch (err) {
        console.error('[shanan-api] Seed failed:', err);
        return errorResponse('Seed failed.', 500, origin);
      }
    }

    // --- Internal admin: import job history ---
    if (url.pathname === '/api/admin/import-jobs' && req.method === 'GET') {
      const auth = requireInternal(req, origin);
      if (auth.error) return auth.error;
      try {
        const rows = db.query('SELECT * FROM import_jobs ORDER BY created_at DESC LIMIT 50').all();
        return jsonResponse({ jobs: rows, count: rows.length }, 200, origin);
      } catch (err) {
        return errorResponse('Could not retrieve import jobs.', 500, origin);
      }
    }

    // ============================================================
    // V1 — Procurement Engagement & Activity Intelligence
    // ============================================================

    // --- V1-1: Activity event recording (POST /api/activity/events) ---
    // Records a meaningful business event. Identity is always derived
    // from the authenticated server-side context — never client-supplied.
    const activityEventMatch = url.pathname === '/api/activity/events' && req.method === 'POST';
    if (activityEventMatch) {
      const auth = requireAuth(req, origin);
      if (auth.error) return auth.error;
      const supplierBlock = requireNotSupplier(req, auth.user, origin);
      if (supplierBlock) return supplierBlock;
      let body: unknown;
      try { body = await req.json(); } catch { return errorResponse('Invalid JSON body', 400, origin); }
      const b = body as Record<string, unknown>;

      // Validate event_type (controlled enum)
      const VALID_EVENT_TYPES = [
        'PLATFORM_SESSION_STARTED', 'CATALOG_VIEWED', 'PRODUCT_VIEWED',
        'PRODUCT_SEARCHED', 'CATEGORY_VIEWED', 'SUPPLY_REQUEST_STARTED',
        'SUPPLY_REQUEST_SUBMITTED', 'AGREEMENT_VIEWED', 'RFQ_CREATED',
        'OFFER_RECORDED', 'EVALUATION_VIEWED', 'DECISION_RECORDED',
      ];
      if (typeof b.eventType !== 'string' || !VALID_EVENT_TYPES.includes(b.eventType)) {
        return errorResponse(`Validation failed: eventType — must be one of: ${VALID_EVENT_TYPES.join(', ')}`, 400, origin);
      }

      // Allowlisted optional fields (size-limited)
      const productId = (typeof b.productId === 'string' && b.productId.length <= 100) ? b.productId : null;
      const categoryId = (typeof b.categoryId === 'string' && b.categoryId.length <= 100) ? b.categoryId : null;
      const supplyRequestId = (typeof b.supplyRequestId === 'string' && b.supplyRequestId.length <= 100) ? b.supplyRequestId : null;
      const agreementId = (typeof b.agreementId === 'string' && b.agreementId.length <= 100) ? b.agreementId : null;
      const rfqId = (typeof b.rfqId === 'string' && b.rfqId.length <= 100) ? b.rfqId : null;
      // Metadata is allowlisted + size-limited (max 500 chars JSON)
      let metadata: string | null = null;
      if (typeof b.metadata === 'string' && b.metadata.length <= 500) {
        metadata = b.metadata;
      } else if (b.metadata && typeof b.metadata === 'object') {
        try {
          const jsonStr = JSON.stringify(b.metadata);
          if (jsonStr.length <= 500) metadata = jsonStr;
        } catch {}
      }

      const id = crypto.randomUUID();
      const now = new Date().toISOString();

      // Identity always from server-side auth — never client-supplied
      try {
        db.prepare(
          `INSERT INTO activity_events (id, event_type, user_id, user_type, company_id,
             product_id, category_id, supply_request_id, agreement_id, rfq_id, metadata, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          id, b.eventType,
          auth.user.id, auth.user.user_type, auth.user.company_id,
          productId, categoryId, supplyRequestId, agreementId, rfqId,
          metadata, now,
        );
        return jsonResponse({ id, createdAt: now }, 201, origin);
      } catch (err) {
        console.error('[shanan-api] Activity event insert failed:', err);
        return errorResponse('Could not record activity event.', 500, origin);
      }
    }

    // --- V1-3: Activity analytics (GET /api/admin/activity/analytics) ---
    // Internal-only analytics summarizing engagement intelligence.
    if (url.pathname === '/api/admin/activity/analytics' && req.method === 'GET') {
      const auth = requireInternal(req, origin);
      if (auth.error) return auth.error;
      try {
        // 1. Total engaged users (distinct user_id with events)
        const engagedUsers = (db.prepare('SELECT COUNT(DISTINCT user_id) as n FROM activity_events WHERE user_id IS NOT NULL').get() as any).n;
        // 2. Total engaged companies
        const engagedCompanies = (db.prepare('SELECT COUNT(DISTINCT company_id) as n FROM activity_events WHERE company_id IS NOT NULL').get() as any).n;
        // 3. Users who submitted a Supply Request
        const submittedUsers = (db.prepare("SELECT COUNT(DISTINCT user_id) as n FROM activity_events WHERE event_type = 'SUPPLY_REQUEST_SUBMITTED' AND user_id IS NOT NULL").get() as any).n;
        // 4. Users who had activity but did NOT submit
        const engagedNotSubmitted = (db.prepare(
          `SELECT COUNT(DISTINCT ae.user_id) as n
           FROM activity_events ae
           WHERE ae.user_id IS NOT NULL
             AND ae.user_id NOT IN (
               SELECT DISTINCT user_id FROM activity_events WHERE event_type = 'SUPPLY_REQUEST_SUBMITTED'
             )`
        ).get() as any).n;
        // 5. Event counts by type
        const eventCounts = db.query(
          `SELECT event_type, COUNT(*) as count FROM activity_events GROUP BY event_type ORDER BY count DESC`
        ).all();
        // 6. Last meaningful stage for non-submitters
        const lastStagesNonSubmitters = db.query(
          `SELECT ae.user_id, ae.event_type, ae.created_at
           FROM activity_events ae
           WHERE ae.user_id IS NOT NULL
             AND ae.user_id NOT IN (
               SELECT DISTINCT user_id FROM activity_events WHERE event_type = 'SUPPLY_REQUEST_SUBMITTED'
             )
             AND ae.created_at = (
               SELECT MAX(created_at) FROM activity_events WHERE user_id = ae.user_id
             )
           ORDER BY ae.created_at DESC`
        ).all();
        // 7. Top active products
        const topProducts = db.query(
          `SELECT product_id, COUNT(*) as views FROM activity_events
           WHERE product_id IS NOT NULL AND event_type IN ('PRODUCT_VIEWED', 'PRODUCT_SEARCHED')
           GROUP BY product_id ORDER BY views DESC LIMIT 10`
        ).all();
        // 8. Top active categories
        const topCategories = db.query(
          `SELECT category_id, COUNT(*) as views FROM activity_events
           WHERE category_id IS NOT NULL AND event_type = 'CATEGORY_VIEWED'
           GROUP BY category_id ORDER BY views DESC LIMIT 10`
        ).all();
        // 9. Total events
        const totalEvents = (db.prepare('SELECT COUNT(*) as n FROM activity_events').get() as any).n;

        return jsonResponse({
          totalEvents,
          engagedUsers,
          engagedCompanies,
          submittedUsers,
          engagedNotSubmitted,
          eventCounts,
          lastStagesNonSubmitters: lastStagesNonSubmitters.slice(0, 50),
          topProducts,
          topCategories,
        }, 200, origin);
      } catch (err) {
        console.error('[shanan-api] Activity analytics failed:', err);
        return errorResponse('Could not retrieve analytics.', 500, origin);
      }
    }

    // --- V1-2: Server-side event recording for key business actions ---
    // These are called inline from existing handlers, not as separate endpoints.
    // They use the recordActivityEvent helper function (defined below).

    // ============================================================
    // V2 — Activity Intelligence Insights & Opportunity Detection
    // All endpoints require requireInternal.
    // No new tables — all insights derived from existing activity_events
    // and business tables.
    // ============================================================

    // --- V2-1: Customer/Company Activity Insights ---
    // GET /api/admin/activity/customer-insights
    // Returns per-user activity classification with evidence.
    if (url.pathname === '/api/admin/activity/customer-insights' && req.method === 'GET') {
      const auth = requireInternal(req, origin);
      if (auth.error) return auth.error;
      try {
        // Analysis window: last 30 days (configurable via env)
        const ANALYSIS_WINDOW_DAYS = Number(process.env.ANALYSIS_WINDOW_DAYS || '30');
        const windowStart = new Date(Date.now() - ANALYSIS_WINDOW_DAYS * 86400000).toISOString();

        // Get all users with activity events in the window
        const users = db.query(
          `SELECT DISTINCT ae.user_id, ae.user_type, ae.company_id,
                  u.name AS user_name, u.email AS user_email,
                  cc.name_en AS company_name
           FROM activity_events ae
           LEFT JOIN users u ON ae.user_id = u.id
           LEFT JOIN customer_companies cc ON ae.company_id = cc.id
           WHERE ae.user_id IS NOT NULL
             AND ae.created_at >= ?
           ORDER BY ae.company_id, ae.user_id`,
        ).all(windowStart) as any[];

        const insights = [];
        for (const user of users) {
          // Count events by type for this user
          const events = db.query(
            `SELECT event_type, COUNT(*) as count, MAX(created_at) as last_at
             FROM activity_events
             WHERE user_id = ? AND created_at >= ?
             GROUP BY event_type`,
          ).all(user.user_id, windowStart) as any[];

          const eventMap: Record<string, { count: number; last_at: string }> = {};
          let totalActivity = 0;
          let lastActivity = '';
          for (const e of events) {
            eventMap[e.event_type] = { count: e.count, last_at: e.last_at };
            totalActivity += e.count;
            if (!lastActivity || e.last_at > lastActivity) lastActivity = e.last_at;
          }

          const hasSubmitted = !!eventMap['SUPPLY_REQUEST_SUBMITTED'];
          const hasStarted = !!eventMap['SUPPLY_REQUEST_STARTED'];
          const hasCatalogView = !!eventMap['CATALOG_VIEWED'];
          const hasProductView = !!eventMap['PRODUCT_VIEWED'];
          const hasSearch = !!eventMap['PRODUCT_SEARCHED'];

          // Deterministic classification rules:
          // A. ACTIVE_AND_SUBMITTED — has SUPPLY_REQUEST_SUBMITTED
          // B. STARTED_NOT_SUBMITTED — has SUPPLY_REQUEST_STARTED but no SUBMITTED
          // C. BROWSED_ONLY — has catalog/product/search activity but no SUPPLY_REQUEST_STARTED
          // D. SUBMITTED_ONLY — has SUBMITTED but no other engagement (unlikely but possible)
          let classification: string;
          let classificationReason: string;
          if (hasSubmitted) {
            classification = 'ACTIVE_AND_SUBMITTED';
            classificationReason = 'User has SUPPLY_REQUEST_SUBMITTED event in the analysis window';
          } else if (hasStarted) {
            classification = 'STARTED_NOT_SUBMITTED';
            classificationReason = 'User has SUPPLY_REQUEST_STARTED but no SUPPLY_REQUEST_SUBMITTED';
          } else if (hasCatalogView || hasProductView || hasSearch) {
            classification = 'BROWSED_ONLY';
            classificationReason = 'User has catalog/product/search activity but no Supply Request progression';
          } else {
            classification = 'OTHER_ACTIVITY';
            classificationReason = 'User has activity events but no catalog or request engagement';
          }

          // Determine last meaningful workflow stage
          let lastWorkflowStage = 'NONE';
          const stageOrder = [
            'PLATFORM_SESSION_STARTED', 'CATALOG_VIEWED', 'PRODUCT_SEARCHED', 'PRODUCT_VIEWED',
            'CATEGORY_VIEWED', 'SUPPLY_REQUEST_STARTED', 'SUPPLY_REQUEST_SUBMITTED',
            'AGREEMENT_VIEWED', 'RFQ_CREATED', 'OFFER_RECORDED', 'EVALUATION_VIEWED', 'DECISION_RECORDED',
          ];
          for (const stage of stageOrder) {
            if (eventMap[stage]) lastWorkflowStage = stage;
          }

          insights.push({
            userId: user.user_id,
            userName: user.user_name,
            userEmail: user.user_email,
            companyId: user.company_id,
            companyName: user.company_name,
            userType: user.user_type,
            classification,
            classificationReason,
            totalActivity,
            lastActivity,
            lastWorkflowStage,
            eventBreakdown: eventMap,
            analysisWindowDays: ANALYSIS_WINDOW_DAYS,
          });
        }

        return jsonResponse({
          insights,
          count: insights.length,
          analysisWindowDays: ANALYSIS_WINDOW_DAYS,
          classifications: {
            ACTIVE_AND_SUBMITTED: insights.filter(i => i.classification === 'ACTIVE_AND_SUBMITTED').length,
            STARTED_NOT_SUBMITTED: insights.filter(i => i.classification === 'STARTED_NOT_SUBMITTED').length,
            BROWSED_ONLY: insights.filter(i => i.classification === 'BROWSED_ONLY').length,
            OTHER_ACTIVITY: insights.filter(i => i.classification === 'OTHER_ACTIVITY').length,
          },
        }, 200, origin);
      } catch (err) {
        console.error('[shanan-api] Customer insights failed:', err);
        return errorResponse('Could not retrieve customer insights.', 500, origin);
      }
    }

    // --- V2-2: Product Interest vs Conversion Insights ---
    // GET /api/admin/activity/product-insights
    // Compares product engagement with Supply Request conversion.
    if (url.pathname === '/api/admin/activity/product-insights' && req.method === 'GET') {
      const auth = requireInternal(req, origin);
      if (auth.error) return auth.error;
      try {
        const ANALYSIS_WINDOW_DAYS = Number(process.env.ANALYSIS_WINDOW_DAYS || '30');
        const windowStart = new Date(Date.now() - ANALYSIS_WINDOW_DAYS * 86400000).toISOString();

        // Products viewed/searched in the analysis window
        const productEngagement = db.query(
          `SELECT product_id,
                  SUM(CASE WHEN event_type = 'PRODUCT_VIEWED' THEN 1 ELSE 0 END) as view_count,
                  SUM(CASE WHEN event_type = 'PRODUCT_SEARCHED' THEN 1 ELSE 0 END) as search_count,
                  COUNT(DISTINCT user_id) as unique_users,
                  MAX(created_at) as last_engagement
           FROM activity_events
           WHERE product_id IS NOT NULL
             AND event_type IN ('PRODUCT_VIEWED', 'PRODUCT_SEARCHED')
             AND created_at >= ?
           GROUP BY product_id
           ORDER BY view_count + search_count DESC`,
        ).all(windowStart) as any[];

        // Products in submitted Supply Requests
        const convertedProducts = db.query(
          `SELECT DISTINCT sri.product_id
           FROM supply_request_items sri
           JOIN supply_requests sr ON sri.request_id = sr.id
           WHERE sr.created_at >= ?`,
        ).all(windowStart) as any[];
        const convertedSet = new Set(convertedProducts.map((p: any) => p.product_id));

        // Build product insights with conversion status
        const productInsights = productEngagement.map((p: any) => {
          // Enrich with product name from Product Master
          const product = db.prepare('SELECT name_en, sku FROM products WHERE id = ?').get(p.product_id) as any;
          const hasConversion = convertedSet.has(p.product_id);
          return {
            productId: p.product_id,
            productName: product?.name_en || '(unknown)',
            sku: product?.sku || '(unknown)',
            viewCount: p.view_count,
            searchCount: p.search_count,
            uniqueUsers: p.unique_users,
            lastEngagement: p.last_engagement,
            hasSupplyRequestConversion: hasConversion,
            // Deterministic rule: "INTEREST_NO_CONVERSION" if engagement > 0 and no conversion
            insightLabel: hasConversion ? 'ENGAGED_WITH_CONVERSION' : 'INTEREST_NO_CONVERSION',
          };
        });

        return jsonResponse({
          products: productInsights,
          count: productInsights.length,
          engagedWithConversion: productInsights.filter(p => p.insightLabel === 'ENGAGED_WITH_CONVERSION').length,
          interestNoConversion: productInsights.filter(p => p.insightLabel === 'INTEREST_NO_CONVERSION').length,
          analysisWindowDays: ANALYSIS_WINDOW_DAYS,
        }, 200, origin);
      } catch (err) {
        console.error('[shanan-api] Product insights failed:', err);
        return errorResponse('Could not retrieve product insights.', 500, origin);
      }
    }

    // --- V2-3: Internal Opportunity / Follow-up Queue ---
    // GET /api/admin/activity/opportunities
    // Evidence-based queue of cases that may deserve human review.
    // No automatic messaging — internal review only.
    if (url.pathname === '/api/admin/activity/opportunities' && req.method === 'GET') {
      const auth = requireInternal(req, origin);
      if (auth.error) return auth.error;
      try {
        const ANALYSIS_WINDOW_DAYS = Number(process.env.ANALYSIS_WINDOW_DAYS || '30');
        const windowStart = new Date(Date.now() - ANALYSIS_WINDOW_DAYS * 86400000).toISOString();

        const opportunities: any[] = [];

        // RULE A: User has SUPPLY_REQUEST_STARTED but no SUPPLY_REQUEST_SUBMITTED
        const ruleAOpp = db.query(
          `SELECT ae.user_id, ae.company_id,
                  u.name AS user_name, u.email AS user_email,
                  cc.name_en AS company_name,
                  MAX(CASE WHEN ae.event_type = 'SUPPLY_REQUEST_STARTED' THEN ae.created_at END) as started_at,
                  MAX(ae.created_at) as last_activity,
                  COUNT(*) as event_count
           FROM activity_events ae
           LEFT JOIN users u ON ae.user_id = u.id
           LEFT JOIN customer_companies cc ON ae.company_id = cc.id
           WHERE ae.user_id IS NOT NULL
             AND ae.created_at >= ?
             AND ae.user_id IN (
               SELECT DISTINCT user_id FROM activity_events
               WHERE event_type = 'SUPPLY_REQUEST_STARTED' AND created_at >= ?
             )
             AND ae.user_id NOT IN (
               SELECT DISTINCT user_id FROM activity_events
               WHERE event_type = 'SUPPLY_REQUEST_SUBMITTED' AND created_at >= ?
             )
           GROUP BY ae.user_id, ae.company_id
           ORDER BY last_activity DESC`,
        ).all(windowStart, windowStart, windowStart) as any[];

        for (const opp of ruleAOpp) {
          opportunities.push({
            opportunityType: 'STARTED_REQUEST_NOT_SUBMITTED',
            userId: opp.user_id,
            userName: opp.user_name,
            userEmail: opp.user_email,
            companyId: opp.company_id,
            companyName: opp.company_name,
            reason: 'User started a Supply Request but has not submitted within the analysis window',
            evidence: {
              startedAt: opp.started_at,
              lastActivity: opp.last_activity,
              totalEvents: opp.event_count,
            },
            deterministicRule: 'RULE_A: Has SUPPLY_REQUEST_STARTED, no SUPPLY_REQUEST_SUBMITTED in window',
          });
        }

        // RULE B: User has >= 3 PRODUCT_VIEWED events but no SUPPLY_REQUEST_SUBMITTED
        const ruleBOpp = db.query(
          `SELECT ae.user_id, ae.company_id,
                  u.name AS user_name, u.email AS user_email,
                  cc.name_en AS company_name,
                  COUNT(*) as product_view_count,
                  MAX(ae.created_at) as last_activity
           FROM activity_events ae
           LEFT JOIN users u ON ae.user_id = u.id
           LEFT JOIN customer_companies cc ON ae.company_id = cc.id
           WHERE ae.event_type = 'PRODUCT_VIEWED'
             AND ae.user_id IS NOT NULL
             AND ae.created_at >= ?
           GROUP BY ae.user_id, ae.company_id
           HAVING product_view_count >= 3
           AND ae.user_id NOT IN (
             SELECT DISTINCT user_id FROM activity_events
             WHERE event_type = 'SUPPLY_REQUEST_SUBMITTED' AND created_at >= ?
           )
           ORDER BY product_view_count DESC`,
        ).all(windowStart, windowStart) as any[];

        for (const opp of ruleBOpp) {
          // Avoid duplicating users already in Rule A
          if (opportunities.find(o => o.userId === opp.user_id)) continue;
          opportunities.push({
            opportunityType: 'REPEATED_PRODUCT_VIEWS_NO_SUBMISSION',
            userId: opp.user_id,
            userName: opp.user_name,
            userEmail: opp.user_email,
            companyId: opp.company_id,
            companyName: opp.company_name,
            reason: 'User viewed 3+ products but has not submitted a Supply Request',
            evidence: {
              productViewCount: opp.product_view_count,
              lastActivity: opp.last_activity,
            },
            deterministicRule: 'RULE_B: >= 3 PRODUCT_VIEWED events, no SUPPLY_REQUEST_SUBMITTED in window',
          });
        }

        // RULE C: Products with engagement but zero conversion
        const ruleCOpp = db.query(
          `SELECT ae.product_id,
                  p.name_en AS product_name, p.sku,
                  COUNT(*) as engagement_count,
                  COUNT(DISTINCT ae.user_id) as unique_users,
                  MAX(ae.created_at) as last_engagement
           FROM activity_events ae
           LEFT JOIN products p ON ae.product_id = p.id
           WHERE ae.product_id IS NOT NULL
             AND ae.event_type IN ('PRODUCT_VIEWED', 'PRODUCT_SEARCHED')
             AND ae.created_at >= ?
             AND ae.product_id NOT IN (
               SELECT DISTINCT sri.product_id
               FROM supply_request_items sri
               JOIN supply_requests sr ON sri.request_id = sr.id
               WHERE sr.created_at >= ?
             )
           GROUP BY ae.product_id
           ORDER BY engagement_count DESC
           LIMIT 20`,
        ).all(windowStart, windowStart) as any[];

        for (const opp of ruleCOpp) {
          opportunities.push({
            opportunityType: 'PRODUCT_INTEREST_NO_CONVERSION',
            productId: opp.product_id,
            productName: opp.product_name,
            productSku: opp.sku,
            reason: 'Product has engagement events but no linked Supply Request conversion',
            evidence: {
              engagementCount: opp.engagement_count,
              uniqueUsers: opp.unique_users,
              lastEngagement: opp.last_engagement,
            },
            deterministicRule: 'RULE_C: Product has engagement events, no supply_request_items link in window',
          });
        }

        return jsonResponse({
          opportunities,
          count: opportunities.length,
          analysisWindowDays: ANALYSIS_WINDOW_DAYS,
          rulesApplied: ['RULE_A', 'RULE_B', 'RULE_C'],
        }, 200, origin);
      } catch (err) {
        console.error('[shanan-api] Opportunity queue failed:', err);
        return errorResponse('Could not retrieve opportunities.', 500, origin);
      }
    }

    // ============================================================
    // V3 — Internal Opportunity Action Layer
    // All endpoints require requireInternal.
    // ============================================================

    // Helper: Generate stable dedup key for an opportunity
    // RULE_A/RULE_B: dedupe by user_id + opportunity_type
    // RULE_C: dedupe by product_id + opportunity_type
    function generateDedupKey(opportunityType: string, userId: string | null, productId: string | null): string {
      if (userId) return `${opportunityType}:${userId}`;
      if (productId) return `${opportunityType}:${productId}`;
      return `${opportunityType}:${crypto.randomUUID()}`;
    }

    // Helper: Record an action in opportunity_actions
    function recordOpportunityAction(
      opportunityId: string,
      actionType: string,
      actorId: string,
      note: string | null,
      previousStatus: string | null,
      newStatus: string | null,
    ): void {
      try {
        db.prepare(
          `INSERT INTO opportunity_actions (id, opportunity_id, action_type, actor_id, note, previous_status, new_status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(crypto.randomUUID(), opportunityId, actionType, actorId, note, previousStatus, newStatus, new Date().toISOString());
      } catch (err) {
        console.error('[shanan-api] Opportunity action recording failed:', err);
      }
    }

    // --- V3: Sync opportunities from V2 rules into persistence ---
    // POST /api/admin/activity/opportunities/sync
    // Generates opportunities from V2 rules and persists them (dedup by dedup_key).
    // Existing opportunities are NOT duplicated — only new ones are created.
    if (url.pathname === '/api/admin/activity/opportunities/sync' && req.method === 'POST') {
      const auth = requireInternal(req, origin);
      if (auth.error) return auth.error;
      try {
        const ANALYSIS_WINDOW_DAYS = Number(process.env.ANALYSIS_WINDOW_DAYS || '30');
        const windowStart = new Date(Date.now() - ANALYSIS_WINDOW_DAYS * 86400000).toISOString();
        let created = 0, skipped = 0;

        // RULE_A: Users with SUPPLY_REQUEST_STARTED but no SUBMITTED
        const ruleA = db.query(
          `SELECT ae.user_id, ae.company_id,
                  u.name AS user_name, u.email AS user_email,
                  cc.name_en AS company_name,
                  MAX(CASE WHEN ae.event_type = 'SUPPLY_REQUEST_STARTED' THEN ae.created_at END) as started_at,
                  MAX(ae.created_at) as last_activity,
                  COUNT(*) as event_count
           FROM activity_events ae
           LEFT JOIN users u ON ae.user_id = u.id
           LEFT JOIN customer_companies cc ON ae.company_id = cc.id
           WHERE ae.user_id IS NOT NULL AND ae.created_at >= ?
             AND ae.user_id IN (
               SELECT DISTINCT user_id FROM activity_events WHERE event_type = 'SUPPLY_REQUEST_STARTED' AND created_at >= ?
             )
             AND ae.user_id NOT IN (
               SELECT DISTINCT user_id FROM activity_events WHERE event_type = 'SUPPLY_REQUEST_SUBMITTED' AND created_at >= ?
             )
           GROUP BY ae.user_id, ae.company_id`,
        ).all(windowStart, windowStart, windowStart) as any[];

        for (const opp of ruleA) {
          const dedupKey = generateDedupKey('STARTED_REQUEST_NOT_SUBMITTED', opp.user_id, null);
          const existing = db.prepare('SELECT id FROM opportunities WHERE dedup_key = ?').get(dedupKey) as any;
          if (existing) { skipped++; continue; }
          const id = crypto.randomUUID();
          const evidence = JSON.stringify({ startedAt: opp.started_at, lastActivity: opp.last_activity, totalEvents: opp.event_count });
          db.prepare(
            `INSERT INTO opportunities (id, opportunity_type, dedup_key, rule, user_id, company_id, reason, evidence_json, status, created_by, created_at, updated_at)
             VALUES (?, 'STARTED_REQUEST_NOT_SUBMITTED', ?, 'RULE_A', ?, ?, ?, ?, 'NEW', ?, ?, ?)`,
          ).run(id, dedupKey, opp.user_id, opp.company_id,
            'User started a Supply Request but has not submitted within the analysis window',
            evidence, auth.user.id, new Date().toISOString(), new Date().toISOString());
          created++;
        }

        // RULE_B: Users with >= 3 PRODUCT_VIEWED but no SUBMITTED (not already in Rule A)
        const ruleB = db.query(
          `SELECT ae.user_id, ae.company_id,
                  u.name AS user_name, u.email AS user_email,
                  cc.name_en AS company_name,
                  COUNT(*) as product_view_count,
                  MAX(ae.created_at) as last_activity
           FROM activity_events ae
           LEFT JOIN users u ON ae.user_id = u.id
           LEFT JOIN customer_companies cc ON ae.company_id = cc.id
           WHERE ae.event_type = 'PRODUCT_VIEWED' AND ae.user_id IS NOT NULL AND ae.created_at >= ?
           GROUP BY ae.user_id, ae.company_id
           HAVING product_view_count >= 3
           AND ae.user_id NOT IN (
             SELECT DISTINCT user_id FROM activity_events WHERE event_type = 'SUPPLY_REQUEST_SUBMITTED' AND created_at >= ?
           )`,
        ).all(windowStart, windowStart) as any[];

        for (const opp of ruleB) {
          const dedupKey = generateDedupKey('REPEATED_PRODUCT_VIEWS_NO_SUBMISSION', opp.user_id, null);
          const existing = db.prepare('SELECT id FROM opportunities WHERE dedup_key = ?').get(dedupKey) as any;
          if (existing) { skipped++; continue; }
          const id = crypto.randomUUID();
          const evidence = JSON.stringify({ productViewCount: opp.product_view_count, lastActivity: opp.last_activity });
          db.prepare(
            `INSERT INTO opportunities (id, opportunity_type, dedup_key, rule, user_id, company_id, reason, evidence_json, status, created_by, created_at, updated_at)
             VALUES (?, 'REPEATED_PRODUCT_VIEWS_NO_SUBMISSION', ?, 'RULE_B', ?, ?, ?, ?, 'NEW', ?, ?, ?)`,
          ).run(id, dedupKey, opp.user_id, opp.company_id,
            'User viewed 3+ products but has not submitted a Supply Request',
            evidence, auth.user.id, new Date().toISOString(), new Date().toISOString());
          created++;
        }

        // RULE_C: Products with engagement but zero conversion
        const ruleC = db.query(
          `SELECT ae.product_id, p.name_en AS product_name, p.sku,
                  COUNT(*) as engagement_count,
                  COUNT(DISTINCT ae.user_id) as unique_users,
                  MAX(ae.created_at) as last_engagement
           FROM activity_events ae
           LEFT JOIN products p ON ae.product_id = p.id
           WHERE ae.product_id IS NOT NULL AND ae.event_type IN ('PRODUCT_VIEWED', 'PRODUCT_SEARCHED')
             AND ae.created_at >= ?
             AND ae.product_id NOT IN (
               SELECT DISTINCT sri.product_id FROM supply_request_items sri
               JOIN supply_requests sr ON sri.request_id = sr.id WHERE sr.created_at >= ?
             )
           GROUP BY ae.product_id`,
        ).all(windowStart, windowStart) as any[];

        for (const opp of ruleC) {
          const dedupKey = generateDedupKey('PRODUCT_INTEREST_NO_CONVERSION', null, opp.product_id);
          const existing = db.prepare('SELECT id FROM opportunities WHERE dedup_key = ?').get(dedupKey) as any;
          if (existing) { skipped++; continue; }
          const id = crypto.randomUUID();
          const evidence = JSON.stringify({ engagementCount: opp.engagement_count, uniqueUsers: opp.unique_users, lastEngagement: opp.last_engagement });
          db.prepare(
            `INSERT INTO opportunities (id, opportunity_type, dedup_key, rule, product_id, reason, evidence_json, status, created_by, created_at, updated_at)
             VALUES (?, 'PRODUCT_INTEREST_NO_CONVERSION', ?, 'RULE_C', ?, ?, ?, 'NEW', ?, ?, ?)`,
          ).run(id, dedupKey, opp.product_id,
            'Product has engagement events but no linked Supply Request conversion',
            evidence, auth.user.id, new Date().toISOString(), new Date().toISOString());
          created++;
        }

        return jsonResponse({ created, skipped, totalProcessed: created + skipped }, 200, origin);
      } catch (err) {
        console.error('[shanan-api] Opportunity sync failed:', err);
        return errorResponse('Could not sync opportunities.', 500, origin);
      }
    }

    // --- V3: List persisted opportunities ---
    // GET /api/admin/activity/opportunities/tracked
    if (url.pathname === '/api/admin/activity/opportunities/tracked' && req.method === 'GET') {
      const auth = requireInternal(req, origin);
      if (auth.error) return auth.error;
      try {
        const statusFilter = url.searchParams.get('status');
        let rows;
        if (statusFilter) {
          rows = db.query(
            `SELECT o.*, u.name AS assigned_to_name, ou.name AS user_name, cc.name_en AS company_name,
                    p.name_en AS product_name, p.sku AS product_sku
             FROM opportunities o
             LEFT JOIN users u ON o.assigned_to = u.id
             LEFT JOIN users ou ON o.user_id = ou.id
             LEFT JOIN customer_companies cc ON o.company_id = cc.id
             LEFT JOIN products p ON o.product_id = p.id
             WHERE o.status = ?
             ORDER BY o.created_at DESC`,
          ).all(statusFilter);
        } else {
          rows = db.query(
            `SELECT o.*, u.name AS assigned_to_name, ou.name AS user_name, cc.name_en AS company_name,
                    p.name_en AS product_name, p.sku AS product_sku
             FROM opportunities o
             LEFT JOIN users u ON o.assigned_to = u.id
             LEFT JOIN users ou ON o.user_id = ou.id
             LEFT JOIN customer_companies cc ON o.company_id = cc.id
             LEFT JOIN products p ON o.product_id = p.id
             ORDER BY o.created_at DESC`,
          ).all();
        }
        return jsonResponse({ opportunities: rows, count: rows.length }, 200, origin);
      } catch (err) {
        console.error('[shanan-api] Tracked opportunities query failed:', err);
        return errorResponse('Could not retrieve opportunities.', 500, origin);
      }
    }

    // ============================================================
    // V5 — Deterministic Opportunity Prioritization
    // Pure function: no DB writes, no schema changes.
    // All inputs come from existing opportunity fields.
    // ============================================================

    // Compute a deterministic 0-100 priority score with explainable factors.
    // Returns: { score, level, factors: [{key, label, points, max, reason}] }
    function computeOpportunityPriority(opp: any): {
      score: number;
      level: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
      factors: Array<{ key: string; label: string; points: number; max: number; reason: string }>;
    } {
      const factors: Array<{ key: string; label: string; points: number; max: number; reason: string }> = [];

      // --- Factor 1: Rule Base Weight (max 40) ---
      // RULE_A (started request not submitted) = highest intent signal = 40
      // RULE_B (repeated product views)       = strong engagement   = 30
      // RULE_C (product interest no conversion) = product-level only = 20
      const RULE_WEIGHT: Record<string, number> = { RULE_A: 40, RULE_B: 30, RULE_C: 20 };
      const rulePoints = RULE_WEIGHT[opp.rule] ?? 0;
      factors.push({
        key: 'rule',
        label: 'Deterministic Rule',
        points: rulePoints,
        max: 40,
        reason: `${opp.rule} — ${
          opp.rule === 'RULE_A' ? 'user started a request (highest intent)'
          : opp.rule === 'RULE_B' ? 'user engaged repeatedly with products'
          : opp.rule === 'RULE_C' ? 'product has engagement but no conversion'
          : 'unknown rule'
        }`,
      });

      // --- Factor 2: Status Weight (max 25) ---
      // NEW = needs attention = 25
      // UNDER_REVIEW = being worked = 15
      // CONTACTED = awaiting customer = 10
      // CONVERTED / DISMISSED = closed = 0
      const STATUS_WEIGHT: Record<string, number> = {
        NEW: 25, UNDER_REVIEW: 15, CONTACTED: 10, CONVERTED: 0, DISMISSED: 0,
      };
      const statusPoints = STATUS_WEIGHT[opp.status] ?? 0;
      factors.push({
        key: 'status',
        label: 'Workflow Status',
        points: statusPoints,
        max: 25,
        reason: `${opp.status} — ${
          opp.status === 'NEW' ? 'not yet acted on'
          : opp.status === 'UNDER_REVIEW' ? 'currently being reviewed'
          : opp.status === 'CONTACTED' ? 'customer contacted, awaiting response'
          : opp.status === 'CONVERTED' ? 'already converted (closed)'
          : opp.status === 'DISMISSED' ? 'dismissed (closed)'
          : 'unknown status'
        }`,
      });

      // --- Factor 3: Recency Weight (max 20) ---
      // Based on updated_at (last activity on the opportunity)
      // <24h = 20, <3d = 15, <7d = 10, <14d = 5, else 0
      let recencyPoints = 0;
      let recencyReason = 'older than 14 days';
      try {
        const updated = new Date(opp.updated_at).getTime();
        const ageMs = Date.now() - updated;
        const ageH = ageMs / 36e5;
        if (ageH < 24) { recencyPoints = 20; recencyReason = `updated ${Math.round(ageH)}h ago`; }
        else if (ageH < 72) { recencyPoints = 15; recencyReason = `updated ${Math.round(ageH / 24)}d ago`; }
        else if (ageH < 168) { recencyPoints = 10; recencyReason = `updated ${Math.round(ageH / 24)}d ago`; }
        else if (ageH < 336) { recencyPoints = 5; recencyReason = `updated ${Math.round(ageH / 24)}d ago`; }
        else { recencyPoints = 0; recencyReason = `updated ${Math.round(ageH / 24)}d ago (stale)`; }
      } catch {
        recencyPoints = 0;
        recencyReason = 'updated_at could not be parsed';
      }
      factors.push({
        key: 'recency',
        label: 'Recency of Last Update',
        points: recencyPoints,
        max: 20,
        reason: recencyReason,
      });

      // --- Factor 4: Evidence Strength (max 15) ---
      // Parsed from evidence_json, rule-specific scaling
      let evidencePoints = 0;
      let evidenceReason = 'no evidence available';
      try {
        const ev = opp.evidence_json ? JSON.parse(opp.evidence_json) : null;
        if (ev) {
          if (opp.rule === 'RULE_A' && typeof ev.totalEvents === 'number') {
            // 1 event = 5, 3 events = 10, 5+ events = 15
            evidencePoints = ev.totalEvents >= 5 ? 15 : ev.totalEvents >= 3 ? 10 : 5;
            evidenceReason = `${ev.totalEvents} total event(s) recorded`;
          } else if (opp.rule === 'RULE_B' && typeof ev.productViewCount === 'number') {
            // 3 views = 5, 5 views = 10, 7+ views = 15
            evidencePoints = ev.productViewCount >= 7 ? 15 : ev.productViewCount >= 5 ? 10 : 5;
            evidenceReason = `${ev.productViewCount} product view(s)`;
          } else if (opp.rule === 'RULE_C' && typeof ev.engagementCount === 'number') {
            // 1 engagement = 5, 3 engagements = 10, 5+ = 15
            evidencePoints = ev.engagementCount >= 5 ? 15 : ev.engagementCount >= 3 ? 10 : 5;
            const uniqueUsersStr = typeof ev.uniqueUsers === 'number' ? ` across ${ev.uniqueUsers} user(s)` : '';
            evidenceReason = `${ev.engagementCount} engagement event(s)${uniqueUsersStr}`;
          } else {
            evidencePoints = 5;
            evidenceReason = 'evidence present but shape unrecognized';
          }
        }
      } catch {
        evidencePoints = 0;
        evidenceReason = 'evidence_json could not be parsed';
      }
      factors.push({
        key: 'evidence',
        label: 'Evidence Strength',
        points: evidencePoints,
        max: 15,
        reason: evidenceReason,
      });

      // --- Total + Level ---
      const score = factors.reduce((sum, f) => sum + f.points, 0);
      let level: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
      if (score >= 70) level = 'CRITICAL';
      else if (score >= 50) level = 'HIGH';
      else if (score >= 30) level = 'MEDIUM';
      else level = 'LOW';

      // Closed opportunities are always at least LOW — never CRITICAL even with high scores
      // (CONVERTED/DISMISSED have status=0 already, so they will score low naturally; this is a safety net)
      if (opp.status === 'CONVERTED' || opp.status === 'DISMISSED') {
        const cappedScore = Math.min(score, 29);
        return {
          score: cappedScore,
          level: 'LOW',
          factors: factors.map(f => f.key === 'status' ? { ...f, reason: `${f.reason} (closed — capped at LOW)` } : f),
        };
      }

      return { score, level, factors };
    }

    // --- V5: List opportunities with deterministic priority scoring ---
    // GET /api/admin/activity/opportunities/prioritized
    // Query params:
    //   ?status=NEW|UNDER_REVIEW|CONTACTED|CONVERTED|DISMISSED  (optional filter)
    //   ?limit=N  (optional, default 50, max 200)
    //   ?includeTasks=true  (optional, V6 — adds taskCount + openTaskCount per opportunity)
    // Returns the same opportunities as /tracked plus:
    //   priority_score (0-100), priority_level (CRITICAL/HIGH/MEDIUM/LOW), priority_factors []
    //   When includeTasks=true, also adds: taskCount (total), openTaskCount (PENDING+IN_PROGRESS)
    if (url.pathname === '/api/admin/activity/opportunities/prioritized' && req.method === 'GET') {
      const auth = requireInternal(req, origin);
      if (auth.error) return auth.error;
      try {
        const statusFilter = url.searchParams.get('status');
        const limitRaw = Number(url.searchParams.get('limit') || '50');
        const limit = Number.isFinite(limitRaw) && limitRaw > 0 && limitRaw <= 200 ? Math.floor(limitRaw) : 50;
        // V6: includeTasks=true (backward compatible — omitted = no task counts in response)
        const includeTasks = url.searchParams.get('includeTasks') === 'true';

        let rows;
        if (statusFilter) {
          rows = db.query(
            `SELECT o.*, u.name AS assigned_to_name, ou.name AS user_name, cc.name_en AS company_name,
                    p.name_en AS product_name, p.sku AS product_sku
             FROM opportunities o
             LEFT JOIN users u ON o.assigned_to = u.id
             LEFT JOIN users ou ON o.user_id = ou.id
             LEFT JOIN customer_companies cc ON o.company_id = cc.id
             LEFT JOIN products p ON o.product_id = p.id
             WHERE o.status = ?`,
          ).all(statusFilter);
        } else {
          rows = db.query(
            `SELECT o.*, u.name AS assigned_to_name, ou.name AS user_name, cc.name_en AS company_name,
                    p.name_en AS product_name, p.sku AS product_sku
             FROM opportunities o
             LEFT JOIN users u ON o.assigned_to = u.id
             LEFT JOIN users ou ON o.user_id = ou.id
             LEFT JOIN customer_companies cc ON o.company_id = cc.id
             LEFT JOIN products p ON o.product_id = p.id`,
          ).all();
        }

        // V6: Pre-fetch task counts per opportunity if requested (single grouped query — efficient)
        let taskCountMap: Map<string, { taskCount: number; openTaskCount: number }> = new Map();
        if (includeTasks && rows.length > 0) {
          const oppIds = (rows as any[]).map(r => r.id);
          const placeholders = oppIds.map(() => '?').join(',');
          const taskRows = db.query(
            `SELECT opportunity_id,
                    COUNT(*) AS task_count,
                    SUM(CASE WHEN status IN ('PENDING','IN_PROGRESS') THEN 1 ELSE 0 END) AS open_task_count
             FROM follow_up_tasks
             WHERE opportunity_id IN (${placeholders})
             GROUP BY opportunity_id`,
          ).all(...oppIds) as any[];
          for (const tr of taskRows) {
            taskCountMap.set(tr.opportunity_id, {
              taskCount: tr.task_count || 0,
              openTaskCount: tr.open_task_count || 0,
            });
          }
        }

        // Compute priority for each row, then sort by score DESC (ties broken by updated_at DESC)
        const withPriority = (rows as any[]).map(opp => {
          const priority = computeOpportunityPriority(opp);
          const base: any = {
            ...opp,
            priority_score: priority.score,
            priority_level: priority.level,
            priority_factors: priority.factors,
          };
          if (includeTasks) {
            const tc = taskCountMap.get(opp.id) || { taskCount: 0, openTaskCount: 0 };
            base.taskCount = tc.taskCount;
            base.openTaskCount = tc.openTaskCount;
          }
          return base;
        });
        withPriority.sort((a, b) => {
          if (b.priority_score !== a.priority_score) return b.priority_score - a.priority_score;
          // Tie-break: newer updated_at first
          const ta = new Date(a.updated_at || 0).getTime();
          const tb = new Date(b.updated_at || 0).getTime();
          return tb - ta;
        });
        const limited = withPriority.slice(0, limit);

        return jsonResponse({ opportunities: limited, count: limited.length, totalAvailable: withPriority.length }, 200, origin);
      } catch (err) {
        console.error('[shanan-api] Prioritized opportunities query failed:', err);
        return errorResponse('Could not retrieve prioritized opportunities.', 500, origin);
      }
    }

    // --- V3: Get single opportunity + action history ---
    // GET /api/admin/activity/opportunities/:id
    const trackedOppMatch = url.pathname.match(/^\/api\/admin\/activity\/opportunities\/([^/]+)$/);
    if (trackedOppMatch && req.method === 'GET') {
      const auth = requireInternal(req, origin);
      if (auth.error) return auth.error;
      const oppId = decodeURIComponent(trackedOppMatch[1]);
      const opp = db.prepare(
        `SELECT o.*, u.name AS assigned_to_name, ou.name AS user_name, cc.name_en AS company_name,
                p.name_en AS product_name, p.sku AS product_sku
         FROM opportunities o
         LEFT JOIN users u ON o.assigned_to = u.id
         LEFT JOIN users ou ON o.user_id = ou.id
         LEFT JOIN customer_companies cc ON o.company_id = cc.id
         LEFT JOIN products p ON o.product_id = p.id
         WHERE o.id = ?`,
      ).get(oppId) as any;
      if (!opp) return errorResponse('Opportunity not found', 404, origin);
      const actions = db.query(
        `SELECT oa.*, u.name AS actor_name
         FROM opportunity_actions oa
         LEFT JOIN users u ON oa.actor_id = u.id
         WHERE oa.opportunity_id = ?
         ORDER BY oa.created_at ASC`,
      ).all(oppId);
      // V5: include deterministic priority in the detail response so the
      // dashboard can render the score breakdown alongside the opportunity.
      const priority = computeOpportunityPriority(opp);
      return jsonResponse({ opportunity: opp, actions, actionCount: actions.length, priority }, 200, origin);
    }

    // --- V3: Update opportunity status ---
    // PATCH /api/admin/activity/opportunities/:id
    if (trackedOppMatch && req.method === 'PATCH') {
      const auth = requireInternal(req, origin);
      if (auth.error) return auth.error;
      const oppId = decodeURIComponent(trackedOppMatch[1]);
      const existing = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(oppId) as any;
      if (!existing) return errorResponse('Opportunity not found', 404, origin);
      let body: unknown;
      try { body = await req.json(); } catch { return errorResponse('Invalid JSON body', 400, origin); }
      const b = body as Record<string, unknown>;
      const now = new Date().toISOString();
      const VALID_STATUSES = ['NEW', 'UNDER_REVIEW', 'CONTACTED', 'CONVERTED', 'DISMISSED'];

      // Status update
      if (b.status !== undefined) {
        if (typeof b.status !== 'string' || !VALID_STATUSES.includes(b.status)) {
          return errorResponse(`Validation failed: status — must be one of: ${VALID_STATUSES.join(', ')}`, 400, origin);
        }
        const note = (typeof b.note === 'string' && b.note.length <= 500) ? b.note.trim() : null;
        const prevStatus = existing.status;
        db.prepare('UPDATE opportunities SET status = ?, updated_at = ? WHERE id = ?').run(b.status, now, oppId);
        // Record action — actor is always from auth, never client-supplied
        recordOpportunityAction(oppId, 'STATUS_CHANGED', auth.user.id, note, prevStatus, b.status);
        const updated = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(oppId);
        return jsonResponse({ opportunity: updated }, 200, origin);
      }

      // Assignment update
      if (b.assignedTo !== undefined) {
        let assignedTo: string | null = null;
        if (b.assignedTo === null) {
          // Unassign
          assignedTo = null;
        } else {
          if (typeof b.assignedTo !== 'string') {
            return errorResponse('Validation failed: assignedTo — must be a string or null', 400, origin);
          }
          // Verify user exists and is internal
          const targetUser = db.prepare('SELECT id, user_type FROM users WHERE id = ?').get(b.assignedTo) as any;
          if (!targetUser) {
            return errorResponse('Validation failed: assignedTo — user not found', 422, origin);
          }
          if (targetUser.user_type !== 'internal') {
            return errorResponse('Validation failed: assignedTo — can only assign to internal users', 400, origin);
          }
          assignedTo = targetUser.id;
        }
        const note = (typeof b.note === 'string' && b.note.length <= 500) ? b.note.trim() : null;
        const actionType = existing.assigned_to ? 'REASSIGNED' : 'ASSIGNED';
        const prevAssigned = existing.assigned_to;
        db.prepare('UPDATE opportunities SET assigned_to = ?, updated_at = ? WHERE id = ?').run(assignedTo, now, oppId);
        recordOpportunityAction(oppId, actionType, auth.user.id, note, null, null);
        const updated = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(oppId);
        return jsonResponse({ opportunity: updated }, 200, origin);
      }

      return errorResponse('No valid fields to update (status or assignedTo)', 422, origin);
    }

    // ============================================================
    // V6 — Internal Follow-up Task Queue
    // Endpoints (all requireInternal):
    //   POST   /api/admin/activity/opportunities/:id/tasks
    //   GET    /api/admin/activity/opportunities/:id/tasks
    //   PATCH  /api/admin/follow-up-tasks/:id
    //   GET    /api/admin/follow-up-tasks
    // ============================================================

    const VALID_TASK_STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
    const VALID_TASK_PRIORITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

    // Helper: stable dedup_key for a task = opportunity_id + ':' + normalized title
    // Normalization: trim + collapse whitespace + lowercase.
    // This prevents accidental duplicate tasks with the same title on the same opportunity.
    function computeTaskDedupKey(opportunityId: string, title: string): string {
      const normalized = title.trim().replace(/\s+/g, ' ').toLowerCase();
      return `${opportunityId}:${normalized}`;
    }

    // Helper: validate ISO date string (basic shape check — not full ISO 8601 validation)
    function isValidIsoDate(s: string | null | undefined): boolean {
      if (!s || typeof s !== 'string') return false;
      // Accept YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS(...Z)
      return /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?Z?)?$/.test(s.trim());
    }

    // --- V6-1: Create a follow-up task on an opportunity ---
    // POST /api/admin/activity/opportunities/:id/tasks
    const oppTasksMatch = url.pathname.match(/^\/api\/admin\/activity\/opportunities\/([^/]+)\/tasks$/);
    if (oppTasksMatch && req.method === 'POST') {
      const auth = requireInternal(req, origin);
      if (auth.error) return auth.error;
      const oppId = decodeURIComponent(oppTasksMatch[1]);
      const opp = db.prepare('SELECT id FROM opportunities WHERE id = ?').get(oppId) as any;
      if (!opp) return errorResponse('Opportunity not found', 404, origin);
      let body: unknown;
      try { body = await req.json(); } catch { return errorResponse('Invalid JSON body', 400, origin); }
      const b = body as Record<string, unknown>;

      // Required: title
      if (typeof b.title !== 'string' || b.title.trim() === '') {
        return errorResponse('Validation failed: title — required (non-empty string)', 400, origin);
      }
      const title = b.title.trim().slice(0, 200); // cap length

      // Optional: description
      const description = (typeof b.description === 'string' ? b.description.trim().slice(0, 2000) : null);

      // Optional: priority (default MEDIUM)
      let priority: string = 'MEDIUM';
      if (b.priority !== undefined && b.priority !== null) {
        if (typeof b.priority !== 'string' || !VALID_TASK_PRIORITIES.includes(b.priority)) {
          return errorResponse(`Validation failed: priority — must be one of: ${VALID_TASK_PRIORITIES.join(', ')}`, 400, origin);
        }
        priority = b.priority;
      }

      // Optional: assigneeUserId (must be internal user if provided)
      let assigneeUserId: string | null = null;
      if (b.assigneeUserId !== undefined && b.assigneeUserId !== null) {
        if (typeof b.assigneeUserId !== 'string') {
          return errorResponse('Validation failed: assigneeUserId — must be a string or null', 400, origin);
        }
        const targetUser = db.prepare('SELECT id, user_type FROM users WHERE id = ?').get(b.assigneeUserId) as any;
        if (!targetUser) {
          return errorResponse('Validation failed: assigneeUserId — user not found', 422, origin);
        }
        if (targetUser.user_type !== 'internal') {
          return errorResponse('Validation failed: assigneeUserId — can only assign to internal users', 400, origin);
        }
        assigneeUserId = targetUser.id;
      }

      // Optional: dueDate (ISO date)
      let dueDate: string | null = null;
      if (b.dueDate !== undefined && b.dueDate !== null) {
        if (!isValidIsoDate(b.dueDate as string)) {
          return errorResponse('Validation failed: dueDate — must be a valid ISO date (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)', 400, origin);
        }
        dueDate = (b.dueDate as string).trim();
      }

      // Dedup check
      const dedupKey = computeTaskDedupKey(oppId, title);
      const existingTask = db.prepare('SELECT id FROM follow_up_tasks WHERE dedup_key = ?').get(dedupKey) as any;
      if (existingTask) {
        return errorResponse('Validation failed: title — a task with this title already exists on this opportunity (dedup_key conflict)', 409, origin);
      }

      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      try {
        db.prepare(
          `INSERT INTO follow_up_tasks (id, opportunity_id, dedup_key, title, description, status, priority, assignee_user_id, created_by, due_date, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?, ?, ?)`,
        ).run(id, oppId, dedupKey, title, description, priority, assigneeUserId, auth.user.id, dueDate, now, now);
        const created = db.prepare(
          `SELECT t.*, u.name AS assignee_name, ou.name AS created_by_name
           FROM follow_up_tasks t
           LEFT JOIN users u ON t.assignee_user_id = u.id
           LEFT JOIN users ou ON t.created_by = ou.id
           WHERE t.id = ?`,
        ).get(id);
        return jsonResponse({ task: created }, 201, origin);
      } catch (err) {
        console.error('[shanan-api] V6 task create failed:', err);
        return errorResponse('Could not create follow-up task.', 500, origin);
      }
    }

    // --- V6-2: List follow-up tasks for an opportunity ---
    // GET /api/admin/activity/opportunities/:id/tasks
    if (oppTasksMatch && req.method === 'GET') {
      const auth = requireInternal(req, origin);
      if (auth.error) return auth.error;
      const oppId = decodeURIComponent(oppTasksMatch[1]);
      const opp = db.prepare('SELECT id FROM opportunities WHERE id = ?').get(oppId) as any;
      if (!opp) return errorResponse('Opportunity not found', 404, origin);
      const statusFilter = url.searchParams.get('status');
      let rows;
      if (statusFilter) {
        if (!VALID_TASK_STATUSES.includes(statusFilter)) {
          return errorResponse(`Validation failed: status — must be one of: ${VALID_TASK_STATUSES.join(', ')}`, 400, origin);
        }
        rows = db.query(
          `SELECT t.*, u.name AS assignee_name, ou.name AS created_by_name
           FROM follow_up_tasks t
           LEFT JOIN users u ON t.assignee_user_id = u.id
           LEFT JOIN users ou ON t.created_by = ou.id
           WHERE t.opportunity_id = ? AND t.status = ?
           ORDER BY t.created_at DESC`,
        ).all(oppId, statusFilter);
      } else {
        rows = db.query(
          `SELECT t.*, u.name AS assignee_name, ou.name AS created_by_name
           FROM follow_up_tasks t
           LEFT JOIN users u ON t.assignee_user_id = u.id
           LEFT JOIN users ou ON t.created_by = ou.id
           WHERE t.opportunity_id = ?
           ORDER BY t.created_at DESC`,
        ).all(oppId);
      }
      return jsonResponse({ tasks: rows, count: rows.length }, 200, origin);
    }

    // --- V6-3: List all follow-up tasks (cross-opportunity queue) ---
    // GET /api/admin/follow-up-tasks
    // Query params: ?status=, ?priority=, ?assigneeUserId=, ?opportunityId=
    if (url.pathname === '/api/admin/follow-up-tasks' && req.method === 'GET') {
      const auth = requireInternal(req, origin);
      if (auth.error) return auth.error;
      try {
        const statusFilter = url.searchParams.get('status');
        const priorityFilter = url.searchParams.get('priority');
        const assigneeFilter = url.searchParams.get('assigneeUserId');
        const opportunityFilter = url.searchParams.get('opportunityId');

        // Validate filters
        if (statusFilter && !VALID_TASK_STATUSES.includes(statusFilter)) {
          return errorResponse(`Validation failed: status — must be one of: ${VALID_TASK_STATUSES.join(', ')}`, 400, origin);
        }
        if (priorityFilter && !VALID_TASK_PRIORITIES.includes(priorityFilter)) {
          return errorResponse(`Validation failed: priority — must be one of: ${VALID_TASK_PRIORITIES.join(', ')}`, 400, origin);
        }

        const conditions: string[] = [];
        const params: any[] = [];
        if (statusFilter) { conditions.push('t.status = ?'); params.push(statusFilter); }
        if (priorityFilter) { conditions.push('t.priority = ?'); params.push(priorityFilter); }
        if (assigneeFilter) { conditions.push('t.assignee_user_id = ?'); params.push(assigneeFilter); }
        if (opportunityFilter) { conditions.push('t.opportunity_id = ?'); params.push(opportunityFilter); }
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const rows = db.query(
          `SELECT t.*, u.name AS assignee_name, ou.name AS created_by_name,
                  o.opportunity_type, o.rule, o.status AS opportunity_status
           FROM follow_up_tasks t
           LEFT JOIN users u ON t.assignee_user_id = u.id
           LEFT JOIN users ou ON t.created_by = ou.id
           LEFT JOIN opportunities o ON t.opportunity_id = o.id
           ${whereClause}
           ORDER BY
             CASE t.priority
               WHEN 'CRITICAL' THEN 0
               WHEN 'HIGH' THEN 1
               WHEN 'MEDIUM' THEN 2
               WHEN 'LOW' THEN 3
               ELSE 4
             END ASC,
             t.created_at DESC`,
        ).all(...params);
        return jsonResponse({ tasks: rows, count: rows.length }, 200, origin);
      } catch (err) {
        console.error('[shanan-api] V6 task list failed:', err);
        return errorResponse('Could not retrieve follow-up tasks.', 500, origin);
      }
    }

    // --- V6-4: Update a follow-up task (PATCH) ---
    // PATCH /api/admin/follow-up-tasks/:id
    const followUpTaskMatch = url.pathname.match(/^\/api\/admin\/follow-up-tasks\/([^/]+)$/);
    if (followUpTaskMatch && req.method === 'PATCH') {
      const auth = requireInternal(req, origin);
      if (auth.error) return auth.error;
      const taskId = decodeURIComponent(followUpTaskMatch[1]);
      const existing = db.prepare('SELECT * FROM follow_up_tasks WHERE id = ?').get(taskId) as any;
      if (!existing) return errorResponse('Follow-up task not found', 404, origin);
      let body: unknown;
      try { body = await req.json(); } catch { return errorResponse('Invalid JSON body', 400, origin); }
      const b = body as Record<string, unknown>;
      const now = new Date().toISOString();
      const updates: string[] = [];
      const values: any[] = [];

      // status update
      if (b.status !== undefined) {
        if (typeof b.status !== 'string' || !VALID_TASK_STATUSES.includes(b.status)) {
          return errorResponse(`Validation failed: status — must be one of: ${VALID_TASK_STATUSES.join(', ')}`, 400, origin);
        }
        updates.push('status = ?'); values.push(b.status);
      }

      // priority update
      if (b.priority !== undefined) {
        if (typeof b.priority !== 'string' || !VALID_TASK_PRIORITIES.includes(b.priority)) {
          return errorResponse(`Validation failed: priority — must be one of: ${VALID_TASK_PRIORITIES.join(', ')}`, 400, origin);
        }
        updates.push('priority = ?'); values.push(b.priority);
      }

      // title update (re-check dedup if title changes)
      if (b.title !== undefined) {
        if (typeof b.title !== 'string' || b.title.trim() === '') {
          return errorResponse('Validation failed: title — must be a non-empty string', 400, origin);
        }
        const newTitle = b.title.trim().slice(0, 200);
        const newDedupKey = computeTaskDedupKey(existing.opportunity_id, newTitle);
        if (newDedupKey !== existing.dedup_key) {
          const conflict = db.prepare('SELECT id FROM follow_up_tasks WHERE dedup_key = ? AND id != ?').get(newDedupKey, taskId) as any;
          if (conflict) {
            return errorResponse('Validation failed: title — a task with this title already exists on this opportunity', 409, origin);
          }
          updates.push('dedup_key = ?'); values.push(newDedupKey);
        }
        updates.push('title = ?'); values.push(newTitle);
      }

      // description update
      if (b.description !== undefined) {
        if (b.description === null) {
          updates.push('description = NULL');
        } else if (typeof b.description === 'string') {
          updates.push('description = ?'); values.push(b.description.trim().slice(0, 2000));
        } else {
          return errorResponse('Validation failed: description — must be a string or null', 400, origin);
        }
      }

      // dueDate update
      if (b.dueDate !== undefined) {
        if (b.dueDate === null) {
          updates.push('due_date = NULL');
        } else if (isValidIsoDate(b.dueDate as string)) {
          updates.push('due_date = ?'); values.push((b.dueDate as string).trim());
        } else {
          return errorResponse('Validation failed: dueDate — must be a valid ISO date or null', 400, origin);
        }
      }

      // assigneeUserId update
      if (b.assigneeUserId !== undefined) {
        if (b.assigneeUserId === null) {
          updates.push('assignee_user_id = NULL');
        } else {
          if (typeof b.assigneeUserId !== 'string') {
            return errorResponse('Validation failed: assigneeUserId — must be a string or null', 400, origin);
          }
          const targetUser = db.prepare('SELECT id, user_type FROM users WHERE id = ?').get(b.assigneeUserId) as any;
          if (!targetUser) {
            return errorResponse('Validation failed: assigneeUserId — user not found', 422, origin);
          }
          if (targetUser.user_type !== 'internal') {
            return errorResponse('Validation failed: assigneeUserId — can only assign to internal users', 400, origin);
          }
          updates.push('assignee_user_id = ?'); values.push(targetUser.id);
        }
      }

      if (updates.length === 0) {
        return errorResponse('No valid fields to update', 422, origin);
      }
      updates.push('updated_at = ?'); values.push(now);
      values.push(taskId);

      try {
        db.prepare(`UPDATE follow_up_tasks SET ${updates.join(', ')} WHERE id = ?`).run(...values);
        const updated = db.prepare(
          `SELECT t.*, u.name AS assignee_name, ou.name AS created_by_name
           FROM follow_up_tasks t
           LEFT JOIN users u ON t.assignee_user_id = u.id
           LEFT JOIN users ou ON t.created_by = ou.id
           WHERE t.id = ?`,
        ).get(taskId);
        return jsonResponse({ task: updated }, 200, origin);
      } catch (err) {
        console.error('[shanan-api] V6 task update failed:', err);
        return errorResponse('Could not update follow-up task.', 500, origin);
      }
    }

    // --- V3: Record an action on an opportunity ---
    // POST /api/admin/activity/opportunities/:id/actions
    const oppActionMatch = url.pathname.match(/^\/api\/admin\/activity\/opportunities\/([^/]+)\/actions$/);
    if (oppActionMatch && req.method === 'POST') {
      const auth = requireInternal(req, origin);
      if (auth.error) return auth.error;
      const oppId = decodeURIComponent(oppActionMatch[1]);
      const existing = db.prepare('SELECT id FROM opportunities WHERE id = ?').get(oppId) as any;
      if (!existing) return errorResponse('Opportunity not found', 404, origin);
      let body: unknown;
      try { body = await req.json(); } catch { return errorResponse('Invalid JSON body', 400, origin); }
      const b = body as Record<string, unknown>;

      const VALID_ACTION_TYPES = ['REVIEWED', 'CONTACT_ATTEMPTED', 'CUSTOMER_CONTACTED', 'FOLLOW_UP_REQUIRED', 'QUOTE_REQUESTED', 'CONVERTED', 'DISMISSED'];
      if (typeof b.actionType !== 'string' || !VALID_ACTION_TYPES.includes(b.actionType)) {
        return errorResponse(`Validation failed: actionType — must be one of: ${VALID_ACTION_TYPES.join(', ')}`, 400, origin);
      }
      const note = (typeof b.note === 'string' && b.note.length <= 500) ? b.note.trim() : null;
      const actionId = crypto.randomUUID();
      const now = new Date().toISOString();

      // If action implies a status change, update the opportunity too
      let newStatus: string | null = null;
      if (b.actionType === 'CONVERTED') newStatus = 'CONVERTED';
      if (b.actionType === 'DISMISSED') newStatus = 'DISMISSED';
      if (b.actionType === 'REVIEWED' && existing.status === 'NEW') newStatus = 'UNDER_REVIEW';
      if (b.actionType === 'CUSTOMER_CONTACTED') newStatus = 'CONTACTED';

      if (newStatus) {
        db.prepare('UPDATE opportunities SET status = ?, updated_at = ? WHERE id = ?').run(newStatus, now, oppId);
      }

      try {
        db.prepare(
          `INSERT INTO opportunity_actions (id, opportunity_id, action_type, actor_id, note, previous_status, new_status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(actionId, oppId, b.actionType, auth.user.id, note, existing.status, newStatus, now);
        return jsonResponse({ id: actionId, createdAt: now }, 201, origin);
      } catch (err) {
        console.error('[shanan-api] Opportunity action insert failed:', err);
        return errorResponse('Could not record action.', 500, origin);
      }
    }

    return errorResponse('Not found', 404, origin);
  },
});

// --- Customer reference generator ----------------------------------------
// Format: CUS-YYYY-NNNNNN (year + 6-char alphanumeric)
// Follows the same server-controlled pattern as supply request references.
function generateCustomerReference(): string {
  const year = new Date().getFullYear();
  const random = Math.random().toString(36).slice(2, 8).toUpperCase().padStart(6, '0');
  return `CUS-${year}-${random}`;
}

// --- Credit Application number generator ---------------------------------
// Format: CR-YYYYMMDD-XXXXXX (date + 6-char alphanumeric)
// Follows the same server-controlled pattern as supply request references.
function generateCreditApplicationNumber(): string {
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const random = Math.random().toString(36).slice(2, 8).toUpperCase().padStart(6, '0');
  return `CR-${ymd}-${random}`;
}

// --- A8-FIX: Real server-generated PDF binary ----------------------------
// Uses pdfkit (single minimum-stable dependency, pure-JS, works under Bun).
// Generates a real %PDF-Ã¢â‚¬Â¦ document from authoritative server-side data only.
// Includes ONLY data that actually exists and belongs to the request.
// Never exposes internal reviewer notes, approval_notes, rejection_reason,
// or reviewed_by fields.
function generateOfficialDocumentPDF(
  req: any,
  items: any[],
  creditAppRef: string | null,
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 50,
        // Disable stream compression so the PDF text is directly searchable
        // in the binary (and copy-pasteable in viewers). Trade-off: slightly
        // larger file size, which is acceptable for an official document.
        compress: false,
        info: {
          Title: `SHANAN Official Document Ã¢â‚¬â€ ${req.reference}`,
          Author: 'SHANAN Engineering Knowledge Platform',
          Subject: 'Official Supply Request Document',
          Producer: 'SHANAN Platform (pdfkit)',
          Creator: 'SHANAN Platform API',
        },
      });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(new Uint8Array(Buffer.concat(chunks))));
      doc.on('error', (err: Error) => reject(err));

      const PAGE_W = 595.28; // A4 width in pt
      const M = 50;
      const CONTENT_W = PAGE_W - 2 * M;
      const NAVY = '#0B2545';
      const GRAY = '#6b7280';
      const LIGHT_GRAY = '#f1f3f5';
      const BORDER = '#d1d5db';

      // --- Header ---
      doc.fillColor(NAVY).fontSize(22).font('Helvetica-Bold').text('SHANAN', M, 50);
      doc.fillColor(GRAY).fontSize(8).font('Helvetica').text('ENGINEERING KNOWLEDGE PLATFORM', M, 76);
      doc.fillColor(GRAY).fontSize(8).text('OFFICIAL SUPPLY REQUEST DOCUMENT', PAGE_W - M - 220, 50, { width: 220, align: 'right' });
      doc.fillColor(NAVY).fontSize(11).font('Courier-Bold').text(req.reference, PAGE_W - M - 220, 65, { width: 220, align: 'right' });
      doc.moveTo(M, 95).lineTo(PAGE_W - M, 95).lineWidth(2).strokeColor(NAVY).stroke();

      // --- Metadata block ---
      let y = 115;
      const label = (s: string, x: number, yy: number) => {
        doc.fillColor(GRAY).fontSize(8).font('Helvetica-Bold').text(s.toUpperCase(), x, yy);
      };
      const value = (s: string, x: number, yy: number, w: number) => {
        doc.fillColor('#111').fontSize(11).font('Helvetica').text(s || 'Ã¢â‚¬â€', x, yy + 12, { width: w });
      };

      const COL_W = CONTENT_W / 2;
      label('Date', M, y);
      const dateStr = (() => {
        try { return new Date(req.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' }); }
        catch { return String(req.created_at || ''); }
      })();
      value(dateStr, M, y, COL_W - 10);

      label('Request Status', M + COL_W, y);
      value(String(req.status || '').replace(/_/g, ' '), M + COL_W, y, COL_W - 10);
      y += 40;

      label('Customer Company', M, y);
      value(req.cc_name ? `${req.cc_name}${req.cc_ref ? `  (${req.cc_ref})` : ''}` : 'Ã¢â‚¬â€', M, y, CONTENT_W);
      y += 40;

      label('Customer PO Number', M, y);
      value(req.customer_po_number || 'Ã¢â‚¬â€', M, y, COL_W - 10);
      label('Credit Application Ref.', M + COL_W, y);
      value(creditAppRef || 'Ã¢â‚¬â€', M + COL_W, y, COL_W - 10);
      y += 40;

      if (req.official_doc_reference) {
        label('Official Document Reference', M, y);
        doc.fillColor(NAVY).fontSize(11).font('Courier-Bold').text(req.official_doc_reference, M, y + 12, { width: CONTENT_W });
        y += 35;
      }

      if (req.closed_at) {
        label('Closure Date', M, y);
        const closedStr = (() => {
          try { return new Date(req.closed_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' }); }
          catch { return String(req.closed_at); }
        })();
        value(closedStr, M, y, CONTENT_W);
        y += 35;
      }

      // --- Message ---
      if (req.message) {
        y = Math.max(y, 200);
        label('Message / Notes', M, y);
        doc.fillColor('#111').fontSize(10).font('Helvetica').text(req.message, M, y + 12, { width: CONTENT_W });
        y += 30 + Math.ceil(req.message.length / 80) * 13;
      }

      // --- Items table ---
      y = Math.max(y, 260);
      doc.fillColor(NAVY).fontSize(10).font('Helvetica-Bold').text(`Request Items (${items.length})`, M, y);
      y += 18;

      const colX = [M, M + 30, M + 280, M + 380, M + 440];
      const colW = [30, 250, 100, 60, 105];
      const headerY = y;
      doc.rect(M, headerY, CONTENT_W, 18).fill(LIGHT_GRAY);
      doc.fillColor(NAVY).fontSize(8).font('Helvetica-Bold');
      doc.text('#', colX[0] + 4, headerY + 5, { width: colW[0] - 4 });
      doc.text('PRODUCT', colX[1] + 4, headerY + 5, { width: colW[1] - 8 });
      doc.text('SKU', colX[2] + 4, headerY + 5, { width: colW[2] - 8 });
      doc.text('QTY', colX[3] + 4, headerY + 5, { width: colW[3] - 8, align: 'right' });
      doc.text('NOTES', colX[4] + 4, headerY + 5, { width: colW[4] - 8 });
      y = headerY + 18;

      doc.fillColor('#111').fontSize(9).font('Helvetica');
      if (items.length === 0) {
        doc.rect(M, y, CONTENT_W, 22).fillColor('#fff').fill().strokeColor(BORDER).stroke();
        doc.fillColor(GRAY).text('No items in this request.', M + 8, y + 6, { width: CONTENT_W - 16 });
        y += 22;
      } else {
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          const rowH = 22;
          doc.rect(M, y, CONTENT_W, rowH).fillColor(i % 2 === 0 ? '#fafafa' : '#fff').fill().strokeColor(BORDER).stroke();
          doc.fillColor('#111').fontSize(9).font('Helvetica');
          doc.text(String(i + 1), colX[0] + 4, y + 7, { width: colW[0] - 4 });
          doc.text(String(it.product_name || ''), colX[1] + 4, y + 7, { width: colW[1] - 8 });
          doc.text(String(it.sku || ''), colX[2] + 4, y + 7, { width: colW[2] - 8 });
          doc.text(String(it.quantity || 0), colX[3] + 4, y + 7, { width: colW[3] - 8, align: 'right' });
          doc.text(String(it.notes || 'Ã¢â‚¬â€'), colX[4] + 4, y + 7, { width: colW[4] - 8 });
          y += rowH;
        }
      }

      // --- Footer note (authoritative source) ---
      y += 20;
      doc.fillColor(GRAY).fontSize(7).font('Helvetica-Oblique').text(
        'This document was generated by the SHANAN platform from authoritative server-side records.',
        M, y, { width: CONTENT_W }
      );

      // --- Signature & stamp areas (4 placeholders) ---
      // Force a new page if there's not enough vertical room for the 2x2 sign grid.
      const SIGN_BLOCK_H = 230;
      if (y + SIGN_BLOCK_H > 780) {
        doc.addPage();
        y = 60;
      } else {
        y += 30;
      }

      doc.fillColor(NAVY).fontSize(10).font('Helvetica-Bold').text('Authorized Signatures & Official Stamps', M, y);
      y += 18;
      doc.fillColor(GRAY).fontSize(7).font('Helvetica-Oblique').text(
        'Manual / physical signature and stamp areas. This PDF is NOT electronically signed and carries no legal signature validity.',
        M, y, { width: CONTENT_W }
      );
      y += 20;

      const boxW = (CONTENT_W - 20) / 2;
      const boxH = 95;
      const drawSignBox = (x: number, yy: number, title: string, hint: string) => {
        doc.rect(x, yy, boxW, boxH).fillColor('#fff').fill().strokeColor('#999').dash(2, { phase: 2 }).stroke().undash();
        doc.fillColor(NAVY).fontSize(9).font('Helvetica-Bold').text(title, x + 10, yy + 10, { width: boxW - 20 });
        doc.fillColor(GRAY).fontSize(7).font('Helvetica').text(hint, x + 10, yy + boxH - 18, { width: boxW - 20 });
      };

      // Row 1: SHANAN rep + SHANAN stamp
      drawSignBox(M, y, 'SHANAN Authorized Representative', 'Signature & Date');
      drawSignBox(M + boxW + 20, y, 'SHANAN Official Stamp', 'Stamp Area');
      y += boxH + 15;
      // Row 2: Customer rep + Customer stamp
      drawSignBox(M, y, 'Customer Authorized Representative', 'Signature & Date');
      drawSignBox(M + boxW + 20, y, 'Customer Official Stamp', 'Stamp Area');

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

console.log(`[shanan-api] Listening on http://localhost:${PORT}`);
console.log(`[shanan-api] Allowed CORS origins:`);
for (const o of ALLOWED_ORIGINS) console.log(`           - ${o}`);
console.log(`[shanan-api] Also allowing any preview-*.z.ai origin`);
