import postgres from 'postgres';
import PDFDocument from 'pdfkit';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';

// ============================================================
// SHANAN Engineering Knowledge Platform - Production Business API
// Vercel catch-all /api/[[...route]].ts
// Ports legacy/server.ts business endpoints onto Supabase Postgres.
// Vercel gives precedence to more specific route files
// (auth/**, products.ts, products/[id].ts, categories.ts,
//  brands.ts, health.ts); everything else lands here.
// Contract provenance: legacy/api/server.ts line-for-line.
// ============================================================

// ------------------------------------------------------------
// Lazy Postgres client (avoid top-level throw if env missing)
// ------------------------------------------------------------
let _sql: any = null;
function sql(): any {
  if (!_sql) {
    const url = process.env.SUPABASE_DB_URL;
    if (!url) throw new Error('SUPABASE_DB_URL is required');
    _sql = postgres(url, { max: 5, connect_timeout: 10, prepare: false, ssl: { ca: process.env.SUPABASE_SSL_CA, rejectUnauthorized: true } });
  }
  return _sql;
}

// ------------------------------------------------------------
// Response helpers (legacy parity)
// ------------------------------------------------------------
const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "style-src-attr 'unsafe-inline'; img-src 'self' data: https://images.pexels.com; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'; form-action 'self'",
};

function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST, GET, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    ...SECURITY_HEADERS,
  };
  if (origin) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function jsonResponse(data: unknown, status = 200, origin: string | null = null): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...corsHeaders(origin) },
  });
}

function errorResponse(message: string, status: number, origin: string | null = null, extra: Record<string, unknown> = {}) {
  return jsonResponse({ error: message, ...extra }, status, origin);
}

async function tryParseJson(req: Request): Promise<{ ok: true; body: any } | { ok: false }> {
  try {
    return { ok: true, body: await req.json() };
  } catch {
    return { ok: false };
  }
}

// ------------------------------------------------------------
// Authentication infrastructure (legacy parity; same format as
// api/auth/[[...route]].ts: pbkdf2$100000$<base64>)
// ------------------------------------------------------------
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;
const PBKDF2_ITERATIONS = 100000;
const PBKDF2_HASH = 'SHA-256';

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const hash = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: PBKDF2_HASH }, keyMaterial, 256);
  const combined = new Uint8Array(salt.length + hash.byteLength);
  combined.set(salt, 0);
  combined.set(new Uint8Array(hash), salt.length);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${btoa(String.fromCharCode(...combined))}`;
}

async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (!storedHash || !storedHash.startsWith('pbkdf2$')) return false;
  const parts = storedHash.split('$');
  if (parts.length !== 3) return false;
  const iterations = Number.parseInt(parts[1], 10);
  if (!Number.isFinite(iterations)) return false;
  let combinedBytes: Uint8Array;
  try {
    combinedBytes = Uint8Array.from(atob(parts[2]), (c) => c.charCodeAt(0));
  } catch {
    return false;
  }
  if (combinedBytes.length < 16) return false;
  const salt = combinedBytes.slice(0, 16);
  const expected = combinedBytes.slice(16);
  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const hash = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: PBKDF2_HASH }, keyMaterial, 256);
  return constantTimeEqual(new Uint8Array(hash), expected);
}

function generateSessionToken(): string {
  return crypto.randomUUID() + '-' + crypto.randomUUID();
}

function generateId(): string {
  return crypto.randomUUID();
}

function safeUserInfo(user: any) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    userType: user.user_type,
    role: user.role,
    companyId: user.company_id,
    supplierId: user.supplier_id,
    isActive: Boolean(user.is_active),
  };
}

function bearerToken(req: Request): string | null {
  const header = req.headers.get('Authorization');
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token || null;
}

// async auth primitives over postgres.js
async function getAuthenticatedUser(req: Request): Promise<any | null> {
  const token = bearerToken(req);
  if (!token) return null;
  try {
    const rows = await sql()`
      SELECT u.id, u.name, u.email, u.user_type, u.role, u.company_id, u.supplier_id, u.is_active
      FROM user_sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token = ${token} AND s.expires_at > NOW()
      LIMIT 1`;
    if (!rows[0]) {
      await sql()`DELETE FROM user_sessions WHERE token = ${token}`;
      return null;
    }
    const user = rows[0];
    if (!user.is_active) {
      await sql()`DELETE FROM user_sessions WHERE token = ${token}`;
      return null;
    }
    return user;
  } catch (err) {
    console.error('[shanan-api] getAuthenticatedUser failed:', err);
    return null;
  }
}

type AuthResult =
  | { user: any; error: null }
  | { user: null; error: Response };

async function requireAuth(req: Request, origin: string | null): Promise<AuthResult> {
  const user = await getAuthenticatedUser(req);
  if (!user) return { user: null, error: errorResponse('Authentication required', 401, origin) };
  return { user, error: null };
}

async function requireInternal(req: Request, origin: string | null): Promise<AuthResult> {
  const result = await requireAuth(req, origin);
  if (result.error) return result;
  if (result.user.user_type !== 'internal') {
    return { user: null, error: errorResponse('Forbidden: internal access required', 403, origin) };
  }
  return result;
}

async function requireInternalRole(req: Request, origin: string | null, roles: string[]): Promise<AuthResult> {
  const result = await requireInternal(req, origin);
  if (result.error) return result;
  if (!roles.includes(result.user.role)) {
    return { user: null, error: errorResponse(`Forbidden: requires one of roles: ${roles.join(', ')}`, 403, origin) };
  }
  return result;
}

type SupplierAuthResult =
  | { user: any; supplierId: string; error: null }
  | { user: null; supplierId: null; error: Response };

async function requireSupplier(req: Request, origin: string | null): Promise<SupplierAuthResult> {
  const result = await requireAuth(req, origin);
  if (result.error) return { user: null, supplierId: null, error: result.error };
  if (result.user.user_type !== 'supplier') {
    return { user: null, supplierId: null, error: errorResponse('Forbidden: supplier access required', 403, origin) };
  }
  if (!result.user.supplier_id) {
    return { user: null, supplierId: null, error: errorResponse('Forbidden: supplier account not linked', 403, origin) };
  }
  const rows = await sql()`SELECT id, status FROM suppliers WHERE id = ${result.user.supplier_id} LIMIT 1`;
  const supplier = rows[0] as { id: string; status: string } | undefined;
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

async function requireSupplierAnyStatus(req: Request, origin: string | null): Promise<SupplierAuthResult> {
  const result = await requireAuth(req, origin);
  if (result.error) return { user: null, supplierId: null, error: result.error };
  if (result.user.user_type !== 'supplier') {
    return { user: null, supplierId: null, error: errorResponse('Forbidden: supplier access required', 403, origin) };
  }
  if (!result.user.supplier_id) {
    return { user: null, supplierId: null, error: errorResponse('Forbidden: supplier account not linked', 403, origin) };
  }
  const rows = await sql()`SELECT id, status FROM suppliers WHERE id = ${result.user.supplier_id} LIMIT 1`;
  const supplier = rows[0] as { id: string; status: string } | undefined;
  if (!supplier) {
    return { user: null, supplierId: null, error: errorResponse('Supplier account not found', 403, origin) };
  }
  if (supplier.status === 'suspended' || supplier.status === 'terminated') {
    return { user: null, supplierId: null, error: errorResponse('Supplier account is not active', 403, origin) };
  }
  return { user: result.user, supplierId: result.user.supplier_id, error: null };
}

async function requireNotSupplier(auth: any, origin: string | null): Promise<Response | null> {
  if (auth.user_type === 'supplier') {
    return errorResponse('Forbidden: suppliers cannot access this resource', 403, origin);
  }
  return null;
}

// ------------------------------------------------------------
// Reference generators (legacy parity)
// ------------------------------------------------------------
// SHN-YYYYMMDD-XXXXXX (supply requests)
function generateReference(): string {
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const random = Math.random().toString(16).slice(2, 8).toUpperCase().padStart(6, '0');
  return `SHN-${ymd}-${random}`;
}
// SUP-YYYY-NNNNNN (suppliers)
function generateSupplierReference(): string {
  const year = new Date().getFullYear();
  const random = Math.random().toString(36).slice(2, 8).toUpperCase().padStart(6, '0');
  return `SUP-${year}-${random}`;
}
// AGR-YYYYMMDD-XXXXXX (agreements)
function generateAgreementNumber(): string {
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const random = Math.random().toString(36).slice(2, 8).toUpperCase().padStart(6, '0');
  return `AGR-${ymd}-${random}`;
}
// RFQ-YYYYMMDD-XXXXXX
function generateRfqReference(): string {
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const random = Math.random().toString(36).slice(2, 8).toUpperCase().padStart(6, '0');
  return `RFQ-${ymd}-${random}`;
}
// DEC-YYYYMMDD-XXXXXX (sourcing decisions)
function generateSourcingDecisionReference(): string {
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const random = Math.random().toString(36).slice(2, 8).toUpperCase().padStart(6, '0');
  return `DEC-${ymd}-${random}`;
}
// PRR-YYYYMMDD-XXXXXX (purchase requests)
function generatePrReference(): string {
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const random = Math.random().toString(36).slice(2, 8).toUpperCase().padStart(6, '0');
  return `PRR-${ymd}-${random}`;
}
// PO-YYYYMMDD-XXXXXX (purchase orders)
function generatePoReference(): string {
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const random = Math.random().toString(36).slice(2, 8).toUpperCase().padStart(6, '0');
  return `PO-${ymd}-${random}`;
}
// CUS-YYYY-NNNNNN (customers)
function generateCustomerReference(): string {
  const year = new Date().getFullYear();
  const random = Math.random().toString(36).slice(2, 8).toUpperCase().padStart(6, '0');
  return `CUS-${year}-${random}`;
}
// CR-YYYYMMDD-XXXXXX (credit applications)
function generateCreditApplicationNumber(): string {
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const random = Math.random().toString(36).slice(2, 8).toUpperCase().padStart(6, '0');
  return `CR-${ymd}-${random}`;
}

// ------------------------------------------------------------
// G5: Storage abstraction (legacy/api/storage.ts parity).
// Local provider uses the Node filesystem (dev / ephemeral /tmp on
// serverless); S3 provider uses pre-signed SigV4 fetch. Binaries are
// never stored in Postgres — only metadata lands in product_images /
// product_documents.
// ------------------------------------------------------------
const STORAGE_BASE_PATH = process.env.STORAGE_BASE_PATH || '/tmp/shanan-storage';
const STORAGE_PUBLIC_URL = process.env.STORAGE_PUBLIC_URL || '';

const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  dwg: 'application/acad',
};

function isValidStorageKey(key: string): boolean {
  if (key.includes('..') || key.startsWith('/')) return false;
  return /^[a-zA-Z0-9._\-\/]+$/.test(key);
}

function generateImageStorageKey(productId: string, filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || 'jpg';
  const paddedIndex = String(Date.now() % 1000).padStart(3, '0');
  const safeName = filename.replace(/[^a-zA-Z0-9.-]/g, '_').slice(0, 50);
  return `products/${productId}/${paddedIndex}-${Date.now()}-${safeName}`;
}

function generateDocumentStorageKey(productId: string, filename: string): string {
  const safeName = filename.replace(/[^a-zA-Z0-9.-]/g, '_').slice(0, 50);
  return `documents/${productId}/${Date.now()}-${safeName}`;
}

function storagePublicUrl(key: string, provider: string): string | null {
  if (STORAGE_PUBLIC_URL) return `${STORAGE_PUBLIC_URL.replace(/\/$/, '')}/${key}`;
  if (provider === 's3') {
    if (process.env.S3_FORCE_PATH_STYLE === 'true' && process.env.S3_ENDPOINT && process.env.S3_BUCKET) {
      return `${process.env.S3_ENDPOINT.replace(/\/$/, '')}/${process.env.S3_BUCKET}/${key}`;
    }
    return `https://${process.env.S3_BUCKET}.s3.${process.env.S3_REGION || 'us-east-1'}.amazonaws.com/${key}`;
  }
  return `/api/storage/${key}`;
}

async function s3SignRequest(method: string, key: string, body: Uint8Array | null, contentType: string): Promise<{ url: string; headers: Record<string, string> }> {
  const forcePathStyle = process.env.S3_FORCE_PATH_STYLE === 'true';
  const bucket = process.env.S3_BUCKET || '';
  const region = process.env.S3_REGION || 'us-east-1';
  const accessKey = process.env.S3_ACCESS_KEY || '';
  const secretKey = process.env.S3_SECRET_KEY || '';
  const endpoint = process.env.S3_ENDPOINT || '';
  const host = forcePathStyle
    ? endpoint.replace(/^https?:\/\//, '').replace(/\/$/, '')
    : `${bucket}.s3.${region}.amazonaws.com`;
  const protocol = endpoint.startsWith('http://') ? 'http:' : 'https:';
  const urlPath = forcePathStyle ? `/${bucket}/${key}` : `/${key}`;
  const fullUrl = `${protocol}//${host}${urlPath}`;

  const nowIso = new Date().toISOString().replace(/[:.]/g, '').slice(0, -1) + 'Z';
  const dateStamp = nowIso.slice(0, 8);
  const payloadHash = body ? createHash('sha256').update(Buffer.from(body)).digest('hex') : createHash('sha256').digest('hex');
  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${nowIso}\n`;
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = `${method}\n${urlPath}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${nowIso}\n${credentialScope}\n${createHash('sha256').update(canonicalRequest).digest('hex')}`;

  const hmac = async (keyData: Buffer, data: string): Promise<Buffer> => {
    const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return Buffer.from(await crypto.subtle.sign('HMAC', cryptoKey, Buffer.from(data, 'utf8')));
  };
  const kDate = await hmac(Buffer.from(`AWS4${secretKey}`, 'utf8'), dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, 's3');
  const kSigning = await hmac(kService, 'aws4_request');
  const signature = await hmac(kSigning, stringToSign);
  return {
    url: fullUrl,
    headers: {
      host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': nowIso,
      Authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature.toString('hex')}`,
      ...(contentType && method !== 'GET' ? { 'Content-Type': contentType } : {}),
    },
  };
}

async function storageSave(data: Uint8Array, key: string, mimeType: string): Promise<{ storageProvider: string; storageKey: string; publicUrl: string | null; filename: string; mimeType: string; fileSize: number; checksum: string }> {
  const buf = Buffer.from(data);
  const checksum = createHash('sha256').update(buf).digest('hex');
  const filename = key.split('/').pop() || key;
  if (process.env.STORAGE_PROVIDER === 's3' && process.env.S3_BUCKET && process.env.S3_ACCESS_KEY && process.env.S3_SECRET_KEY) {
    const signed = await s3SignRequest('PUT', key, buf, mimeType);
    const res = await fetch(signed.url, { method: 'PUT', headers: { ...signed.headers, 'Content-Length': String(buf.length) }, body: buf });
    if (!res.ok) throw new Error(`S3 upload failed (${res.status}): ${await res.text()}`);
    return { storageProvider: 's3', storageKey: key, publicUrl: storagePublicUrl(key, 's3'), filename, mimeType, fileSize: buf.length, checksum };
  }
  const fullPath = join(STORAGE_BASE_PATH, key);
  const dir = dirname(fullPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(fullPath, buf);
  return { storageProvider: 'local', storageKey: key, publicUrl: storagePublicUrl(key, 'local'), filename, mimeType, fileSize: buf.length, checksum };
}

async function storageExists(key: string): Promise<boolean> {
  if (process.env.STORAGE_PROVIDER === 's3' && process.env.S3_BUCKET && process.env.S3_ACCESS_KEY && process.env.S3_SECRET_KEY) {
    try {
      const signed = await s3SignRequest('HEAD', key, null, '');
      const res = await fetch(signed.url, { method: 'HEAD', headers: signed.headers });
      return res.ok;
    } catch {
      return false;
    }
  }
  return existsSync(join(STORAGE_BASE_PATH, key));
}

async function storageDelete(key: string): Promise<void> {
  if (process.env.STORAGE_PROVIDER === 's3' && process.env.S3_BUCKET && process.env.S3_ACCESS_KEY && process.env.S3_SECRET_KEY) {
    try {
      const signed = await s3SignRequest('DELETE', key, null, '');
      await fetch(signed.url, { method: 'DELETE', headers: signed.headers });
    } catch {
      // ignore
    }
    return;
  }
  const fullPath = join(STORAGE_BASE_PATH, key);
  if (existsSync(fullPath)) unlinkSync(fullPath);
}

function storageLoad(key: string): { data: Buffer; mimeType: string } | null {
  const fullPath = join(STORAGE_BASE_PATH, key);
  if (!existsSync(fullPath)) return null;
  const data = readFileSync(fullPath);
  const ext = key.split('.').pop()?.toLowerCase() || '';
  const mimeType = MIME_BY_EXT[ext] || 'application/octet-stream';
  return { data, mimeType };
}

function assertStoragePathContainment(key: string): boolean {
  const resolvedBase = resolve(STORAGE_BASE_PATH);
  const resolvedPath = resolve(join(resolvedBase, key));
  return resolvedPath === resolvedBase || resolvedPath.startsWith(resolvedBase + sep);
}

// ------------------------------------------------------------
// G5: Bulk import helpers (legacy/api/importer.ts parity)
// ------------------------------------------------------------
interface ImportResult {
  jobId: string;
  status: 'completed' | 'partial' | 'failed';
  total: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: string[];
}

function importRowError(i: number, e: unknown): string {
  return `Row ${i + 1}: ${e instanceof Error ? e.message : String(e)}`;
}

async function importProductsInto(items: any[]): Promise<ImportResult> {
  const db = sql();
  const jobId = crypto.randomUUID();
  const errors: string[] = [];
  let created = 0, updated = 0, skipped = 0, failed = 0;
  const now = new Date().toISOString();
  await db`INSERT INTO import_jobs (id, job_type, status, total_rows, started_at, created_at) VALUES (${jobId}, 'products', 'running', ${items.length}, ${now}, ${now})`;
  for (let i = 0; i < items.length; i++) {
    try {
      const item = items[i];
      if (!item.sku || !item.productCode || !item.nameEn) {
        errors.push(`Row ${i + 1}: missing required field (sku, productCode, or nameEn)`);
        failed++;
        continue;
      }
      const slug = item.slug || item.sku.toLowerCase().replace(/[^a-z0-9-]/g, '-');
      const productId = item.id || `prod-${item.sku}`;
      const availability = item.availability || 'in_stock';
      const status = item.status || 'active';
      const isSample = item.isSampleData ? 1 : 0;
      const existing = await db`SELECT id FROM products WHERE sku = ${item.sku} LIMIT 1`;
      if (existing[0]) {
        await db`UPDATE products SET product_code = ${item.productCode}, slug = ${slug}, name_en = ${item.nameEn}, name_ar = ${item.nameAr || null}, description_en = ${item.descriptionEn || null}, description_ar = ${item.descriptionAr || null}, category_id = ${item.categoryId || null}, brand_id = ${item.brandId || null}, manufacturer = ${item.manufacturer || null}, availability = ${availability}, status = ${status}, updated_at = ${now} WHERE sku = ${item.sku}`;
        updated++;
      } else {
        await db`INSERT INTO products (id, sku, product_code, slug, name_en, name_ar, description_en, description_ar, category_id, brand_id, manufacturer, availability, status, is_sample_data, created_at, updated_at) VALUES (${productId}, ${item.sku}, ${item.productCode}, ${slug}, ${item.nameEn}, ${item.nameAr || null}, ${item.descriptionEn || null}, ${item.descriptionAr || null}, ${item.categoryId || null}, ${item.brandId || null}, ${item.manufacturer || null}, ${availability}, ${status}, ${isSample}, ${now}, ${now})`;
        created++;
      }
    } catch (e) {
      errors.push(importRowError(i, e));
      failed++;
    }
  }
  const status = failed === 0 ? 'completed' : created > 0 ? 'partial' : 'failed';
  await db`UPDATE import_jobs SET status = ${status}, created_count = ${created}, updated_count = ${updated}, skipped_count = ${skipped}, failed_count = ${failed}, error_log = ${JSON.stringify(errors.slice(0, 100))}, completed_at = ${now} WHERE id = ${jobId}`;
  return { jobId, status, total: items.length, created, updated, skipped, failed, errors };
}

async function importCategoriesInto(items: any[]): Promise<ImportResult> {
  const db = sql();
  const jobId = crypto.randomUUID();
  const errors: string[] = [];
  let created = 0, updated = 0, skipped = 0, failed = 0;
  const now = new Date().toISOString();
  await db`INSERT INTO import_jobs (id, job_type, status, total_rows, started_at, created_at) VALUES (${jobId}, 'categories', 'running', ${items.length}, ${now}, ${now})`;
  for (let i = 0; i < items.length; i++) {
    try {
      const item = items[i];
      if (!item.slug || !item.nameEn) {
        errors.push(`Row ${i + 1}: missing required field (slug or nameEn)`);
        failed++;
        continue;
      }
      const catId = item.id || `cat-${item.slug}`;
      const existing = await db`SELECT id FROM categories WHERE slug = ${item.slug} LIMIT 1`;
      if (existing[0]) {
        await db`UPDATE categories SET name_en = ${item.nameEn}, name_ar = ${item.nameAr || null}, description_en = ${item.descriptionEn || null}, description_ar = ${item.descriptionAr || null}, image_url = ${item.imageUrl || null}, sort_order = ${item.sortOrder || 0}, updated_at = ${now} WHERE slug = ${item.slug}`;
        updated++;
      } else {
        await db`INSERT INTO categories (id, slug, name_en, name_ar, description_en, description_ar, parent_id, image_url, sort_order, is_active, created_at, updated_at) VALUES (${catId}, ${item.slug}, ${item.nameEn}, ${item.nameAr || null}, ${item.descriptionEn || null}, ${item.descriptionAr || null}, ${item.parentId || null}, ${item.imageUrl || null}, ${item.sortOrder || 0}, ${item.isActive !== false ? 1 : 0}, ${now}, ${now})`;
        created++;
      }
    } catch (e) {
      errors.push(importRowError(i, e));
      failed++;
    }
  }
  const status = failed === 0 ? 'completed' : created > 0 ? 'partial' : 'failed';
  await db`UPDATE import_jobs SET status = ${status}, created_count = ${created}, updated_count = ${updated}, skipped_count = ${skipped}, failed_count = ${failed}, error_log = ${JSON.stringify(errors.slice(0, 100))}, completed_at = ${now} WHERE id = ${jobId}`;
  return { jobId, status, total: items.length, created, updated, skipped, failed, errors };
}

async function importBrandsInto(items: any[]): Promise<ImportResult> {
  const db = sql();
  const jobId = crypto.randomUUID();
  const errors: string[] = [];
  let created = 0, updated = 0, skipped = 0, failed = 0;
  const now = new Date().toISOString();
  await db`INSERT INTO import_jobs (id, job_type, status, total_rows, started_at, created_at) VALUES (${jobId}, 'brands', 'running', ${items.length}, ${now}, ${now})`;
  for (let i = 0; i < items.length; i++) {
    try {
      const item = items[i];
      if (!item.slug || !item.name) {
        errors.push(`Row ${i + 1}: missing required field (slug or name)`);
        failed++;
        continue;
      }
      const brandId = item.id || `brand-${item.slug}`;
      const existing = await db`SELECT id FROM brands WHERE slug = ${item.slug} LIMIT 1`;
      if (existing[0]) {
        await db`UPDATE brands SET name = ${item.name}, name_ar = ${item.nameAr || null}, description_en = ${item.descriptionEn || null}, description_ar = ${item.descriptionAr || null}, logo_url = ${item.logoUrl || null}, country = ${item.country || null}, updated_at = ${now} WHERE slug = ${item.slug}`;
        updated++;
      } else {
        await db`INSERT INTO brands (id, slug, name, name_ar, description_en, description_ar, logo_url, country, is_active, created_at, updated_at) VALUES (${brandId}, ${item.slug}, ${item.name}, ${item.nameAr || null}, ${item.descriptionEn || null}, ${item.descriptionAr || null}, ${item.logoUrl || null}, ${item.country || null}, ${item.isActive !== false ? 1 : 0}, ${now}, ${now})`;
        created++;
      }
    } catch (e) {
      errors.push(importRowError(i, e));
      failed++;
    }
  }
  const status = failed === 0 ? 'completed' : created > 0 ? 'partial' : 'failed';
  await db`UPDATE import_jobs SET status = ${status}, created_count = ${created}, updated_count = ${updated}, skipped_count = ${skipped}, failed_count = ${failed}, error_log = ${JSON.stringify(errors.slice(0, 100))}, completed_at = ${now} WHERE id = ${jobId}`;
  return { jobId, status, total: items.length, created, updated, skipped, failed, errors };
}

async function importImagesInto(items: any[]): Promise<ImportResult> {
  const db = sql();
  const jobId = crypto.randomUUID();
  const errors: string[] = [];
  let created = 0, updated = 0, skipped = 0, failed = 0;
  const now = new Date().toISOString();
  await db`INSERT INTO import_jobs (id, job_type, status, total_rows, started_at, created_at) VALUES (${jobId}, 'images', 'running', ${items.length}, ${now}, ${now})`;
  for (let i = 0; i < items.length; i++) {
    try {
      const item = items[i];
      if (!item.productId || !item.storageKey) {
        errors.push(`Row ${i + 1}: missing required field (productId or storageKey)`);
        failed++;
        continue;
      }
      const product = await db`SELECT id FROM products WHERE id = ${item.productId} OR sku = ${item.productId} LIMIT 1`;
      if (!product[0]) {
        errors.push(`Row ${i + 1}: product not found (productId: ${item.productId})`);
        failed++;
        continue;
      }
      const imageId = item.id || crypto.randomUUID();
      const existing = await db`SELECT id FROM product_images WHERE product_id = ${product[0].id} AND storage_key = ${item.storageKey} LIMIT 1`;
      if (existing[0]) {
        await db`UPDATE product_images SET public_url = ${item.publicUrl || null}, filename = ${item.filename || String(item.storageKey).split('/').pop() || `image-${i}`}, mime_type = ${item.mimeType || 'image/jpeg'}, file_size = ${item.fileSize || null}, width = ${item.width || null}, height = ${item.height || null}, alt_en = ${item.altEn || null}, alt_ar = ${item.altAr || null}, is_primary = ${item.isPrimary ? 1 : 0}, sort_order = ${item.sortOrder || 0}, updated_at = ${now} WHERE product_id = ${product[0].id} AND storage_key = ${item.storageKey}`;
        updated++;
      } else {
        await db`INSERT INTO product_images (id, product_id, storage_provider, storage_key, public_url, filename, mime_type, file_size, width, height, checksum, alt_en, alt_ar, is_primary, sort_order, created_at, updated_at) VALUES (${imageId}, ${product[0].id}, ${item.storageProvider || 'local'}, ${item.storageKey}, ${item.publicUrl || null}, ${item.filename || String(item.storageKey).split('/').pop() || `image-${i}`}, ${item.mimeType || 'image/jpeg'}, ${item.fileSize || null}, ${item.width || null}, ${item.height || null}, ${item.checksum || null}, ${item.altEn || null}, ${item.altAr || null}, ${item.isPrimary ? 1 : 0}, ${item.sortOrder || 0}, ${now}, ${now})`;
        created++;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('UNIQUE') || msg.includes('constraint')) skipped++;
      else {
        errors.push(importRowError(i, e));
        failed++;
      }
    }
  }
  const status = failed === 0 ? 'completed' : created > 0 ? 'partial' : 'failed';
  await db`UPDATE import_jobs SET status = ${status}, created_count = ${created}, updated_count = ${updated}, skipped_count = ${skipped}, failed_count = ${failed}, error_log = ${JSON.stringify(errors.slice(0, 100))}, completed_at = ${now} WHERE id = ${jobId}`;
  return { jobId, status, total: items.length, created, updated, skipped, failed, errors };
}

async function importSpecsInto(items: any[]): Promise<ImportResult> {
  const db = sql();
  const jobId = crypto.randomUUID();
  const errors: string[] = [];
  let created = 0, failed = 0;
  const now = new Date().toISOString();
  await db`INSERT INTO import_jobs (id, job_type, status, total_rows, started_at, created_at) VALUES (${jobId}, 'specifications', 'running', ${items.length}, ${now}, ${now})`;
  for (let i = 0; i < items.length; i++) {
    try {
      const item = items[i];
      if (!item.productId || !item.labelEn || !item.valueEn) {
        errors.push(`Row ${i + 1}: missing required field`);
        failed++;
        continue;
      }
      const product = await db`SELECT id FROM products WHERE id = ${item.productId} OR sku = ${item.productId} LIMIT 1`;
      if (!product[0]) {
        errors.push(`Row ${i + 1}: product not found`);
        failed++;
        continue;
      }
      await db`INSERT INTO product_specifications (id, product_id, label_en, label_ar, value_en, value_ar, group_en, group_ar, sort_order, created_at) VALUES (${crypto.randomUUID()}, ${product[0].id}, ${item.labelEn}, ${item.labelAr || null}, ${item.valueEn}, ${item.valueAr || null}, ${item.groupEn || null}, ${item.groupAr || null}, ${item.sortOrder || 0}, ${now})`;
      created++;
    } catch (e) {
      errors.push(importRowError(i, e));
      failed++;
    }
  }
  const status = failed === 0 ? 'completed' : created > 0 ? 'partial' : 'failed';
  await db`UPDATE import_jobs SET status = ${status}, created_count = ${created}, updated_count = 0, skipped_count = 0, failed_count = ${failed}, error_log = ${JSON.stringify(errors.slice(0, 100))}, completed_at = ${now} WHERE id = ${jobId}`;
  return { jobId, status, total: items.length, created, updated: 0, skipped: 0, failed, errors };
}

async function importTechMetaInto(items: any[]): Promise<ImportResult> {
  const db = sql();
  const jobId = crypto.randomUUID();
  const errors: string[] = [];
  let created = 0, failed = 0;
  const now = new Date().toISOString();
  await db`INSERT INTO import_jobs (id, job_type, status, total_rows, started_at, created_at) VALUES (${jobId}, 'technical_metadata', 'running', ${items.length}, ${now}, ${now})`;
  for (let i = 0; i < items.length; i++) {
    try {
      const item = items[i];
      if (!item.productId || !item.keyEn || !item.value) {
        errors.push(`Row ${i + 1}: missing required field`);
        failed++;
        continue;
      }
      const product = await db`SELECT id FROM products WHERE id = ${item.productId} OR sku = ${item.productId} LIMIT 1`;
      if (!product[0]) {
        errors.push(`Row ${i + 1}: product not found`);
        failed++;
        continue;
      }
      await db`INSERT INTO product_technical_metadata (id, product_id, key_en, key_ar, value, unit, sort_order, created_at) VALUES (${crypto.randomUUID()}, ${product[0].id}, ${item.keyEn}, ${item.keyAr || null}, ${item.value}, ${item.unit || null}, ${item.sortOrder || 0}, ${now})`;
      created++;
    } catch (e) {
      errors.push(importRowError(i, e));
      failed++;
    }
  }
  const status = failed === 0 ? 'completed' : created > 0 ? 'partial' : 'failed';
  await db`UPDATE import_jobs SET status = ${status}, created_count = ${created}, updated_count = 0, skipped_count = 0, failed_count = ${failed}, error_log = ${JSON.stringify(errors.slice(0, 100))}, completed_at = ${now} WHERE id = ${jobId}`;
  return { jobId, status, total: items.length, created, updated: 0, skipped: 0, failed, errors };
}

async function importDocumentsInto(items: any[]): Promise<ImportResult> {
  const db = sql();
  const jobId = crypto.randomUUID();
  const errors: string[] = [];
  let created = 0, failed = 0;
  const now = new Date().toISOString();
  await db`INSERT INTO import_jobs (id, job_type, status, total_rows, started_at, created_at) VALUES (${jobId}, 'documents', 'running', ${items.length}, ${now}, ${now})`;
  for (let i = 0; i < items.length; i++) {
    try {
      const item = items[i];
      if (!item.productId || !item.titleEn || !item.storageKey) {
        errors.push(`Row ${i + 1}: missing required field`);
        failed++;
        continue;
      }
      const product = await db`SELECT id FROM products WHERE id = ${item.productId} OR sku = ${item.productId} LIMIT 1`;
      if (!product[0]) {
        errors.push(`Row ${i + 1}: product not found`);
        failed++;
        continue;
      }
      await db`INSERT INTO product_documents (id, product_id, title_en, title_ar, storage_provider, storage_key, public_url, filename, file_type, file_size, mime_type, sort_order, created_at) VALUES (${crypto.randomUUID()}, ${product[0].id}, ${item.titleEn}, ${item.titleAr || null}, ${item.storageProvider || 'local'}, ${item.storageKey}, ${item.publicUrl || null}, ${item.filename || String(item.storageKey).split('/').pop() || `doc-${i}`}, ${item.fileType || 'other'}, ${item.fileSize || null}, ${item.mimeType || null}, ${item.sortOrder || 0}, ${now})`;
      created++;
    } catch (e) {
      errors.push(importRowError(i, e));
      failed++;
    }
  }
  const status = failed === 0 ? 'completed' : created > 0 ? 'partial' : 'failed';
  await db`UPDATE import_jobs SET status = ${status}, created_count = ${created}, updated_count = 0, skipped_count = 0, failed_count = ${failed}, error_log = ${JSON.stringify(errors.slice(0, 100))}, completed_at = ${now} WHERE id = ${jobId}`;
  return { jobId, status, total: items.length, created, updated: 0, skipped: 0, failed, errors };
}

// ------------------------------------------------------------
// G5: Seed helper (legacy/api/seed.ts parity, idempotent)
// ------------------------------------------------------------
async function seedProductMasterInto(): Promise<{ categories: number; brands: number; products: number; images: number; specs: number; techMeta: number }> {
  const db = sql();
  const now = new Date().toISOString();
  let categoriesCreated = 0, brandsCreated = 0, productsCreated = 0, imagesCreated = 0, specsCreated = 0, techMetaCreated = 0;

  const categories = [
    { id: 'cat-001', slug: 'fasteners', nameEn: 'Fasteners', nameAr: 'تثبيتات', descEn: 'Bolts, screws, nuts, washers, and rivets.', descAr: 'براغي، مسامير، صواميل، حلقات، ومسامير برشام.' },
    { id: 'cat-002', slug: 'bearings', nameEn: 'Bearings', nameAr: 'محامل', descEn: 'Ball bearings, roller bearings, and bearing units.', descAr: 'محامل كروية، محامل أسطوانية، ووحدات محامل.' },
    { id: 'cat-003', slug: 'power-transmission', nameEn: 'Power Transmission', nameAr: 'نقل الحركة', descEn: 'Belts, pulleys, chains, sprockets, and couplings.', descAr: 'أحزمة، بكرات، سلاسل، مسننات، ووصلات.' },
    { id: 'cat-004', slug: 'pneumatics-hydraulics', nameEn: 'Pneumatics & Hydraulics', nameAr: 'هوائية وهيدروليكية', descEn: 'Cylinders, valves, fittings, and hoses.', descAr: 'أسطوانات، صمامات، وصلات، وخراطيم.' },
    { id: 'cat-005', slug: 'electrical', nameEn: 'Electrical Components', nameAr: 'مكونات كهربائية', descEn: 'Contactors, relays, switches, and circuit breakers.', descAr: 'كونتاكتورات، مرحلات، مفاتيح، وقواطع دوائر.' },
    { id: 'cat-006', slug: 'tools', nameEn: 'Industrial Tools', nameAr: 'أدوات صناعية', descEn: 'Hand tools, power tools, and cutting tools.', descAr: 'أدوات يدوية، أدوات كهربائية، وأدوات قطع.' },
    { id: 'cat-007', slug: 'safety', nameEn: 'Safety & PPE', nameAr: 'السلامة ومعدات الوقاية', descEn: 'Personal protective equipment and safety gear.', descAr: 'معدات الوقاية الشخصية ومعدات السلامة.' },
    { id: 'cat-008', slug: 'plumbing-valves', nameEn: 'Plumbing & Valves', nameAr: 'سباكة وصمامات', descEn: 'Pipes, fittings, valves, and flanges.', descAr: 'أنابيب، وصلات، صمامات، وفلنجات.' },
  ];
  for (const c of categories) {
    const existing = await db`SELECT id FROM categories WHERE slug = ${c.slug} LIMIT 1`;
    if (!existing[0]) {
      await db`INSERT INTO categories (id, slug, name_en, name_ar, description_en, description_ar, sort_order, is_active, created_at, updated_at) VALUES (${c.id}, ${c.slug}, ${c.nameEn}, ${c.nameAr}, ${c.descEn}, ${c.descAr}, ${categoriesCreated}, 1, ${now}, ${now})`;
      categoriesCreated++;
    }
  }

  const brands = [
    { id: 'brand-skf', slug: 'skf', name: 'SKF', nameAr: 'SKF', descEn: 'Bearings and power transmission solutions.', country: 'Sweden' },
    { id: 'brand-bosch', slug: 'bosch', name: 'Bosch', nameAr: 'بوش', descEn: 'Industrial tools and electrical components.', country: 'Germany' },
    { id: 'brand-festo', slug: 'festo', name: 'Festo', nameAr: 'فيستو', descEn: 'Pneumatic and automation solutions.', country: 'Germany' },
    { id: 'brand-3m', slug: '3m', name: '3M', nameAr: '3M', descEn: 'Safety equipment and industrial supplies.', country: 'USA' },
    { id: 'brand-parker', slug: 'parker', name: 'Parker', nameAr: 'باركر', descEn: 'Hydraulic and pneumatic components.', country: 'USA' },
  ];
  for (const b of brands) {
    const existing = await db`SELECT id FROM brands WHERE slug = ${b.slug} LIMIT 1`;
    if (!existing[0]) {
      await db`INSERT INTO brands (id, slug, name, name_ar, description_en, country, is_active, created_at, updated_at) VALUES (${b.id}, ${b.slug}, ${b.name}, ${b.nameAr}, ${b.descEn}, ${b.country}, 1, ${now}, ${now})`;
      brandsCreated++;
    }
  }

  const products = [
    { id: 'prod-00001', sku: 'SHN-SKU-00001', code: 'SHN-PC-00001', slug: 'deep-groove-ball-bearing-6201', nameEn: 'Deep Groove Ball Bearing 6201', nameAr: 'محمل كروي عميق 6201', catId: 'cat-002', brandId: 'brand-skf', descEn: 'Sample deep groove ball bearing for general industrial applications.', descAr: 'محمل كروي عميق تجريبي للتطبيقات الصناعية العامة.', avail: 'in_stock' },
    { id: 'prod-00002', sku: 'SHN-SKU-00002', code: 'SHN-PC-00002', slug: 'deep-groove-ball-bearing-6202', nameEn: 'Deep Groove Ball Bearing 6202', nameAr: 'محمل كروي عميق 6202', catId: 'cat-002', brandId: 'brand-skf', descEn: 'Sample deep groove ball bearing for general industrial applications.', descAr: 'محمل كروي عميق تجريبي للتطبيقات الصناعية العامة.', avail: 'in_stock' },
    { id: 'prod-00003', sku: 'SHN-SKU-00003', code: 'SHN-PC-00003', slug: 'hex-bolt-m8-30mm', nameEn: 'Hex Bolt M8 x 30mm', nameAr: 'برغي سداسي M8 × 30mm', catId: 'cat-001', brandId: 'brand-bosch', descEn: 'Sample hex bolt, M8 thread, 30mm length.', descAr: 'برغي سداسي تجريبي، خيط M8، طول 30mm.', avail: 'in_stock' },
    { id: 'prod-00004', sku: 'SHN-SKU-00004', code: 'SHN-PC-00004', slug: 'hex-nut-m8', nameEn: 'Hex Nut M8', nameAr: 'صامولة سداسية M8', catId: 'cat-001', brandId: 'brand-bosch', descEn: 'Sample hex nut, M8 thread.', descAr: 'صامولة سداسية تجريبية، خيط M8.', avail: 'in_stock' },
    { id: 'prod-00005', sku: 'SHN-SKU-00005', code: 'SHN-PC-00005', slug: 'v-belt-a-42', nameEn: 'V-Belt A-42', nameAr: 'حزام V نوع A-42', catId: 'cat-003', brandId: 'brand-skf', descEn: 'Sample V-belt for power transmission.', descAr: 'حزام V تجريبي لنقل الحركة.', avail: 'limited' },
    { id: 'prod-00006', sku: 'SHN-SKU-00006', code: 'SHN-PC-00006', slug: 'pneumatic-cylinder-32x100', nameEn: 'Pneumatic Cylinder 32x100', nameAr: 'أسطوانة هوائية 32×100', catId: 'cat-004', brandId: 'brand-festo', descEn: 'Sample double-acting pneumatic cylinder, 32mm bore, 100mm stroke.', descAr: 'أسطوانة هوائية تجريبية مزدوجة الحركة، قطر 32mm، شوط 100mm.', avail: 'in_stock' },
    { id: 'prod-00007', sku: 'SHN-SKU-00007', code: 'SHN-PC-00007', slug: 'contactor-25a-230v', nameEn: 'Contactor 25A 230V', nameAr: 'كونتاكتور 25A 230V', catId: 'cat-005', brandId: 'brand-bosch', descEn: 'Sample AC contactor, 25A, 230V coil.', descAr: 'كونتاكتور تجريبي، 25A، ملف 230V.', avail: 'in_stock' },
    { id: 'prod-00008', sku: 'SHN-SKU-00008', code: 'SHN-PC-00008', slug: 'circuit-breaker-16a', nameEn: 'Circuit Breaker 16A', nameAr: 'قاطع دائرة 16A', catId: 'cat-005', brandId: 'brand-bosch', descEn: 'Sample miniature circuit breaker, 16A, C-curve.', descAr: 'قاطع دائرة تجريبي، 16A، منحنى C.', avail: 'in_stock' },
    { id: 'prod-00009', sku: 'SHN-SKU-00009', code: 'SHN-PC-00009', slug: 'safety-goggles-clear', nameEn: 'Safety Goggles Clear', nameAr: 'نظارات أمان شفافة', catId: 'cat-007', brandId: 'brand-3m', descEn: 'Sample clear safety goggles with anti-fog coating.', descAr: 'نظارات أمان شفافة تجريبية مع طلاء مضاد للضباب.', avail: 'in_stock' },
    { id: 'prod-00010', sku: 'SHN-SKU-00010', code: 'SHN-PC-00010', slug: 'ball-valve-1inch', nameEn: 'Ball Valve 1 inch', nameAr: 'صمام كروي 1 بوصة', catId: 'cat-008', brandId: 'brand-parker', descEn: 'Sample brass ball valve, 1 inch NPT.', descAr: 'صمام كروي نحاسي تجريبي، 1 بوصة NPT.', avail: 'on_request' },
    { id: 'prod-00011', sku: 'SHN-SKU-00011', code: 'SHN-PC-00011', slug: 'cordless-drill-18v', nameEn: 'Cordless Drill 18V', nameAr: 'مثقاب لاسلكي 18V', catId: 'cat-006', brandId: 'brand-bosch', descEn: 'Sample 18V cordless drill with 2 batteries.', descAr: 'مثقاب لاسلكي تجريبي 18V مع بطاريتين.', avail: 'limited' },
    { id: 'prod-00012', sku: 'SHN-SKU-00012', code: 'SHN-PC-00012', slug: 'hydraulic-hose-12mm', nameEn: 'Hydraulic Hose 12mm', nameAr: 'خرطوم هيدروليكي 12mm', catId: 'cat-004', brandId: 'brand-parker', descEn: 'Sample hydraulic hose, 12mm ID, 250 bar working pressure.', descAr: 'خرطوم هيدروليكي تجريبي، قطر داخلي 12mm، ضغط 250 بار.', avail: 'in_stock' },
  ];
  for (const p of products) {
    const existing = await db`SELECT id FROM products WHERE sku = ${p.sku} LIMIT 1`;
    if (!existing[0]) {
      await db`INSERT INTO products (id, sku, product_code, slug, name_en, name_ar, description_en, description_ar, category_id, brand_id, manufacturer, availability, status, is_sample_data, created_at, updated_at) VALUES (${p.id}, ${p.sku}, ${p.code}, ${p.slug}, ${p.nameEn}, ${p.nameAr}, ${p.descEn}, ${p.descAr}, ${p.catId}, ${p.brandId}, ${brands.find(b => b.id === p.brandId)?.name || null}, ${p.avail}, 'active', 1, ${now}, ${now})`;
      productsCreated++;
    }
  }

  const specs = [
    { prodId: 'prod-00001', labelEn: 'Material', labelAr: 'المادة', valueEn: 'Chrome Steel', valueAr: 'صلب كروم', groupEn: 'General', groupAr: 'عام' },
    { prodId: 'prod-00001', labelEn: 'Bore Diameter', labelAr: 'قطر الثقب', valueEn: '12 mm', valueAr: '12 مم', groupEn: 'Dimensions', groupAr: 'الأبعاد' },
    { prodId: 'prod-00001', labelEn: 'Outer Diameter', labelAr: 'القطر الخارجي', valueEn: '32 mm', valueAr: '32 مم', groupEn: 'Dimensions', groupAr: 'الأبعاد' },
    { prodId: 'prod-00001', labelEn: 'Width', labelAr: 'العرض', valueEn: '10 mm', valueAr: '10 مم', groupEn: 'Dimensions', groupAr: 'الأبعاد' },
  ];
  for (const s of specs) {
    const existing = await db`SELECT id FROM product_specifications WHERE product_id = ${s.prodId} AND label_en = ${s.labelEn} LIMIT 1`;
    if (!existing[0]) {
      await db`INSERT INTO product_specifications (id, product_id, label_en, label_ar, value_en, value_ar, group_en, group_ar, sort_order, created_at) VALUES (${crypto.randomUUID()}, ${s.prodId}, ${s.labelEn}, ${s.labelAr}, ${s.valueEn}, ${s.valueAr}, ${s.groupEn}, ${s.groupAr}, ${specsCreated}, ${now})`;
      specsCreated++;
    }
  }

  const techMeta = [
    { prodId: 'prod-00001', keyEn: 'Dynamic Load Rating', keyAr: 'تصنيف الحمل الديناميكي', value: '9.95 kN', unit: 'kN' },
    { prodId: 'prod-00001', keyEn: 'Static Load Rating', keyAr: 'تصنيف الحمل الثابت', value: '3.15 kN', unit: 'kN' },
    { prodId: 'prod-00001', keyEn: 'Max Speed', keyAr: 'السرعة القصوى', value: '36000', unit: 'rpm' },
  ];
  for (const t of techMeta) {
    const existing = await db`SELECT id FROM product_technical_metadata WHERE product_id = ${t.prodId} AND key_en = ${t.keyEn} LIMIT 1`;
    if (!existing[0]) {
      await db`INSERT INTO product_technical_metadata (id, product_id, key_en, key_ar, value, unit, sort_order, created_at) VALUES (${crypto.randomUUID()}, ${t.prodId}, ${t.keyEn}, ${t.keyAr}, ${t.value}, ${t.unit}, ${techMetaCreated}, ${now})`;
      techMetaCreated++;
    }
  }

  return { categories: categoriesCreated, brands: brandsCreated, products: productsCreated, images: imagesCreated, specs: specsCreated, techMeta: techMetaCreated };
}

// ------------------------------------------------------------
// G5: V3/V5/V6 opportunity helpers (legacy parity)
// ------------------------------------------------------------
function generateDedupKey(opportunityType: string, userId: string | null, productId: string | null): string {
  if (userId) return `${opportunityType}:${userId}`;
  if (productId) return `${opportunityType}:${productId}`;
  return `${opportunityType}:${crypto.randomUUID()}`;
}

async function recordOpportunityAction(
  opportunityId: string,
  actionType: string,
  actorId: string,
  note: string | null,
  previousStatus: string | null,
  newStatus: string | null,
): Promise<void> {
  try {
    await sql()`INSERT INTO opportunity_actions (id, opportunity_id, action_type, actor_id, note, previous_status, new_status, created_at) VALUES (${crypto.randomUUID()}, ${opportunityId}, ${actionType}, ${actorId}, ${note}, ${previousStatus}, ${newStatus}, ${new Date().toISOString()})`;
  } catch (err) {
    console.error('[shanan-api] Opportunity action recording failed:', err);
  }
}

function computeOpportunityPriority(opp: any): {
  score: number;
  level: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  factors: Array<{ key: string; label: string; points: number; max: number; reason: string }>;
} {
  const factors: Array<{ key: string; label: string; points: number; max: number; reason: string }> = [];
  const RULE_WEIGHT: Record<string, number> = { RULE_A: 40, RULE_B: 30, RULE_C: 20 };
  const rulePoints = RULE_WEIGHT[opp.rule] ?? 0;
  factors.push({
    key: 'rule', label: 'Deterministic Rule', points: rulePoints, max: 40,
    reason: `${opp.rule} — ${opp.rule === 'RULE_A' ? 'user started a request (highest intent)' : opp.rule === 'RULE_B' ? 'user engaged repeatedly with products' : opp.rule === 'RULE_C' ? 'product has engagement but no conversion' : 'unknown rule'}`,
  });
  const STATUS_WEIGHT: Record<string, number> = { NEW: 25, UNDER_REVIEW: 15, CONTACTED: 10, CONVERTED: 0, DISMISSED: 0 };
  const statusPoints = STATUS_WEIGHT[opp.status] ?? 0;
  factors.push({
    key: 'status', label: 'Workflow Status', points: statusPoints, max: 25,
    reason: `${opp.status} — ${opp.status === 'NEW' ? 'not yet acted on' : opp.status === 'UNDER_REVIEW' ? 'currently being reviewed' : opp.status === 'CONTACTED' ? 'customer contacted, awaiting response' : opp.status === 'CONVERTED' ? 'already converted (closed)' : opp.status === 'DISMISSED' ? 'dismissed (closed)' : 'unknown status'}`,
  });
  let recencyPoints = 0;
  let recencyReason = 'older than 14 days';
  try {
    const updated = new Date(opp.updated_at).getTime();
    const ageH = (Date.now() - updated) / 36e5;
    if (ageH < 24) { recencyPoints = 20; recencyReason = `updated ${Math.round(ageH)}h ago`; }
    else if (ageH < 72) { recencyPoints = 15; recencyReason = `updated ${Math.round(ageH / 24)}d ago`; }
    else if (ageH < 168) { recencyPoints = 10; recencyReason = `updated ${Math.round(ageH / 24)}d ago`; }
    else if (ageH < 336) { recencyPoints = 5; recencyReason = `updated ${Math.round(ageH / 24)}d ago`; }
    else { recencyPoints = 0; recencyReason = `updated ${Math.round(ageH / 24)}d ago (stale)`; }
  } catch {
    recencyPoints = 0;
    recencyReason = 'updated_at could not be parsed';
  }
  factors.push({ key: 'recency', label: 'Recency of Last Update', points: recencyPoints, max: 20, reason: recencyReason });
  let evidencePoints = 0;
  let evidenceReason = 'no evidence available';
  try {
    const ev = opp.evidence_json ? JSON.parse(opp.evidence_json) : null;
    if (ev) {
      if (opp.rule === 'RULE_A' && typeof ev.totalEvents === 'number') {
        evidencePoints = ev.totalEvents >= 5 ? 15 : ev.totalEvents >= 3 ? 10 : 5;
        evidenceReason = `${ev.totalEvents} total event(s) recorded`;
      } else if (opp.rule === 'RULE_B' && typeof ev.productViewCount === 'number') {
        evidencePoints = ev.productViewCount >= 7 ? 15 : ev.productViewCount >= 5 ? 10 : 5;
        evidenceReason = `${ev.productViewCount} product view(s)`;
      } else if (opp.rule === 'RULE_C' && typeof ev.engagementCount === 'number') {
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
  factors.push({ key: 'evidence', label: 'Evidence Strength', points: evidencePoints, max: 15, reason: evidenceReason });
  const score = factors.reduce((sum, f) => sum + f.points, 0);
  let level: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  if (score >= 70) level = 'CRITICAL';
  else if (score >= 50) level = 'HIGH';
  else if (score >= 30) level = 'MEDIUM';
  else level = 'LOW';
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

function computeTaskDedupKey(opportunityId: string, title: string): string {
  const normalized = title.trim().replace(/\s+/g, ' ').toLowerCase();
  return `${opportunityId}:${normalized}`;
}

function isValidIsoDate(s: string | null | undefined): boolean {
  if (!s || typeof s !== 'string') return false;
  return /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?Z?)?$/.test(s.trim());
}

// ------------------------------------------------------------
// G5: activity event types (legacy parity)
// ------------------------------------------------------------
const VALID_EVENT_TYPES = [
  'PLATFORM_SESSION_STARTED', 'CATALOG_VIEWED', 'PRODUCT_VIEWED',
  'PRODUCT_SEARCHED', 'CATEGORY_VIEWED', 'SUPPLY_REQUEST_STARTED',
  'SUPPLY_REQUEST_SUBMITTED', 'AGREEMENT_VIEWED', 'RFQ_CREATED',
  'OFFER_RECORDED', 'EVALUATION_VIEWED', 'DECISION_RECORDED',
];
const VALID_TASK_STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
const VALID_TASK_PRIORITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
const VALID_OPPORTUNITY_STATUSES = ['NEW', 'UNDER_REVIEW', 'CONTACTED', 'CONVERTED', 'DISMISSED'];
const VALID_ACTION_TYPES = ['REVIEWED', 'CONTACT_ATTEMPTED', 'CUSTOMER_CONTACTED', 'FOLLOW_UP_REQUIRED', 'QUOTE_REQUESTED', 'CONVERTED', 'DISMISSED'];
const OPPORTUNITY_STAGE_ORDER = [
  'PLATFORM_SESSION_STARTED', 'CATALOG_VIEWED', 'PRODUCT_SEARCHED', 'PRODUCT_VIEWED',
  'CATEGORY_VIEWED', 'SUPPLY_REQUEST_STARTED', 'SUPPLY_REQUEST_SUBMITTED',
  'AGREEMENT_VIEWED', 'RFQ_CREATED', 'OFFER_RECORDED', 'EVALUATION_VIEWED', 'DECISION_RECORDED',
];

// ------------------------------------------------------------
// Shared business helpers (legacy parity)
// ------------------------------------------------------------
async function isValidProductId(productId: string): Promise<boolean> {
  const rows = await sql()`SELECT id FROM products WHERE id = ${productId} AND status = ${'active'} LIMIT 1`;
  return rows.length > 0;
}

async function getProductSummary(productId: string): Promise<{ id: string; sku: string; productCode: string; nameEn: string } | null> {
  const rows = await sql()`SELECT id, sku, product_code, name_en FROM products WHERE id = ${productId} LIMIT 1`;
  if (!rows[0]) return null;
  const p = rows[0];
  return { id: p.id, sku: p.sku, productCode: p.product_code, nameEn: p.name_en || '' };
}

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
  const id = generateId();
  sql()`INSERT INTO notifications (id, user_id, event_type, title_en, title_ar, body_en, body_ar, entity_type, entity_id, created_at)
        VALUES (${id}, ${userId}, ${eventType}, ${titleEn}, ${titleAr}, ${bodyEn}, ${bodyAr}, ${entityType}, ${entityId}, ${new Date().toISOString()})`
    .catch((err: any) => console.error('[shanan-api] Notification create failed:', err));
}

async function recordActivityEvent(
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
): Promise<void> {
  try {
    await sql()`INSERT INTO activity_events (id, event_type, user_id, user_type, company_id,
          product_id, category_id, supply_request_id, agreement_id, rfq_id, metadata, created_at)
       VALUES (${crypto.randomUUID()}, ${eventType},
               ${authUser?.id ?? null}, ${authUser?.user_type ?? null}, ${authUser?.company_id ?? null},
               ${context?.productId ?? null}, ${context?.categoryId ?? null},
               ${context?.supplyRequestId ?? null}, ${context?.agreementId ?? null},
               ${context?.rfqId ?? null}, ${context?.metadata ?? null},
               ${new Date().toISOString()})`;
  } catch (err) {
    console.error('[shanan-api] Activity event recording failed:', err);
  }
}

// STEP 17 PHASE 2: RFQ state helpers
async function updateSupplierResponseState(rfqSupplierId: string, rfqId: string): Promise<void> {
  const totalRows = await sql()`SELECT COUNT(*)::int AS cnt FROM rfq_items WHERE rfq_id = ${rfqId}`;
  const totalItems = Number(totalRows[0]?.cnt ?? 0);
  const answeredRows = await sql()`SELECT COUNT(*)::int AS cnt FROM rfq_supplier_offers WHERE rfq_supplier_id = ${rfqSupplierId} AND offer_status IN ('quoted','declined','unavailable')`;
  const answeredItems = Number(answeredRows[0]?.cnt ?? 0);
  const now = new Date().toISOString();
  if (totalItems > 0 && answeredItems >= totalItems) {
    await sql()`UPDATE rfq_suppliers SET response_state = 'responded', responded_at = ${now} WHERE id = ${rfqSupplierId}`;
  } else {
    await sql()`UPDATE rfq_suppliers SET response_state = 'pending', responded_at = NULL WHERE id = ${rfqSupplierId}`;
  }
}

async function updateRfqAggregateStatus(rfqId: string, now: string): Promise<void> {
  const rfqRows = await sql()`SELECT status FROM rfqs WHERE id = ${rfqId} LIMIT 1`;
  const rfq = rfqRows[0] as { status: string } | undefined;
  if (!rfq || !['sent', 'partially_responded', 'responded'].includes(rfq.status)) return;
  const totalSuppliersRows = await sql()`SELECT COUNT(*)::int AS cnt FROM rfq_suppliers WHERE rfq_id = ${rfqId}`;
  const totalSuppliers = Number(totalSuppliersRows[0]?.cnt ?? 0);
  const respondedRows = await sql()`SELECT COUNT(*)::int AS cnt FROM rfq_suppliers WHERE rfq_id = ${rfqId} AND response_state = 'responded'`;
  const respondedSuppliers = Number(respondedRows[0]?.cnt ?? 0);
  const totalItemsRows = await sql()`SELECT COUNT(*)::int AS cnt FROM rfq_items WHERE rfq_id = ${rfqId}`;
  const totalItems = Number(totalItemsRows[0]?.cnt ?? 0);
  const coveredRows = await sql()`SELECT COUNT(DISTINCT rso.rfq_item_id)::int AS cnt FROM rfq_supplier_offers rso JOIN rfq_suppliers rs ON rso.rfq_supplier_id = rs.id WHERE rs.rfq_id = ${rfqId}`;
  const coveredItems = Number(coveredRows[0]?.cnt ?? 0);
  let newStatus: string | null = null;
  if (respondedSuppliers >= totalSuppliers && totalSuppliers > 0) {
    newStatus = 'responded';
  } else if (coveredItems > 0 && coveredItems < totalItems) {
    newStatus = 'partially_responded';
  } else if (coveredItems >= totalItems && totalItems > 0) {
    newStatus = respondedSuppliers >= totalSuppliers ? 'responded' : 'partially_responded';
  }
  if (newStatus && newStatus !== rfq.status) {
    await sql()`UPDATE rfqs SET status = ${newStatus}, updated_at = ${now} WHERE id = ${rfqId}`;
  }
}

// ------------------------------------------------------------
// Sourcing evaluation engine (A9/A10/A11 - legacy parity)
// ------------------------------------------------------------
type SourcingOptionSource = 'agreement_term' | 'rfq_offer';
type EligibilityResult = 'ELIGIBLE' | 'ELIGIBLE_WITH_WARNINGS' | 'NOT_ELIGIBLE' | 'INSUFFICIENT_DATA';
type RecommendationTag = 'recommended' | 'alternative' | 'requires_review' | 'not_eligible' | 'insufficient_data';

interface SourcingOptionFlag {
  type: 'blocking' | 'warning' | 'info';
  code: string;
  message: string;
}

interface SourcingOption {
  source_type: SourcingOptionSource;
  source_id: string;
  rfq_item_id: string | null;
  supplier_id: string;
  supplier_reference: string | null;
  supplier_name_en: string | null;
  supplier_status: string | null;
  agreement_id: string | null;
  agreement_number: string | null;
  agreement_status: string | null;
  agreement_effective_from: string | null;
  agreement_effective_to: string | null;
  agreement_currency: string | null;
  agreement_payment_terms_days: number | null;
  agreement_supplier_credit_limit: string | null;
  rfq_id: string | null;
  rfq_reference: string | null;
  rfq_status: string | null;
  rfq_supplier_response_state: string | null;
  product_id: string;
  canonical_product_sku: string | null;
  canonical_product_code: string | null;
  canonical_product_name_en: string | null;
  unit_price: number | null;
  currency: string | null;
  minimum_order_quantity: number | null;
  price_valid_from: string | null;
  price_valid_to: string | null;
  availability_status: string | null;
  available_quantity: number | null;
  expected_available_date: string | null;
  lead_time_days: number | null;
  payment_terms: string | null;
  offer_status: string | null;
  eligibility: EligibilityResult;
  flags: SourcingOptionFlag[];
  data_completeness: 'complete' | 'partial' | 'missing_critical';
  recommendation: RecommendationTag;
}

interface ItemEvaluation {
  request_item_id: string;
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

async function evaluateSourcingForRequest(supplyRequestId: string): Promise<SourcingEvaluation | null> {
  const srRows = await sql()`
    SELECT sr.id, sr.reference, sr.status, sr.customer_company_id, sr.customer_po_number,
           cc.name_en AS customer_company_name
      FROM supply_requests sr
      LEFT JOIN customer_companies cc ON sr.customer_company_id = cc.id
     WHERE sr.id = ${supplyRequestId}
     LIMIT 1`;
  const sr = srRows[0] as any;
  if (!sr) return null;

  const items = await sql()`
    SELECT id, product_id, product_name, sku, quantity, notes
      FROM supply_request_items
     WHERE request_id = ${supplyRequestId}
     ORDER BY id ASC`;

  const itemEvaluations: ItemEvaluation[] = [];
  const allCurrencies = new Set<string>();

  for (const item of items) {
    const options: SourcingOption[] = [];

    // Source A: agreement_product_terms
    const terms = await sql()`
      SELECT apt.*, sa.agreement_number, sa.status AS agreement_status, sa.effective_from, sa.effective_to,
             sa.currency AS agreement_currency, sa.payment_terms_days, sa.supplier_credit_limit,
             s.id AS supplier_id, s.reference AS supplier_reference, s.name_en AS supplier_name_en, s.status AS supplier_status
        FROM agreement_product_terms apt
        JOIN supplier_agreements sa ON apt.agreement_id = sa.id
        JOIN suppliers s ON sa.supplier_id = s.id
       WHERE apt.product_id = ${item.product_id} AND apt.status = 'active'
       ORDER BY apt.unit_price ASC`;

    for (const t of terms) {
      const agreementCheck = isAgreementActive(t.agreement_status, t.effective_from, t.effective_to);
      const priceCheck = isPriceValid(t.price_valid_from, t.price_valid_to);
      const product = await getProductSummary(t.product_id);
      const currency = t.currency || t.agreement_currency || null;
      if (currency) allCurrencies.add(currency);

      const flags: SourcingOptionFlag[] = [];
      let eligibility: EligibilityResult = 'ELIGIBLE';
      let dataCompleteness: 'complete' | 'partial' | 'missing_critical' = 'complete';

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
      if (t.available_quantity !== null && t.available_quantity !== undefined && Number(t.available_quantity) < item.quantity) {
        flags.push({ type: 'blocking', code: 'QUANTITY_INSUFFICIENT', message: `Available ${t.available_quantity} < requested ${item.quantity}` });
        eligibility = 'NOT_ELIGIBLE';
      }
      if (t.minimum_order_quantity !== null && t.minimum_order_quantity !== undefined && Number(t.minimum_order_quantity) > item.quantity) {
        flags.push({ type: 'blocking', code: 'MOQ_CONFLICT', message: `MOQ ${t.minimum_order_quantity} > requested ${item.quantity}` });
        eligibility = 'NOT_ELIGIBLE';
      }
      if (!priceCheck.valid && eligibility !== 'NOT_ELIGIBLE') {
        flags.push({ type: 'blocking', code: 'PRICE_EXPIRED', message: priceCheck.reason || 'Price not valid' });
        eligibility = 'NOT_ELIGIBLE';
      }

      if (eligibility !== 'NOT_ELIGIBLE') {
        if (t.unit_price === null || t.unit_price === undefined) {
          flags.push({ type: 'blocking', code: 'PRICE_MISSING', message: 'Unit price is missing' });
          eligibility = 'INSUFFICIENT_DATA';
          dataCompleteness = 'missing_critical';
        }
      }

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
        data_completeness,
        recommendation: 'requires_review',
      });
    }

    // Source B: rfq_supplier_offers (quoted)
    const offers = await sql()`
      SELECT o.*, ri.id AS rfq_item_id, ri.product_id AS ri_product_id, ri.requested_quantity,
             ri.supply_request_item_id, rs.supplier_id, rs.response_state AS rfq_supplier_response_state,
             s.reference AS supplier_reference, s.name_en AS supplier_name_en, s.status AS supplier_status,
             r.id AS rfq_id, r.reference AS rfq_reference, r.status AS rfq_status
        FROM rfq_supplier_offers o
        JOIN rfq_suppliers rs ON o.rfq_supplier_id = rs.id
        JOIN suppliers s ON rs.supplier_id = s.id
        JOIN rfq_items ri ON o.rfq_item_id = ri.id
        JOIN rfqs r ON ri.rfq_id = r.id
       WHERE ri.supply_request_item_id = ${item.id} AND o.offer_status = 'quoted'
       ORDER BY o.quoted_unit_price ASC`;

    for (const o of offers) {
      const product = await getProductSummary(o.ri_product_id);
      const currency = o.currency || null;
      if (currency) allCurrencies.add(currency);

      const flags: SourcingOptionFlag[] = [];
      let eligibility: EligibilityResult = 'ELIGIBLE';
      let dataCompleteness: 'complete' | 'partial' | 'missing_critical' = 'complete';

      if (o.supplier_status && o.supplier_status !== 'active') {
        flags.push({ type: 'blocking', code: 'SUPPLIER_INACTIVE', message: `Supplier status is '${o.supplier_status}'` });
        eligibility = 'NOT_ELIGIBLE';
      }
      if (o.validity_date && o.validity_date < new Date().toISOString()) {
        flags.push({ type: 'blocking', code: 'OFFER_EXPIRED', message: `Offer expired (validity_date=${o.validity_date})` });
        eligibility = 'NOT_ELIGIBLE';
      }
      if (o.offered_quantity !== null && o.offered_quantity !== undefined && Number(o.offered_quantity) < item.quantity) {
        flags.push({ type: 'blocking', code: 'QUANTITY_INSUFFICIENT', message: `Offered ${o.offered_quantity} < requested ${item.quantity}` });
        eligibility = 'NOT_ELIGIBLE';
      }
      if (o.minimum_order_quantity !== null && o.minimum_order_quantity !== undefined && Number(o.minimum_order_quantity) > item.quantity) {
        flags.push({ type: 'blocking', code: 'MOQ_CONFLICT', message: `MOQ ${o.minimum_order_quantity} > requested ${item.quantity}` });
        eligibility = 'NOT_ELIGIBLE';
      }

      if (eligibility !== 'NOT_ELIGIBLE') {
        if (o.quoted_unit_price === null || o.quoted_unit_price === undefined) {
          flags.push({ type: 'blocking', code: 'PRICE_MISSING', message: 'Quoted unit price is missing' });
          eligibility = 'INSUFFICIENT_DATA';
          dataCompleteness = 'missing_critical';
        }
      }

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
        data_completeness,
        recommendation: 'requires_review',
      });
    }

    // Recommendation pass
    const eligible = options.filter(o => o.eligibility === 'ELIGIBLE' || o.eligibility === 'ELIGIBLE_WITH_WARNINGS');
    const notEligible = options.filter(o => o.eligibility === 'NOT_ELIGIBLE');
    const insufficient = options.filter(o => o.eligibility === 'INSUFFICIENT_DATA');

    for (const o of notEligible) o.recommendation = 'not_eligible';
    for (const o of insufficient) o.recommendation = 'insufficient_data';

    let recommendationTag: RecommendationTag = 'requires_review';
    let recommendedOptionId: string | null = null;
    let note = '';

    if (eligible.length === 0) {
      if (insufficient.length > 0 && notEligible.length === 0) {
        recommendationTag = 'insufficient_data';
        note = 'No eligible options - insufficient data prevents a reliable determination.';
      } else if (notEligible.length > 0 && insufficient.length === 0) {
        recommendationTag = 'not_eligible';
        note = 'All available options are not eligible.';
      } else if (options.length === 0) {
        recommendationTag = 'requires_review';
        note = 'No sourcing options available for this item. Consider creating an RFQ (A10).';
      } else {
        recommendationTag = 'requires_review';
        note = 'No eligible options - manual review required.';
      }
    } else {
      const eligibleCurrencies = new Set(eligible.map(o => o.currency).filter(Boolean) as string[]);
      if (eligibleCurrencies.size > 1) {
        for (const o of eligible) o.recommendation = 'requires_review';
        recommendationTag = 'requires_review';
        note = `${eligibleCurrencies.size} different currencies present (${Array.from(eligibleCurrencies).join(', ')}). Direct price comparison not available - manual review required.`;
      } else {
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

async function validateSelectedOption(
  supplyRequestId: string,
  selectedSourceType: 'agreement_term' | 'rfq_offer',
  selectedSourceId: string,
): Promise<{ ok: true; option: SourcingOption } | { ok: false; reason: string }> {
  const evaluation = await evaluateSourcingForRequest(supplyRequestId);
  if (!evaluation) return { ok: false, reason: 'Supply Request not found' };
  for (const item of evaluation.items) {
    const match = item.options.find(o => o.source_type === selectedSourceType && o.source_id === selectedSourceId);
    if (match) {
      if (match.eligibility === 'NOT_ELIGIBLE') {
        return { ok: false, reason: `Cannot select a NOT_ELIGIBLE option (blocking: ${match.flags.filter(f => f.type === 'blocking').map(f => f.code).join(', ')})` };
      }
      if (match.eligibility === 'INSUFFICIENT_DATA') {
        return { ok: false, reason: 'Cannot select an INSUFFICIENT_DATA option (missing critical data)' };
      }
      return { ok: true, option: match };
    }
  }
  return { ok: false, reason: `Selected option does not belong to this Supply Request's evaluation` };
}

// A10: RFQ status workflow
const RFQ_ACTIONS: Record<string, { from: string[]; to: string }> = {
  mark_ready: { from: ['draft'], to: 'ready_to_send' },
  send: { from: ['ready_to_send'], to: 'sent' },
  close: { from: ['partially_responded', 'responded'], to: 'closed' },
  cancel: { from: ['draft', 'ready_to_send', 'sent', 'partially_responded', 'responded'], to: 'cancelled' },
};

function rfqSendReadinessErrors(hasItems: boolean, hasSuppliers: boolean): string | null {
  if (!hasItems) return 'RFQ must have at least one item before it can be sent';
  if (!hasSuppliers) return 'RFQ must have at least one supplier recipient before it can be sent';
  return null;
}

// A13-2 note: login/auth rate limiting lives in api/auth/[[...route]].ts.
// General per-endpoint rate limiting is intentionally not ported to the
// catch-all: serverless instances are short-lived and have no shared state.

// ------------------------------------------------------------
// Supply Request validation + insert (legacy parity)
// ------------------------------------------------------------
interface RequestItem {
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  notes?: string;
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
    customerCompanyId: string | null;
    customerPoNumber: string | null;
    creditApplicationId: string | null;
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

type CreditLinkResult = { ok: true; id: string | null } | { ok: false; reason: string };

async function validateCreditApplicationLink(
  creditAppId: unknown,
  ownerCompanyId: string | null,
): Promise<CreditLinkResult> {
  if (creditAppId === undefined || creditAppId === null || creditAppId === '') {
    return { ok: true, id: null };
  }
  if (typeof creditAppId !== 'string') {
    return { ok: false, reason: 'creditApplicationId must be a string or null' };
  }
  const trimmed = creditAppId.trim();
  if (trimmed === '') return { ok: true, id: null };
  if (!ownerCompanyId) {
    return { ok: false, reason: 'Supply Request has no customer company; cannot link a Credit Application' };
  }
  const rows = await sql()`SELECT id, customer_company_id, status FROM credit_applications WHERE id = ${trimmed} OR application_number = ${trimmed} LIMIT 1`;
  const ca = rows[0];
  if (!ca) return { ok: false, reason: 'Credit Application not found' };
  if (ca.customer_company_id !== ownerCompanyId) {
    return { ok: false, reason: 'Credit Application not found' };
  }
  if (ca.status !== 'approved') {
    return { ok: false, reason: `Credit Application is not eligible (status: ${ca.status}). Only approved applications can be linked.` };
  }
  return { ok: true, id: ca.id };
}

async function validate(body: any): Promise<ValidationOk | ValidationFail> {
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
    const item = body.items[i] as Partial<RequestItem>;
    if (typeof item?.productId !== 'string' || !item.productId) {
      return { ok: false, field: `items[${i}].productId`, reason: 'required' };
    }
    if (typeof item?.productName !== 'string' || !item.productName) {
      return { ok: false, field: `items[${i}].productName`, reason: 'required' };
    }
    if (typeof item?.sku !== 'string' || !item.sku) {
      return { ok: false, field: `items[${i}].sku`, reason: 'required' };
    }
    if (typeof item?.quantity !== 'number' || !Number.isInteger(item.quantity) || item.quantity < 1) {
      return { ok: false, field: `items[${i}].quantity`, reason: 'must be a positive integer' };
    }
    if (item.notes !== undefined && item.notes !== null && typeof item.notes !== 'string') {
      return { ok: false, field: `items[${i}].notes`, reason: 'must be a string' };
    }
  }

  let customerCompanyId: string | null = null;
  if (body.customerCompanyId !== undefined && body.customerCompanyId !== null && body.customerCompanyId !== '') {
    if (typeof body.customerCompanyId !== 'string' || body.customerCompanyId.trim() === '') {
      return { ok: false, field: 'customerCompanyId', reason: 'must be a non-empty string or omitted' };
    }
    const rows = await sql()`SELECT id FROM customer_companies WHERE id = ${body.customerCompanyId.trim()} LIMIT 1`;
    if (!rows[0]) {
      return { ok: false, field: 'customerCompanyId', reason: 'references a non-existent customer company' };
    }
    customerCompanyId = rows[0].id;
  }

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

  const creditLink = await validateCreditApplicationLink(body.creditApplicationId, customerCompanyId);
  if (!creditLink.ok) {
    return { ok: false, field: 'creditApplicationId', reason: creditLink.reason };
  }

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

async function insertSupplyRequest(data: ValidationOk['data']): Promise<{ id: string; reference: string; createdAt: string }> {
  const id = generateId();
  const reference = generateReference();
  const createdAt = new Date().toISOString();
  await sql.begin(async (tx: any) => {
    await tx`
      INSERT INTO supply_requests
        (id, reference, requester_name, company_name, email, phone, country, city, message,
         status, customer_company_id, customer_po_number, credit_application_id, delivery_date, created_at)
      VALUES (${id}, ${reference}, ${data.requesterName}, ${data.companyName}, ${data.email}, ${data.phone},
              ${data.country}, ${data.city}, ${data.message || null}, 'pending',
              ${data.customerCompanyId}, ${data.customerPoNumber}, ${data.creditApplicationId}, ${data.deliveryDate}, ${createdAt})`;
    for (const item of data.items) {
      await tx`
        INSERT INTO supply_request_items (request_id, product_id, product_name, sku, quantity, notes)
        VALUES (${id}, ${item.productId}, ${item.productName}, ${item.sku}, ${item.quantity}, ${item.notes || null})`;
    }
  });
  return { id, reference, createdAt };
}

// Official Supply Request PDF (A8 - pdfkit, legacy parity)
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
        compress: false,
        info: {
          Title: `SHANAN Official Document - ${req.reference}`,
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

      const PAGE_W = 595.28;
      const M = 50;
      const CONTENT_W = PAGE_W - 2 * M;
      const NAVY = '#0B2545';
      const GRAY = '#6b7280';
      const LIGHT_GRAY = '#f1f3f5';
      const BORDER = '#d1d5db';

      doc.fillColor(NAVY).fontSize(22).font('Helvetica-Bold').text('SHANAN', M, 50);
      doc.fillColor(GRAY).fontSize(8).font('Helvetica').text('ENGINEERING KNOWLEDGE PLATFORM', M, 76);
      doc.fillColor(GRAY).fontSize(8).text('OFFICIAL SUPPLY REQUEST DOCUMENT', PAGE_W - M - 220, 50, { width: 220, align: 'right' });
      doc.fillColor(NAVY).fontSize(11).font('Courier-Bold').text(req.reference, PAGE_W - M - 220, 65, { width: 220, align: 'right' });
      doc.moveTo(M, 95).lineTo(PAGE_W - M, 95).lineWidth(2).strokeColor(NAVY).stroke();

      let y = 115;
      const label = (s: string, x: number, yy: number) => {
        doc.fillColor(GRAY).fontSize(8).font('Helvetica-Bold').text(s.toUpperCase(), x, yy);
      };
      const value = (s: string, x: number, yy: number, w: number) => {
        doc.fillColor('#111').fontSize(11).font('Helvetica').text(s || '-', x, yy + 12, { width: w });
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
      value(req.cc_name ? `${req.cc_name}${req.cc_ref ? `  (${req.cc_ref})` : ''}` : '-', M, y, CONTENT_W);
      y += 40;

      label('Customer PO Number', M, y);
      value(req.customer_po_number || '-', M, y, COL_W - 10);
      label('Credit Application Ref.', M + COL_W, y);
      value(creditAppRef || '-', M + COL_W, y, COL_W - 10);
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

      if (req.message) {
        y = Math.max(y, 200);
        label('Message / Notes', M, y);
        doc.fillColor('#111').fontSize(10).font('Helvetica').text(req.message, M, y + 12, { width: CONTENT_W });
        y += 30 + Math.ceil(req.message.length / 80) * 13;
      }

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
          doc.text(String(it.notes || '-'), colX[4] + 4, y + 7, { width: colW[4] - 8 });
          y += rowH;
        }
      }

      y += 20;
      doc.fillColor(GRAY).fontSize(7).font('Helvetica-Oblique').text(
        'This document was generated by the SHANAN platform from authoritative server-side records.',
        M, y, { width: CONTENT_W }
      );

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

      drawSignBox(M, y, 'SHANAN Authorized Representative', 'Signature & Date');
      drawSignBox(M + boxW + 20, y, 'SHANAN Official Stamp', 'Stamp Area');
      y += boxH + 15;
      drawSignBox(M, y, 'Customer Authorized Representative', 'Signature & Date');
      drawSignBox(M + boxW + 20, y, 'Customer Official Stamp', 'Stamp Area');

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

// ====<CHUNK-1-MARKER>====
// GROUPS <= 1 service functions
// ====<DISPATCH-GROUPS>====

async function route(req: Request, method: string): Promise<Response> {
  const url = new URL(req.url);
  const origin = req.headers.get('Origin');
  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  // ============================================================
  // Supply Requests
  // ============================================================

  // GET /api/supply-requests - list (auth + ownership filtering)
  if (url.pathname === '/api/supply-requests' && method === 'GET') {
    const auth = await requireAuth(req, origin);
    if (auth.error) return auth.error;
    if (auth.user.user_type === 'supplier') {
      return errorResponse('Forbidden: suppliers cannot access supply requests', 403, origin);
    }
    try {
      let rows;
      if (auth.user.user_type === 'customer') {
        rows = await sql()`
          SELECT sr.id, sr.reference, sr.requester_name, sr.company_name, sr.email, sr.phone,
                 sr.country, sr.city, sr.message, sr.status, sr.created_at,
                 sr.customer_company_id, sr.customer_po_number, sr.credit_application_id,
                 sr.delivery_date,
                 cc.reference AS customer_company_reference, cc.name_en AS customer_company_name,
                 (SELECT COUNT(*)::int FROM supply_request_items sri WHERE sri.request_id = sr.id) AS item_count
            FROM supply_requests sr
            LEFT JOIN customer_companies cc ON sr.customer_company_id = cc.id
           WHERE sr.customer_company_id = ${auth.user.company_id}
           ORDER BY sr.created_at DESC
           LIMIT 50`;
      } else {
        const filterStatus = url.searchParams.get('status');
        if (filterStatus) {
          rows = await sql()`
            SELECT sr.id, sr.reference, sr.requester_name, sr.company_name, sr.email, sr.phone,
                   sr.country, sr.city, sr.message, sr.status, sr.created_at,
                   sr.customer_company_id, sr.customer_po_number, sr.credit_application_id,
                   sr.delivery_date,
                   cc.reference AS customer_company_reference, cc.name_en AS customer_company_name,
                   (SELECT COUNT(*)::int FROM supply_request_items sri WHERE sri.request_id = sr.id) AS item_count
              FROM supply_requests sr
              LEFT JOIN customer_companies cc ON sr.customer_company_id = cc.id
             WHERE sr.status = ${filterStatus}
             ORDER BY sr.created_at DESC
             LIMIT 50`;
        } else {
          rows = await sql()`
            SELECT sr.id, sr.reference, sr.requester_name, sr.company_name, sr.email, sr.phone,
                   sr.country, sr.city, sr.message, sr.status, sr.created_at,
                   sr.customer_company_id, sr.customer_po_number, sr.credit_application_id,
                   sr.delivery_date,
                   cc.reference AS customer_company_reference, cc.name_en AS customer_company_name,
                   (SELECT COUNT(*)::int FROM supply_request_items sri WHERE sri.request_id = sr.id) AS item_count
              FROM supply_requests sr
              LEFT JOIN customer_companies cc ON sr.customer_company_id = cc.id
             ORDER BY sr.created_at DESC
             LIMIT 50`;
        }
      }
      return jsonResponse({ requests: rows, count: rows.length }, 200, origin);
    } catch (err) {
      console.error('[shanan-api] Query failed:', err);
      return errorResponse('Could not retrieve requests.', 500, origin);
    }
  }

  // POST /api/supply-requests - create (auth + ownership derivation)
  if (url.pathname === '/api/supply-requests' && method === 'POST') {
    const auth = await requireAuth(req, origin);
    if (auth.error) return auth.error;
    const supplierBlock = await requireNotSupplier(auth.user, origin);
    if (supplierBlock) return supplierBlock;
    const parsed = await tryParseJson(req);
    if (!parsed.ok) return errorResponse('Invalid JSON body', 400, origin);
    const requestBody = parsed.body;

    if (auth.user.user_type === 'customer') {
      requestBody.customerCompanyId = auth.user.company_id;
    }

    const result = await validate(requestBody);
    if (!result.ok) {
      return errorResponse(`Validation failed: ${result.field} - ${result.reason}`, 422, origin);
    }

    if (auth.user.user_type === 'customer') {
      result.data = { ...result.data };
    }

    try {
      const created = await insertSupplyRequest(result.data);
      await recordActivityEvent('SUPPLY_REQUEST_SUBMITTED', auth.user, {
        supplyRequestId: created.id,
      });
      return jsonResponse(created, 201, origin);
    } catch (err) {
      console.error('[shanan-api] Insert failed:', err);
      return errorResponse('Could not persist your request. Please try again later.', 500, origin);
    }
  }

  // GET /api/supply-requests/:id - fetch single (auth + ownership check)
  const srMatch = url.pathname.match(/^\/api\/supply-requests\/([^/]+)$/);
  if (srMatch && method === 'GET') {
    const auth = await requireAuth(req, origin);
    if (auth.error) return auth.error;
    const supplierBlock = await requireNotSupplier(auth.user, origin);
    if (supplierBlock) return supplierBlock;
    const requestId = decodeURIComponent(srMatch[1]);
    try {
      const rows = await sql()`
        SELECT sr.id, sr.reference, sr.requester_name, sr.company_name, sr.email, sr.phone,
               sr.country, sr.city, sr.message, sr.status, sr.created_at,
               sr.customer_company_id, sr.customer_po_number, sr.credit_application_id,
               sr.delivery_date,
               cc.reference AS customer_company_reference, cc.name_en AS customer_company_name
          FROM supply_requests sr
          LEFT JOIN customer_companies cc ON sr.customer_company_id = cc.id
         WHERE sr.id = ${requestId} OR sr.reference = ${requestId}
         LIMIT 1`;
      const parent = rows[0] as { id: string; customer_company_id: string | null } | undefined;
      if (!parent) {
        return errorResponse('Request not found', 404, origin);
      }
      if (auth.user.user_type === 'customer' && parent.customer_company_id !== auth.user.company_id) {
        return errorResponse('Request not found', 404, origin);
      }
      const items = await sql()`SELECT id, request_id, product_id, product_name, sku, quantity, notes FROM supply_request_items WHERE request_id = ${parent.id} ORDER BY id ASC`;
      return jsonResponse({ request: parent, items }, 200, origin);
    } catch (err) {
      console.error('[shanan-api] Single-query failed:', err);
      return errorResponse('Could not retrieve request.', 500, origin);
    }
  }

  // PATCH /api/supply-requests/:id - status workflow + customer editing
  if (srMatch && method === 'PATCH') {
    const auth = await requireAuth(req, origin);
    if (auth.error) return auth.error;
    const supplierBlock = await requireNotSupplier(auth.user, origin);
    if (supplierBlock) return supplierBlock;
    const requestId = decodeURIComponent(srMatch[1]);
    const parsed = await tryParseJson(req);
    if (!parsed.ok) return errorResponse('Invalid JSON body', 400, origin);
    const b = parsed.body as Record<string, unknown>;
    const now = new Date().toISOString();

    const existingRows = await sql()`SELECT * FROM supply_requests WHERE id = ${requestId} OR reference = ${requestId} LIMIT 1`;
    const existing = existingRows[0] as Record<string, unknown> | undefined;
    if (!existing) return errorResponse('Request not found', 404, origin);

    if (auth.user.user_type === 'customer' && existing.customer_company_id !== auth.user.company_id) {
      return errorResponse('Request not found', 404, origin);
    }

    const currentStatus = existing.status as string;

    if (b.action === 'submit') {
      if (auth.user.user_type === 'customer' && existing.customer_company_id !== auth.user.company_id) {
        return errorResponse('Request not found', 404, origin);
      }
      if (currentStatus !== 'draft' && currentStatus !== 'pending') {
        return errorResponse(`Cannot submit: current status is '${currentStatus}' (must be 'draft' or 'pending')`, 400, origin);
      }
      const itemCountRows = await sql()`SELECT COUNT(*)::int AS n FROM supply_request_items WHERE request_id = ${existing.id}`;
      if (Number(itemCountRows[0]?.n ?? 0) === 0) {
        return errorResponse('Cannot submit: request has no items', 422, origin);
      }
      await sql()`UPDATE supply_requests SET status = 'submitted', updated_at = ${now} WHERE id = ${existing.id}`;
      const updatedRows = await sql()`SELECT * FROM supply_requests WHERE id = ${existing.id} LIMIT 1`;
      return jsonResponse({ request: updatedRows[0] }, 200, origin);
    }

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
      if (auth.user.user_type !== 'internal') {
        return errorResponse('Forbidden: SHANAN internal access required for this action', 403, origin);
      }
      if (b.action === 'close' && auth.user.role !== 'admin' && auth.user.role !== 'manager') {
        return errorResponse('Forbidden: admin or manager role required to close requests', 403, origin);
      }
      const action = b.action as string;
      const allowedFrom = INTERNAL_TRANSITIONS[action];
      if (!allowedFrom.includes(currentStatus)) {
        return errorResponse(`Cannot ${action}: current status is '${currentStatus}' (must be one of: ${allowedFrom.join(', ')})`, 400, origin);
      }
      if (action === 'close') {
        const docRef = `DOC-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
        await sql()`UPDATE supply_requests SET status = 'closed', official_doc_reference = ${docRef}, closed_at = ${now}, closed_by = ${auth.user.id}, updated_at = ${now} WHERE id = ${existing.id}`;
      } else {
        await sql()`UPDATE supply_requests SET status = ${TARGET_STATUS[action]}, updated_at = ${now} WHERE id = ${existing.id}`;
      }
      const updatedRows = await sql()`SELECT * FROM supply_requests WHERE id = ${existing.id} LIMIT 1`;
      return jsonResponse({ request: updatedRows[0] }, 200, origin);
    }

    if (currentStatus !== 'draft' && currentStatus !== 'pending') {
      return errorResponse(`Cannot edit: request status is '${currentStatus}'. Only draft or pending requests can be edited.`, 400, origin);
    }

    const updates: string[] = [];
    const values: any[] = [];

    if (b.customerPoNumber !== undefined) {
      if (typeof b.customerPoNumber !== 'string' || b.customerPoNumber.length > 100) {
        return errorResponse('Validation failed: customerPoNumber - must be a string of 100 characters or fewer', 400, origin);
      }
      updates.push('customer_po_number = $' + String(updates.length + 1));
      values.push(b.customerPoNumber.trim() || null);
    }
    if (typeof b.message === 'string') {
      updates.push('message = $' + String(updates.length + 1));
      values.push(b.message.trim() || null);
    }
    if (b.deliveryDate !== undefined) {
      if (b.deliveryDate !== null && b.deliveryDate !== '') {
        if (typeof b.deliveryDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(b.deliveryDate.trim())) {
          return errorResponse('Validation failed: deliveryDate - must be in YYYY-MM-DD format or omitted', 400, origin);
        }
        updates.push('delivery_date = $' + String(updates.length + 1));
        values.push(b.deliveryDate.trim());
      } else {
        updates.push('delivery_date = $' + String(updates.length + 1));
        values.push(null);
      }
    }
    if (b.creditApplicationId !== undefined) {
      const ownerCompanyId = (existing.customer_company_id as string | null) ?? null;
      if (auth.user.user_type === 'customer' && ownerCompanyId !== auth.user.company_id) {
        return errorResponse('Request not found', 404, origin);
      }
      const creditLink = await validateCreditApplicationLink(b.creditApplicationId, ownerCompanyId);
      if (!creditLink.ok) {
        return errorResponse(`Validation failed: creditApplicationId - ${creditLink.reason}`, 400, origin);
      }
      updates.push('credit_application_id = $' + String(updates.length + 1));
      values.push(creditLink.id);
    }

    if (updates.length === 0) {
      return errorResponse('No valid fields to update', 422, origin);
    }

    if (currentStatus === 'pending' && auth.user.user_type === 'customer') {
      updates.push('status = $' + String(updates.length + 1));
      values.push('draft');
    }

    updates.push('updated_at = $' + String(updates.length + 1));
    values.push(now);
    values.push(existing.id);

    try {
      await sql().unsafe(`UPDATE supply_requests SET ${updates.join(', ')} WHERE id = $${updates.length}`, values);
      const updatedRows = await sql()`SELECT * FROM supply_requests WHERE id = ${existing.id} LIMIT 1`;
      return jsonResponse({ request: updatedRows[0] }, 200, origin);
    } catch (err) {
      console.error('[shanan-api] Supply request update failed:', err);
      return errorResponse('Could not update request.', 500, origin);
    }
  }

  // GET /api/supply-requests/:id/pdf - official PDF document
  const pdfMatch = url.pathname.match(/^\/api\/supply-requests\/([^/]+)\/pdf$/);
  if (pdfMatch && method === 'GET') {
    const auth = await requireAuth(req, origin);
    if (auth.error) return auth.error;
    const supplierBlock = await requireNotSupplier(auth.user, origin);
    if (supplierBlock) return supplierBlock;
    const requestId = decodeURIComponent(pdfMatch[1]);
    try {
      const reqRows = await sql()`
        SELECT sr.id, sr.reference, sr.requester_name, sr.company_name, sr.email, sr.phone,
               sr.country, sr.city, sr.message, sr.status, sr.created_at, sr.customer_po_number,
               sr.customer_company_id, sr.credit_application_id,
               sr.official_doc_reference, sr.closed_at,
               cc.reference AS cc_ref, cc.name_en AS cc_name
          FROM supply_requests sr
          LEFT JOIN customer_companies cc ON sr.customer_company_id = cc.id
         WHERE sr.id = ${requestId} OR sr.reference = ${requestId}
         LIMIT 1`;
      const req_data = reqRows[0] as any;
      if (!req_data) return errorResponse('Request not found', 404, origin);
      if (auth.user.user_type === 'customer' && req_data.customer_company_id !== auth.user.company_id) {
        return errorResponse('Request not found', 404, origin);
      }
      const items = await sql()`SELECT product_id, product_name, sku, quantity, notes FROM supply_request_items WHERE request_id = ${req_data.id} ORDER BY id ASC`;

      let creditAppRef: string | null = null;
      if (req_data.credit_application_id) {
        const caRows = await sql()`SELECT application_number, status FROM credit_applications WHERE id = ${req_data.credit_application_id} LIMIT 1`;
        const ca = caRows[0] as any;
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
  // Phase A1 - Customer Company endpoints
  // ============================================================

  // GET /api/customers - list (internal only)
  if (url.pathname === '/api/customers' && method === 'GET') {
    const auth = await requireInternal(req, origin);
    if (auth.error) return auth.error;
    try {
      const rows = await sql()`SELECT id, reference, name_en, name_ar, email, phone, country, city, address, tax_id, account_status, payment_mode, created_at, updated_at FROM customer_companies ORDER BY created_at DESC`;
      return jsonResponse({ customers: rows, count: rows.length }, 200, origin);
    } catch (err) {
      console.error('[shanan-api] Customer query failed:', err);
      return errorResponse('Could not retrieve customers.', 500, origin);
    }
  }

  // POST /api/customers - create (internal only)
  if (url.pathname === '/api/customers' && method === 'POST') {
    const auth = await requireInternal(req, origin);
    if (auth.error) return auth.error;
    const parsed = await tryParseJson(req);
    if (!parsed.ok) return errorResponse('Invalid JSON body', 400, origin);
    const b = parsed.body as Record<string, unknown>;
    if (typeof b.nameEn !== 'string' || b.nameEn.trim() === '') {
      return errorResponse('Validation failed: nameEn - required', 422, origin);
    }
    let paymentMode: 'cash' | 'credit' = 'cash';
    if (b.paymentMode !== undefined && b.paymentMode !== null) {
      if (typeof b.paymentMode === 'string' && ['cash', 'credit'].includes(b.paymentMode)) {
        paymentMode = b.paymentMode as 'cash' | 'credit';
      } else {
        return errorResponse(`Validation failed: paymentMode - must be 'cash' or 'credit' (got: ${String(b.paymentMode)})`, 400, origin);
      }
    }
    let accountStatus: 'pending' | 'active' | 'suspended' | 'rejected' | 'closed' = 'pending';
    if (b.accountStatus !== undefined && b.accountStatus !== null) {
      if (typeof b.accountStatus === 'string' && ['pending', 'active', 'suspended', 'rejected', 'closed'].includes(b.accountStatus)) {
        accountStatus = b.accountStatus as 'pending' | 'active' | 'suspended' | 'rejected' | 'closed';
      } else {
        return errorResponse(`Validation failed: accountStatus - must be one of: pending, active, suspended, rejected, closed (got: ${String(b.accountStatus)})`, 400, origin);
      }
    }
    const id = generateId();
    const reference = generateCustomerReference();
    const now = new Date().toISOString();
    try {
      await sql()`
        INSERT INTO customer_companies
          (id, reference, name_en, name_ar, email, phone, country, city, address, tax_id,
           account_status, payment_mode, created_at, updated_at)
        VALUES (${id}, ${reference}, ${b.nameEn}, ${typeof b.nameAr === 'string' ? b.nameAr : null},
                ${typeof b.email === 'string' ? b.email.trim() : null},
                ${typeof b.phone === 'string' ? b.phone.trim() : null},
                ${typeof b.country === 'string' ? b.country.trim() : null},
                ${typeof b.city === 'string' ? b.city.trim() : null},
                ${typeof b.address === 'string' ? b.address.trim() : null},
                ${typeof b.taxId === 'string' ? b.taxId.trim() : null},
                ${accountStatus}, ${paymentMode}, ${now}, ${now})`;
      return jsonResponse({ id, reference, createdAt: now }, 201, origin);
    } catch (err) {
      console.error('[shanan-api] Customer insert failed:', err);
      return errorResponse('Could not create customer company.', 500, origin);
    }
  }

  // GET/PATCH /api/customers/:id
  const customerMatch = url.pathname.match(/^\/api\/customers\/([^/]+)$/);
  if (customerMatch && (method === 'GET' || method === 'PATCH')) {
    const auth = await requireInternal(req, origin);
    if (auth.error) return auth.error;
    const customerId = decodeURIComponent(customerMatch[1]);
    if (method === 'GET') {
      try {
        const rows = await sql()`SELECT id, reference, name_en, name_ar, email, phone, country, city, address, tax_id, account_status, payment_mode, created_at, updated_at FROM customer_companies WHERE id = ${customerId} OR reference = ${customerId} LIMIT 1`;
        if (!rows[0]) return errorResponse('Customer not found', 404, origin);
        return jsonResponse({ customer: rows[0] }, 200, origin);
      } catch (err) {
        console.error('[shanan-api] Customer lookup failed:', err);
        return errorResponse('Could not retrieve customer.', 500, origin);
      }
    }
    const parsed = await tryParseJson(req);
    if (!parsed.ok) return errorResponse('Invalid JSON body', 400, origin);
    const existingRows = await sql()`SELECT id FROM customer_companies WHERE id = ${customerId} OR reference = ${customerId} LIMIT 1`;
    const existing = existingRows[0] as { id: string } | undefined;
    if (!existing) return errorResponse('Customer not found', 404, origin);
    const b = parsed.body as Record<string, unknown>;
    const updates: string[] = [];
    const values: any[] = [];
    if (b.accountStatus !== undefined && b.accountStatus !== null) {
      if (typeof b.accountStatus === 'string' && ['pending', 'active', 'suspended', 'rejected', 'closed'].includes(b.accountStatus)) {
        updates.push('account_status = $' + String(updates.length + 1));
        values.push(b.accountStatus);
      } else {
        return errorResponse(`Validation failed: accountStatus - must be one of: pending, active, suspended, rejected, closed (got: ${String(b.accountStatus)})`, 400, origin);
      }
    }
    if (b.paymentMode !== undefined && b.paymentMode !== null) {
      if (typeof b.paymentMode === 'string' && ['cash', 'credit'].includes(b.paymentMode)) {
        updates.push('payment_mode = $' + String(updates.length + 1));
        values.push(b.paymentMode);
      } else {
        return errorResponse(`Validation failed: paymentMode - must be 'cash' or 'credit' (got: ${String(b.paymentMode)})`, 400, origin);
      }
    }
    for (const [field, col] of [
      ['nameEn', 'name_en'], ['nameAr', 'name_ar'], ['email', 'email'],
      ['phone', 'phone'], ['country', 'country'], ['city', 'city'],
      ['address', 'address'], ['taxId', 'tax_id'],
    ] as const) {
      if (typeof b[field] === 'string') {
        updates.push(`${col} = $${String(updates.length + 1)}`);
        values.push((b[field] as string).trim());
      }
    }
    if (updates.length === 0) return errorResponse('No valid fields to update', 422, origin);
    updates.push('updated_at = $' + String(updates.length + 1));
    values.push(new Date().toISOString());
    values.push(existing.id);
    try {
      await sql().unsafe(`UPDATE customer_companies SET ${updates.join(', ')} WHERE id = $${updates.length}`, values);
      const updatedRows = await sql()`SELECT id, reference, name_en, name_ar, email, phone, country, city, address, tax_id, account_status, payment_mode, created_at, updated_at FROM customer_companies WHERE id = ${existing.id} LIMIT 1`;
      return jsonResponse({ customer: updatedRows[0] }, 200, origin);
    } catch (err) {
      console.error('[shanan-api] Customer update failed:', err);
      return errorResponse('Could not update customer.', 500, origin);
    }
  }

  // ============================================================
  // Phase A2 - Users, Roles & Access endpoints
  // ============================================================

  // GET /api/users - list (internal only)
  if (url.pathname === '/api/users' && method === 'GET') {
    const auth = await requireInternal(req, origin);
    if (auth.error) return auth.error;
    try {
      const rows = await sql()`
        SELECT u.id, u.name, u.email, u.user_type, u.role, u.company_id,
               u.is_active, u.created_at, u.updated_at,
               cc.reference AS company_reference, cc.name_en AS company_name_en
          FROM users u
          LEFT JOIN customer_companies cc ON u.company_id = cc.id
         ORDER BY u.created_at DESC`;
      return jsonResponse({ users: rows, count: rows.length }, 200, origin);
    } catch (err) {
      console.error('[shanan-api] User query failed:', err);
      return errorResponse('Could not retrieve users.', 500, origin);
    }
  }

  // POST /api/users - create login-capable user
  if (url.pathname === '/api/users' && method === 'POST') {
    const auth = await requireAuth(req, origin);
    if (auth.error) return auth.error;
    const supplierBlock = await requireNotSupplier(auth.user, origin);
    if (supplierBlock) return supplierBlock;
    if (auth.user.user_type === 'customer' && auth.user.role !== 'customer_admin') {
      return errorResponse('Forbidden: insufficient permissions to create users', 403, origin);
    }
    const parsed = await tryParseJson(req);
    if (!parsed.ok) return errorResponse('Invalid JSON body', 400, origin);
    const b = parsed.body as Record<string, unknown>;
    if (typeof b.name !== 'string' || b.name.trim() === '') return errorResponse('Validation failed: name - required', 422, origin);
    if (typeof b.email !== 'string' || b.email.trim() === '' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email)) return errorResponse('Validation failed: email - valid email required', 422, origin);
    if (typeof b.password !== 'string' || b.password.length < 8) return errorResponse('Validation failed: password - must be at least 8 characters', 422, origin);

    const VALID_USER_TYPES = ['internal', 'customer'];
    let userType: 'internal' | 'customer' = 'customer';
    if (b.userType !== undefined && b.userType !== null) {
      if (typeof b.userType === 'string' && VALID_USER_TYPES.includes(b.userType)) {
        userType = b.userType as 'internal' | 'customer';
      } else {
        return errorResponse(`Validation failed: userType - must be 'internal' or 'customer' (got: ${String(b.userType)})`, 400, origin);
      }
    }
    if (auth.user.user_type === 'customer' && userType !== 'customer') return errorResponse('Forbidden: customer users can only create customer-type users', 403, origin);
    if (auth.user.user_type === 'internal' && auth.user.role === 'employee' && userType !== 'customer') return errorResponse('Forbidden: employees can only create customer-type users', 403, origin);

    const VALID_INTERNAL_ROLES = ['admin', 'manager', 'employee'];
    const VALID_CUSTOMER_ROLES = ['customer_admin', 'customer_user'];
    const ALL_VALID_ROLES = [...VALID_INTERNAL_ROLES, ...VALID_CUSTOMER_ROLES];
    let role: string = userType === 'internal' ? 'employee' : 'customer_user';
    if (b.role !== undefined && b.role !== null) {
      if (typeof b.role === 'string' && ALL_VALID_ROLES.includes(b.role)) {
        role = b.role;
      } else {
        return errorResponse(`Validation failed: role - must be one of: ${ALL_VALID_ROLES.join(', ')} (got: ${String(b.role)})`, 400, origin);
      }
    }
    if (userType === 'internal' && !VALID_INTERNAL_ROLES.includes(role)) return errorResponse(`Validation failed: role - internal users must have role: ${VALID_INTERNAL_ROLES.join(', ')} (got: ${role})`, 400, origin);
    if (userType === 'customer' && !VALID_CUSTOMER_ROLES.includes(role)) return errorResponse(`Validation failed: role - customer users must have role: ${VALID_CUSTOMER_ROLES.join(', ')} (got: ${role})`, 400, origin);
    if (auth.user.user_type === 'internal' && auth.user.role === 'employee' && role === 'admin') return errorResponse('Forbidden: cannot create users with admin role', 403, origin);
    if (auth.user.user_type === 'customer' && role === 'customer_admin' && auth.user.role !== 'customer_admin') return errorResponse('Forbidden: insufficient permissions', 403, origin);

    let companyId: string | null = null;
    if (userType === 'internal') {
      companyId = null;
    } else {
      if (auth.user.user_type === 'customer') {
        companyId = auth.user.company_id;
      } else {
        if (typeof b.companyId !== 'string' || b.companyId.trim() === '') return errorResponse('Validation failed: companyId - required for customer users', 422, origin);
        const companyRows = await sql()`SELECT id FROM customer_companies WHERE id = ${b.companyId} LIMIT 1`;
        if (!companyRows[0]) return errorResponse('Validation failed: companyId - references a non-existent customer company', 422, origin);
        companyId = companyRows[0].id;
      }
    }

    const existingRows = await sql()`SELECT id FROM users WHERE email = ${b.email.trim().toLowerCase()} LIMIT 1`;
    if (existingRows[0]) return errorResponse('Validation failed: email - already in use', 409, origin);

    const id = generateId();
    const passwordHash = await hashPassword(b.password);
    const now = new Date().toISOString();
    try {
      await sql()`
        INSERT INTO users (id, name, email, password_hash, user_type, role, company_id, supplier_id, is_active, created_at, updated_at)
        VALUES (${id}, ${b.name}, ${(b.email as string).trim().toLowerCase()}, ${passwordHash}, ${userType}, ${role}, ${companyId}, null, 1, ${now}, ${now})`;
      return jsonResponse({ id, createdAt: now }, 201, origin);
    } catch (err) {
      console.error('[shanan-api] User insert failed:', err);
      return errorResponse('Could not create user.', 500, origin);
    }
  }

  // GET/PATCH /api/users/:id
  const userMatch = url.pathname.match(/^\/api\/users\/([^/]+)$/);
  if (userMatch && (method === 'GET' || method === 'PATCH')) {
    const auth = await requireAuth(req, origin);
    if (auth.error) return auth.error;
    const supplierBlock = await requireNotSupplier(auth.user, origin);
    if (supplierBlock) return supplierBlock;
    const userId = decodeURIComponent(userMatch[1]);
    if (method === 'GET') {
      try {
        const rows = await sql()`SELECT u.id, u.name, u.email, u.user_type, u.role, u.company_id, u.is_active, u.created_at, u.updated_at, cc.reference AS company_reference, cc.name_en AS company_name_en FROM users u LEFT JOIN customer_companies cc ON u.company_id = cc.id WHERE u.id = ${userId} LIMIT 1`;
        if (!rows[0]) return errorResponse('User not found', 404, origin);
        if (auth.user.user_type === 'customer' && rows[0].id !== auth.user.id) return errorResponse('User not found', 404, origin);
        return jsonResponse({ user: rows[0] }, 200, origin);
      } catch (err) {
        console.error('[shanan-api] User lookup failed:', err);
        return errorResponse('Could not retrieve user.', 500, origin);
      }
    }
    const parsed = await tryParseJson(req);
    if (!parsed.ok) return errorResponse('Invalid JSON body', 400, origin);
    const existingRows = await sql()`SELECT id, user_type, role, company_id FROM users WHERE id = ${userId} LIMIT 1`;
    const existing = existingRows[0] as { id: string; user_type: string; role: string; company_id: string | null } | undefined;
    if (!existing) return errorResponse('User not found', 404, origin);
    const b = parsed.body as Record<string, unknown>;
    const updates: string[] = [];
    const values: any[] = [];
    const isInternal = auth.user.user_type === 'internal';
    const isInternalAdminOrManager = isInternal && (auth.user.role === 'admin' || auth.user.role === 'manager');
    const isSelf = auth.user.id === existing.id;
    const isSameCompany = auth.user.company_id === existing.company_id;

    if (typeof b.name === 'string' && b.name.trim() !== '') {
      if (!(isInternal || (auth.user.user_type === 'customer' && auth.user.role === 'customer_admin' && isSameCompany) || isSelf)) {
        return errorResponse('Forbidden: insufficient permissions to update this user', 403, origin);
      }
      updates.push('name = $' + String(updates.length + 1));
      values.push(b.name.trim());
    }
    if (b.role !== undefined && b.role !== null) {
      if (!isInternalAdminOrManager) return errorResponse('Forbidden: only internal admin or manager can change user roles', 403, origin);
      const VALID_INTERNAL_ROLES = ['admin', 'manager', 'employee'];
      const VALID_CUSTOMER_ROLES = ['customer_admin', 'customer_user'];
      const validForType = existing.user_type === 'internal' ? VALID_INTERNAL_ROLES : VALID_CUSTOMER_ROLES;
      if (typeof b.role === 'string' && validForType.includes(b.role)) {
        updates.push('role = $' + String(updates.length + 1));
        values.push(b.role);
      } else {
        return errorResponse(`Validation failed: role - must be one of: ${validForType.join(', ')} for userType '${existing.user_type}' (got: ${String(b.role)})`, 400, origin);
      }
    }
    if (b.isActive !== undefined && b.isActive !== null) {
      if (!isInternalAdminOrManager) return errorResponse('Forbidden: only internal admin or manager can change user active status', 403, origin);
      if (typeof b.isActive === 'boolean') {
        updates.push('is_active = $' + String(updates.length + 1));
        values.push(b.isActive ? 1 : 0);
      } else {
        return errorResponse('Validation failed: isActive - must be boolean', 400, origin);
      }
    }
    if (updates.length === 0) return errorResponse('No valid fields to update', 422, origin);
    updates.push('updated_at = $' + String(updates.length + 1));
    values.push(new Date().toISOString());
    values.push(existing.id);
    try {
      await sql().unsafe(`UPDATE users SET ${updates.join(', ')} WHERE id = $${updates.length}`, values);
      const updatedRows = await sql()`SELECT u.id, u.name, u.email, u.user_type, u.role, u.company_id, u.is_active, u.created_at, u.updated_at, cc.reference AS company_reference, cc.name_en AS company_name_en FROM users u LEFT JOIN customer_companies cc ON u.company_id = cc.id WHERE u.id = ${existing.id} LIMIT 1`;
      return jsonResponse({ user: updatedRows[0] }, 200, origin);
    } catch (err) {
      console.error('[shanan-api] User update failed:', err);
      return errorResponse('Could not update user.', 500, origin);
    }
  }

  // ============================================================
  // Phase A4 - Credit Application endpoints
  // ============================================================

  // GET /api/credit-applications - list (auth + ownership)
  if (url.pathname === '/api/credit-applications' && method === 'GET') {
    const auth = await requireAuth(req, origin);
    if (auth.error) return auth.error;
    const supplierBlock = await requireNotSupplier(auth.user, origin);
    if (supplierBlock) return supplierBlock;
    try {
      let rows;
      if (auth.user.user_type === 'customer') {
        rows = await sql()`SELECT ca.*, cc.reference AS customer_company_reference, cc.name_en AS customer_company_name FROM credit_applications ca LEFT JOIN customer_companies cc ON ca.customer_company_id = cc.id WHERE ca.customer_company_id = ${auth.user.company_id} ORDER BY ca.created_at DESC`;
      } else {
        const filterCompany = url.searchParams.get('customerCompanyId');
        if (filterCompany) {
          rows = await sql()`SELECT ca.*, cc.reference AS customer_company_reference, cc.name_en AS customer_company_name FROM credit_applications ca LEFT JOIN customer_companies cc ON ca.customer_company_id = cc.id WHERE ca.customer_company_id = ${filterCompany} ORDER BY ca.created_at DESC`;
        } else {
          rows = await sql()`SELECT ca.*, cc.reference AS customer_company_reference, cc.name_en AS customer_company_name FROM credit_applications ca LEFT JOIN customer_companies cc ON ca.customer_company_id = cc.id ORDER BY ca.created_at DESC`;
        }
      }
      return jsonResponse({ applications: rows, count: rows.length }, 200, origin);
    } catch (err) {
      console.error('[shanan-api] Credit application query failed:', err);
      return errorResponse('Could not retrieve credit applications.', 500, origin);
    }
  }

  // POST /api/credit-applications - create (auth + ownership)
  if (url.pathname === '/api/credit-applications' && method === 'POST') {
    const auth = await requireAuth(req, origin);
    if (auth.error) return auth.error;
    const supplierBlock = await requireNotSupplier(auth.user, origin);
    if (supplierBlock) return supplierBlock;
    const parsed = await tryParseJson(req);
    if (!parsed.ok) return errorResponse('Invalid JSON body', 400, origin);
    const b = parsed.body as Record<string, unknown>;
    let customerCompanyId: string;
    if (auth.user.user_type === 'customer') {
      customerCompanyId = auth.user.company_id!;
    } else {
      if (typeof b.customerCompanyId !== 'string' || b.customerCompanyId.trim() === '') return errorResponse('Validation failed: customerCompanyId - required', 422, origin);
      customerCompanyId = b.customerCompanyId;
    }
    if (typeof b.authorizedPersonName !== 'string' || b.authorizedPersonName.trim() === '') return errorResponse('Validation failed: authorizedPersonName - required', 422, origin);
    const companyRows = await sql()`SELECT id FROM customer_companies WHERE id = ${customerCompanyId} LIMIT 1`;
    if (!companyRows[0]) return errorResponse('Validation failed: customerCompanyId - references a non-existent customer company', 422, origin);
    const id = generateId();
    const applicationNumber = generateCreditApplicationNumber();
    const now = new Date().toISOString();
    try {
      await sql()`
        INSERT INTO credit_applications
          (id, customer_company_id, application_number, status,
           requested_credit_limit, requested_payment_terms, requested_payment_method,
           business_activity, company_registration_number, tax_number,
           authorized_person_name, authorized_person_title, authorized_person_phone, authorized_person_email,
           requested_by_user_id, submitted_at, reviewed_at, reviewed_by,
           approval_notes, rejection_reason, created_at, updated_at)
        VALUES (${id}, ${companyRows[0].id}, ${applicationNumber}, 'draft',
                ${typeof b.requestedCreditLimit === 'string' ? b.requestedCreditLimit : null},
                ${typeof b.requestedPaymentTerms === 'string' ? b.requestedPaymentTerms : null},
                ${typeof b.requestedPaymentMethod === 'string' ? b.requestedPaymentMethod : null},
                ${typeof b.businessActivity === 'string' ? b.businessActivity : null},
                ${typeof b.companyRegistrationNumber === 'string' ? b.companyRegistrationNumber : null},
                ${typeof b.taxNumber === 'string' ? b.taxNumber : null},
                ${b.authorizedPersonName},
                ${typeof b.authorizedPersonTitle === 'string' ? b.authorizedPersonTitle : null},
                ${typeof b.authorizedPersonPhone === 'string' ? b.authorizedPersonPhone : null},
                ${typeof b.authorizedPersonEmail === 'string' ? b.authorizedPersonEmail : null},
                null, null, null, null, null, null, ${now}, ${now})`;
      return jsonResponse({ id, applicationNumber, status: 'draft', createdAt: now }, 201, origin);
    } catch (err) {
      console.error('[shanan-api] Credit application insert failed:', err);
      return errorResponse('Could not create credit application.', 500, origin);
    }
  }

  // GET/PATCH /api/credit-applications/:id
  const creditMatch = url.pathname.match(/^\/api\/credit-applications\/([^/]+)$/);
  if (creditMatch && (method === 'GET' || method === 'PATCH')) {
    const auth = await requireAuth(req, origin);
    if (auth.error) return auth.error;
    const supplierBlock = await requireNotSupplier(auth.user, origin);
    if (supplierBlock) return supplierBlock;
    const appId = decodeURIComponent(creditMatch[1]);
    if (method === 'GET') {
      try {
        const rows = await sql()`SELECT ca.*, cc.reference AS customer_company_reference, cc.name_en AS customer_company_name FROM credit_applications ca LEFT JOIN customer_companies cc ON ca.customer_company_id = cc.id WHERE ca.id = ${appId} OR ca.application_number = ${appId} LIMIT 1`;
        if (!rows[0]) return errorResponse('Credit application not found', 404, origin);
        if (auth.user.user_type === 'customer' && rows[0].customer_company_id !== auth.user.company_id) return errorResponse('Credit application not found', 404, origin);
        return jsonResponse({ application: rows[0] }, 200, origin);
      } catch (err) {
        console.error('[shanan-api] Credit application lookup failed:', err);
        return errorResponse('Could not retrieve credit application.', 500, origin);
      }
    }
    const parsed = await tryParseJson(req);
    if (!parsed.ok) return errorResponse('Invalid JSON body', 400, origin);
    const existingRows = await sql()`SELECT * FROM credit_applications WHERE id = ${appId} OR application_number = ${appId} LIMIT 1`;
    const existing = existingRows[0] as Record<string, unknown> | undefined;
    if (!existing) return errorResponse('Credit application not found', 404, origin);
    if (auth.user.user_type === 'customer' && existing.customer_company_id !== auth.user.company_id) return errorResponse('Credit application not found', 404, origin);
    const b = parsed.body as Record<string, unknown>;
    const currentStatus = existing.status as string;
    const now = new Date().toISOString();

    const ADMIN_ACTIONS = ['start_review', 'approve', 'reject', 'return_for_correction'];
    if (ADMIN_ACTIONS.includes(b.action as string)) {
      if (auth.user.user_type !== 'internal') return errorResponse('Forbidden: SHANAN internal access required for this action', 403, origin);
      if (b.action !== 'start_review' && auth.user.role !== 'admin' && auth.user.role !== 'manager') return errorResponse('Forbidden: admin or manager role required for this action', 403, origin);
    }

    if (b.action === 'submit') {
      if (currentStatus !== 'draft' && currentStatus !== 'returned_for_correction') return errorResponse(`Cannot submit: current status is '${currentStatus}' (must be 'draft' or 'returned_for_correction')`, 400, origin);
      await sql()`UPDATE credit_applications SET status = 'submitted', submitted_at = ${now}, updated_at = ${now} WHERE id = ${existing.id}`;
      const updatedRows = await sql()`SELECT * FROM credit_applications WHERE id = ${existing.id} LIMIT 1`;
      return jsonResponse({ application: updatedRows[0] }, 200, origin);
    }
    if (b.action === 'start_review') {
      if (currentStatus !== 'submitted') return errorResponse(`Cannot start review: current status is '${currentStatus}' (must be 'submitted')`, 400, origin);
      await sql()`UPDATE credit_applications SET status = 'under_review', updated_at = ${now} WHERE id = ${existing.id}`;
      const updatedRows = await sql()`SELECT * FROM credit_applications WHERE id = ${existing.id} LIMIT 1`;
      return jsonResponse({ application: updatedRows[0] }, 200, origin);
    }
    if (b.action === 'approve') {
      if (currentStatus !== 'under_review') return errorResponse(`Cannot approve: current status is '${currentStatus}' (must be 'under_review')`, 400, origin);
      const notes = typeof b.approvalNotes === 'string' ? b.approvalNotes : null;
      const reviewer = typeof b.reviewedBy === 'string' ? b.reviewedBy : null;
      await sql()`UPDATE credit_applications SET status = 'approved', approval_notes = ${notes}, reviewed_at = ${now}, reviewed_by = ${reviewer}, updated_at = ${now} WHERE id = ${existing.id}`;
      const updatedRows = await sql()`SELECT * FROM credit_applications WHERE id = ${existing.id} LIMIT 1`;
      return jsonResponse({ application: updatedRows[0] }, 200, origin);
    }
    if (b.action === 'reject') {
      if (currentStatus !== 'under_review') return errorResponse(`Cannot reject: current status is '${currentStatus}' (must be 'under_review')`, 400, origin);
      const reason = typeof b.rejectionReason === 'string' ? b.rejectionReason : null;
      const reviewer = typeof b.reviewedBy === 'string' ? b.reviewedBy : null;
      await sql()`UPDATE credit_applications SET status = 'rejected', rejection_reason = ${reason}, reviewed_at = ${now}, reviewed_by = ${reviewer}, updated_at = ${now} WHERE id = ${existing.id}`;
      const updatedRows = await sql()`SELECT * FROM credit_applications WHERE id = ${existing.id} LIMIT 1`;
      return jsonResponse({ application: updatedRows[0] }, 200, origin);
    }
    if (b.action === 'return_for_correction') {
      if (currentStatus !== 'under_review') return errorResponse(`Cannot return: current status is '${currentStatus}' (must be 'under_review')`, 400, origin);
      await sql()`UPDATE credit_applications SET status = 'returned_for_correction', updated_at = ${now} WHERE id = ${existing.id}`;
      const updatedRows = await sql()`SELECT * FROM credit_applications WHERE id = ${existing.id} LIMIT 1`;
      return jsonResponse({ application: updatedRows[0] }, 200, origin);
    }
    if (b.action === 'cancel') {
      if (currentStatus !== 'draft' && currentStatus !== 'returned_for_correction') return errorResponse(`Cannot cancel: current status is '${currentStatus}'`, 400, origin);
      await sql()`UPDATE credit_applications SET status = 'cancelled', updated_at = ${now} WHERE id = ${existing.id}`;
      const updatedRows = await sql()`SELECT * FROM credit_applications WHERE id = ${existing.id} LIMIT 1`;
      return jsonResponse({ application: updatedRows[0] }, 200, origin);
    }

    if (currentStatus !== 'draft' && currentStatus !== 'returned_for_correction') {
      return errorResponse(`Cannot edit: application status is '${currentStatus}'. Only 'draft' or 'returned_for_correction' applications can be edited.`, 400, origin);
    }

    const updates: string[] = [];
    const cvalues: any[] = [];
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
          updates.push(`${col} = $${String(updates.length + 1)}`);
          cvalues.push((b[field] as string).trim());
        } else if (b[field] === null) {
          updates.push(`${col} = $${String(updates.length + 1)}`);
          cvalues.push(null);
        } else {
          return errorResponse(`Validation failed: ${field} - must be a string or null`, 400, origin);
        }
      }
    }
    if (updates.length === 0) return errorResponse('No valid fields to update', 422, origin);
    updates.push('updated_at = $' + String(updates.length + 1));
    cvalues.push(now);
    cvalues.push(existing.id);
    try {
      await sql().unsafe(`UPDATE credit_applications SET ${updates.join(', ')} WHERE id = $${updates.length}`, cvalues);
      const updatedRows = await sql()`SELECT * FROM credit_applications WHERE id = ${existing.id} LIMIT 1`;
      return jsonResponse({ application: updatedRows[0] }, 200, origin);
    } catch (err) {
      console.error('[shanan-api] Credit application update failed:', err);
      return errorResponse('Could not update credit application.', 500, origin);
    }
  }

  // ============================================================
  // Phase A8 - Account Records, Summary
  // ============================================================

  // GET /api/account-records - list (auth + ownership)
  if (url.pathname === '/api/account-records' && method === 'GET') {
    const auth = await requireAuth(req, origin);
    if (auth.error) return auth.error;
    const supplierBlock = await requireNotSupplier(auth.user, origin);
    if (supplierBlock) return supplierBlock;
    try {
      let rows;
      if (auth.user.user_type === 'customer') {
        rows = await sql()`SELECT * FROM customer_account_records WHERE customer_company_id = ${auth.user.company_id} ORDER BY created_at DESC`;
      } else {
        const filterCompany = url.searchParams.get('customerCompanyId');
        if (filterCompany) {
          rows = await sql()`SELECT * FROM customer_account_records WHERE customer_company_id = ${filterCompany} ORDER BY created_at DESC`;
        } else {
          rows = await sql()`SELECT * FROM customer_account_records ORDER BY created_at DESC`;
        }
      }
      return jsonResponse({ records: rows, count: rows.length }, 200, origin);
    } catch (err) {
      console.error('[shanan-api] Account records query failed:', err);
      return errorResponse('Could not retrieve account records.', 500, origin);
    }
  }

  // POST /api/account-records - create (internal only)
  if (url.pathname === '/api/account-records' && method === 'POST') {
    const auth = await requireInternal(req, origin);
    if (auth.error) return auth.error;
    const parsed = await tryParseJson(req);
    if (!parsed.ok) return errorResponse('Invalid JSON', 400, origin);
    const b = parsed.body as Record<string, unknown>;
    if (typeof b.customerCompanyId !== 'string' || typeof b.recordType !== 'string' || typeof b.amount !== 'number') {
      return errorResponse('customerCompanyId, recordType, amount required', 422, origin);
    }
    const id = generateId();
    const ref = `ACC-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const now = new Date().toISOString();
    try {
      await sql()`
        INSERT INTO customer_account_records (id, customer_company_id, supply_request_id, record_type, reference, description, amount, due_date, status, created_by, created_at, updated_at)
        VALUES (${id}, ${b.customerCompanyId}, ${typeof b.supplyRequestId === 'string' ? b.supplyRequestId : null}, ${b.recordType}, ${ref}, ${typeof b.description === 'string' ? b.description : null}, ${b.amount}, ${typeof b.dueDate === 'string' ? b.dueDate : null}, 'open', ${auth.user.id}, ${now}, ${now})`;
      return jsonResponse({ id, reference: ref, createdAt: now }, 201, origin);
    } catch (err) {
      console.error('[shanan-api] Account record insert failed:', err);
      return errorResponse('Could not create account record.', 500, origin);
    }
  }

  // GET /api/account-summary - customer financial summary (auth + ownership)
  if (url.pathname === '/api/account-summary' && method === 'GET') {
    const auth = await requireAuth(req, origin);
    if (auth.error) return auth.error;
    const supplierBlock = await requireNotSupplier(auth.user, origin);
    if (supplierBlock) return supplierBlock;
    const companyId = auth.user.user_type === 'customer' ? auth.user.company_id : url.searchParams.get('customerCompanyId');
    if (!companyId) return errorResponse('customerCompanyId required for internal users', 422, origin);
    try {
      const records = await sql()`SELECT amount, status, record_type, due_date FROM customer_account_records WHERE customer_company_id = ${companyId}`;
      let outstanding = 0, paid = 0;
      for (const r of records) {
        if (r.record_type === 'invoice' && r.status === 'open') outstanding += Number(r.amount);
        if (r.status === 'paid') paid += Number(r.amount);
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

  // ============================================================
  // Phase A9 - Suppliers (internal only)
  // ============================================================

  // GET /api/suppliers - list all suppliers (internal only)
  if (url.pathname === '/api/suppliers' && method === 'GET') {
    const auth = await requireInternal(req, origin);
    if (auth.error) return auth.error;
    try {
      const rows = await sql()`SELECT s.*, u.name AS created_by_name FROM suppliers s LEFT JOIN users u ON s.created_by = u.id ORDER BY s.created_at DESC`;
      return jsonResponse({ suppliers: rows, count: rows.length }, 200, origin);
    } catch (err) {
      console.error('[shanan-api] Suppliers query failed:', err);
      return errorResponse('Could not retrieve suppliers.', 500, origin);
    }
  }

  // POST /api/suppliers - create a new supplier (internal only)
  if (url.pathname === '/api/suppliers' && method === 'POST') {
    const auth = await requireInternal(req, origin);
    if (auth.error) return auth.error;
    const parsed = await tryParseJson(req);
    if (!parsed.ok) return errorResponse('Invalid JSON body', 400, origin);
    const b = parsed.body as Record<string, unknown>;
    if (typeof b.nameEn !== 'string' || b.nameEn.trim() === '') {
      return errorResponse('Validation failed: nameEn - required', 422, origin);
    }
    let status: 'pending' | 'under_review' | 'active' | 'suspended' | 'terminated' = 'pending';
    if (b.status !== undefined && b.status !== null) {
      if (typeof b.status === 'string' && ['pending', 'under_review', 'active', 'suspended', 'terminated'].includes(b.status)) {
        status = b.status as 'pending' | 'under_review' | 'active' | 'suspended' | 'terminated';
      } else {
        return errorResponse(`Validation failed: status - must be one of: pending, under_review, active, suspended, terminated (got: ${String(b.status)})`, 400, origin);
      }
    }
    const id = generateId();
    const reference = generateSupplierReference();
    const now = new Date().toISOString();
    try {
      await sql()`
        INSERT INTO suppliers
          (id, reference, name_en, name_ar, status, country, contact_name, contact_email,
           contact_phone, tax_id, notes, created_by, created_at, updated_at)
        VALUES (${id}, ${reference}, ${b.nameEn as string},
                ${typeof b.nameAr === 'string' ? b.nameAr : null}, ${status},
                ${typeof b.country === 'string' ? b.country.trim() : null},
                ${typeof b.contactName === 'string' ? b.contactName.trim() : null},
                ${typeof b.contactEmail === 'string' ? b.contactEmail.trim() : null},
                ${typeof b.contactPhone === 'string' ? b.contactPhone.trim() : null},
                ${typeof b.taxId === 'string' ? b.taxId.trim() : null},
                ${typeof b.notes === 'string' ? b.notes.trim() : null},
                ${auth.user.id}, ${now}, ${now})`;
      return jsonResponse({ id, reference, createdAt: now }, 201, origin);
    } catch (err) {
      console.error('[shanan-api] Supplier insert failed:', err);
      return errorResponse('Could not create supplier.', 500, origin);
    }
  }

  // GET /api/suppliers/:id - fetch single supplier + its agreements (internal only)
  const supplierMatch = url.pathname.match(/^\/api\/suppliers\/([^/]+)$/);
  if (supplierMatch && method === 'GET') {
    const auth = await requireInternal(req, origin);
    if (auth.error) return auth.error;
    const supplierIdOrRef = decodeURIComponent(supplierMatch[1]);
    try {
      const suppliers = await sql()`SELECT s.*, u.name AS created_by_name FROM suppliers s LEFT JOIN users u ON s.created_by = u.id WHERE s.id = ${supplierIdOrRef} OR s.reference = ${supplierIdOrRef} LIMIT 1`;
      const supplier = suppliers[0] as any;
      if (!supplier) return errorResponse('Supplier not found', 404, origin);
      const agreements = await sql()`SELECT id, agreement_number, status, effective_from, effective_to, currency, payment_terms_days, supplier_credit_limit, created_at FROM supplier_agreements WHERE supplier_id = ${supplier.id} ORDER BY created_at DESC`;
      return jsonResponse({ supplier, agreements, agreementsCount: agreements.length }, 200, origin);
    } catch (err) {
      console.error('[shanan-api] Supplier lookup failed:', err);
      return errorResponse('Could not retrieve supplier.', 500, origin);
    }
  }

  // PATCH /api/suppliers/:id - update supplier (internal only)
  if (supplierMatch && method === 'PATCH') {
    const auth = await requireInternal(req, origin);
    if (auth.error) return auth.error;
    const supplierIdOrRef = decodeURIComponent(supplierMatch[1]);
    const parsed = await tryParseJson(req);
    if (!parsed.ok) return errorResponse('Invalid JSON body', 400, origin);
    const existingRows = await sql()`SELECT id FROM suppliers WHERE id = ${supplierIdOrRef} OR reference = ${supplierIdOrRef} LIMIT 1`;
    const existing = existingRows[0] as { id: string } | undefined;
    if (!existing) return errorResponse('Supplier not found', 404, origin);
    const b = parsed.body as Record<string, unknown>;
    const updates: string[] = [];
    const values: any[] = [];
    const editableFields: [string, string][] = [
      ['nameEn', 'name_en'], ['nameAr', 'name_ar'], ['country', 'country'],
      ['contactName', 'contact_name'], ['contactEmail', 'contact_email'],
      ['contactPhone', 'contact_phone'], ['taxId', 'tax_id'], ['notes', 'notes'],
    ];
    for (const [field, col] of editableFields) {
      if (b[field] !== undefined) {
        if (typeof b[field] === 'string') {
          updates.push(`${col} = $${String(updates.length + 1)}`);
          values.push((b[field] as string).trim());
        } else if (b[field] === null) {
          updates.push(`${col} = $${String(updates.length + 1)}`);
          values.push(null);
        } else {
          return errorResponse(`Validation failed: ${field} - must be a string or null`, 400, origin);
        }
      }
    }
    if (b.status !== undefined && b.status !== null) {
      if (typeof b.status === 'string' && ['pending', 'under_review', 'active', 'suspended', 'terminated'].includes(b.status)) {
        updates.push(`status = $${String(updates.length + 1)}`);
        values.push(b.status);
      } else {
        return errorResponse(`Validation failed: status - must be one of: pending, under_review, active, suspended, terminated`, 400, origin);
      }
    }
    if (updates.length === 0) return errorResponse('No valid fields to update', 422, origin);
    updates.push('updated_at = $' + String(updates.length + 1));
    values.push(new Date().toISOString());
    values.push(existing.id);
    try {
      await sql().unsafe(`UPDATE suppliers SET ${updates.join(', ')} WHERE id = $${updates.length}`, values);
      const updatedRows = await sql()`SELECT * FROM suppliers WHERE id = ${existing.id} LIMIT 1`;
      return jsonResponse({ supplier: updatedRows[0] }, 200, origin);
    } catch (err) {
      console.error('[shanan-api] Supplier update failed:', err);
      return errorResponse('Could not update supplier.', 500, origin);
    }
  }

  // ============================================================
  // Phase A9.1b - Supplier Portal Endpoints (supplier-auth required)
  // ============================================================

  // GET /api/supplier/profile - supplier views own profile
  if (url.pathname === '/api/supplier/profile' && method === 'GET') {
    const auth = await requireSupplierAnyStatus(req, origin);
    if (auth.error) return auth.error;
    try {
      const rows = await sql()`SELECT * FROM suppliers WHERE id = ${auth.supplierId} LIMIT 1`;
      return jsonResponse({ supplier: rows[0] }, 200, origin);
    } catch (err) {
      return errorResponse('Could not load supplier profile.', 500, origin);
    }
  }

  // PATCH /api/supplier/profile - supplier updates permitted profile fields
  if (url.pathname === '/api/supplier/profile' && method === 'PATCH') {
    const auth = await requireSupplierAnyStatus(req, origin);
    if (auth.error) return auth.error;
    const parsed = await tryParseJson(req);
    if (!parsed.ok) return errorResponse('Invalid JSON body', 400, origin);
    const b = parsed.body as Record<string, unknown>;
    const updates: string[] = [];
    const values: any[] = [];
    const editableFields: [string, string][] = [
      ['nameAr', 'name_ar'], ['country', 'country'], ['city', 'city'],
      ['address', 'address'], ['website', 'website'],
      ['contactName', 'contact_name'], ['contactPhone', 'contact_phone'],
      ['taxId', 'tax_id'], ['notes', 'notes'],
    ];
    for (const [field, col] of editableFields) {
      if (b[field] !== undefined) {
        if (typeof b[field] === 'string') {
          updates.push(`${col} = $${String(updates.length + 1)}`);
          values.push((b[field] as string).trim());
        } else if (b[field] === null) {
          updates.push(`${col} = $${String(updates.length + 1)}`);
          values.push(null);
        }
      }
    }
    if (updates.length === 0) return errorResponse('No valid fields to update', 422, origin);
    updates.push('updated_at = $' + String(updates.length + 1));
    values.push(new Date().toISOString());
    values.push(auth.supplierId);
    try {
      await sql().unsafe(`UPDATE suppliers SET ${updates.join(', ')} WHERE id = $${updates.length}`, values);
      const updatedRows = await sql()`SELECT * FROM suppliers WHERE id = ${auth.supplierId} LIMIT 1`;
      return jsonResponse({ supplier: updatedRows[0] }, 200, origin);
    } catch (err) {
      return errorResponse('Could not update profile.', 500, origin);
    }
  }

  // GET /api/supplier/rfqs - supplier views only RFQs assigned to them
  if (url.pathname === '/api/supplier/rfqs' && method === 'GET') {
    const auth = await requireSupplier(req, origin);
    if (auth.error) return auth.error;
    try {
      const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
      const pageSize = Math.min(50, Math.max(1, parseInt(url.searchParams.get('pageSize') || '20', 10)));
      const statusFilter = url.searchParams.get('status');
      const search = url.searchParams.get('search')?.trim() || '';

      let where = ['rs.supplier_id = $1'];
      const params: any[] = [auth.supplierId];
      let n = 1;
      if (statusFilter) {
        where.push(`rfq.status = $${String(++n)}`);
        params.push(statusFilter);
      }
      if (search) {
        where.push('(rfq.reference LIKE $' + String(++n) + ' OR sr.reference LIKE $' + String(++n) + ')');
        const q = `%${search}%`;
        params.push(q, q);
      }
      const whereClause = where.join(' AND ');
      const totalRows = await sql().unsafe(
        `SELECT COUNT(*)::int AS n FROM rfq_suppliers rs JOIN rfqs rfq ON rs.rfq_id = rfq.id LEFT JOIN supply_requests sr ON rfq.supply_request_id = sr.id WHERE ${whereClause}`,
        params,
      );
      const total = Number((totalRows[0] as any)?.n ?? 0);
      const totalPages = Math.ceil(total / pageSize) || 1;
      const offset = (page - 1) * pageSize;

      // Note: offer_count uses the supplier's own rfq_supplier id.
      const offerCountSql =
        `(SELECT COUNT(*)::int FROM rfq_supplier_offers rso ` +
        `JOIN rfq_suppliers rs2 ON rso.rfq_supplier_id = rs2.id ` +
        `WHERE rs2.rfq_id = rfq.id AND rs2.supplier_id = $1) AS offer_count`;
      const listRows = await sql().unsafe(
        `SELECT rfq.id, rfq.reference, rfq.status, rfq.sent_at, rfq.created_at, rfq.updated_at,
                rs.response_state, rs.responded_at,
                sr.reference AS supply_request_reference,
                (SELECT COUNT(*)::int FROM rfq_items WHERE rfq_id = rfq.id) AS item_count,
                ${offerCountSql}
           FROM rfq_suppliers rs
           JOIN rfqs rfq ON rs.rfq_id = rfq.id
           LEFT JOIN supply_requests sr ON rfq.supply_request_id = sr.id
          WHERE ${whereClause}
          ORDER BY rfq.created_at DESC
          LIMIT $${String(params.length + 1)} OFFSET $${String(params.length + 2)}`,
        [...params, pageSize, offset],
      );
      return jsonResponse({ rfqs: listRows, total, page, pageSize, totalPages }, 200, origin);
    } catch (err) {
      console.error('[shanan-api] Supplier RFQ list failed:', err);
      return errorResponse('Could not load RFQs.', 500, origin);
    }
  }

  // GET /api/supplier/rfqs/:id - supplier views one RFQ (only if assigned)
  const supplierRfqMatch = url.pathname.match(/^\/api\/supplier\/rfqs\/([^/]+)$/);
  if (supplierRfqMatch && method === 'GET') {
    const auth = await requireSupplier(req, origin);
    if (auth.error) return auth.error;
    const rfqId = decodeURIComponent(supplierRfqMatch[1]);
    try {
      const assignmentRows = await sql()`SELECT id FROM rfq_suppliers WHERE rfq_id = ${rfqId} AND supplier_id = ${auth.supplierId} LIMIT 1`;
      const assignment = assignmentRows[0] as { id: string } | undefined;
      if (!assignment) return errorResponse('RFQ not found or not assigned to you', 404, origin);
      const rfqRows = await sql()`SELECT id, reference, status, sent_at, created_at, updated_at FROM rfqs WHERE id = ${rfqId} LIMIT 1`;
      if (!rfqRows[0]) return errorResponse('RFQ not found', 404, origin);
      const items = await sql()`SELECT ri.id, ri.rfq_id, ri.supply_request_item_id, sri.product_id, sri.product_name, sri.sku, sri.quantity AS requested_quantity, ri.customer_notes, ri.rfq_notes FROM rfq_items ri JOIN supply_request_items sri ON ri.supply_request_item_id = sri.id WHERE ri.rfq_id = ${rfqId}`;
      const existingOffers = await sql()`SELECT rso.* FROM rfq_supplier_offers rso WHERE rso.rfq_supplier_id = ${assignment.id}`;
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
      return jsonResponse({ rfq: rfqRows[0], items: itemsWithOffers }, 200, origin);
    } catch (err) {
      console.error('[shanan-api] Supplier RFQ detail failed:', err);
      return errorResponse('Could not load RFQ details.', 500, origin);
    }
  }

  // POST /api/supplier/rfqs/:id/offers - supplier submits offer (only for assigned RFQ)
  const supplierRfqOfferMatch = url.pathname.match(/^\/api\/supplier\/rfqs\/([^/]+)\/offers$/);
  if (supplierRfqOfferMatch && method === 'POST') {
    const auth = await requireSupplier(req, origin);
    if (auth.error) return auth.error;
    const rfqId = decodeURIComponent(supplierRfqOfferMatch[1]);
    const assignmentRows = await sql()`SELECT id FROM rfq_suppliers WHERE rfq_id = ${rfqId} AND supplier_id = ${auth.supplierId} LIMIT 1`;
    const assignment = assignmentRows[0] as { id: string } | undefined;
    if (!assignment) return errorResponse('RFQ not found or not assigned to you', 404, origin);
    const rfqRows = await sql()`SELECT status FROM rfqs WHERE id = ${rfqId} LIMIT 1`;
    const rfqRecord = rfqRows[0] as { status: string } | undefined;
    if (!rfqRecord) return errorResponse('RFQ not found', 404, origin);
    if (!['sent', 'partially_responded'].includes(rfqRecord.status)) {
      return errorResponse(`RFQ is ${rfqRecord.status} and does not accept offers`, 409, origin);
    }
    const parsed = await tryParseJson(req);
    if (!parsed.ok) return errorResponse('Invalid JSON body', 400, origin);
    const b = parsed.body as Record<string, unknown>;
    if (typeof b.rfqItemId !== 'string') return errorResponse('rfqItemId is required', 422, origin);
    if (typeof b.unitPrice !== 'number' || b.unitPrice <= 0) return errorResponse('unitPrice must be greater than 0', 422, origin);
    if (typeof b.currency !== 'string' || !['JOD', 'USD', 'EUR', 'GBP', 'SAR', 'AED'].includes(b.currency.trim())) {
      return errorResponse('Valid currency is required (JOD, USD, EUR, GBP, SAR, AED)', 422, origin);
    }
    const rfqItemRows = await sql()`SELECT id FROM rfq_items WHERE id = ${b.rfqItemId} AND rfq_id = ${rfqId} LIMIT 1`;
    if (!rfqItemRows[0]) return errorResponse('Invalid rfqItemId for this RFQ', 422, origin);
    if (b.leadTimeDays !== undefined && b.leadTimeDays !== null && (typeof b.leadTimeDays !== 'number' || b.leadTimeDays < 0)) {
      return errorResponse('leadTimeDays must be a non-negative number', 422, origin);
    }
    try {
      const existingRows = await sql()`SELECT id FROM rfq_supplier_offers WHERE rfq_supplier_id = ${assignment.id} AND rfq_item_id = ${b.rfqItemId} LIMIT 1`;
      if (existingRows[0]) return errorResponse('An offer already exists for this item. Use PUT to update.', 409, origin);
      const offerId = generateId();
      const now = new Date().toISOString();
      await sql()`
        INSERT INTO rfq_supplier_offers (id, rfq_supplier_id, rfq_item_id, offer_status, quoted_unit_price, currency, offered_quantity, lead_time_days, validity_date, minimum_order_quantity, payment_terms, commercial_notes, responded_at, created_at, updated_at)
        VALUES (${offerId}, ${assignment.id}, ${b.rfqItemId}, 'quoted', ${b.unitPrice}, ${(b.currency as string).trim()},
                ${typeof b.offeredQuantity === 'number' ? b.offeredQuantity : null},
                ${typeof b.leadTimeDays === 'number' ? b.leadTimeDays : null},
                ${typeof b.validityDate === 'string' ? b.validityDate : null},
                ${typeof b.minimumOrderQuantity === 'number' ? b.minimumOrderQuantity : null},
                ${typeof b.paymentTerms === 'string' ? b.paymentTerms.trim() : null},
                ${typeof b.notes === 'string' ? b.notes.trim() : null},
                ${now}, ${now}, ${now})`;
      await updateSupplierResponseState(assignment.id, rfqId);
      await updateRfqAggregateStatus(rfqId, now);
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

  // PUT /api/supplier/rfqs/:id/offers/:offerId - supplier updates an existing offer
  const supplierOfferPutMatch = url.pathname.match(/^\/api\/supplier\/rfqs\/([^/]+)\/offers\/([^/]+)$/);
  if (supplierOfferPutMatch && method === 'PUT') {
    const auth = await requireSupplier(req, origin);
    if (auth.error) return auth.error;
    const rfqId = decodeURIComponent(supplierOfferPutMatch[1]);
    const offerId = decodeURIComponent(supplierOfferPutMatch[2]);
    const assignmentRows = await sql()`SELECT id FROM rfq_suppliers WHERE rfq_id = ${rfqId} AND supplier_id = ${auth.supplierId} LIMIT 1`;
    const assignment = assignmentRows[0] as { id: string } | undefined;
    if (!assignment) return errorResponse('RFQ not found or not assigned to you', 404, origin);
    const offerRows = await sql()`SELECT id, rfq_item_id FROM rfq_supplier_offers WHERE id = ${offerId} AND rfq_supplier_id = ${assignment.id} LIMIT 1`;
    const offer = offerRows[0] as { id: string; rfq_item_id: string } | undefined;
    if (!offer) return errorResponse('Offer not found', 404, origin);
    const rfqRows = await sql()`SELECT status FROM rfqs WHERE id = ${rfqId} LIMIT 1`;
    const rfqRecord = rfqRows[0] as { status: string } | undefined;
    if (!rfqRecord) return errorResponse('RFQ not found', 404, origin);
    if (!['sent', 'partially_responded', 'responded'].includes(rfqRecord.status)) {
      return errorResponse(`RFQ is ${rfqRecord.status} and does not accept offer updates`, 409, origin);
    }
    const parsed = await tryParseJson(req);
    if (!parsed.ok) return errorResponse('Invalid JSON body', 400, origin);
    const b = parsed.body as Record<string, unknown>;
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
      if (typeof b.unitPrice === 'number') { updates.push('quoted_unit_price = $' + String(updates.length + 1)); values.push(b.unitPrice); }
      if (typeof b.currency === 'string') { updates.push('currency = $' + String(updates.length + 1)); values.push(b.currency.trim()); }
      if (typeof b.offeredQuantity === 'number') { updates.push('offered_quantity = $' + String(updates.length + 1)); values.push(b.offeredQuantity); }
      else if (b.offeredQuantity === null) { updates.push('offered_quantity = $' + String(updates.length + 1)); values.push(null); }
      if (typeof b.leadTimeDays === 'number') { updates.push('lead_time_days = $' + String(updates.length + 1)); values.push(b.leadTimeDays); }
      else if (b.leadTimeDays === null) { updates.push('lead_time_days = $' + String(updates.length + 1)); values.push(null); }
      if (typeof b.validityDate === 'string') { updates.push('validity_date = $' + String(updates.length + 1)); values.push(b.validityDate); }
      else if (b.validityDate === null) { updates.push('validity_date = $' + String(updates.length + 1)); values.push(null); }
      if (typeof b.minimumOrderQuantity === 'number') { updates.push('minimum_order_quantity = $' + String(updates.length + 1)); values.push(b.minimumOrderQuantity); }
      else if (b.minimumOrderQuantity === null) { updates.push('minimum_order_quantity = $' + String(updates.length + 1)); values.push(null); }
      if (typeof b.paymentTerms === 'string') { updates.push('payment_terms = $' + String(updates.length + 1)); values.push(b.paymentTerms.trim()); }
      else if (b.paymentTerms === null) { updates.push('payment_terms = $' + String(updates.length + 1)); values.push(null); }
      if (typeof b.notes === 'string') { updates.push('commercial_notes = $' + String(updates.length + 1)); values.push(b.notes.trim()); }
      else if (b.notes === null) { updates.push('commercial_notes = $' + String(updates.length + 1)); values.push(null); }
      if (updates.length === 0) return errorResponse('No fields to update', 422, origin);
      updates.push('updated_at = $' + String(updates.length + 1));
      values.push(new Date().toISOString());
      values.push(offerId);
      await sql().unsafe(`UPDATE rfq_supplier_offers SET ${updates.join(', ')} WHERE id = $${updates.length}`, values);
      await updateSupplierResponseState(assignment.id, rfqId);
      await updateRfqAggregateStatus(rfqId, new Date().toISOString());
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

  // DELETE /api/supplier/rfqs/:id/offers/:offerId - supplier withdraws an offer
  if (supplierOfferPutMatch && method === 'DELETE') {
    const auth = await requireSupplier(req, origin);
    if (auth.error) return auth.error;
    const rfqId = decodeURIComponent(supplierOfferPutMatch[1]);
    const offerId = decodeURIComponent(supplierOfferPutMatch[2]);
    const assignmentRows = await sql()`SELECT id FROM rfq_suppliers WHERE rfq_id = ${rfqId} AND supplier_id = ${auth.supplierId} LIMIT 1`;
    const assignment = assignmentRows[0] as { id: string } | undefined;
    if (!assignment) return errorResponse('RFQ not found or not assigned to you', 404, origin);
    const offerRows = await sql()`SELECT id FROM rfq_supplier_offers WHERE id = ${offerId} AND rfq_supplier_id = ${assignment.id} LIMIT 1`;
    if (!offerRows[0]) return errorResponse('Offer not found', 404, origin);
    const rfqRows = await sql()`SELECT status FROM rfqs WHERE id = ${rfqId} LIMIT 1`;
    const rfqRecord = rfqRows[0] as { status: string } | undefined;
    if (!rfqRecord) return errorResponse('RFQ not found', 404, origin);
    if (!['sent', 'partially_responded', 'responded'].includes(rfqRecord.status)) {
      return errorResponse(`RFQ is ${rfqRecord.status} and does not allow offer withdrawal`, 409, origin);
    }
    try {
      await sql()`DELETE FROM rfq_supplier_offers WHERE id = ${offerId}`;
      await updateSupplierResponseState(assignment.id, rfqId);
      await updateRfqAggregateStatus(rfqId, new Date().toISOString());
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

  // --- Supplier Product Catalog ---

  // GET /api/supplier/products - supplier lists their own products (with master catalog data)
  if (url.pathname === '/api/supplier/products' && method === 'GET') {
    const auth = await requireSupplier(req, origin);
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

      let where = ['sp.supplier_id = $1'];
      const params: any[] = [auth.supplierId];
      let n = 1;
      if (search) {
        where.push('(p.name_en LIKE $' + String(++n) + ' OR p.name_ar LIKE $' + String(++n) + ' OR p.sku LIKE $' + String(++n) + ' OR p.product_code LIKE $' + String(++n) + ' OR sp.supplier_sku LIKE $' + String(++n) + ' OR sp.supplier_product_name LIKE $' + String(++n) + ')');
        const q = `%${search}%`;
        params.push(q, q, q, q, q, q);
      }
      if (categoryId) { where.push(`p.category_id = $${String(++n)}`); params.push(categoryId); }
      if (brandId) { where.push(`p.brand_id = $${String(++n)}`); params.push(brandId); }
      if (availability) { where.push(`sp.availability_status = $${String(++n)}`); params.push(availability); }
      if (activeOnly === '1') { where.push('sp.is_active = 1'); }
      if (withPrice === '1') { where.push('sp.unit_price IS NOT NULL'); }
      if (withPrice === '0') { where.push('sp.unit_price IS NULL'); }

      const whereClause = where.join(' AND ');
      const totalRows = await sql().unsafe(
        `SELECT COUNT(*)::int AS n FROM supplier_products sp JOIN products p ON sp.product_id = p.id WHERE ${whereClause}`,
        params,
      );
      const total = Number((totalRows[0] as any)?.n ?? 0);
      const totalPages = Math.ceil(total / pageSize) || 1;
      const offset = (page - 1) * pageSize;

      const rows = await sql().unsafe(
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
          LIMIT $${String(params.length + 1)} OFFSET $${String(params.length + 2)}`,
        [...params, pageSize, offset],
      );
      const items = (rows as any[]).map((r: any) => ({
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

  // GET /api/supplier/products/summary - dashboard counters
  if (url.pathname === '/api/supplier/products/summary' && method === 'GET') {
    const auth = await requireSupplier(req, origin);
    if (auth.error) return auth.error;
    try {
      const statsRows = await sql()`SELECT COUNT(*)::int AS total, SUM(CASE WHEN sp.is_active = 1 THEN 1 ELSE 0 END)::int AS active, SUM(CASE WHEN sp.unit_price IS NOT NULL THEN 1 ELSE 0 END)::int AS with_price, SUM(CASE WHEN sp.unit_price IS NULL THEN 1 ELSE 0 END)::int AS without_price FROM supplier_products sp WHERE sp.supplier_id = ${auth.supplierId}`;
      const stats = statsRows[0] as any;
      const rfqRows = await sql()`SELECT COUNT(*)::int AS cnt FROM rfq_suppliers rs JOIN rfqs rfq ON rs.rfq_id = rfq.id WHERE rs.supplier_id = ${auth.supplierId} AND rfq.status IN ('sent','partially_responded')`;
      const rfqCount = Number((rfqRows[0] as any)?.cnt ?? 0);
      return jsonResponse({
        totalProducts: Number(stats?.total || 0),
        activeProducts: Number(stats?.active || 0),
        withPrice: Number(stats?.with_price || 0),
        withoutPrice: Number(stats?.without_price || 0),
        activeRfqs: rfqCount || 0,
      }, 200, origin);
    } catch (err) {
      console.error('[shanan-api] Supplier products summary failed:', err);
      return errorResponse('Could not load summary.', 500, origin);
    }
  }

  // GET /api/supplier/products/:id - supplier views one product with master + supplier data
  const supplierProductGetMatch = url.pathname.match(/^\/api\/supplier\/products\/([^/]+)$/);
  if (supplierProductGetMatch && method === 'GET') {
    const auth = await requireSupplier(req, origin);
    if (auth.error) return auth.error;
    const spId = decodeURIComponent(supplierProductGetMatch[1]);
    try {
      const rows = await sql()`
        SELECT sp.id, sp.supplier_id, sp.product_id, sp.supplier_sku, sp.supplier_product_name,
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
         WHERE sp.id = ${spId} AND sp.supplier_id = ${auth.supplierId}
         LIMIT 1`;
      const row = rows[0] as any;
      if (!row) return errorResponse('Supplier product not found', 404, origin);
      const images = await sql()`SELECT * FROM product_images WHERE product_id = ${row.product_id} ORDER BY is_primary DESC, sort_order ASC`;
      const specs = await sql()`SELECT * FROM product_specifications WHERE product_id = ${row.product_id} ORDER BY sort_order ASC`;
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
          images: (images as any[]).map((img: any) => ({
            id: img.id,
            url: img.public_url || `/api/storage/${img.storage_key}`,
            alt: { en: img.alt_en || '', ar: img.alt_ar || '' },
            isPrimary: img.is_primary === 1,
            sortOrder: img.sort_order,
          })),
          specifications: (specs as any[]).map((s: any) => ({
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

  // POST /api/supplier/products - add a product to supplier's catalog
  if (url.pathname === '/api/supplier/products' && method === 'POST') {
    const auth = await requireSupplier(req, origin);
    if (auth.error) return auth.error;
    const parsed = await tryParseJson(req);
    if (!parsed.ok) return errorResponse('Invalid JSON body', 400, origin);
    const b = parsed.body as Record<string, unknown>;
    if (typeof b.productId !== 'string' || !b.productId.trim()) return errorResponse('productId is required', 422, origin);
    if (!(await isValidProductId(b.productId.trim()))) return errorResponse('Product not found or inactive', 422, origin);
    const existingRows = await sql()`SELECT id FROM supplier_products WHERE supplier_id = ${auth.supplierId} AND product_id = ${b.productId.trim()} LIMIT 1`;
    if (existingRows[0]) return errorResponse('Product already in your catalog', 409, origin);
    const id = generateId();
    const now = new Date().toISOString();
    try {
      await sql()`
        INSERT INTO supplier_products (id, supplier_id, product_id, supplier_sku, supplier_product_name, unit_price, currency, minimum_order_quantity, lead_time_days, availability_status, payment_terms, notes, is_active, created_at, updated_at)
        VALUES (${id}, ${auth.supplierId}, ${b.productId.trim()},
                ${typeof b.supplierSku === 'string' ? b.supplierSku.trim() : null},
                ${typeof b.supplierProductName === 'string' ? b.supplierProductName.trim() : null},
                ${typeof b.unitPrice === 'number' ? b.unitPrice : null},
                ${typeof b.currency === 'string' && b.currency.trim() ? b.currency.trim() : 'JOD'},
                ${typeof b.minimumOrderQuantity === 'number' && b.minimumOrderQuantity > 0 ? b.minimumOrderQuantity : null},
                ${typeof b.leadTimeDays === 'number' && b.leadTimeDays >= 0 ? b.leadTimeDays : null},
                ${typeof b.availabilityStatus === 'string' ? b.availabilityStatus : 'available'},
                ${typeof b.paymentTerms === 'string' ? b.paymentTerms.trim() : null},
                ${typeof b.notes === 'string' ? b.notes.trim() : null},
                1, ${now}, ${now})`;
      return jsonResponse({ id, message: 'Product added to catalog' }, 201, origin);
    } catch (err) {
      console.error('[shanan-api] Supplier product create failed:', err);
      return errorResponse('Could not add product.', 500, origin);
    }
  }

  // PATCH /api/supplier/products/:id - update supplier-specific fields
  const supplierProductPatchMatch = url.pathname.match(/^\/api\/supplier\/products\/([^/]+)$/);
  if (supplierProductPatchMatch && method === 'PATCH') {
    const auth = await requireSupplier(req, origin);
    if (auth.error) return auth.error;
    const spId = decodeURIComponent(supplierProductPatchMatch[1]);
    const ownedRows = await sql()`SELECT id FROM supplier_products WHERE id = ${spId} AND supplier_id = ${auth.supplierId} LIMIT 1`;
    if (!ownedRows[0]) return errorResponse('Supplier product not found', 404, origin);
    const parsed = await tryParseJson(req);
    if (!parsed.ok) return errorResponse('Invalid JSON body', 400, origin);
    const b = parsed.body as Record<string, unknown>;
    const updates: string[] = [];
    const values: any[] = [];
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
          updates.push(`${col} = $${String(updates.length + 1)}`);
          values.push((b[field] as string).trim());
        } else if (type === 'number' && typeof b[field] === 'number') {
          updates.push(`${col} = $${String(updates.length + 1)}`);
          values.push(b[field]);
        } else if (type === 'boolean' && typeof b[field] === 'boolean') {
          updates.push(`${col} = $${String(updates.length + 1)}`);
          values.push(b[field] ? 1 : 0);
        } else if (b[field] === null) {
          updates.push(`${col} = $${String(updates.length + 1)}`);
          values.push(null);
        }
      }
    }
    if (updates.length === 0) return errorResponse('No valid fields to update', 422, origin);
    updates.push('updated_at = $' + String(updates.length + 1));
    values.push(new Date().toISOString());
    values.push(spId);
    try {
      await sql().unsafe(`UPDATE supplier_products SET ${updates.join(', ')} WHERE id = $${updates.length}`, values);
      return jsonResponse({ message: 'Updated' }, 200, origin);
    } catch (err) {
      console.error('[shanan-api] Supplier product update failed:', err);
      return errorResponse('Could not update product.', 500, origin);
    }
  }

  // DELETE /api/supplier/products/:id - deactivate (not master delete)
  const supplierProductDeleteMatch = url.pathname.match(/^\/api\/supplier\/products\/([^/]+)$/);
  if (supplierProductDeleteMatch && method === 'DELETE') {
    const auth = await requireSupplier(req, origin);
    if (auth.error) return auth.error;
    const spId = decodeURIComponent(supplierProductDeleteMatch[1]);
    const ownedRows = await sql()`SELECT id FROM supplier_products WHERE id = ${spId} AND supplier_id = ${auth.supplierId} LIMIT 1`;
    if (!ownedRows[0]) return errorResponse('Supplier product not found', 404, origin);
    try {
      await sql()`UPDATE supplier_products SET is_active = 0, updated_at = ${new Date().toISOString()} WHERE id = ${spId}`;
      return jsonResponse({ message: 'Product deactivated from catalog' }, 200, origin);
    } catch (err) {
      console.error('[shanan-api] Supplier product deactivate failed:', err);
      return errorResponse('Could not deactivate product.', 500, origin);
    }
  }

  // --- Supplier Notifications ---

  // GET /api/supplier/notifications - supplier lists their notifications
  if (url.pathname === '/api/supplier/notifications' && method === 'GET') {
    const auth = await requireSupplier(req, origin);
    if (auth.error) return auth.error;
    try {
      const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
      const pageSize = Math.min(50, Math.max(1, parseInt(url.searchParams.get('pageSize') || '20', 10)));
      const unreadOnly = url.searchParams.get('unreadOnly') === '1';

      let where = 'n.user_id = $1';
      const params: any[] = [auth.user.id];
      if (unreadOnly) { where += ' AND n.is_read = 0'; }

      const totalRows = await sql().unsafe(`SELECT COUNT(*)::int as n FROM notifications n WHERE ${where}`, params);
      const total = Number((totalRows[0] as any)?.n ?? 0);
      const totalPages = Math.ceil(total / pageSize) || 1;
      const offset = (page - 1) * pageSize;

      const notifications = await sql().unsafe(
        `SELECT n.id, n.event_type, n.title_en, n.title_ar, n.body_en, n.body_ar,
                n.entity_type, n.entity_id, n.is_read, n.created_at
           FROM notifications n
          WHERE ${where}
          ORDER BY n.created_at DESC
          LIMIT $${String(params.length + 1)} OFFSET $${String(params.length + 2)}`,
        [...params, pageSize, offset],
      );
      const unreadRows = await sql()`SELECT COUNT(*)::int as n FROM notifications WHERE user_id = ${auth.user.id} AND is_read = 0`;
      const unreadCount = Number((unreadRows[0] as any)?.n ?? 0);
      return jsonResponse({ notifications, total, page, pageSize, totalPages, unreadCount }, 200, origin);
    } catch (err) {
      console.error('[shanan-api] Notifications list failed:', err);
      return errorResponse('Could not load notifications.', 500, origin);
    }
  }

  // PATCH /api/supplier/notifications/:id/read - mark one as read
  const notifReadMatch = url.pathname.match(/^\/api\/supplier\/notifications\/([^/]+)\/read$/);
  if (notifReadMatch && method === 'PATCH') {
    const auth = await requireSupplier(req, origin);
    if (auth.error) return auth.error;
    const notifId = decodeURIComponent(notifReadMatch[1]);
    try {
      const notifRows = await sql()`SELECT id FROM notifications WHERE id = ${notifId} AND user_id = ${auth.user.id} LIMIT 1`;
      if (!notifRows[0]) return errorResponse('Notification not found', 404, origin);
      await sql()`UPDATE notifications SET is_read = 1 WHERE id = ${notifId}`;
      return jsonResponse({ message: 'Marked as read' }, 200, origin);
    } catch (err) {
      return errorResponse('Could not update notification.', 500, origin);
    }
  }

  // PATCH /api/supplier/notifications/read-all - mark all as read
  if (url.pathname === '/api/supplier/notifications/read-all' && method === 'PATCH') {
    const auth = await requireSupplier(req, origin);
    if (auth.error) return auth.error;
    try {
      await sql()`UPDATE notifications SET is_read = 1 WHERE user_id = ${auth.user.id} AND is_read = 0`;
      return jsonResponse({ message: 'All notifications marked as read' }, 200, origin);
    } catch (err) {
      return errorResponse('Could not update notifications.', 500, origin);
    }
  }

  // --- Supplier Agreements (internal only) ---

  // GET /api/supplier-agreements - list agreements (optional ?supplierId=X filter)
  if (url.pathname === '/api/supplier-agreements' && method === 'GET') {
    const auth = await requireInternal(req, origin);
    if (auth.error) return auth.error;
    try {
      const supplierFilter = url.searchParams.get('supplierId');
      let rows;
      if (supplierFilter) {
        rows = await sql()`SELECT sa.*, s.name_en AS supplier_name, s.reference AS supplier_reference FROM supplier_agreements sa LEFT JOIN suppliers s ON sa.supplier_id = s.id WHERE sa.supplier_id = ${supplierFilter} ORDER BY sa.created_at DESC`;
      } else {
        rows = await sql()`SELECT sa.*, s.name_en AS supplier_name, s.reference AS supplier_reference FROM supplier_agreements sa LEFT JOIN suppliers s ON sa.supplier_id = s.id ORDER BY sa.created_at DESC`;
      }
      return jsonResponse({ agreements: rows, count: rows.length }, 200, origin);
    } catch (err) {
      console.error('[shanan-api] Agreements query failed:', err);
      return errorResponse('Could not retrieve agreements.', 500, origin);
    }
  }

  // POST /api/supplier-agreements - create a new agreement (internal only)
  if (url.pathname === '/api/supplier-agreements' && method === 'POST') {
    const auth = await requireInternal(req, origin);
    if (auth.error) return auth.error;
    const parsed = await tryParseJson(req);
    if (!parsed.ok) return errorResponse('Invalid JSON body', 400, origin);
    const b = parsed.body as Record<string, unknown>;
    if (typeof b.supplierId !== 'string' || b.supplierId.trim() === '') {
      return errorResponse('Validation failed: supplierId - required', 422, origin);
    }
    const supplierRows = await sql()`SELECT id FROM suppliers WHERE id = ${b.supplierId} OR reference = ${b.supplierId} LIMIT 1`;
    const supplier = supplierRows[0] as { id: string } | undefined;
    if (!supplier) {
      return errorResponse('Validation failed: supplierId - references a non-existent supplier', 422, origin);
    }
    let status: string = 'draft';
    if (b.status !== undefined && b.status !== null) {
      if (typeof b.status === 'string' && ['draft', 'active', 'suspended', 'expired', 'terminated'].includes(b.status)) {
        status = b.status;
      } else {
        return errorResponse(`Validation failed: status - must be one of: draft, active, suspended, expired, terminated`, 400, origin);
      }
    }
    let paymentTermsDays: number | null = null;
    if (b.paymentTermsDays !== undefined && b.paymentTermsDays !== null) {
      if (typeof b.paymentTermsDays === 'number' && Number.isInteger(b.paymentTermsDays) && b.paymentTermsDays >= 0) {
        paymentTermsDays = b.paymentTermsDays;
      } else {
        return errorResponse('Validation failed: paymentTermsDays - must be a non-negative integer', 400, origin);
      }
    }
    const id = generateId();
    const agreementNumber = generateAgreementNumber();
    const now = new Date().toISOString();
    try {
      await sql()`
        INSERT INTO supplier_agreements
          (id, agreement_number, supplier_id, status, effective_from, effective_to,
           currency, payment_terms_days, supplier_credit_limit, trade_terms_notes,
           internal_notes, created_by, created_at, updated_at)
        VALUES (${id}, ${agreementNumber}, ${supplier.id}, ${status},
                ${typeof b.effectiveFrom === 'string' ? b.effectiveFrom : null},
                ${typeof b.effectiveTo === 'string' ? b.effectiveTo : null},
                ${typeof b.currency === 'string' && b.currency.trim() ? b.currency.trim() : 'JOD'},
                ${paymentTermsDays},
                ${typeof b.supplierCreditLimit === 'string' ? b.supplierCreditLimit.trim() : null},
                ${typeof b.tradeTermsNotes === 'string' ? b.tradeTermsNotes.trim() : null},
                ${typeof b.internalNotes === 'string' ? b.internalNotes.trim() : null},
                ${auth.user.id}, ${now}, ${now})`;
      await recordActivityEvent('AGREEMENT_VIEWED', auth.user, { agreementId: id });
      return jsonResponse({ id, agreementNumber, createdAt: now }, 201, origin);
    } catch (err) {
      console.error('[shanan-api] Agreement insert failed:', err);
      return errorResponse('Could not create agreement.', 500, origin);
    }
  }

  // GET /api/supplier-agreements/:id - fetch single agreement + product terms (internal only)
  const agreementMatch = url.pathname.match(/^\/api\/supplier-agreements\/([^/]+)$/);
  if (agreementMatch && method === 'GET') {
    const auth = await requireInternal(req, origin);
    if (auth.error) return auth.error;
    const agrIdOrNum = decodeURIComponent(agreementMatch[1]);
    try {
      const agreementRows = await sql()`SELECT sa.*, s.name_en AS supplier_name, s.reference AS supplier_reference FROM supplier_agreements sa LEFT JOIN suppliers s ON sa.supplier_id = s.id WHERE sa.id = ${agrIdOrNum} OR sa.agreement_number = ${agrIdOrNum} LIMIT 1`;
      const agreement = agreementRows[0] as any;
      if (!agreement) return errorResponse('Agreement not found', 404, origin);
      const termsRows = await sql()`SELECT * FROM agreement_product_terms WHERE agreement_id = ${agreement.id} ORDER BY created_at ASC`;
      const enrichedTerms = await Promise.all((termsRows as any[]).map(async (t: any) => {
        const product = await getProductSummary(t.product_id);
        return {
          ...t,
          canonical_product_sku: product?.sku ?? null,
          canonical_product_code: product?.productCode ?? null,
          canonical_product_name_en: product?.nameEn ?? null,
        };
      }));
      return jsonResponse({ agreement, productTerms: enrichedTerms, productTermsCount: enrichedTerms.length }, 200, origin);
    } catch (err) {
      console.error('[shanan-api] Agreement lookup failed:', err);
      return errorResponse('Could not retrieve agreement.', 500, origin);
    }
  }

  // PATCH /api/supplier-agreements/:id - update agreement (internal only)
  if (agreementMatch && method === 'PATCH') {
    const auth = await requireInternal(req, origin);
    if (auth.error) return auth.error;
    const agrIdOrNum = decodeURIComponent(agreementMatch[1]);
    const parsed = await tryParseJson(req);
    if (!parsed.ok) return errorResponse('Invalid JSON body', 400, origin);
    const existingRows = await sql()`SELECT * FROM supplier_agreements WHERE id = ${agrIdOrNum} OR agreement_number = ${agrIdOrNum} LIMIT 1`;
    const existing = existingRows[0] as any;
    if (!existing) return errorResponse('Agreement not found', 404, origin);
    const b = parsed.body as Record<string, unknown>;
    const updates: string[] = [];
    const values: any[] = [];
    if (b.status !== undefined && b.status !== null) {
      if (typeof b.status === 'string' && ['draft', 'active', 'suspended', 'expired', 'terminated'].includes(b.status)) {
        updates.push('status = $' + String(updates.length + 1));
        values.push(b.status);
      } else {
        return errorResponse(`Validation failed: status - must be one of: draft, active, suspended, expired, terminated`, 400, origin);
      }
    }
    if (b.effectiveFrom !== undefined) {
      if (typeof b.effectiveFrom === 'string' || b.effectiveFrom === null) {
        updates.push('effective_from = $' + String(updates.length + 1));
        values.push(b.effectiveFrom);
      } else {
        return errorResponse('Validation failed: effectiveFrom - must be a string or null', 400, origin);
      }
    }
    if (b.effectiveTo !== undefined) {
      if (typeof b.effectiveTo === 'string' || b.effectiveTo === null) {
        updates.push('effective_to = $' + String(updates.length + 1));
        values.push(b.effectiveTo);
      } else {
        return errorResponse('Validation failed: effectiveTo - must be a string or null', 400, origin);
      }
    }
    if (b.currency !== undefined) {
      if (typeof b.currency === 'string' && b.currency.trim()) {
        updates.push('currency = $' + String(updates.length + 1));
        values.push(b.currency.trim());
      } else if (b.currency === null) {
        // do not null out (NOT NULL column with default JOD)
      } else {
        return errorResponse('Validation failed: currency - must be a non-empty string', 400, origin);
      }
    }
    if (b.paymentTermsDays !== undefined) {
      if (b.paymentTermsDays === null) {
        updates.push('payment_terms_days = $' + String(updates.length + 1));
        values.push(null);
      } else if (typeof b.paymentTermsDays === 'number' && Number.isInteger(b.paymentTermsDays) && b.paymentTermsDays >= 0) {
        updates.push('payment_terms_days = $' + String(updates.length + 1));
        values.push(b.paymentTermsDays);
      } else {
        return errorResponse('Validation failed: paymentTermsDays - must be a non-negative integer or null', 400, origin);
      }
    }
    if (b.supplierCreditLimit !== undefined) {
      if (typeof b.supplierCreditLimit === 'string' || b.supplierCreditLimit === null) {
        updates.push('supplier_credit_limit = $' + String(updates.length + 1));
        values.push(typeof b.supplierCreditLimit === 'string' ? b.supplierCreditLimit.trim() : null);
      } else {
        return errorResponse('Validation failed: supplierCreditLimit - must be a string or null', 400, origin);
      }
    }
    if (b.tradeTermsNotes !== undefined) {
      if (typeof b.tradeTermsNotes === 'string' || b.tradeTermsNotes === null) {
        updates.push('trade_terms_notes = $' + String(updates.length + 1));
        values.push(typeof b.tradeTermsNotes === 'string' ? b.tradeTermsNotes.trim() : null);
      } else {
        return errorResponse('Validation failed: tradeTermsNotes - must be a string or null', 400, origin);
      }
    }
    if (b.internalNotes !== undefined) {
      if (typeof b.internalNotes === 'string' || b.internalNotes === null) {
        updates.push('internal_notes = $' + String(updates.length + 1));
        values.push(typeof b.internalNotes === 'string' ? b.internalNotes.trim() : null);
      } else {
        return errorResponse('Validation failed: internalNotes - must be a string or null', 400, origin);
      }
    }
    if (updates.length === 0) return errorResponse('No valid fields to update', 422, origin);
    updates.push('updated_at = $' + String(updates.length + 1));
    values.push(new Date().toISOString());
    values.push(existing.id);
    try {
      await sql().unsafe(`UPDATE supplier_agreements SET ${updates.join(', ')} WHERE id = $${updates.length}`, values);
      const updatedRows = await sql()`SELECT * FROM supplier_agreements WHERE id = ${existing.id} LIMIT 1`;
      return jsonResponse({ agreement: updatedRows[0] }, 200, origin);
    } catch (err) {
      console.error('[shanan-api] Agreement update failed:', err);
      return errorResponse('Could not update agreement.', 500, origin);
    }
  }

  // --- Agreement Product Terms (internal only) ---

  // GET /api/supplier-agreements/:id/product-terms - list product terms (internal only)
  const productTermsMatch = url.pathname.match(/^\/api\/supplier-agreements\/([^/]+)\/product-terms$/);
  if (productTermsMatch && method === 'GET') {
    const auth = await requireInternal(req, origin);
    if (auth.error) return auth.error;
    const agrIdOrNum = decodeURIComponent(productTermsMatch[1]);
    const existingRows = await sql()`SELECT id FROM supplier_agreements WHERE id = ${agrIdOrNum} OR agreement_number = ${agrIdOrNum} LIMIT 1`;
    const existing = existingRows[0] as { id: string } | undefined;
    if (!existing) return errorResponse('Agreement not found', 404, origin);
    try {
      const termsRows = await sql()`SELECT * FROM agreement_product_terms WHERE agreement_id = ${existing.id} ORDER BY created_at ASC`;
      const enriched = await Promise.all((termsRows as any[]).map(async (t: any) => {
        const product = await getProductSummary(t.product_id);
        return {
          ...t,
          canonical_product_sku: product?.sku ?? null,
          canonical_product_code: product?.productCode ?? null,
          canonical_product_name_en: product?.nameEn ?? null,
        };
      }));
      return jsonResponse({ productTerms: enriched, count: enriched.length }, 200, origin);
    } catch (err) {
      console.error('[shanan-api] Product terms query failed:', err);
      return errorResponse('Could not retrieve product terms.', 500, origin);
    }
  }

  // POST /api/supplier-agreements/:id/product-terms - add product term (internal only)
  if (productTermsMatch && method === 'POST') {
    const auth = await requireInternal(req, origin);
    if (auth.error) return auth.error;
    const agrIdOrNum = decodeURIComponent(productTermsMatch[1]);
    const parsed = await tryParseJson(req);
    if (!parsed.ok) return errorResponse('Invalid JSON body', 400, origin);
    const existingRows = await sql()`SELECT id, currency FROM supplier_agreements WHERE id = ${agrIdOrNum} OR agreement_number = ${agrIdOrNum} LIMIT 1`;
    const existing = existingRows[0] as any;
    if (!existing) return errorResponse('Agreement not found', 404, origin);
    const b = parsed.body as Record<string, unknown>;
    if (typeof b.productId !== 'string' || b.productId.trim() === '') {
      return errorResponse('Validation failed: productId - required', 422, origin);
    }
    if (!(await isValidProductId(b.productId))) {
      return errorResponse('Validation failed: productId - references a non-existent SHANAN product', 422, origin);
    }
    if (typeof b.unitPrice !== 'number' || b.unitPrice < 0 || !isFinite(b.unitPrice)) {
      return errorResponse('Validation failed: unitPrice - must be a non-negative number', 422, origin);
    }
    let availabilityStatus = 'available';
    if (b.availabilityStatus !== undefined && b.availabilityStatus !== null) {
      if (typeof b.availabilityStatus === 'string' && ['available', 'limited', 'unavailable', 'expected'].includes(b.availabilityStatus)) {
        availabilityStatus = b.availabilityStatus;
      } else {
        return errorResponse(`Validation failed: availabilityStatus - must be one of: available, limited, unavailable, expected`, 400, origin);
      }
    }
    let termStatus = 'active';
    if (b.status !== undefined && b.status !== null) {
      if (typeof b.status === 'string' && ['active', 'inactive'].includes(b.status)) {
        termStatus = b.status;
      } else {
        return errorResponse(`Validation failed: status - must be one of: active, inactive`, 400, origin);
      }
    }
    let moq: number | null = null;
    if (b.minimumOrderQuantity !== undefined && b.minimumOrderQuantity !== null) {
      if (typeof b.minimumOrderQuantity === 'number' && Number.isInteger(b.minimumOrderQuantity) && b.minimumOrderQuantity >= 0) {
        moq = b.minimumOrderQuantity;
      } else {
        return errorResponse('Validation failed: minimumOrderQuantity - must be a non-negative integer', 400, origin);
      }
    }
    let availableQty: number | null = null;
    if (b.availableQuantity !== undefined && b.availableQuantity !== null) {
      if (typeof b.availableQuantity === 'number' && Number.isInteger(b.availableQuantity) && b.availableQuantity >= 0) {
        availableQty = b.availableQuantity;
      } else {
        return errorResponse('Validation failed: availableQuantity - must be a non-negative integer', 400, origin);
      }
    }
    let leadTime: number | null = null;
    if (b.leadTimeDays !== undefined && b.leadTimeDays !== null) {
      if (typeof b.leadTimeDays === 'number' && Number.isInteger(b.leadTimeDays) && b.leadTimeDays >= 0) {
        leadTime = b.leadTimeDays;
      } else {
        return errorResponse('Validation failed: leadTimeDays - must be a non-negative integer', 400, origin);
      }
    }
    const id = generateId();
    const now = new Date().toISOString();
    try {
      await sql()`
        INSERT INTO agreement_product_terms
          (id, agreement_id, product_id, supplier_product_code, supplier_product_name,
           unit_price, currency, minimum_order_quantity, price_valid_from, price_valid_to,
           availability_status, available_quantity, availability_updated_at, expected_available_date,
           lead_time_days, status, internal_notes, created_at, updated_at)
        VALUES (${id}, ${existing.id}, ${b.productId},
                ${typeof b.supplierProductCode === 'string' ? b.supplierProductCode.trim() : null},
                ${typeof b.supplierProductName === 'string' ? b.supplierProductName.trim() : null},
                ${b.unitPrice as number},
                ${typeof b.currency === 'string' && b.currency.trim() ? b.currency.trim() : null},
                ${moq},
                ${typeof b.priceValidFrom === 'string' ? b.priceValidFrom : null},
                ${typeof b.priceValidTo === 'string' ? b.priceValidTo : null},
                ${availabilityStatus}, ${availableQty}, ${now},
                ${typeof b.expectedAvailableDate === 'string' ? b.expectedAvailableDate : null},
                ${leadTime}, ${termStatus},
                ${typeof b.internalNotes === 'string' ? b.internalNotes.trim() : null},
                ${now}, ${now})`;
      return jsonResponse({ id, createdAt: now }, 201, origin);
    } catch (err) {
      console.error('[shanan-api] Product term insert failed:', err);
      return errorResponse('Could not create product term.', 500, origin);
    }
  }

  // PATCH /api/supplier-agreements/:id/product-terms/:termId - update term (internal only)
  const singleTermMatch = url.pathname.match(/^\/api\/supplier-agreements\/([^/]+)\/product-terms\/([^/]+)$/);
  if (singleTermMatch && method === 'PATCH') {
    const auth = await requireInternal(req, origin);
    if (auth.error) return auth.error;
    const agrIdOrNum = decodeURIComponent(singleTermMatch[1]);
    const termId = decodeURIComponent(singleTermMatch[2]);
    const agrRows = await sql()`SELECT id FROM supplier_agreements WHERE id = ${agrIdOrNum} OR agreement_number = ${agrIdOrNum} LIMIT 1`;
    const agr = agrRows[0] as { id: string } | undefined;
    if (!agr) return errorResponse('Agreement not found', 404, origin);
    const existingRows = await sql()`SELECT * FROM agreement_product_terms WHERE id = ${termId} AND agreement_id = ${agr.id} LIMIT 1`;
    const existing = existingRows[0] as any;
    if (!existing) return errorResponse('Product term not found', 404, origin);
    const parsed = await tryParseJson(req);
    if (!parsed.ok) return errorResponse('Invalid JSON body', 400, origin);
    const b = parsed.body as Record<string, unknown>;
    const updates: string[] = [];
    const values: any[] = [];
    if (b.supplierProductCode !== undefined) {
      if (typeof b.supplierProductCode === 'string' || b.supplierProductCode === null) {
        updates.push('supplier_product_code = $' + String(updates.length + 1));
        values.push(typeof b.supplierProductCode === 'string' ? b.supplierProductCode.trim() : null);
      } else {
        return errorResponse('Validation failed: supplierProductCode - must be a string or null', 400, origin);
      }
    }
    if (b.supplierProductName !== undefined) {
      if (typeof b.supplierProductName === 'string' || b.supplierProductName === null) {
        updates.push('supplier_product_name = $' + String(updates.length + 1));
        values.push(typeof b.supplierProductName === 'string' ? b.supplierProductName.trim() : null);
      } else {
        return errorResponse('Validation failed: supplierProductName - must be a string or null', 400, origin);
      }
    }
    if (b.unitPrice !== undefined) {
      if (typeof b.unitPrice === 'number' && b.unitPrice >= 0 && isFinite(b.unitPrice)) {
        updates.push('unit_price = $' + String(updates.length + 1));
        values.push(b.unitPrice);
      } else {
        return errorResponse('Validation failed: unitPrice - must be a non-negative number', 400, origin);
      }
    }
    if (b.currency !== undefined) {
      if ((typeof b.currency === 'string' && b.currency.trim()) || b.currency === null) {
        updates.push('currency = $' + String(updates.length + 1));
        values.push(typeof b.currency === 'string' ? b.currency.trim() : null);
      } else {
        return errorResponse('Validation failed: currency - must be a non-empty string or null', 400, origin);
      }
    }
    if (b.minimumOrderQuantity !== undefined) {
      if (b.minimumOrderQuantity === null || (typeof b.minimumOrderQuantity === 'number' && Number.isInteger(b.minimumOrderQuantity) && b.minimumOrderQuantity >= 0)) {
        updates.push('minimum_order_quantity = $' + String(updates.length + 1));
        values.push(b.minimumOrderQuantity);
      } else {
        return errorResponse('Validation failed: minimumOrderQuantity - must be a non-negative integer or null', 400, origin);
      }
    }
    if (b.priceValidFrom !== undefined) {
      if (typeof b.priceValidFrom === 'string' || b.priceValidFrom === null) {
        updates.push('price_valid_from = $' + String(updates.length + 1));
        values.push(b.priceValidFrom);
      } else {
        return errorResponse('Validation failed: priceValidFrom - must be a string or null', 400, origin);
      }
    }
    if (b.priceValidTo !== undefined) {
      if (typeof b.priceValidTo === 'string' || b.priceValidTo === null) {
        updates.push('price_valid_to = $' + String(updates.length + 1));
        values.push(b.priceValidTo);
      } else {
        return errorResponse('Validation failed: priceValidTo - must be a string or null', 400, origin);
      }
    }
    if (b.availabilityStatus !== undefined) {
      if (typeof b.availabilityStatus === 'string' && ['available', 'limited', 'unavailable', 'expected'].includes(b.availabilityStatus)) {
        updates.push('availability_status = $' + String(updates.length + 1));
        updates.push('availability_updated_at = $' + String(updates.length + 1));
        values.push(b.availabilityStatus);
        values.push(new Date().toISOString());
      } else {
        return errorResponse(`Validation failed: availabilityStatus - must be one of: available, limited, unavailable, expected`, 400, origin);
      }
    }
    if (b.availableQuantity !== undefined) {
      if (b.availableQuantity === null || (typeof b.availableQuantity === 'number' && Number.isInteger(b.availableQuantity) && b.availableQuantity >= 0)) {
        updates.push('available_quantity = $' + String(updates.length + 1));
        updates.push('availability_updated_at = $' + String(updates.length + 1));
        values.push(b.availableQuantity);
        values.push(new Date().toISOString());
      } else {
        return errorResponse('Validation failed: availableQuantity - must be a non-negative integer or null', 400, origin);
      }
    }
    if (b.expectedAvailableDate !== undefined) {
      if (typeof b.expectedAvailableDate === 'string' || b.expectedAvailableDate === null) {
        updates.push('expected_available_date = $' + String(updates.length + 1));
        values.push(b.expectedAvailableDate);
      } else {
        return errorResponse('Validation failed: expectedAvailableDate - must be a string or null', 400, origin);
      }
    }
    if (b.leadTimeDays !== undefined) {
      if (b.leadTimeDays === null || (typeof b.leadTimeDays === 'number' && Number.isInteger(b.leadTimeDays) && b.leadTimeDays >= 0)) {
        updates.push('lead_time_days = $' + String(updates.length + 1));
        values.push(b.leadTimeDays);
      } else {
        return errorResponse('Validation failed: leadTimeDays - must be a non-negative integer or null', 400, origin);
      }
    }
    if (b.status !== undefined) {
      if (typeof b.status === 'string' && ['active', 'inactive'].includes(b.status)) {
        updates.push('status = $' + String(updates.length + 1));
        values.push(b.status);
      } else {
        return errorResponse(`Validation failed: status - must be one of: active, inactive`, 400, origin);
      }
    }
    if (b.internalNotes !== undefined) {
      if (typeof b.internalNotes === 'string' || b.internalNotes === null) {
        updates.push('internal_notes = $' + String(updates.length + 1));
        values.push(typeof b.internalNotes === 'string' ? b.internalNotes.trim() : null);
      } else {
        return errorResponse('Validation failed: internalNotes - must be a string or null', 400, origin);
      }
    }
    if (updates.length === 0) return errorResponse('No valid fields to update', 422, origin);
    updates.push('updated_at = $' + String(updates.length + 1));
    values.push(new Date().toISOString());
    values.push(existing.id);
    try {
      await sql().unsafe(`UPDATE agreement_product_terms SET ${updates.join(', ')} WHERE id = $${updates.length}`, values);
      const updatedRows = await sql()`SELECT * FROM agreement_product_terms WHERE id = ${existing.id} LIMIT 1`;
      return jsonResponse({ productTerm: updatedRows[0] }, 200, origin);
    } catch (err) {
      console.error('[shanan-api] Product term update failed:', err);
      return errorResponse('Could not update product term.', 500, origin);
    }
  }

  // DELETE /api/supplier-agreements/:id/product-terms/:termId - deactivate (controlled)
  if (singleTermMatch && method === 'DELETE') {
    const auth = await requireInternal(req, origin);
    if (auth.error) return auth.error;
    const agrIdOrNum = decodeURIComponent(singleTermMatch[1]);
    const termId = decodeURIComponent(singleTermMatch[2]);
    const agrRows = await sql()`SELECT id FROM supplier_agreements WHERE id = ${agrIdOrNum} OR agreement_number = ${agrIdOrNum} LIMIT 1`;
    const agr = agrRows[0] as { id: string } | undefined;
    if (!agr) return errorResponse('Agreement not found', 404, origin);
    const existingRows = await sql()`SELECT id FROM agreement_product_terms WHERE id = ${termId} AND agreement_id = ${agr.id} LIMIT 1`;
    const existing = existingRows[0] as { id: string } | undefined;
    if (!existing) return errorResponse('Product term not found', 404, origin);
    try {
      await sql()`UPDATE agreement_product_terms SET status = 'inactive', updated_at = ${new Date().toISOString()} WHERE id = ${existing.id}`;
      return jsonResponse({ ok: true, deactivated: true, id: existing.id }, 200, origin);
    } catch (err) {
      console.error('[shanan-api] Product term deactivation failed:', err);
      return errorResponse('Could not deactivate product term.', 500, origin);
    }
  }

  // ============================================================
  // Phase A10 - Internal RFQ / Supplier Sourcing Workflow
  // ============================================================

  // GET /api/rfqs - list RFQs (internal OR customer with ownership check; optional ?supplyRequestId= filter)
  if (url.pathname === '/api/rfqs' && method === 'GET') {
    const auth = await requireAuth(req, origin);
    if (auth.error) return auth.error;
    const rfqUserType = auth.user.user_type;
    if (rfqUserType !== 'customer' && rfqUserType !== 'internal') {
      return errorResponse('Forbidden: access denied', 403, origin);
    }
    const isCustomer = auth.user.user_type === 'customer';
    try {
      const filterSR = url.searchParams.get('supplyRequestId');
      if (isCustomer) {
        if (!filterSR) {
          return errorResponse('supplyRequestId is required for customer access', 400, origin);
        }
        const srRows = await sql()`SELECT id, customer_company_id FROM supply_requests WHERE id = ${filterSR} OR reference = ${filterSR} LIMIT 1`;
        const sr = srRows[0] as { id: string; customer_company_id: string | null } | undefined;
        if (!sr || sr.customer_company_id !== auth.user.company_id) {
          return errorResponse('Request not found', 404, origin);
        }
        const rows = await sql()`
          SELECT r.id, r.reference, r.status, r.sent_at, r.created_at,
                 (SELECT COUNT(*)::int FROM rfq_suppliers rs WHERE rs.rfq_id = r.id) AS supplier_count,
                 (SELECT COUNT(*)::int FROM rfq_suppliers rs WHERE rs.rfq_id = r.id AND rs.response_state = 'responded') AS responded_count,
                 (SELECT COUNT(*)::int FROM rfq_supplier_offers o JOIN rfq_suppliers rs ON o.rfq_supplier_id = rs.id WHERE rs.rfq_id = r.id) AS offer_count,
                 (SELECT COUNT(*)::int FROM rfq_items ri WHERE ri.rfq_id = r.id) AS items_count
            FROM rfqs r
           WHERE r.supply_request_id = ${sr.id}
           ORDER BY r.created_at DESC`;
        return jsonResponse({ rfqs: rows, count: rows.length }, 200, origin);
      }
      let rows;
      if (filterSR) {
        rows = await sql()`
          SELECT r.*, sr.reference AS supply_request_reference, sr.status AS supply_request_status,
                 (SELECT COUNT(*)::int FROM rfq_suppliers rs WHERE rs.rfq_id = r.id) AS suppliers_count,
                 (SELECT COUNT(*)::int FROM rfq_suppliers rs WHERE rs.rfq_id = r.id AND rs.response_state = 'responded') AS responded_count,
                 (SELECT COUNT(*)::int FROM rfq_items ri WHERE ri.rfq_id = r.id) AS items_count
            FROM rfqs r
            LEFT JOIN supply_requests sr ON r.supply_request_id = sr.id
           WHERE r.supply_request_id = ${filterSR}
           ORDER BY r.created_at DESC`;
      } else {
        rows = await sql()`
          SELECT r.*, sr.reference AS supply_request_reference, sr.status AS supply_request_status,
                 (SELECT COUNT(*)::int FROM rfq_suppliers rs WHERE rs.rfq_id = r.id) AS suppliers_count,
                 (SELECT COUNT(*)::int FROM rfq_suppliers rs WHERE rs.rfq_id = r.id AND rs.response_state = 'responded') AS responded_count,
                 (SELECT COUNT(*)::int FROM rfq_items ri WHERE ri.rfq_id = r.id) AS items_count
            FROM rfqs r
            LEFT JOIN supply_requests sr ON r.supply_request_id = sr.id
           ORDER BY r.created_at DESC`;
      }
      return jsonResponse({ rfqs: rows, count: rows.length }, 200, origin);
    } catch (err) {
      console.error('[shanan-api] RFQ query failed:', err);
      return errorResponse('Could not retrieve RFQs.', 500, origin);
    }
  }

  // POST /api/rfqs - create a new RFQ from an existing Supply Request (internal only)
  if (url.pathname === '/api/rfqs' && method === 'POST') {
    const auth = await requireInternal(req, origin);
    if (auth.error) return auth.error;
    const parsed = await tryParseJson(req);
    if (!parsed.ok) return errorResponse('Invalid JSON body', 400, origin);
    const b = parsed.body as Record<string, unknown>;
    if (typeof b.supplyRequestId !== 'string' || b.supplyRequestId.trim() === '') {
      return errorResponse('Validation failed: supplyRequestId - required', 422, origin);
    }
    const srRows = await sql()`SELECT id FROM supply_requests WHERE id = ${b.supplyRequestId} OR reference = ${b.supplyRequestId} LIMIT 1`;
    const sr = srRows[0] as { id: string } | undefined;
    if (!sr) {
      return errorResponse('Validation failed: supplyRequestId - references a non-existent Supply Request', 422, origin);
    }
    const itemIds = b.itemIds;
    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return errorResponse('Validation failed: itemIds - at least one request item is required', 422, origin);
    }
    type PendingItem = { id: string; request_id: string; product_id: string; product_name: string; sku: string; quantity: number; notes: string | null };
    const pendingItems: PendingItem[] = [];
    const seenItemIds = new Set<string>();
    for (let i = 0; i < itemIds.length; i++) {
      const rid = itemIds[i];
      if (typeof rid !== 'number' && typeof rid !== 'string') {
        return errorResponse(`Validation failed: itemIds[${i}] - must be a positive integer (supply_request_item.id)`, 422, origin);
      }
      const ridKey = String(rid);
      if (seenItemIds.has(ridKey)) {
        return errorResponse(`Validation failed: itemIds[${i}] - duplicate request item ${ridKey}`, 422, origin);
      }
      seenItemIds.add(ridKey);
      const itemRows = await sql()`SELECT id, request_id, product_id, product_name, sku, quantity, notes FROM supply_request_items WHERE id = ${rid} LIMIT 1`;
      const item = itemRows[0] as PendingItem | undefined;
      if (!item) {
        return errorResponse(`Validation failed: itemIds[${i}] - request item ${ridKey} does not exist`, 422, origin);
      }
      if (item.request_id !== sr.id) {
        return errorResponse(`Validation failed: itemIds[${i}] - request item ${ridKey} does not belong to this Supply Request`, 422, origin);
      }
      if (!(await isValidProductId(item.product_id))) {
        return errorResponse(`Validation failed: itemIds[${i}] - request item ${ridKey} references a non-existent SHANAN product`, 422, origin);
      }
      pendingItems.push(item);
    }

    const supplierIds = b.supplierIds;
    const pendingSupplierIds: string[] = [];
    if (supplierIds !== undefined && supplierIds !== null) {
      if (!Array.isArray(supplierIds)) {
        return errorResponse('Validation failed: supplierIds - must be an array', 422, origin);
      }
      const seenSup = new Set<string>();
      for (let i = 0; i < supplierIds.length; i++) {
        const sid = supplierIds[i];
        if (typeof sid !== 'string' || sid.trim() === '') {
          return errorResponse(`Validation failed: supplierIds[${i}] - must be a non-empty string`, 422, origin);
        }
        if (seenSup.has(sid)) {
          return errorResponse(`Validation failed: supplierIds[${i}] - duplicate supplier ${sid}`, 422, origin);
        }
        seenSup.add(sid);
        const supRows = await sql()`SELECT id FROM suppliers WHERE id = ${sid} OR reference = ${sid} LIMIT 1`;
        const sup = supRows[0] as { id: string } | undefined;
        if (!sup) {
          return errorResponse(`Validation failed: supplierIds[${i}] - references a non-existent supplier`, 422, origin);
        }
        pendingSupplierIds.push(sup.id);
      }
    }

    const id = generateId();
    const reference = generateRfqReference();
    const now = new Date().toISOString();
    const internalNotes = typeof b.internalNotes === 'string' ? b.internalNotes.trim() || null : null;
    try {
      await sql().begin(async (tx: any) => {
        await tx`INSERT INTO rfqs (id, reference, supply_request_id, status, internal_notes, created_by, created_at, updated_at)
                 VALUES (${id}, ${reference}, ${sr.id}, 'draft', ${internalNotes}, ${auth.user.id}, ${now}, ${now})`;
        for (const it of pendingItems) {
          await tx`INSERT INTO rfq_items (id, rfq_id, supply_request_item_id, product_id, product_name, sku, requested_quantity, customer_notes, rfq_notes, created_at)
                   VALUES (${generateId()}, ${id}, ${it.id}, ${it.product_id}, ${it.product_name}, ${it.sku}, ${it.quantity}, ${it.notes}, NULL, ${now})`;
        }
        for (const sid of pendingSupplierIds) {
          await tx`INSERT INTO rfq_suppliers (id, rfq_id, supplier_id, response_state, created_at)
                   VALUES (${generateId()}, ${id}, ${sid}, 'pending', ${now})`;
        }
      });
      await recordActivityEvent('RFQ_CREATED', auth.user, { rfqId: id });
      return jsonResponse({ id, reference, createdAt: now, status: 'draft' }, 201, origin);
    } catch (err) {
      console.error('[shanan-api] RFQ insert failed:', err);
      return errorResponse('Could not create RFQ.', 500, origin);
    }
  }

  // GET /api/rfqs/:id - fetch single RFQ with full detail (internal only)
  const rfqMatch = url.pathname.match(/^\/api\/rfqs\/([^/]+)$/);
  if (rfqMatch && method === 'GET') {
    const auth = await requireInternal(req, origin);
    if (auth.error) return auth.error;
    const rfqIdOrRef = decodeURIComponent(rfqMatch[1]);
    try {
      const rfqRows = await sql()`
        SELECT r.*, sr.reference AS supply_request_reference, sr.status AS supply_request_status,
               sr.customer_company_id AS supply_request_customer_company_id,
               u.name AS created_by_name
          FROM rfqs r
          LEFT JOIN supply_requests sr ON r.supply_request_id = sr.id
          LEFT JOIN users u ON r.created_by = u.id
         WHERE r.id = ${rfqIdOrRef} OR r.reference = ${rfqIdOrRef}
         LIMIT 1`;
      const rfq = rfqRows[0] as any;
      if (!rfq) return errorResponse('RFQ not found', 404, origin);

      const suppliers = await sql()`SELECT rs.id, rs.rfq_id, rs.supplier_id, rs.response_state, rs.responded_at, rs.created_at, s.reference AS supplier_reference, s.name_en AS supplier_name_en, s.status AS supplier_status FROM rfq_suppliers rs LEFT JOIN suppliers s ON rs.supplier_id = s.id WHERE rs.rfq_id = ${rfq.id} ORDER BY rs.created_at ASC`;
      const itemsRows = await sql()`SELECT ri.*, ri.supply_request_item_id AS request_item_id FROM rfq_items ri WHERE ri.rfq_id = ${rfq.id} ORDER BY ri.created_at ASC`;
      const enrichedItems = await Promise.all((itemsRows as any[]).map(async (it: any) => {
        const product = await getProductSummary(it.product_id);
        return {
          ...it,
          canonical_product_sku: product?.sku ?? null,
          canonical_product_code: product?.productCode ?? null,
          canonical_product_name_en: product?.nameEn ?? null,
        };
      }));
      const offers = await sql()`SELECT o.*, rs.supplier_id AS supplier_id, ri.product_id AS product_id FROM rfq_supplier_offers o JOIN rfq_suppliers rs ON o.rfq_supplier_id = rs.id JOIN rfq_items ri ON o.rfq_item_id = ri.id WHERE rs.rfq_id = ${rfq.id} ORDER BY o.updated_at ASC`;

      const totalSuppliers = (suppliers as any[]).length;
      const respondedSuppliers = (suppliers as any[]).filter((s: any) => s.response_state === 'responded').length;
      return jsonResponse({
        rfq,
        supplyRequestReference: rfq.supply_request_reference,
        items: enrichedItems,
        itemsCount: enrichedItems.length,
        suppliers,
        suppliersCount: totalSuppliers,
        respondedCount: respondedSuppliers,
        offers,
        offersCount: (offers as any[]).length,
      }, 200, origin);
    } catch (err) {
      console.error('[shanan-api] RFQ lookup failed:', err);
      return errorResponse('Could not retrieve RFQ.', 500, origin);
    }
  }

  // PATCH /api/rfqs/:id - state transition + edit (internal only)
  if (rfqMatch && method === 'PATCH') {
    const auth = await requireInternal(req, origin);
    if (auth.error) return auth.error;
    const rfqIdOrRef = decodeURIComponent(rfqMatch[1]);
    const parsed = await tryParseJson(req);
    if (!parsed.ok) return errorResponse('Invalid JSON body', 400, origin);
    const existingRows = await sql()`SELECT * FROM rfqs WHERE id = ${rfqIdOrRef} OR reference = ${rfqIdOrRef} LIMIT 1`;
    const existing = existingRows[0] as any;
    if (!existing) return errorResponse('RFQ not found', 404, origin);
    const now = new Date().toISOString();
    const currentStatus = existing.status as string;
    const b = parsed.body as Record<string, unknown>;

    if (typeof b.action === 'string') {
      const action = b.action;
      if (!RFQ_ACTIONS[action]) {
        return errorResponse(`Validation failed: action - must be one of: ${Object.keys(RFQ_ACTIONS).join(', ')}`, 400, origin);
      }
      const rule = RFQ_ACTIONS[action];
      if (!rule.from.includes(currentStatus)) {
        return errorResponse(`Cannot ${action}: current status is '${currentStatus}' (must be one of: ${rule.from.join(', ')})`, 400, origin);
      }
      if (action === 'mark_ready' || action === 'send') {
        const itemCountRows = await sql()`SELECT COUNT(*)::int as n FROM rfq_items WHERE rfq_id = ${existing.id}`;
        const supCountRows = await sql()`SELECT COUNT(*)::int as n FROM rfq_suppliers WHERE rfq_id = ${existing.id}`;
        const itemCount = Number((itemCountRows[0] as any)?.n ?? 0);
        const supCount = Number((supCountRows[0] as any)?.n ?? 0);
        const err = rfqSendReadinessErrors(itemCount > 0, supCount > 0);
        if (err) return errorResponse(err, 400, origin);
      }
      const newStatus = rule.to;
      if (action === 'send') {
        await sql()`UPDATE rfqs SET status = ${newStatus}, sent_at = ${now}, updated_at = ${now} WHERE id = ${existing.id}`;
      } else if (action === 'close') {
        await sql()`UPDATE rfqs SET status = ${newStatus}, closed_at = ${now}, updated_at = ${now} WHERE id = ${existing.id}`;
      } else {
        await sql()`UPDATE rfqs SET status = ${newStatus}, updated_at = ${now} WHERE id = ${existing.id}`;
      }
      const updatedRows = await sql()`SELECT * FROM rfqs WHERE id = ${existing.id} LIMIT 1`;
      return jsonResponse({ rfq: updatedRows[0] }, 200, origin);
    }

    if (currentStatus !== 'draft' && currentStatus !== 'ready_to_send') {
      return errorResponse(`Cannot edit: RFQ status is '${currentStatus}'. Only draft or ready_to_send RFQs can be edited.`, 400, origin);
    }
    const updates: string[] = [];
    const values: any[] = [];
    if (b.internalNotes !== undefined) {
      if (typeof b.internalNotes === 'string' || b.internalNotes === null) {
        updates.push('internal_notes = $' + String(updates.length + 1));
        values.push(typeof b.internalNotes === 'string' ? b.internalNotes.trim() || null : null);
      } else {
        return errorResponse('Validation failed: internalNotes - must be a string or null', 400, origin);
      }
    }
    if (updates.length === 0) return errorResponse('No valid fields to update', 422, origin);
    updates.push('updated_at = $' + String(updates.length + 1));
    values.push(now);
    values.push(existing.id);
    try {
      await sql().unsafe(`UPDATE rfqs SET ${updates.join(', ')} WHERE id = $${updates.length}`, values);
      const updatedRows = await sql()`SELECT * FROM rfqs WHERE id = ${existing.id} LIMIT 1`;
      return jsonResponse({ rfq: updatedRows[0] }, 200, origin);
    } catch (err) {
      console.error('[shanan-api] RFQ update failed:', err);
      return errorResponse('Could not update RFQ.', 500, origin);
    }
  }

  // --- A10.2 RFQ suppliers (recipients) ---

  // POST /api/rfqs/:id/suppliers - add a supplier to an RFQ (internal only, editable states only)
  const rfqSupplierMatch = url.pathname.match(/^\/api\/rfqs\/([^/]+)\/suppliers$/);
  if (rfqSupplierMatch && method === 'POST') {
    const auth = await requireInternal(req, origin);
    if (auth.error) return auth.error;
    const rfqIdOrRef = decodeURIComponent(rfqSupplierMatch[1]);
    const parsed = await tryParseJson(req);
    if (!parsed.ok) return errorResponse('Invalid JSON body', 400, origin);
    const existingRows = await sql()`SELECT id, status FROM rfqs WHERE id = ${rfqIdOrRef} OR reference = ${rfqIdOrRef} LIMIT 1`;
    const existing = existingRows[0] as any;
    if (!existing) return errorResponse('RFQ not found', 404, origin);
    if (existing.status !== 'draft' && existing.status !== 'ready_to_send') {
      return errorResponse(`Cannot modify suppliers: RFQ status is '${existing.status}'. Only draft or ready_to_send RFQs can be modified.`, 400, origin);
    }
    const b = parsed.body as Record<string, unknown>;
    if (typeof b.supplierId !== 'string' || b.supplierId.trim() === '') {
      return errorResponse('Validation failed: supplierId - required', 422, origin);
    }
    const supRows = await sql()`SELECT id FROM suppliers WHERE id = ${b.supplierId} OR reference = ${b.supplierId} LIMIT 1`;
    const sup = supRows[0] as { id: string } | undefined;
    if (!sup) {
      return errorResponse('Validation failed: supplierId - references a non-existent supplier', 422, origin);
    }
    const existingRecipRows = await sql()`SELECT id FROM rfq_suppliers WHERE rfq_id = ${existing.id} AND supplier_id = ${sup.id} LIMIT 1`;
    if (existingRecipRows[0]) {
      return errorResponse('Validation failed: supplierId - this supplier is already a recipient of this RFQ', 409, origin);
    }
    const id = generateId();
    const now = new Date().toISOString();
    try {
      await sql()`INSERT INTO rfq_suppliers (id, rfq_id, supplier_id, response_state, created_at) VALUES (${id}, ${existing.id}, ${sup.id}, 'pending', ${now})`;
      return jsonResponse({ id, rfqId: existing.id, supplierId: sup.id, createdAt: now, responseState: 'pending' }, 201, origin);
    } catch (err) {
      console.error('[shanan-api] RFQ supplier insert failed:', err);
      return errorResponse('Could not add supplier to RFQ.', 500, origin);
    }
  }

  // DELETE /api/rfqs/:id/suppliers/:supplierId - remove a supplier from an RFQ (editable states only)
  const rfqSingleSupplierMatch = url.pathname.match(/^\/api\/rfqs\/([^/]+)\/suppliers\/([^/]+)$/);
  if (rfqSingleSupplierMatch && method === 'DELETE') {
    const auth = await requireInternal(req, origin);
    if (auth.error) return auth.error;
    const rfqIdOrRef = decodeURIComponent(rfqSingleSupplierMatch[1]);
    const supplierIdOrRef = decodeURIComponent(rfqSingleSupplierMatch[2]);
    const existingRows = await sql()`SELECT id, status FROM rfqs WHERE id = ${rfqIdOrRef} OR reference = ${rfqIdOrRef} LIMIT 1`;
    const existing = existingRows[0] as any;
    if (!existing) return errorResponse('RFQ not found', 404, origin);
    if (existing.status !== 'draft' && existing.status !== 'ready_to_send') {
      return errorResponse(`Cannot remove supplier: RFQ status is '${existing.status}'. Only draft or ready_to_send RFQs can be modified.`, 400, origin);
    }
    const supRows = await sql()`SELECT id FROM suppliers WHERE id = ${supplierIdOrRef} OR reference = ${supplierIdOrRef} LIMIT 1`;
    const sup = supRows[0] as { id: string } | undefined;
    if (!sup) return errorResponse('Supplier not found', 404, origin);
    try {
      const result = await sql()`DELETE FROM rfq_suppliers WHERE rfq_id = ${existing.id} AND supplier_id = ${sup.id}`;
      if (Number(result.count) === 0) return errorResponse('Supplier is not a recipient of this RFQ', 404, origin);
      return jsonResponse({ ok: true, removed: true }, 200, origin);
    } catch (err) {
      console.error('[shanan-api] RFQ supplier remove failed:', err);
      return errorResponse('Could not remove supplier from RFQ.', 500, origin);
    }
  }

  // --- A10.3 RFQ items ---

  // POST /api/rfqs/:id/items - add a request item to an RFQ (editable states only)
  const rfqItemsMatch = url.pathname.match(/^\/api\/rfqs\/([^/]+)\/items$/);
  if (rfqItemsMatch && method === 'POST') {
    const auth = await requireInternal(req, origin);
    if (auth.error) return auth.error;
    const rfqIdOrRef = decodeURIComponent(rfqItemsMatch[1]);
    const parsed = await tryParseJson(req);
    if (!parsed.ok) return errorResponse('Invalid JSON body', 400, origin);
    const existingRows = await sql()`SELECT id, status, supply_request_id FROM rfqs WHERE id = ${rfqIdOrRef} OR reference = ${rfqIdOrRef} LIMIT 1`;
    const existing = existingRows[0] as any;
    if (!existing) return errorResponse('RFQ not found', 404, origin);
    if (existing.status !== 'draft' && existing.status !== 'ready_to_send') {
      return errorResponse(`Cannot modify items: RFQ status is '${existing.status}'. Only draft or ready_to_send RFQs can be modified.`, 400, origin);
    }
    const b = parsed.body as Record<string, unknown>;
    if (typeof b.requestItemId !== 'number' && typeof b.requestItemId !== 'string') {
      return errorResponse('Validation failed: requestItemId - must be a positive integer (supply_request_item.id)', 422, origin);
    }
    const itemRows = await sql()`SELECT id, request_id, product_id, product_name, sku, quantity, notes FROM supply_request_items WHERE id = ${b.requestItemId} LIMIT 1`;
    const item = itemRows[0] as any;
    if (!item) {
      return errorResponse('Validation failed: requestItemId - request item does not exist', 422, origin);
    }
    if (item.request_id !== existing.supply_request_id) {
      return errorResponse('Validation failed: requestItemId - request item does not belong to this RFQ\'s supply request', 422, origin);
    }
    if (!(await isValidProductId(item.product_id))) {
      return errorResponse('Validation failed: requestItemId - request item references a non-existent SHANAN product', 422, origin);
    }
    const existingItemRows = await sql()`SELECT id FROM rfq_items WHERE rfq_id = ${existing.id} AND supply_request_item_id = ${item.id} LIMIT 1`;
    if (existingItemRows[0]) {
      return errorResponse('Validation failed: requestItemId - this request item is already in this RFQ', 409, origin);
    }
    const id = generateId();
    const now = new Date().toISOString();
    const rfqNotes = typeof b.rfqNotes === 'string' ? b.rfqNotes.trim() || null : null;
    try {
      await sql()`INSERT INTO rfq_items (id, rfq_id, supply_request_item_id, product_id, product_name, sku, requested_quantity, customer_notes, rfq_notes, created_at) VALUES (${id}, ${existing.id}, ${item.id}, ${item.product_id}, ${item.product_name}, ${item.sku}, ${item.quantity}, ${item.notes}, ${rfqNotes}, ${now})`;
      return jsonResponse({ id, createdAt: now }, 201, origin);
    } catch (err) {
      console.error('[shanan-api] RFQ item insert failed:', err);
      return errorResponse('Could not add item to RFQ.', 500, origin);
    }
  }

  // --- A10.4 RFQ supplier offers (responses) ---

  // POST /api/rfqs/:id/offers - record a supplier offer for one item (internal only)
  const rfqOfferMatch = url.pathname.match(/^\/api\/rfqs\/([^/]+)\/offers$/);
  if (rfqOfferMatch && method === 'POST') {
    const auth = await requireInternal(req, origin);
    if (auth.error) return auth.error;
    const rfqIdOrRef = decodeURIComponent(rfqOfferMatch[1]);
    const parsed = await tryParseJson(req);
    if (!parsed.ok) return errorResponse('Invalid JSON body', 400, origin);
    const existingRows = await sql()`SELECT id, status FROM rfqs WHERE id = ${rfqIdOrRef} OR reference = ${rfqIdOrRef} LIMIT 1`;
    const existing = existingRows[0] as any;
    if (!existing) return errorResponse('RFQ not found', 404, origin);
    if (!['sent', 'partially_responded', 'responded'].includes(existing.status)) {
      return errorResponse(`Cannot record offer: RFQ status is '${existing.status}'. Offers can only be recorded against sent, partially_responded, or responded RFQs.`, 400, origin);
    }
    const b = parsed.body as Record<string, unknown>;
    if (typeof b.supplierId !== 'string' || b.supplierId.trim() === '') {
      return errorResponse('Validation failed: supplierId - required', 422, origin);
    }
    const supRows = await sql()`SELECT id FROM suppliers WHERE id = ${b.supplierId} OR reference = ${b.supplierId} LIMIT 1`;
    const sup = supRows[0] as { id: string } | undefined;
    if (!sup) return errorResponse('Validation failed: supplierId - references a non-existent supplier', 422, origin);
    const rfqSupRows = await sql()`SELECT id FROM rfq_suppliers WHERE rfq_id = ${existing.id} AND supplier_id = ${sup.id} LIMIT 1`;
    const rfqSup = rfqSupRows[0] as { id: string } | undefined;
    if (!rfqSup) {
      return errorResponse('Validation failed: supplierId - this supplier is not a recipient of this RFQ', 422, origin);
    }
    if (typeof b.rfqItemId !== 'string' || b.rfqItemId.trim() === '') {
      return errorResponse('Validation failed: rfqItemId - required', 422, origin);
    }
    const rfqItemRows = await sql()`SELECT id FROM rfq_items WHERE id = ${b.rfqItemId} AND rfq_id = ${existing.id} LIMIT 1`;
    if (!rfqItemRows[0]) {
      return errorResponse('Validation failed: rfqItemId - item does not belong to this RFQ', 422, origin);
    }
    let offerStatus = 'pending';
    if (b.offerStatus !== undefined && b.offerStatus !== null) {
      if (typeof b.offerStatus === 'string' && ['pending', 'quoted', 'declined', 'unavailable'].includes(b.offerStatus)) {
        offerStatus = b.offerStatus;
      } else {
        return errorResponse(`Validation failed: offerStatus - must be one of: pending, quoted, declined, unavailable`, 400, origin);
      }
    }
    let quotedUnitPrice: number | null = null;
    if (b.quotedUnitPrice !== undefined && b.quotedUnitPrice !== null) {
      if (typeof b.quotedUnitPrice !== 'number' || b.quotedUnitPrice < 0 || !isFinite(b.quotedUnitPrice)) {
        return errorResponse('Validation failed: quotedUnitPrice - must be a non-negative number', 400, origin);
      }
      quotedUnitPrice = b.quotedUnitPrice;
    }
    if (offerStatus === 'quoted' && quotedUnitPrice === null) {
      return errorResponse('Validation failed: quotedUnitPrice - required when offerStatus is "quoted"', 400, origin);
    }
    let offeredQty: number | null = null;
    if (b.offeredQuantity !== undefined && b.offeredQuantity !== null) {
      if (typeof b.offeredQuantity === 'number' && Number.isInteger(b.offeredQuantity) && b.offeredQuantity >= 0) {
        offeredQty = b.offeredQuantity;
      } else {
        return errorResponse('Validation failed: offeredQuantity - must be a non-negative integer', 400, origin);
      }
    }
    let leadTime: number | null = null;
    if (b.leadTimeDays !== undefined && b.leadTimeDays !== null) {
      if (typeof b.leadTimeDays === 'number' && Number.isInteger(b.leadTimeDays) && b.leadTimeDays >= 0) {
        leadTime = b.leadTimeDays;
      } else {
        return errorResponse('Validation failed: leadTimeDays - must be a non-negative integer', 400, origin);
      }
    }
    let moq: number | null = null;
    if (b.minimumOrderQuantity !== undefined && b.minimumOrderQuantity !== null) {
      if (typeof b.minimumOrderQuantity === 'number' && Number.isInteger(b.minimumOrderQuantity) && b.minimumOrderQuantity >= 0) {
        moq = b.minimumOrderQuantity;
      } else {
        return errorResponse('Validation failed: minimumOrderQuantity - must be a non-negative integer', 400, origin);
      }
    }
    const currency = (typeof b.currency === 'string' && b.currency.trim()) ? b.currency.trim() : null;
    const validityDate = (typeof b.validityDate === 'string') ? b.validityDate : null;
    const paymentTerms = (typeof b.paymentTerms === 'string' && b.paymentTerms.trim()) ? b.paymentTerms.trim() : null;
    const commercialNotes = (typeof b.commercialNotes === 'string' && b.commercialNotes.trim()) ? b.commercialNotes.trim() : null;
    const now = new Date().toISOString();

    try {
      await sql().begin(async (tx: any) => {
        const existingOfferRows = await tx`SELECT id FROM rfq_supplier_offers WHERE rfq_supplier_id = ${rfqSup.id} AND rfq_item_id = ${rfqItemRows[0].id} LIMIT 1`;
        let offerId: string;
        if (existingOfferRows[0]) {
          offerId = existingOfferRows[0].id;
          await tx`UPDATE rfq_supplier_offers SET offer_status = ${offerStatus}, quoted_unit_price = ${quotedUnitPrice}, currency = ${currency}, offered_quantity = ${offeredQty}, lead_time_days = ${leadTime}, validity_date = ${validityDate}, minimum_order_quantity = ${moq}, payment_terms = ${paymentTerms}, commercial_notes = ${commercialNotes}, responded_at = ${now}, updated_at = ${now} WHERE id = ${offerId}`;
        } else {
          offerId = generateId();
          await tx`INSERT INTO rfq_supplier_offers (id, rfq_supplier_id, rfq_item_id, offer_status, quoted_unit_price, currency, offered_quantity, lead_time_days, validity_date, minimum_order_quantity, payment_terms, commercial_notes, responded_at, created_at, updated_at) VALUES (${offerId}, ${rfqSup.id}, ${rfqItemRows[0].id}, ${offerStatus}, ${quotedUnitPrice}, ${currency}, ${offeredQty}, ${leadTime}, ${validityDate}, ${moq}, ${paymentTerms}, ${commercialNotes}, ${now}, ${now}, ${now})`;
        }
        const allSuppliers = await tx`SELECT id, supplier_id FROM rfq_suppliers WHERE rfq_id = ${existing.id}`;
        let respondedCount = 0;
        for (const rs of (allSuppliers as any[])) {
          const totalItemsRows = await tx`SELECT COUNT(*)::int as n FROM rfq_items WHERE rfq_id = ${existing.id}`;
          const totalItemsForSup = Number((totalItemsRows[0] as any)?.n ?? 0);
          const answeredRows = await tx`SELECT COUNT(*)::int as n FROM rfq_supplier_offers o WHERE o.rfq_supplier_id = ${rs.id} AND o.offer_status != 'pending'`;
          const answeredItems = Number((answeredRows[0] as any)?.n ?? 0);
          const supResponded = answeredItems >= totalItemsForSup && totalItemsForSup > 0;
          if (supResponded) {
            respondedCount++;
            if (rs.response_state !== 'responded') {
              await tx`UPDATE rfq_suppliers SET response_state = 'responded', responded_at = ${now} WHERE id = ${rs.id}`;
            }
          } else {
            if (rs.response_state === 'responded') {
              await tx`UPDATE rfq_suppliers SET response_state = 'pending' WHERE id = ${rs.id}`;
            }
          }
        }
        if (existing.status === 'sent' || existing.status === 'partially_responded') {
          let newStatus: string;
          if (respondedCount === 0) {
            newStatus = 'sent';
          } else if (respondedCount >= (allSuppliers as any[]).length) {
            newStatus = 'responded';
          } else {
            newStatus = 'partially_responded';
          }
          if (newStatus !== existing.status) {
            await tx`UPDATE rfqs SET status = ${newStatus}, updated_at = ${now} WHERE id = ${existing.id}`;
          }
        }
      });
      const updatedRfqRows = await sql()`SELECT * FROM rfqs WHERE id = ${existing.id} LIMIT 1`;
      await recordActivityEvent('OFFER_RECORDED', auth.user, { rfqId: existing.id });
      return jsonResponse({ rfq: updatedRfqRows[0] }, 200, origin);
    } catch (err) {
      console.error('[shanan-api] RFQ offer record failed:', err);
      return errorResponse('Could not record supplier offer.', 500, origin);
    }
  }

  // ============================================================
  // Phase A11 - Internal Sourcing Evaluation & Decision
  // ============================================================

  // GET /api/supply-requests/:id/sourcing-evaluation
  const evaluationMatch = url.pathname.match(/^\/api\/supply-requests\/([^/]+)\/sourcing-evaluation$/);
  if (evaluationMatch && method === 'GET') {
    const auth = await requireInternal(req, origin);
    if (auth.error) return auth.error;
    const srIdOrRef = decodeURIComponent(evaluationMatch[1]);
    const srRows = await sql()`SELECT id FROM supply_requests WHERE id = ${srIdOrRef} OR reference = ${srIdOrRef} LIMIT 1`;
    const sr = srRows[0] as { id: string } | undefined;
    if (!sr) return errorResponse('Supply Request not found', 404, origin);
    try {
      const evaluation = await evaluateSourcingForRequest(sr.id);
      if (!evaluation) return errorResponse('Supply Request not found', 404, origin);
      const latestDecisionRows = await sql()`SELECT sd.*, u.name AS decided_by_name FROM sourcing_decisions sd LEFT JOIN users u ON sd.decided_by = u.id WHERE sd.supply_request_id = ${sr.id} ORDER BY sd.decided_at DESC LIMIT 1`;
      return jsonResponse({ evaluation, latestDecision: latestDecisionRows[0] || null }, 200, origin);
    } catch (err) {
      console.error('[shanan-api] Sourcing evaluation failed:', err);
      return errorResponse('Could not evaluate sourcing options.', 500, origin);
    }
  }

  // POST /api/supply-requests/:id/sourcing-decision
  const decisionMatch = url.pathname.match(/^\/api\/supply-requests\/([^/]+)\/sourcing-decision$/);
  if (decisionMatch && method === 'POST') {
    const auth = await requireInternal(req, origin);
    if (auth.error) return auth.error;
    const srIdOrRef = decodeURIComponent(decisionMatch[1]);
    const parsed = await tryParseJson(req);
    if (!parsed.ok) return errorResponse('Invalid JSON body', 400, origin);
    const srRows = await sql()`SELECT id FROM supply_requests WHERE id = ${srIdOrRef} OR reference = ${srIdOrRef} LIMIT 1`;
    const sr = srRows[0] as { id: string } | undefined;
    if (!sr) return errorResponse('Supply Request not found', 404, origin);
    const b = parsed.body as Record<string, unknown>;
    const validStates = ['not_decided', 'recommended_for_review', 'selected', 'needs_more_sourcing', 'rejected'];
    let decisionState: string;
    if (typeof b.decisionState === 'string' && validStates.includes(b.decisionState)) {
      decisionState = b.decisionState;
    } else {
      return errorResponse(`Validation failed: decisionState - must be one of: ${validStates.join(', ')}`, 400, origin);
    }
    let selectedSourceType: 'agreement_term' | 'rfq_offer' | null = null;
    let selectedSourceId: string | null = null;
    let snapshot: {
      supplier_id: string; product_id: string; unit_price: number | null;
      currency: string | null; lead_time_days: number | null;
      rfq_item_id: string | null;
    } | null = null;
    if (decisionState === 'selected') {
      if (typeof b.selectedSourceType !== 'string' || !['agreement_term', 'rfq_offer'].includes(b.selectedSourceType)) {
        return errorResponse('Validation failed: selectedSourceType - required (must be agreement_term or rfq_offer) when decisionState is "selected"', 422, origin);
      }
      if (typeof b.selectedSourceId !== 'string' || b.selectedSourceId.trim() === '') {
        return errorResponse('Validation failed: selectedSourceId - required when decisionState is "selected"', 422, origin);
      }
      selectedSourceType = b.selectedSourceType as 'agreement_term' | 'rfq_offer';
      selectedSourceId = b.selectedSourceId.trim();
      const validation = await validateSelectedOption(sr.id, selectedSourceType, selectedSourceId);
      if (!validation.ok) {
        return errorResponse(`Validation failed: selectedSourceId - ${validation.reason}`, 400, origin);
      }
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
      await sql()`
        INSERT INTO sourcing_decisions
          (id, reference, supply_request_id, decision_state,
           selected_source_type, selected_agreement_term_id, selected_rfq_offer_id, selected_rfq_item_id,
           snapshot_supplier_id, snapshot_product_id, snapshot_unit_price, snapshot_currency, snapshot_lead_time_days,
           decision_notes, decided_by, decided_at, created_at)
        VALUES (${id}, ${reference}, ${sr.id}, ${decisionState},
                ${selectedSourceType},
                ${selectedSourceType === 'agreement_term' ? selectedSourceId : null},
                ${selectedSourceType === 'rfq_offer' ? selectedSourceId : null},
                ${snapshot?.rfq_item_id ?? null},
                ${snapshot?.supplier_id ?? null},
                ${snapshot?.product_id ?? null},
                ${snapshot?.unit_price ?? null},
                ${snapshot?.currency ?? null},
                ${snapshot?.lead_time_days ?? null},
                ${decisionNotes},
                ${auth.user.id}, ${now}, ${now})`;
      const createdRows = await sql()`SELECT sd.*, u.name AS decided_by_name FROM sourcing_decisions sd LEFT JOIN users u ON sd.decided_by = u.id WHERE sd.id = ${id} LIMIT 1`;
      await recordActivityEvent('DECISION_RECORDED', auth.user, { supplyRequestId: sr.id });
      return jsonResponse({ decision: createdRows[0] }, 201, origin);
    } catch (err) {
      console.error('[shanan-api] Sourcing decision insert failed:', err);
      return errorResponse('Could not record sourcing decision.', 500, origin);
    }
  }

  // GET /api/supply-requests/:id/sourcing-decisions - decision history (internal full; customer safe subset)
  const sdHistoryMatch = url.pathname.match(/^\/api\/supply-requests\/([^/]+)\/sourcing-decisions$/);
  if (sdHistoryMatch && method === 'GET') {
    const auth = await requireAuth(req, origin);
    if (auth.error) return auth.error;
    const sdUserType = auth.user.user_type;
    if (sdUserType !== 'customer' && sdUserType !== 'internal') {
      return errorResponse('Forbidden: access denied', 403, origin);
    }
    const isCustomer = auth.user.user_type === 'customer';
    const srIdOrRef = decodeURIComponent(sdHistoryMatch[1]);
    const srRows = await sql()`SELECT id, customer_company_id FROM supply_requests WHERE id = ${srIdOrRef} OR reference = ${srIdOrRef} LIMIT 1`;
    const sr = srRows[0] as { id: string; customer_company_id: string | null } | undefined;
    if (!sr) return errorResponse('Supply Request not found', 404, origin);
    if (isCustomer && sr.customer_company_id !== auth.user.company_id) {
      return errorResponse('Request not found', 404, origin);
    }
    try {
      if (isCustomer) {
        const rows = await sql()`SELECT sd.id, sd.reference, sd.decision_state, sd.selected_source_type, sd.created_at FROM sourcing_decisions sd WHERE sd.supply_request_id = ${sr.id} ORDER BY sd.decided_at DESC`;
        return jsonResponse({ decisions: rows, count: rows.length }, 200, origin);
      }
      const rows = await sql()`SELECT sd.*, u.name AS decided_by_name FROM sourcing_decisions sd LEFT JOIN users u ON sd.decided_by = u.id WHERE sd.supply_request_id = ${sr.id} ORDER BY sd.decided_at DESC`;
      return jsonResponse({ decisions: rows, count: rows.length }, 200, origin);
    } catch (err) {
      console.error('[shanan-api] Sourcing decisions query failed:', err);
      return errorResponse('Could not retrieve sourcing decisions.', 500, origin);
    }
  }

  // GET /api/supply-requests/:id/procurement-status - customer-safe aggregated procurement status
  const procStatusMatch = url.pathname.match(/^\/api\/supply-requests\/([^/]+)\/procurement-status$/);
  if (procStatusMatch && method === 'GET') {
    const auth = await requireAuth(req, origin);
    if (auth.error) return auth.error;
    const userType = auth.user.user_type;
    if (userType !== 'customer' && userType !== 'internal') {
      return errorResponse('Forbidden: access denied', 403, origin);
    }
    const isCustomer = userType === 'customer';
    const srIdOrRef = decodeURIComponent(procStatusMatch[1]);
    const srRows = await sql()`SELECT id, customer_company_id, status AS sr_status FROM supply_requests WHERE id = ${srIdOrRef} OR reference = ${srIdOrRef} LIMIT 1`;
    const sr = srRows[0] as { id: string; customer_company_id: string | null; sr_status: string } | undefined;
    if (!sr) return errorResponse('Supply Request not found', 404, origin);
    if (isCustomer && sr.customer_company_id !== auth.user.company_id) {
      return errorResponse('Request not found', 404, origin);
    }
    try {
      const rfqRows = await sql()`
        SELECT r.id, r.reference, r.status, r.sent_at, r.created_at,
               (SELECT COUNT(*)::int FROM rfq_suppliers rs WHERE rs.rfq_id = r.id) AS supplier_count,
               (SELECT COUNT(*)::int FROM rfq_suppliers rs WHERE rs.rfq_id = r.id AND rs.response_state = 'responded') AS responded_count,
               (SELECT COUNT(*)::int FROM rfq_supplier_offers o JOIN rfq_suppliers rs ON o.rfq_supplier_id = rs.id WHERE rs.rfq_id = r.id) AS offer_count,
               (SELECT COUNT(*)::int FROM rfq_items ri WHERE ri.rfq_id = r.id) AS items_count
          FROM rfqs r
         WHERE r.supply_request_id = ${sr.id}
         ORDER BY r.created_at DESC LIMIT 1`;
      const rfq = (rfqRows[0] as any) || null;

      const decisionRows = await sql()`SELECT sd.id, sd.reference, sd.decision_state, sd.selected_source_type, sd.created_at FROM sourcing_decisions sd WHERE sd.supply_request_id = ${sr.id} ORDER BY sd.decided_at DESC LIMIT 1`;
      const decision = (decisionRows[0] as any) || null;

      let pr = null;
      if (decision) {
        const prRows = await sql()`SELECT id, reference, status, created_at FROM purchase_requests WHERE sourcing_decision_id = ${decision.id} LIMIT 1`;
        pr = (prRows[0] as any) || null;
      }
      if (!pr) {
        const prRows = await sql()`SELECT id, reference, status, created_at FROM purchase_requests WHERE supply_request_id = ${sr.id} ORDER BY created_at DESC LIMIT 1`;
        pr = (prRows[0] as any) || null;
      }

      let po = null;
      if (pr) {
        const poRows = await sql()`SELECT id, reference, status, expected_delivery, created_at FROM purchase_orders WHERE purchase_request_id = ${pr.id} LIMIT 1`;
        po = (poRows[0] as any) || null;
      }
      if (!po) {
        const poRows = await sql()`SELECT id, reference, status, expected_delivery, created_at FROM purchase_orders WHERE supply_request_id = ${sr.id} ORDER BY created_at DESC LIMIT 1`;
        po = (poRows[0] as any) || null;
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

  // --- B1: RFQ Comparison endpoint ---

  // GET /api/rfqs/:id/comparison
  const rfqComparisonMatch = url.pathname.match(/^\/api\/rfqs\/([^/]+)\/comparison$/);
  if (rfqComparisonMatch && method === 'GET') {
    const auth = await requireInternal(req, origin);
    if (auth.error) return auth.error;
    const rfqIdOrRef = decodeURIComponent(rfqComparisonMatch[1]);
    const rfqRows = await sql()`SELECT id, reference, status, supply_request_id FROM rfqs WHERE id = ${rfqIdOrRef} OR reference = ${rfqIdOrRef} LIMIT 1`;
    const rfq = rfqRows[0] as any;
    if (!rfq) return errorResponse('RFQ not found', 404, origin);
    try {
      const items = await sql()`SELECT ri.*, sri.product_id, sri.product_name, sri.sku, sri.quantity AS requested_quantity FROM rfq_items ri JOIN supply_request_items sri ON ri.supply_request_item_id = sri.id WHERE ri.rfq_id = ${rfq.id}`;
      const suppliers = await sql()`SELECT rs.*, s.id AS supplier_id, s.name_en AS supplier_name, s.reference AS supplier_reference FROM rfq_suppliers rs JOIN suppliers s ON rs.supplier_id = s.id WHERE rs.rfq_id = ${rfq.id}`;
      const offers = await sql()`SELECT rso.* FROM rfq_supplier_offers rso JOIN rfq_suppliers rs ON rso.rfq_supplier_id = rs.id WHERE rs.rfq_id = ${rfq.id}`;
      const comparison = (items as any[]).map((item: any) => {
        const itemOffers = (suppliers as any[]).map((sup: any) => {
          const offer = (offers as any[]).find((o: any) => o.rfq_item_id === item.id && o.rfq_supplier_id === sup.id);
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

  // --- B1: Purchase Requests ---

  // GET /api/purchase-requests - list all PRs (with optional status filter)
  if (url.pathname === '/api/purchase-requests' && method === 'GET') {
    const auth = await requireInternal(req, origin);
    if (auth.error) return auth.error;
    const statusFilter = url.searchParams.get('status');
    try {
      let rows;
      if (statusFilter && statusFilter !== 'all') {
        rows = await sql()`SELECT pr.*, s.name_en AS supplier_name, s.reference AS supplier_reference, sr.reference AS supply_request_reference, sd.reference AS sourcing_decision_reference, u.name AS created_by_name FROM purchase_requests pr JOIN suppliers s ON pr.supplier_id = s.id JOIN supply_requests sr ON pr.supply_request_id = sr.id JOIN sourcing_decisions sd ON pr.sourcing_decision_id = sd.id LEFT JOIN users u ON pr.created_by = u.id WHERE pr.status = ${statusFilter} ORDER BY pr.created_at DESC`;
      } else {
        rows = await sql()`SELECT pr.*, s.name_en AS supplier_name, s.reference AS supplier_reference, sr.reference AS supply_request_reference, sd.reference AS sourcing_decision_reference, u.name AS created_by_name FROM purchase_requests pr JOIN suppliers s ON pr.supplier_id = s.id JOIN supply_requests sr ON pr.supply_request_id = sr.id JOIN sourcing_decisions sd ON pr.sourcing_decision_id = sd.id LEFT JOIN users u ON pr.created_by = u.id ORDER BY pr.created_at DESC`;
      }
      const counts = await sql()`SELECT pr_id, COUNT(*)::int AS item_count, SUM(total_price) AS computed_total FROM purchase_request_items GROUP BY pr_id`;
      const countMap = new Map((counts as any[]).map((c: any) => [c.pr_id, c]));
      const result = (rows as any[]).map((r: any) => ({
        ...r,
        item_count: countMap.get(r.id)?.item_count ?? 0,
      }));
      return jsonResponse({ purchaseRequests: result, count: result.length }, 200, origin);
    } catch (err) {
      console.error('[shanan-api] Purchase requests list failed:', err);
      return errorResponse('Could not retrieve purchase requests.', 500, origin);
    }
  }

  // GET /api/purchase-requests/:id - detail with items
  const prDetailMatch = url.pathname.match(/^\/api\/purchase-requests\/([^/]+)$/);
  if (prDetailMatch && method === 'GET') {
    const auth = await requireInternal(req, origin);
    if (auth.error) return auth.error;
    const prIdOrRef = decodeURIComponent(prDetailMatch[1]);
    try {
      const prRows = await sql()`SELECT pr.*, s.name_en AS supplier_name, s.reference AS supplier_reference, s.contact_name, s.contact_email, s.contact_phone, sr.reference AS supply_request_reference, sr.customer_po_number, sd.reference AS sourcing_decision_reference, sd.snapshot_unit_price, sd.snapshot_currency, sd.snapshot_lead_time_days, u.name AS created_by_name, au.name AS approved_by_name FROM purchase_requests pr JOIN suppliers s ON pr.supplier_id = s.id JOIN supply_requests sr ON pr.supply_request_id = sr.id JOIN sourcing_decisions sd ON pr.sourcing_decision_id = sd.id LEFT JOIN users u ON pr.created_by = u.id LEFT JOIN users au ON pr.approved_by = au.id WHERE pr.id = ${prIdOrRef} OR pr.reference = ${prIdOrRef} LIMIT 1`;
      const pr = prRows[0] as any;
      if (!pr) return errorResponse('Purchase Request not found', 404, origin);
      const items = await sql()`SELECT pri.*, p.name_en AS catalog_product_name, p.sku AS catalog_sku FROM purchase_request_items pri LEFT JOIN products p ON pri.product_id = p.id WHERE pri.pr_id = ${pr.id}`;
      const poRows = await sql()`SELECT id, reference, status FROM purchase_orders WHERE purchase_request_id = ${pr.id} LIMIT 1`;
      return jsonResponse({ purchaseRequest: { ...pr, items, purchaseOrder: poRows[0] || null } }, 200, origin);
    } catch (err) {
      console.error('[shanan-api] Purchase request detail failed:', err);
      return errorResponse('Could not retrieve purchase request.', 500, origin);
    }
  }

  // POST /api/purchase-requests - create from sourcing decision
  if (url.pathname === '/api/purchase-requests' && method === 'POST') {
    const auth = await requireInternal(req, origin);
    if (auth.error) return auth.error;
    const parsed = await tryParseJson(req);
    if (!parsed.ok) return errorResponse('Invalid JSON body', 400, origin);
    const b = parsed.body as Record<string, unknown>;
    if (typeof b.sourcingDecisionId !== 'string' || b.sourcingDecisionId.trim() === '') {
      return errorResponse('Validation failed: sourcingDecisionId is required', 422, origin);
    }
    const decisionId = b.sourcingDecisionId.trim();
    const decisionRows = await sql()`SELECT sd.*, sr.id AS sr_id, sr.reference AS sr_reference FROM sourcing_decisions sd JOIN supply_requests sr ON sd.supply_request_id = sr.id WHERE sd.id = ${decisionId} AND sd.decision_state = 'selected' LIMIT 1`;
    const decision = decisionRows[0] as any;
    if (!decision) {
      return errorResponse('Sourcing decision not found or not in "selected" state', 404, origin);
    }
    const existingPrRows = await sql()`SELECT id, reference FROM purchase_requests WHERE sourcing_decision_id = ${decisionId} LIMIT 1`;
    if (existingPrRows[0]) {
      return errorResponse(`Purchase Request already exists for this decision: ${existingPrRows[0].reference}`, 409, origin);
    }
    if (!decision.snapshot_supplier_id) {
      return errorResponse('Sourcing decision has no supplier snapshot', 422, origin);
    }
    const supplierRows = await sql()`SELECT id, name_en FROM suppliers WHERE id = ${decision.snapshot_supplier_id} LIMIT 1`;
    if (!supplierRows[0]) {
      return errorResponse('Supplier not found', 404, origin);
    }
    const notes = (typeof b.notes === 'string') ? b.notes.trim() || null : null;
    const prId = generateId();
    const prReference = generatePrReference();
    const now = new Date().toISOString();
    try {
      await sql().begin(async (tx: any) => {
        await tx`INSERT INTO purchase_requests
                  (id, reference, supply_request_id, sourcing_decision_id, supplier_id,
                   status, total_amount, currency, notes, created_by, created_at, updated_at)
                 VALUES (${prId}, ${prReference}, ${decision.supply_request_id}, ${decisionId},
                         ${decision.snapshot_supplier_id}, 'draft',
                         ${decision.snapshot_unit_price ?? null},
                         ${decision.snapshot_currency || 'JOD'}, ${notes}, ${auth.user.id}, ${now}, ${now})`;
        let quantity = 1;
        let productName = '';
        let sku = '';
        let productId = decision.snapshot_product_id || '';
        if (decision.selected_rfq_item_id) {
          const rfqItemRows = await tx`SELECT ri.*, sri.quantity, sri.product_name, sri.sku FROM rfq_items ri JOIN supply_request_items sri ON ri.supply_request_item_id = sri.id WHERE ri.id = ${decision.selected_rfq_item_id} LIMIT 1`;
          const rfqItem = rfqItemRows[0] as any;
          if (rfqItem) {
            quantity = rfqItem.quantity;
            productName = rfqItem.product_name;
            sku = rfqItem.sku;
          }
        } else if (decision.selected_agreement_term_id) {
          const aptRows = await tx`SELECT apt.*, p.name_en AS product_name, p.sku FROM agreement_product_terms apt LEFT JOIN products p ON apt.product_id = p.id WHERE apt.id = ${decision.selected_agreement_term_id} LIMIT 1`;
          const apt = aptRows[0] as any;
          if (apt) {
            productId = apt.product_id;
            productName = apt.product_name || '';
            sku = apt.sku || '';
            quantity = apt.minimum_order_quantity || 1;
          }
        }
        const sriRows = await tx`SELECT quantity, product_name, sku FROM supply_request_items WHERE request_id = ${decision.supply_request_id} AND product_id = ${productId} LIMIT 1`;
        const sri = sriRows[0] as any;
        if (sri) {
          quantity = sri.quantity;
          if (!productName) productName = sri.product_name;
          if (!sku) sku = sri.sku;
        }
        const unitPrice = decision.snapshot_unit_price ?? null;
        const totalPrice = unitPrice ? unitPrice * quantity : null;
        await tx`INSERT INTO purchase_request_items
                  (pr_id, product_id, product_name, sku, quantity, unit_price, currency, total_price,
                   rfq_offer_id, rfq_item_id, source_type, snapshot_lead_time_days, created_at)
                 VALUES (${prId}, ${productId}, ${productName}, ${sku}, ${quantity},
                         ${unitPrice}, ${decision.snapshot_currency || 'JOD'}, ${totalPrice},
                         ${decision.selected_rfq_offer_id || null},
                         ${decision.selected_rfq_item_id || null},
                         ${decision.selected_source_type || null},
                         ${decision.snapshot_lead_time_days || null}, ${now})`;
        await tx`UPDATE purchase_requests SET total_amount = ${totalPrice} WHERE id = ${prId}`;
      });
      const createdRows = await sql()`SELECT pr.*, s.name_en AS supplier_name, u.name AS created_by_name FROM purchase_requests pr JOIN suppliers s ON pr.supplier_id = s.id LEFT JOIN users u ON pr.created_by = u.id WHERE pr.id = ${prId} LIMIT 1`;
      const createdItems = await sql()`SELECT * FROM purchase_request_items WHERE pr_id = ${prId}`;
      return jsonResponse({ purchaseRequest: { ...(createdRows[0] as any), items: createdItems } }, 201, origin);
    } catch (err) {
      console.error('[shanan-api] Purchase request creation failed:', err);
      return errorResponse('Could not create purchase request.', 500, origin);
    }
  }

  // PATCH /api/purchase-requests/:id - update status (approve/reject/cancel)
  const prUpdateMatch = url.pathname.match(/^\/api\/purchase-requests\/([^/]+)$/);
  if (prUpdateMatch && method === 'PATCH') {
    const auth = await requireInternal(req, origin);
    if (auth.error) return auth.error;
    const prIdOrRef = decodeURIComponent(prUpdateMatch[1]);
    const parsed = await tryParseJson(req);
    if (!parsed.ok) return errorResponse('Invalid JSON body', 400, origin);
    const prRows = await sql()`SELECT * FROM purchase_requests WHERE id = ${prIdOrRef} OR reference = ${prIdOrRef} LIMIT 1`;
    const pr = prRows[0] as any;
    if (!pr) return errorResponse('Purchase Request not found', 404, origin);
    const now = new Date().toISOString();
    const b = parsed.body as Record<string, unknown>;
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
        const updates: string[] = ['status = $1', 'updated_at = $2'];
        const params: any[] = [b.status, now];
        let n = 2;
        if (b.status === 'approved') {
          updates.push(`approved_by = $${String(++n)}`, `approved_at = $${String(++n)}`);
          params.push(auth.user.id, now);
        }
        if (b.status === 'rejected' && typeof b.rejectedReason === 'string') {
          updates.push(`rejected_reason = $${String(++n)}`);
          params.push(b.rejectedReason.trim());
        }
        if (typeof b.notes === 'string') {
          updates.push(`notes = $${String(++n)}`);
          params.push(b.notes.trim() || null);
        }
        params.push(pr.id);
        await sql().unsafe(`UPDATE purchase_requests SET ${updates.join(', ')} WHERE id = $${updates.length + 1}`, params);
      } else if (typeof b.notes === 'string') {
        await sql()`UPDATE purchase_requests SET notes = ${b.notes.trim() || null}, updated_at = ${now} WHERE id = ${pr.id}`;
      }
      const updatedRows = await sql()`SELECT pr.*, s.name_en AS supplier_name, u.name AS created_by_name, au.name AS approved_by_name FROM purchase_requests pr JOIN suppliers s ON pr.supplier_id = s.id LEFT JOIN users u ON pr.created_by = u.id LEFT JOIN users au ON pr.approved_by = au.id WHERE pr.id = ${pr.id} LIMIT 1`;
      const items = await sql()`SELECT * FROM purchase_request_items WHERE pr_id = ${pr.id}`;
      return jsonResponse({ purchaseRequest: { ...(updatedRows[0] as any), items } }, 200, origin);
    } catch (err) {
      console.error('[shanan-api] Purchase request update failed:', err);
      return errorResponse('Could not update purchase request.', 500, origin);
    }
  }

  // --- B1: Purchase Orders ---

  // GET /api/purchase-orders - list all POs (with optional status filter)
  if (url.pathname === '/api/purchase-orders' && method === 'GET') {
    const auth = await requireInternal(req, origin);
    if (auth.error) return auth.error;
    const statusFilter = url.searchParams.get('status');
    try {
      let rows;
      if (statusFilter && statusFilter !== 'all') {
        rows = await sql()`SELECT po.*, s.name_en AS supplier_name, s.reference AS supplier_reference, pr.reference AS purchase_request_reference, sr.reference AS supply_request_reference, u.name AS created_by_name FROM purchase_orders po JOIN suppliers s ON po.supplier_id = s.id JOIN purchase_requests pr ON po.purchase_request_id = pr.id JOIN supply_requests sr ON po.supply_request_id = sr.id LEFT JOIN users u ON po.created_by = u.id WHERE po.status = ${statusFilter} ORDER BY po.created_at DESC`;
      } else {
        rows = await sql()`SELECT po.*, s.name_en AS supplier_name, s.reference AS supplier_reference, pr.reference AS purchase_request_reference, sr.reference AS supply_request_reference, u.name AS created_by_name FROM purchase_orders po JOIN suppliers s ON po.supplier_id = s.id JOIN purchase_requests pr ON po.purchase_request_id = pr.id JOIN supply_requests sr ON po.supply_request_id = sr.id LEFT JOIN users u ON po.created_by = u.id ORDER BY po.created_at DESC`;
      }
      return jsonResponse({ purchaseOrders: rows, count: rows.length }, 200, origin);
    } catch (err) {
      console.error('[shanan-api] Purchase orders list failed:', err);
      return errorResponse('Could not retrieve purchase orders.', 500, origin);
    }
  }

  // GET /api/purchase-orders/:id - detail with items
  const poDetailMatch = url.pathname.match(/^\/api\/purchase-orders\/([^/]+)$/);
  if (poDetailMatch && method === 'GET') {
    const auth = await requireInternal(req, origin);
    if (auth.error) return auth.error;
    const poIdOrRef = decodeURIComponent(poDetailMatch[1]);
    try {
      const poRows = await sql()`SELECT po.*, s.name_en AS supplier_name, s.reference AS supplier_reference, s.contact_name, s.contact_email, s.contact_phone, pr.reference AS purchase_request_reference, pr.sourcing_decision_id, sr.reference AS supply_request_reference, u.name AS created_by_name FROM purchase_orders po JOIN suppliers s ON po.supplier_id = s.id JOIN purchase_requests pr ON po.purchase_request_id = pr.id JOIN supply_requests sr ON po.supply_request_id = sr.id LEFT JOIN users u ON po.created_by = u.id WHERE po.id = ${poIdOrRef} OR po.reference = ${poIdOrRef} LIMIT 1`;
      const po = poRows[0] as any;
      if (!po) return errorResponse('Purchase Order not found', 404, origin);
      const items = await sql()`SELECT poi.*, p.name_en AS catalog_product_name, p.sku AS catalog_sku FROM purchase_order_items poi LEFT JOIN products p ON poi.product_id = p.id WHERE poi.po_id = ${po.id}`;
      return jsonResponse({ purchaseOrder: { ...po, items } }, 200, origin);
    } catch (err) {
      console.error('[shanan-api] Purchase order detail failed:', err);
      return errorResponse('Could not retrieve purchase order.', 500, origin);
    }
  }

  // POST /api/purchase-orders - create from approved PR
  if (url.pathname === '/api/purchase-orders' && method === 'POST') {
    const auth = await requireInternal(req, origin);
    if (auth.error) return auth.error;
    const parsed = await tryParseJson(req);
    if (!parsed.ok) return errorResponse('Invalid JSON body', 400, origin);
    const b = parsed.body as Record<string, unknown>;
    if (typeof b.purchaseRequestId !== 'string' || b.purchaseRequestId.trim() === '') {
      return errorResponse('Validation failed: purchaseRequestId is required', 422, origin);
    }
    const prId = b.purchaseRequestId.trim();
    const prRows = await sql()`SELECT pr.* FROM purchase_requests pr WHERE pr.id = ${prId} AND pr.status = 'approved' LIMIT 1`;
    const pr = prRows[0] as any;
    if (!pr) {
      return errorResponse('Purchase Request not found or not in "approved" state', 404, origin);
    }
    const existingPoRows = await sql()`SELECT id, reference FROM purchase_orders WHERE purchase_request_id = ${prId} LIMIT 1`;
    if (existingPoRows[0]) {
      return errorResponse(`Purchase Order already exists for this PR: ${existingPoRows[0].reference}`, 409, origin);
    }
    const poId = generateId();
    const poReference = generatePoReference();
    const now = new Date().toISOString();
    const notes = (typeof b.notes === 'string') ? b.notes.trim() || null : null;
    const expectedDelivery = (typeof b.expectedDelivery === 'string') ? b.expectedDelivery.trim() || null : null;
    try {
      await sql().begin(async (tx: any) => {
        await tx`INSERT INTO purchase_orders
                  (id, reference, purchase_request_id, supply_request_id, supplier_id,
                   status, total_amount, currency, issue_date, expected_delivery,
                   notes, created_by, created_at, updated_at)
                 VALUES (${poId}, ${poReference}, ${pr.id}, ${pr.supply_request_id}, ${pr.supplier_id},
                         'draft', ${pr.total_amount}, ${pr.currency}, ${now}, ${expectedDelivery},
                         ${notes}, ${auth.user.id}, ${now}, ${now})`;
        const prItems = await tx`SELECT * FROM purchase_request_items WHERE pr_id = ${pr.id}`;
        for (const pri of (prItems as any[])) {
          await tx`INSERT INTO purchase_order_items
                    (po_id, pr_item_id, product_id, product_name, sku, quantity,
                     unit_price, currency, total_price, notes, created_at)
                   VALUES (${poId}, ${pri.id}, ${pri.product_id}, ${pri.product_name}, ${pri.sku}, ${pri.quantity},
                           ${pri.unit_price}, ${pri.currency}, ${pri.total_price}, ${pri.notes}, ${now})`;
        }
      });
      const createdRows = await sql()`SELECT po.*, s.name_en AS supplier_name, u.name AS created_by_name FROM purchase_orders po JOIN suppliers s ON po.supplier_id = s.id LEFT JOIN users u ON po.created_by = u.id WHERE po.id = ${poId} LIMIT 1`;
      const createdItems = await sql()`SELECT * FROM purchase_order_items WHERE po_id = ${poId}`;
      return jsonResponse({ purchaseOrder: { ...(createdRows[0] as any), items: createdItems } }, 201, origin);
    } catch (err) {
      console.error('[shanan-api] Purchase order creation failed:', err);
      return errorResponse('Could not create purchase order.', 500, origin);
    }
  }

  // PATCH /api/purchase-orders/:id - update status (issue/confirm/receive/cancel)
  const poUpdateMatch = url.pathname.match(/^\/api\/purchase-orders\/([^/]+)$/);
  if (poUpdateMatch && method === 'PATCH') {
    const auth = await requireInternal(req, origin);
    if (auth.error) return auth.error;
    const poIdOrRef = decodeURIComponent(poUpdateMatch[1]);
    const parsed = await tryParseJson(req);
    if (!parsed.ok) return errorResponse('Invalid JSON body', 400, origin);
    const poRows = await sql()`SELECT * FROM purchase_orders WHERE id = ${poIdOrRef} OR reference = ${poIdOrRef} LIMIT 1`;
    const po = poRows[0] as any;
    if (!po) return errorResponse('Purchase Order not found', 404, origin);
    const now = new Date().toISOString();
    const b = parsed.body as Record<string, unknown>;
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
        const updates: string[] = ['status = $1', 'updated_at = $2'];
        const params: any[] = [b.status, now];
        let n = 2;
        if (b.status === 'issued') {
          updates.push(`issue_date = $${String(++n)}`);
          params.push(now);
        }
        if (typeof b.expectedDelivery === 'string') {
          updates.push(`expected_delivery = $${String(++n)}`);
          params.push(b.expectedDelivery.trim() || null);
        }
        if (typeof b.notes === 'string') {
          updates.push(`notes = $${String(++n)}`);
          params.push(b.notes.trim() || null);
        }
        params.push(po.id);
        await sql().unsafe(`UPDATE purchase_orders SET ${updates.join(', ')} WHERE id = $${updates.length + 1}`, params);
      } else if (typeof b.notes === 'string' || typeof b.expectedDelivery === 'string') {
        const updates: string[] = ['updated_at = $1'];
        const params: any[] = [now];
        let n = 1;
        if (typeof b.notes === 'string') { updates.push(`notes = $${String(++n)}`); params.push(b.notes.trim() || null); }
        if (typeof b.expectedDelivery === 'string') { updates.push(`expected_delivery = $${String(++n)}`); params.push(b.expectedDelivery.trim() || null); }
        params.push(po.id);
        await sql().unsafe(`UPDATE purchase_orders SET ${updates.join(', ')} WHERE id = $${updates.length + 1}`, params);
      }
      const updatedRows = await sql()`SELECT po.*, s.name_en AS supplier_name, u.name AS created_by_name FROM purchase_orders po JOIN suppliers s ON po.supplier_id = s.id LEFT JOIN users u ON po.created_by = u.id WHERE po.id = ${po.id} LIMIT 1`;
      const items = await sql()`SELECT * FROM purchase_order_items WHERE po_id = ${po.id}`;
      return jsonResponse({ purchaseOrder: { ...(updatedRows[0] as any), items } }, 200, origin);
    } catch (err) {
      console.error('[shanan-api] Purchase order update failed:', err);
      return errorResponse('Could not update purchase order.', 500, origin);
    }
  }

  // ============================================================
  // G5: Storage file serving (legacy parity, A13-4 Finding 22)
  // Public product images redirect to their public URL when one
  // exists; documents require authentication + non-supplier.
  // ============================================================
  const storageMatch = url.pathname.match(/^\/api\/storage\/(.+)$/);
  if (storageMatch && method === 'GET') {
    try {
      const storageKey = decodeURIComponent(storageMatch[1]);
      if (!isValidStorageKey(storageKey)) {
        return errorResponse('File not found', 404, origin);
      }
      if (storageKey.startsWith('documents/')) {
        const docAuth = await requireAuth(req, origin);
        if (docAuth.error) return docAuth.error;
        const supplierBlock = await requireNotSupplier(docAuth.user, origin);
        if (supplierBlock) return supplierBlock;
      }
      if (!assertStoragePathContainment(storageKey)) {
        return errorResponse('File not found', 404, origin);
      }
      const imgRows = await sql()`SELECT public_url FROM product_images WHERE storage_key = ${storageKey} LIMIT 1`;
      if (imgRows[0]?.public_url && !String(imgRows[0].public_url).startsWith('/api/')) {
        return Response.redirect(imgRows[0].public_url, 307);
      }
      const docRows = await sql()`SELECT public_url FROM product_documents WHERE storage_key = ${storageKey} LIMIT 1`;
      if (docRows[0]?.public_url && !String(docRows[0].public_url).startsWith('/api/')) {
        return Response.redirect(docRows[0].public_url, 307);
      }
      if (process.env.STORAGE_PROVIDER !== 's3' && await storageExists(storageKey)) {
        const file = storageLoad(storageKey);
        if (file) {
          return new Response(new Uint8Array(file.data), {
            status: 200,
            headers: {
              'Content-Type': file.mimeType,
              'Cache-Control': 'public, max-age=86400',
              ...corsHeaders(origin),
            },
          });
        }
      }
      return errorResponse('File not found', 404, origin);
    } catch (err) {
      console.error('[shanan-api] Storage serve failed:', err);
      return errorResponse('File not found', 404, origin);
    }
  }

  // ============================================================
  // G5: Internal admin product management (requireInternal)
  // ============================================================

  // POST /api/admin/products - create a product
  if (url.pathname === '/api/admin/products' && method === 'POST') {
    const auth = await requireInternal(req, origin);
    if (auth.error) return auth.error;
    const parsed = await tryParseJson(req);
    if (!parsed.ok) return errorResponse('Invalid JSON body', 400, origin);
    const b = parsed.body as Record<string, unknown>;
    if (!b.sku || !b.productCode || !b.nameEn) {
      return errorResponse('Validation failed: sku, productCode, nameEn are required', 422, origin);
    }
    const id = (b.id as string) || `prod-${crypto.randomUUID()}`;
    const slug = (b.slug as string) || (b.sku as string).toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const now = new Date().toISOString();
    try {
      await sql()`INSERT INTO products (id, sku, product_code, slug, name_en, name_ar, description_en, description_ar,
             category_id, brand_id, manufacturer, availability, status, is_sample_data, created_at, updated_at)
           VALUES (${id}, ${b.sku}, ${b.productCode}, ${slug}, ${b.nameEn}, ${b.nameAr || null},
             ${b.descriptionEn || null}, ${b.descriptionAr || null},
             ${b.categoryId || null}, ${b.brandId || null}, ${b.manufacturer || null},
             ${b.availability || 'in_stock'}, ${b.status || 'active'}, ${b.isSampleData ? 1 : 0},
             ${now}, ${now})`;
      return jsonResponse({ id, slug, createdAt: now }, 201, origin);
    } catch (err) {
      console.error('[shanan-api] Product insert failed:', err);
      return errorResponse('Could not create product.', 500, origin);
    }
  }

  // PATCH /api/admin/products/:id - update a product
  const adminProductMatch = url.pathname.match(/^\/api\/admin\/products\/([^/]+)$/);
  if (adminProductMatch && method === 'PATCH') {
    const auth = await requireInternal(req, origin);
    if (auth.error) return auth.error;
    const productLookup = decodeURIComponent(adminProductMatch[1]);
    const existing = await sql()`SELECT id FROM products WHERE id = ${productLookup} OR sku = ${productLookup} OR slug = ${productLookup} LIMIT 1`;
    if (!existing[0]) return errorResponse('Product not found', 404, origin);
    const parsed = await tryParseJson(req);
    if (!parsed.ok) return errorResponse('Invalid JSON body', 400, origin);
    const b = parsed.body as Record<string, unknown>;
    const fields: Array<[string, string]> = [
      ['nameEn', 'name_en'], ['nameAr', 'name_ar'], ['descriptionEn', 'description_en'],
      ['descriptionAr', 'description_ar'], ['categoryId', 'category_id'], ['brandId', 'brand_id'],
      ['manufacturer', 'manufacturer'], ['availability', 'availability'], ['status', 'status'],
    ];
    const updates: string[] = ['updated_at = $1'];
    const values: any[] = [new Date().toISOString()];
    let n = 1;
    for (const [field, col] of fields) {
      if (b[field] !== undefined) {
        updates.push(`${col} = $${String(++n)}`);
        values.push(b[field]);
      }
    }
    if (updates.length === 1) return errorResponse('No valid fields to update', 422, origin);
    values.push(existing[0].id);
    try {
      await sql().unsafe(`UPDATE products SET ${updates.join(', ')} WHERE id = $${updates.length + 1}`, values);
      const rows = await sql()`SELECT * FROM products WHERE id = ${existing[0].id}`;
      return jsonResponse({ product: rows[0] }, 200, origin);
    } catch (err) {
      console.error('[shanan-api] Product update failed:', err);
      return errorResponse('Could not update product.', 500, origin);
    }
  }

  // POST /api/admin/products/:id/images/upload - image binary upload (multipart)
  const imageUploadMatch = url.pathname.match(/^\/api\/admin\/products\/([^/]+)\/images\/upload$/);
  if (imageUploadMatch && method === 'POST') {
    const auth = await requireInternal(req, origin);
    if (auth.error) return auth.error;
    const productLookup = decodeURIComponent(imageUploadMatch[1]);
    const productRows = await sql()`SELECT id FROM products WHERE id = ${productLookup} OR sku = ${productLookup} OR slug = ${productLookup} LIMIT 1`;
    const product = productRows[0];
    if (!product) return errorResponse('Product not found', 404, origin);
    try {
      const formData = await req.formData();
      const file = formData.get('file');
      if (!file || typeof (file as any).arrayBuffer !== 'function') {
        return errorResponse('Validation failed: file is required', 422, origin);
      }
      const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
      const mimeType = (file as any).type || 'application/octet-stream';
      if (!allowedMimeTypes.includes(mimeType)) {
        return errorResponse(`Validation failed: file — unsupported MIME type '${mimeType}'. Allowed: ${allowedMimeTypes.join(', ')}`, 400, origin);
      }
      const maxSize = Number(process.env.MAX_IMAGE_SIZE_MB || '10') * 1024 * 1024;
      if ((file as any).size > maxSize) {
        return errorResponse(`Validation failed: file — exceeds maximum size of ${maxSize / 1024 / 1024}MB`, 400, origin);
      }
      const fileData = new Uint8Array(await (file as any).arrayBuffer());
      const filename = (file as any).name || 'unnamed';
      const storageKey = generateImageStorageKey(product.id, filename);
      if (!isValidStorageKey(storageKey)) {
        return errorResponse('Could not generate safe storage key', 500, origin);
      }
      const uploadResult = await storageSave(fileData, storageKey, mimeType);
      const isPrimary = formData.get('isPrimary') === 'true';
      const sortOrder = parseInt((formData.get('sortOrder') as string) || '0', 10) || 0;
      const altEn = (formData.get('altEn') as string) || null;
      const altAr = (formData.get('altAr') as string) || null;
      const now = new Date().toISOString();
      const imageId = crypto.randomUUID();
      if (isPrimary) {
        await sql()`UPDATE product_images SET is_primary = 0 WHERE product_id = ${product.id}`;
      }
      await sql()`INSERT INTO product_images (id, product_id, storage_provider, storage_key, public_url,
             filename, mime_type, file_size, width, height, checksum, alt_en, alt_ar,
             is_primary, sort_order, created_at, updated_at)
           VALUES (${imageId}, ${product.id}, ${uploadResult.storageProvider}, ${uploadResult.storageKey},
             ${uploadResult.publicUrl}, ${uploadResult.filename}, ${uploadResult.mimeType},
             ${uploadResult.fileSize}, null, null, ${uploadResult.checksum},
             ${altEn}, ${altAr}, ${isPrimary ? 1 : 0}, ${sortOrder}, ${now}, ${now})`;
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

  // DELETE /api/admin/products/:id/images/:imageId - delete a product image
  const imageDeleteMatch = url.pathname.match(/^\/api\/admin\/products\/([^/]+)\/images\/([^/]+)$/);
  if (imageDeleteMatch && method === 'DELETE') {
    const auth = await requireInternal(req, origin);
    if (auth.error) return auth.error;
    const productLookup = decodeURIComponent(imageDeleteMatch[1]);
    const imageId = decodeURIComponent(imageDeleteMatch[2]);
    const productRows = await sql()`SELECT id FROM products WHERE id = ${productLookup} OR sku = ${productLookup} OR slug = ${productLookup} LIMIT 1`;
    const product = productRows[0];
    if (!product) return errorResponse('Product not found', 404, origin);
    const imgRows = await sql()`SELECT * FROM product_images WHERE id = ${imageId} AND product_id = ${product.id} LIMIT 1`;
    const img = imgRows[0];
    if (!img) return errorResponse('Image not found', 404, origin);
    try {
      await storageDelete(img.storage_key);
      await sql()`DELETE FROM product_images WHERE id = ${imageId}`;
      return jsonResponse({ ok: true, deleted: true, id: imageId }, 200, origin);
    } catch (err) {
      console.error('[shanan-api] Image delete failed:', err);
      return errorResponse('Could not delete image.', 500, origin);
    }
  }

  // GET /api/admin/products/:id/images - list images for a product
  const imageListMatch = url.pathname.match(/^\/api\/admin\/products\/([^/]+)\/images$/);
  if (imageListMatch && method === 'GET') {
    const auth = await requireInternal(req, origin);
    if (auth.error) return auth.error;
    const productLookup = decodeURIComponent(imageListMatch[1]);
    const productRows = await sql()`SELECT id FROM products WHERE id = ${productLookup} OR sku = ${productLookup} OR slug = ${productLookup} LIMIT 1`;
    const product = productRows[0];
    if (!product) return errorResponse('Product not found', 404, origin);
    const images = await sql()`SELECT * FROM product_images WHERE product_id = ${product.id} ORDER BY is_primary DESC, sort_order ASC`;
    return jsonResponse({ images, count: images.length }, 200, origin);
  }

  // POST /api/admin/import/:type - bulk import
  const importMatch = url.pathname.match(/^\/api\/admin\/import\/([a-z_]+)$/);
  if (importMatch && method === 'POST') {
    const auth = await requireInternal(req, origin);
    if (auth.error) return auth.error;
    const importType = importMatch[1];
    const parsed = await tryParseJson(req);
    if (!parsed.ok) return errorResponse('Invalid JSON body', 400, origin);
    const b = parsed.body as Record<string, unknown>;
    const items = b.items as any[];
    if (!Array.isArray(items)) {
      return errorResponse('Validation failed: items must be an array', 422, origin);
    }
    try {
      let result: ImportResult;
      switch (importType) {
        case 'products': result = await importProductsInto(items); break;
        case 'categories': result = await importCategoriesInto(items); break;
        case 'brands': result = await importBrandsInto(items); break;
        case 'images': result = await importImagesInto(items); break;
        case 'specifications': result = await importSpecsInto(items); break;
        case 'technical_metadata': result = await importTechMetaInto(items); break;
        case 'documents': result = await importDocumentsInto(items); break;
        default: return errorResponse(`Unknown import type: ${importType}`, 400, origin);
      }
      return jsonResponse(result, 200, origin);
    } catch (err) {
      console.error('[shanan-api] Import failed:', err);
      return errorResponse('Import failed.', 500, origin);
    }
  }

  // POST /api/admin/seed - seed demo data (idempotent)
  if (url.pathname === '/api/admin/seed' && method === 'POST') {
    const auth = await requireInternal(req, origin);
    if (auth.error) return auth.error;
    try {
      const seeded = await seedProductMasterInto();
      return jsonResponse({ ok: true, seeded }, 200, origin);
    } catch (err) {
      console.error('[shanan-api] Seed failed:', err);
      return errorResponse('Seed failed.', 500, origin);
    }
  }

  // GET /api/admin/import-jobs
  if (url.pathname === '/api/admin/import-jobs' && method === 'GET') {
    const auth = await requireInternal(req, origin);
    if (auth.error) return auth.error;
    try {
      const rows = await sql()`SELECT * FROM import_jobs ORDER BY created_at DESC LIMIT 50`;
      return jsonResponse({ jobs: rows, count: rows.length }, 200, origin);
    } catch (err) {
      console.error('[shanan-api] Import jobs query failed:', err);
      return errorResponse('Could not retrieve import jobs.', 500, origin);
    }
  }

  // ============================================================
  // G5: V1 - activity event recording + analytics
  // ============================================================

  // POST /api/activity/events - record a business event (customer-side)
  if (url.pathname === '/api/activity/events' && method === 'POST') {
    const auth = await requireAuth(req, origin);
    if (auth.error) return auth.error;
    const supplierBlock = await requireNotSupplier(auth.user, origin);
    if (supplierBlock) return supplierBlock;
    const parsed = await tryParseJson(req);
    if (!parsed.ok) return errorResponse('Invalid JSON body', 400, origin);
    const b = parsed.body as Record<string, unknown>;
    if (typeof b.eventType !== 'string' || !VALID_EVENT_TYPES.includes(b.eventType)) {
      return errorResponse(`Validation failed: eventType — must be one of: ${VALID_EVENT_TYPES.join(', ')}`, 400, origin);
    }
    const productId = (typeof b.productId === 'string' && b.productId.length <= 100) ? b.productId : null;
    const categoryId = (typeof b.categoryId === 'string' && b.categoryId.length <= 100) ? b.categoryId : null;
    const supplyRequestId = (typeof b.supplyRequestId === 'string' && b.supplyRequestId.length <= 100) ? b.supplyRequestId : null;
    const agreementId = (typeof b.agreementId === 'string' && b.agreementId.length <= 100) ? b.agreementId : null;
    const rfqId = (typeof b.rfqId === 'string' && b.rfqId.length <= 100) ? b.rfqId : null;
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
    try {
      await sql()`INSERT INTO activity_events (id, event_type, user_id, user_type, company_id,
             product_id, category_id, supply_request_id, agreement_id, rfq_id, metadata, created_at)
           VALUES (${id}, ${b.eventType}, ${auth.user.id}, ${auth.user.user_type}, ${auth.user.company_id},
             ${productId}, ${categoryId}, ${supplyRequestId}, ${agreementId}, ${rfqId},
             ${metadata}, ${now})`;
      return jsonResponse({ id, createdAt: now }, 201, origin);
    } catch (err) {
      console.error('[shanan-api] Activity event insert failed:', err);
      return errorResponse('Could not record activity event.', 500, origin);
    }
  }

  // GET /api/admin/activity/analytics - internal activity summary
  if (url.pathname === '/api/admin/activity/analytics' && method === 'GET') {
    const auth = await requireInternal(req, origin);
    if (auth.error) return auth.error;
    try {
      const engagedUsersRows = await sql()`SELECT COUNT(DISTINCT user_id)::int AS n FROM activity_events WHERE user_id IS NOT NULL`;
      const engagedCompaniesRows = await sql()`SELECT COUNT(DISTINCT company_id)::int AS n FROM activity_events WHERE company_id IS NOT NULL`;
      const submittedRows = await sql()`SELECT COUNT(DISTINCT user_id)::int AS n FROM activity_events WHERE event_type = 'SUPPLY_REQUEST_SUBMITTED' AND user_id IS NOT NULL`;
      const engagedNotSubmittedRows = await sql()`SELECT COUNT(DISTINCT ae.user_id)::int AS n
           FROM activity_events ae
           WHERE ae.user_id IS NOT NULL
             AND ae.user_id NOT IN (
               SELECT DISTINCT user_id FROM activity_events WHERE event_type = 'SUPPLY_REQUEST_SUBMITTED'
             )`;
      const eventCounts = await sql()`SELECT event_type, COUNT(*)::int AS count FROM activity_events GROUP BY event_type ORDER BY count DESC`;
      const lastStagesNonSubmitters = await sql()`SELECT ae.user_id, ae.event_type, ae.created_at
           FROM activity_events ae
           WHERE ae.user_id IS NOT NULL
             AND ae.user_id NOT IN (
               SELECT DISTINCT user_id FROM activity_events WHERE event_type = 'SUPPLY_REQUEST_SUBMITTED'
             )
             AND ae.created_at = (
               SELECT MAX(created_at) FROM activity_events WHERE user_id = ae.user_id
             )
           ORDER BY ae.created_at DESC`;
      const topProducts = await sql()`SELECT product_id, COUNT(*)::int AS views FROM activity_events
           WHERE product_id IS NOT NULL AND event_type IN ('PRODUCT_VIEWED', 'PRODUCT_SEARCHED')
           GROUP BY product_id ORDER BY views DESC LIMIT 10`;
      const topCategories = await sql()`SELECT category_id, COUNT(*)::int AS views FROM activity_events
           WHERE category_id IS NOT NULL AND event_type = 'CATEGORY_VIEWED'
           GROUP BY category_id ORDER BY views DESC LIMIT 10`;
      const totalEventsRows = await sql()`SELECT COUNT(*)::int AS n FROM activity_events`;
      return jsonResponse({
        totalEvents: Number(totalEventsRows[0]?.n ?? 0),
        engagedUsers: Number(engagedUsersRows[0]?.n ?? 0),
        engagedCompanies: Number(engagedCompaniesRows[0]?.n ?? 0),
        submittedUsers: Number(submittedRows[0]?.n ?? 0),
        engagedNotSubmitted: Number(engagedNotSubmittedRows[0]?.n ?? 0),
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

  // GET /api/admin/activity/customer-insights
  if (url.pathname === '/api/admin/activity/customer-insights' && method === 'GET') {
    const auth = await requireInternal(req, origin);
    if (auth.error) return auth.error;
    try {
      const ANALYSIS_WINDOW_DAYS = Number(process.env.ANALYSIS_WINDOW_DAYS || '30');
      const windowStart = new Date(Date.now() - ANALYSIS_WINDOW_DAYS * 86400000).toISOString();
      const users = await sql()`SELECT DISTINCT ae.user_id, ae.user_type, ae.company_id,
                u.name AS user_name, u.email AS user_email,
                cc.name_en AS company_name
         FROM activity_events ae
         LEFT JOIN users u ON ae.user_id = u.id
         LEFT JOIN customer_companies cc ON ae.company_id = cc.id
         WHERE ae.user_id IS NOT NULL
           AND ae.created_at >= ${windowStart}
         ORDER BY ae.company_id, ae.user_id`;
      const insights: any[] = [];
      for (const user of users) {
        const events = await sql()`SELECT event_type, COUNT(*)::int AS count, MAX(created_at) AS last_at
             FROM activity_events
             WHERE user_id = ${user.user_id} AND created_at >= ${windowStart}
             GROUP BY event_type`;
        const eventMap: Record<string, { count: number; last_at: string }> = {};
        let totalActivity = 0;
        let lastActivity = '';
        for (const e of events) {
          eventMap[e.event_type] = { count: Number(e.count), last_at: e.last_at };
          totalActivity += Number(e.count);
          if (!lastActivity || e.last_at > lastActivity) lastActivity = e.last_at;
        }
        const hasSubmitted = !!eventMap['SUPPLY_REQUEST_SUBMITTED'];
        const hasStarted = !!eventMap['SUPPLY_REQUEST_STARTED'];
        const hasCatalogView = !!eventMap['CATALOG_VIEWED'];
        const hasProductView = !!eventMap['PRODUCT_VIEWED'];
        const hasSearch = !!eventMap['PRODUCT_SEARCHED'];
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
        let lastWorkflowStage = 'NONE';
        for (const stage of OPPORTUNITY_STAGE_ORDER) {
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

  // GET /api/admin/activity/product-insights
  if (url.pathname === '/api/admin/activity/product-insights' && method === 'GET') {
    const auth = await requireInternal(req, origin);
    if (auth.error) return auth.error;
    try {
      const ANALYSIS_WINDOW_DAYS = Number(process.env.ANALYSIS_WINDOW_DAYS || '30');
      const windowStart = new Date(Date.now() - ANALYSIS_WINDOW_DAYS * 86400000).toISOString();
      const productEngagement = await sql()`SELECT product_id,
                SUM(CASE WHEN event_type = 'PRODUCT_VIEWED' THEN 1 ELSE 0 END)::int AS view_count,
                SUM(CASE WHEN event_type = 'PRODUCT_SEARCHED' THEN 1 ELSE 0 END)::int AS search_count,
                COUNT(DISTINCT user_id)::int AS unique_users,
                MAX(created_at) AS last_engagement
         FROM activity_events
         WHERE product_id IS NOT NULL
           AND event_type IN ('PRODUCT_VIEWED', 'PRODUCT_SEARCHED')
           AND created_at >= ${windowStart}
         GROUP BY product_id
         ORDER BY view_count + search_count DESC`;
      const convertedProducts = await sql()`SELECT DISTINCT sri.product_id
         FROM supply_request_items sri
         JOIN supply_requests sr ON sri.request_id = sr.id
         WHERE sr.created_at >= ${windowStart}`;
      const convertedSet = new Set(convertedProducts.map((p: any) => p.product_id));
      const mapped = await Promise.all(productEngagement.map(async (p: any) => {
        const productRows = await sql()`SELECT name_en, sku FROM products WHERE id = ${p.product_id} LIMIT 1`;
        const product = productRows[0];
        const hasConversion = convertedSet.has(p.product_id);
        return {
          productId: p.product_id,
          productName: product?.name_en || '(unknown)',
          sku: product?.sku || '(unknown)',
          viewCount: Number(p.view_count),
          searchCount: Number(p.search_count),
          uniqueUsers: Number(p.unique_users),
          lastEngagement: p.last_engagement,
          hasSupplyRequestConversion: hasConversion,
          insightLabel: hasConversion ? 'ENGAGED_WITH_CONVERSION' : 'INTEREST_NO_CONVERSION',
        };
      }));
      return jsonResponse({
        products: mapped,
        count: mapped.length,
        engagedWithConversion: mapped.filter(p => p.insightLabel === 'ENGAGED_WITH_CONVERSION').length,
        interestNoConversion: mapped.filter(p => p.insightLabel === 'INTEREST_NO_CONVERSION').length,
        analysisWindowDays: ANALYSIS_WINDOW_DAYS,
      }, 200, origin);
    } catch (err) {
      console.error('[shanan-api] Product insights failed:', err);
      return errorResponse('Could not retrieve product insights.', 500, origin);
    }
  }

  // ============================================================
  // G5: V2 - Opportunity queue (derived, read-only)
  // ============================================================
  if (url.pathname === '/api/admin/activity/opportunities' && method === 'GET') {
    const auth = await requireInternal(req, origin);
    if (auth.error) return auth.error;
    try {
      const ANALYSIS_WINDOW_DAYS = Number(process.env.ANALYSIS_WINDOW_DAYS || '30');
      const windowStart = new Date(Date.now() - ANALYSIS_WINDOW_DAYS * 86400000).toISOString();
      const opportunities: any[] = [];
      const ruleAOpp = await sql()`SELECT ae.user_id, ae.company_id,
                u.name AS user_name, u.email AS user_email,
                cc.name_en AS company_name,
                MAX(CASE WHEN ae.event_type = 'SUPPLY_REQUEST_STARTED' THEN ae.created_at END) as started_at,
                MAX(ae.created_at) as last_activity,
                COUNT(*)::int AS event_count
         FROM activity_events ae
         LEFT JOIN users u ON ae.user_id = u.id
         LEFT JOIN customer_companies cc ON ae.company_id = cc.id
         WHERE ae.user_id IS NOT NULL
           AND ae.created_at >= ${windowStart}
           AND ae.user_id IN (
             SELECT DISTINCT user_id FROM activity_events
             WHERE event_type = 'SUPPLY_REQUEST_STARTED' AND created_at >= ${windowStart}
           )
           AND ae.user_id NOT IN (
             SELECT DISTINCT user_id FROM activity_events
             WHERE event_type = 'SUPPLY_REQUEST_SUBMITTED' AND created_at >= ${windowStart}
           )
         GROUP BY ae.user_id, ae.company_id
         ORDER BY last_activity DESC`;
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
            totalEvents: Number(opp.event_count),
          },
          deterministicRule: 'RULE_A: Has SUPPLY_REQUEST_STARTED, no SUPPLY_REQUEST_SUBMITTED in window',
        });
      }
      const ruleBOpp = await sql()`SELECT ae.user_id, ae.company_id,
                u.name AS user_name, u.email AS user_email,
                cc.name_en AS company_name,
                COUNT(*)::int AS product_view_count,
                MAX(ae.created_at) as last_activity
         FROM activity_events ae
         LEFT JOIN users u ON ae.user_id = u.id
         LEFT JOIN customer_companies cc ON ae.company_id = cc.id
         WHERE ae.event_type = 'PRODUCT_VIEWED'
           AND ae.user_id IS NOT NULL
           AND ae.created_at >= ${windowStart}
         GROUP BY ae.user_id, ae.company_id
         HAVING COUNT(*)::int >= 3
         AND ae.user_id NOT IN (
           SELECT DISTINCT user_id FROM activity_events
           WHERE event_type = 'SUPPLY_REQUEST_SUBMITTED' AND created_at >= ${windowStart}
         )
         ORDER BY product_view_count DESC`;
      for (const opp of ruleBOpp) {
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
            productViewCount: Number(opp.product_view_count),
            lastActivity: opp.last_activity,
          },
          deterministicRule: 'RULE_B: >= 3 PRODUCT_VIEWED events, no SUPPLY_REQUEST_SUBMITTED in window',
        });
      }
      const ruleCOpp = await sql()`SELECT ae.product_id,
                p.name_en AS product_name, p.sku,
                COUNT(*)::int AS engagement_count,
                COUNT(DISTINCT ae.user_id)::int AS unique_users,
                MAX(ae.created_at) as last_engagement
         FROM activity_events ae
         LEFT JOIN products p ON ae.product_id = p.id
         WHERE ae.product_id IS NOT NULL
           AND ae.event_type IN ('PRODUCT_VIEWED', 'PRODUCT_SEARCHED')
           AND ae.created_at >= ${windowStart}
           AND ae.product_id NOT IN (
             SELECT DISTINCT sri.product_id
             FROM supply_request_items sri
             JOIN supply_requests sr ON sri.request_id = sr.id
             WHERE sr.created_at >= ${windowStart}
           )
         GROUP BY ae.product_id
         ORDER BY engagement_count DESC
         LIMIT 20`;
      for (const opp of ruleCOpp) {
        opportunities.push({
          opportunityType: 'PRODUCT_INTEREST_NO_CONVERSION',
          productId: opp.product_id,
          productName: opp.product_name,
          productSku: opp.sku,
          reason: 'Product has engagement events but no linked Supply Request conversion',
          evidence: {
            engagementCount: Number(opp.engagement_count),
            uniqueUsers: Number(opp.unique_users),
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
  // G5: V3 - Persisted opportunity actions
  // ============================================================

  // POST /api/admin/activity/opportunities/sync
  if (url.pathname === '/api/admin/activity/opportunities/sync' && method === 'POST') {
    const auth = await requireInternal(req, origin);
    if (auth.error) return auth.error;
    try {
      const ANALYSIS_WINDOW_DAYS = Number(process.env.ANALYSIS_WINDOW_DAYS || '30');
      const windowStart = new Date(Date.now() - ANALYSIS_WINDOW_DAYS * 86400000).toISOString();
      let created = 0, skipped = 0;
      const db = sql();
      const now = new Date().toISOString();
      const ruleA = await db`SELECT ae.user_id, ae.company_id,
                u.name AS user_name, u.email AS user_email,
                cc.name_en AS company_name,
                MAX(CASE WHEN ae.event_type = 'SUPPLY_REQUEST_STARTED' THEN ae.created_at END) as started_at,
                MAX(ae.created_at) as last_activity,
                COUNT(*)::int AS event_count
         FROM activity_events ae
         LEFT JOIN users u ON ae.user_id = u.id
         LEFT JOIN customer_companies cc ON ae.company_id = cc.id
         WHERE ae.user_id IS NOT NULL AND ae.created_at >= ${windowStart}
           AND ae.user_id IN (
             SELECT DISTINCT user_id FROM activity_events WHERE event_type = 'SUPPLY_REQUEST_STARTED' AND created_at >= ${windowStart}
           )
           AND ae.user_id NOT IN (
             SELECT DISTINCT user_id FROM activity_events WHERE event_type = 'SUPPLY_REQUEST_SUBMITTED' AND created_at >= ${windowStart}
           )
         GROUP BY ae.user_id, ae.company_id`;
      for (const opp of ruleA) {
        const dedupKey = generateDedupKey('STARTED_REQUEST_NOT_SUBMITTED', opp.user_id, null);
        const existingRows = await db`SELECT id FROM opportunities WHERE dedup_key = ${dedupKey} LIMIT 1`;
        if (existingRows[0]) { skipped++; continue; }
        const id = crypto.randomUUID();
        const evidence = JSON.stringify({ startedAt: opp.started_at, lastActivity: opp.last_activity, totalEvents: Number(opp.event_count) });
        await db`INSERT INTO opportunities (id, opportunity_type, dedup_key, rule, user_id, company_id, reason, evidence_json, status, created_by, created_at, updated_at)
             VALUES (${id}, 'STARTED_REQUEST_NOT_SUBMITTED', ${dedupKey}, 'RULE_A', ${opp.user_id}, ${opp.company_id},
               'User started a Supply Request but has not submitted within the analysis window',
               ${evidence}, 'NEW', ${auth.user.id}, ${now}, ${now})`;
        created++;
      }
      const ruleB = await db`SELECT ae.user_id, ae.company_id,
                u.name AS user_name, u.email AS user_email,
                cc.name_en AS company_name,
                COUNT(*)::int AS product_view_count,
                MAX(ae.created_at) as last_activity
         FROM activity_events ae
         LEFT JOIN users u ON ae.user_id = u.id
         LEFT JOIN customer_companies cc ON ae.company_id = cc.id
         WHERE ae.event_type = 'PRODUCT_VIEWED' AND ae.user_id IS NOT NULL AND ae.created_at >= ${windowStart}
         GROUP BY ae.user_id, ae.company_id
         HAVING COUNT(*)::int >= 3
         AND ae.user_id NOT IN (
           SELECT DISTINCT user_id FROM activity_events WHERE event_type = 'SUPPLY_REQUEST_SUBMITTED' AND created_at >= ${windowStart}
         )`;
      for (const opp of ruleB) {
        const dedupKey = generateDedupKey('REPEATED_PRODUCT_VIEWS_NO_SUBMISSION', opp.user_id, null);
        const existingRows = await db`SELECT id FROM opportunities WHERE dedup_key = ${dedupKey} LIMIT 1`;
        if (existingRows[0]) { skipped++; continue; }
        const id = crypto.randomUUID();
        const evidence = JSON.stringify({ productViewCount: Number(opp.product_view_count), lastActivity: opp.last_activity });
        await db`INSERT INTO opportunities (id, opportunity_type, dedup_key, rule, user_id, company_id, reason, evidence_json, status, created_by, created_at, updated_at)
             VALUES (${id}, 'REPEATED_PRODUCT_VIEWS_NO_SUBMISSION', ${dedupKey}, 'RULE_B', ${opp.user_id}, ${opp.company_id},
               'User viewed 3+ products but has not submitted a Supply Request',
               ${evidence}, 'NEW', ${auth.user.id}, ${now}, ${now})`;
        created++;
      }
      const ruleC = await db`SELECT ae.product_id, p.name_en AS product_name, p.sku,
                COUNT(*)::int AS engagement_count,
                COUNT(DISTINCT ae.user_id)::int AS unique_users,
                MAX(ae.created_at) as last_engagement
         FROM activity_events ae
         LEFT JOIN products p ON ae.product_id = p.id
         WHERE ae.product_id IS NOT NULL AND ae.event_type IN ('PRODUCT_VIEWED', 'PRODUCT_SEARCHED')
           AND ae.created_at >= ${windowStart}
           AND ae.product_id NOT IN (
             SELECT DISTINCT sri.product_id FROM supply_request_items sri
             JOIN supply_requests sr ON sri.request_id = sr.id WHERE sr.created_at >= ${windowStart}
           )
         GROUP BY ae.product_id`;
      for (const opp of ruleC) {
        const dedupKey = generateDedupKey('PRODUCT_INTEREST_NO_CONVERSION', null, opp.product_id);
        const existingRows = await db`SELECT id FROM opportunities WHERE dedup_key = ${dedupKey} LIMIT 1`;
        if (existingRows[0]) { skipped++; continue; }
        const id = crypto.randomUUID();
        const evidence = JSON.stringify({ engagementCount: Number(opp.engagement_count), uniqueUsers: Number(opp.unique_users), lastEngagement: opp.last_engagement });
        await db`INSERT INTO opportunities (id, opportunity_type, dedup_key, rule, product_id, reason, evidence_json, status, created_by, created_at, updated_at)
             VALUES (${id}, 'PRODUCT_INTEREST_NO_CONVERSION', ${dedupKey}, 'RULE_C', ${opp.product_id},
               'Product has engagement events but no linked Supply Request conversion',
               ${evidence}, 'NEW', ${auth.user.id}, ${now}, ${now})`;
        created++;
      }
      return jsonResponse({ created, skipped, totalProcessed: created + skipped }, 200, origin);
    } catch (err) {
      console.error('[shanan-api] Opportunity sync failed:', err);
      return errorResponse('Could not sync opportunities.', 500, origin);
    }
  }

  // GET /api/admin/activity/opportunities/tracked
  if (url.pathname === '/api/admin/activity/opportunities/tracked' && method === 'GET') {
    const auth = await requireInternal(req, origin);
    if (auth.error) return auth.error;
    try {
      const statusFilter = url.searchParams.get('status');
      const db = sql();
      const baseSql = `SELECT o.*, u.name AS assigned_to_name, ou.name AS user_name, cc.name_en AS company_name,
                p.name_en AS product_name, p.sku AS product_sku
         FROM opportunities o
         LEFT JOIN users u ON o.assigned_to = u.id
         LEFT JOIN users ou ON o.user_id = ou.id
         LEFT JOIN customer_companies cc ON o.company_id = cc.id
         LEFT JOIN products p ON o.product_id = p.id`;
      let rows: any[];
      if (statusFilter && VALID_OPPORTUNITY_STATUSES.includes(statusFilter)) {
        rows = await db.unsafe(`${baseSql} WHERE o.status = $1 ORDER BY o.created_at DESC`, [statusFilter]);
      } else {
        rows = await db`SELECT o.*, u.name AS assigned_to_name, ou.name AS user_name, cc.name_en AS company_name,
                p.name_en AS product_name, p.sku AS product_sku
           FROM opportunities o
           LEFT JOIN users u ON o.assigned_to = u.id
           LEFT JOIN users ou ON o.user_id = ou.id
           LEFT JOIN customer_companies cc ON o.company_id = cc.id
           LEFT JOIN products p ON o.product_id = p.id
           ORDER BY o.created_at DESC`;
      }
      return jsonResponse({ opportunities: rows, count: rows.length }, 200, origin);
    } catch (err) {
      console.error('[shanan-api] Tracked opportunities query failed:', err);
      return errorResponse('Could not retrieve opportunities.', 500, origin);
    }
  }

  // GET /api/admin/activity/opportunities/prioritized (V5 + V6 task counts)
  if (url.pathname === '/api/admin/activity/opportunities/prioritized' && method === 'GET') {
    const auth = await requireInternal(req, origin);
    if (auth.error) return auth.error;
    try {
      const statusFilter = url.searchParams.get('status');
      const limitRaw = Number(url.searchParams.get('limit') || '50');
      const limit = Number.isFinite(limitRaw) && limitRaw > 0 && limitRaw <= 200 ? Math.floor(limitRaw) : 50;
      const includeTasks = url.searchParams.get('includeTasks') === 'true';
      const db = sql();
      const baseSql = `SELECT o.*, u.name AS assigned_to_name, ou.name AS user_name, cc.name_en AS company_name,
                p.name_en AS product_name, p.sku AS product_sku
         FROM opportunities o
         LEFT JOIN users u ON o.assigned_to = u.id
         LEFT JOIN users ou ON o.user_id = ou.id
         LEFT JOIN customer_companies cc ON o.company_id = cc.id
         LEFT JOIN products p ON o.product_id = p.id`;
      let rows: any[];
      if (statusFilter && VALID_OPPORTUNITY_STATUSES.includes(statusFilter)) {
        rows = await db.unsafe(`${baseSql} WHERE o.status = $1`, [statusFilter]);
      } else {
        rows = await db`SELECT o.*, u.name AS assigned_to_name, ou.name AS user_name, cc.name_en AS company_name,
                p.name_en AS product_name, p.sku AS product_sku
           FROM opportunities o
           LEFT JOIN users u ON o.assigned_to = u.id
           LEFT JOIN users ou ON o.user_id = ou.id
           LEFT JOIN customer_companies cc ON o.company_id = cc.id
           LEFT JOIN products p ON o.product_id = p.id`;
      }
      const taskCountMap = new Map<string, { taskCount: number; openTaskCount: number }>();
      if (includeTasks && rows.length > 0) {
        const oppIds = rows.map((r: any) => r.id);
        const placeholders = oppIds.map((_, i2) => `$${i2 + 1}`).join(',');
        const taskRows = await db.unsafe(
          `SELECT opportunity_id,
                  COUNT(*)::int AS task_count,
                  SUM(CASE WHEN status IN ('PENDING','IN_PROGRESS') THEN 1 ELSE 0 END)::int AS open_task_count
           FROM follow_up_tasks
           WHERE opportunity_id IN (${placeholders})
           GROUP BY opportunity_id`,
          oppIds,
        );
        for (const tr of taskRows) {
          taskCountMap.set(tr.opportunity_id, {
            taskCount: Number(tr.task_count) || 0,
            openTaskCount: Number(tr.open_task_count) || 0,
          });
        }
      }
      const withPriority = rows.map((opp: any) => {
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
      withPriority.sort((a: any, b: any) => {
        if (b.priority_score !== a.priority_score) return b.priority_score - a.priority_score;
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

  // GET /api/admin/activity/opportunities/:id - single opportunity + actions + priority
  const trackedOppMatch = url.pathname.match(/^\/api\/admin\/activity\/opportunities\/([^/]+)$/);
  if (trackedOppMatch && method === 'GET') {
    const auth = await requireInternal(req, origin);
    if (auth.error) return auth.error;
    const oppId = decodeURIComponent(trackedOppMatch[1]);
    const oppRows = await sql()`SELECT o.*, u.name AS assigned_to_name, ou.name AS user_name, cc.name_en AS company_name,
                p.name_en AS product_name, p.sku AS product_sku
         FROM opportunities o
         LEFT JOIN users u ON o.assigned_to = u.id
         LEFT JOIN users ou ON o.user_id = ou.id
         LEFT JOIN customer_companies cc ON o.company_id = cc.id
         LEFT JOIN products p ON o.product_id = p.id
         WHERE o.id = ${oppId}
         LIMIT 1`;
    const opp = oppRows[0];
    if (!opp) return errorResponse('Opportunity not found', 404, origin);
    const actions = await sql()`SELECT oa.*, u.name AS actor_name
         FROM opportunity_actions oa
         LEFT JOIN users u ON oa.actor_id = u.id
         WHERE oa.opportunity_id = ${oppId}
         ORDER BY oa.created_at ASC`;
    const priority = computeOpportunityPriority(opp);
    return jsonResponse({ opportunity: opp, actions, actionCount: actions.length, priority }, 200, origin);
  }

  // PATCH /api/admin/activity/opportunities/:id - status or assignment update
  if (trackedOppMatch && method === 'PATCH') {
    const auth = await requireInternal(req, origin);
    if (auth.error) return auth.error;
    const oppId = decodeURIComponent(trackedOppMatch[1]);
    const existingRows = await sql()`SELECT * FROM opportunities WHERE id = ${oppId} LIMIT 1`;
    const existing = existingRows[0];
    if (!existing) return errorResponse('Opportunity not found', 404, origin);
    const parsed = await tryParseJson(req);
    if (!parsed.ok) return errorResponse('Invalid JSON body', 400, origin);
    const b = parsed.body as Record<string, unknown>;
    const now = new Date().toISOString();
    if (b.status !== undefined) {
      if (typeof b.status !== 'string' || !VALID_OPPORTUNITY_STATUSES.includes(b.status)) {
        return errorResponse(`Validation failed: status — must be one of: ${VALID_OPPORTUNITY_STATUSES.join(', ')}`, 400, origin);
      }
      const note = (typeof b.note === 'string' && b.note.length <= 500) ? b.note.trim() : null;
      const prevStatus = existing.status;
      await sql()`UPDATE opportunities SET status = ${b.status}, updated_at = ${now} WHERE id = ${oppId}`;
      await recordOpportunityAction(oppId, 'STATUS_CHANGED', auth.user.id, note, prevStatus, b.status);
      const updatedRows = await sql()`SELECT * FROM opportunities WHERE id = ${oppId}`;
      return jsonResponse({ opportunity: updatedRows[0] }, 200, origin);
    }
    if (b.assignedTo !== undefined) {
      let assignedTo: string | null = null;
      if (b.assignedTo !== null) {
        if (typeof b.assignedTo !== 'string') {
          return errorResponse('Validation failed: assignedTo — must be a string or null', 400, origin);
        }
        const targetRows = await sql()`SELECT id, user_type FROM users WHERE id = ${b.assignedTo} LIMIT 1`;
        const targetUser = targetRows[0];
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
      await sql()`UPDATE opportunities SET assigned_to = ${assignedTo}, updated_at = ${now} WHERE id = ${oppId}`;
      await recordOpportunityAction(oppId, actionType, auth.user.id, note, null, null);
      const updatedRows = await sql()`SELECT * FROM opportunities WHERE id = ${oppId}`;
      return jsonResponse({ opportunity: updatedRows[0] }, 200, origin);
    }
    return errorResponse('No valid fields to update (status or assignedTo)', 422, origin);
  }

  // ============================================================
  // G5: V6 - Follow-up task queue
  // ============================================================

  // POST /api/admin/activity/opportunities/:id/tasks
  const oppTasksMatch = url.pathname.match(/^\/api\/admin\/activity\/opportunities\/([^/]+)\/tasks$/);
  if (oppTasksMatch && method === 'POST') {
    const auth = await requireInternal(req, origin);
    if (auth.error) return auth.error;
    const oppId = decodeURIComponent(oppTasksMatch[1]);
    const oppRows = await sql()`SELECT id FROM opportunities WHERE id = ${oppId} LIMIT 1`;
    if (!oppRows[0]) return errorResponse('Opportunity not found', 404, origin);
    const parsed = await tryParseJson(req);
    if (!parsed.ok) return errorResponse('Invalid JSON body', 400, origin);
    const b = parsed.body as Record<string, unknown>;
    if (typeof b.title !== 'string' || b.title.trim() === '') {
      return errorResponse('Validation failed: title — required (non-empty string)', 400, origin);
    }
    const title = b.title.trim().slice(0, 200);
    const description = (typeof b.description === 'string' ? b.description.trim().slice(0, 2000) : null);
    let priority: string = 'MEDIUM';
    if (b.priority !== undefined && b.priority !== null) {
      if (typeof b.priority !== 'string' || !VALID_TASK_PRIORITIES.includes(b.priority)) {
        return errorResponse(`Validation failed: priority — must be one of: ${VALID_TASK_PRIORITIES.join(', ')}`, 400, origin);
      }
      priority = b.priority;
    }
    let assigneeUserId: string | null = null;
    if (b.assigneeUserId !== undefined && b.assigneeUserId !== null) {
      if (typeof b.assigneeUserId !== 'string') {
        return errorResponse('Validation failed: assigneeUserId — must be a string or null', 400, origin);
      }
      const targetRows = await sql()`SELECT id, user_type FROM users WHERE id = ${b.assigneeUserId} LIMIT 1`;
      const targetUser = targetRows[0];
      if (!targetUser) {
        return errorResponse('Validation failed: assigneeUserId — user not found', 422, origin);
      }
      if (targetUser.user_type !== 'internal') {
        return errorResponse('Validation failed: assigneeUserId — can only assign to internal users', 400, origin);
      }
      assigneeUserId = targetUser.id;
    }
    let dueDate: string | null = null;
    if (b.dueDate !== undefined && b.dueDate !== null) {
      if (!isValidIsoDate(b.dueDate as string)) {
        return errorResponse('Validation failed: dueDate — must be a valid ISO date (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)', 400, origin);
      }
      dueDate = (b.dueDate as string).trim();
    }
    const dedupKey = computeTaskDedupKey(oppId, title);
    const existingTaskRows = await sql()`SELECT id FROM follow_up_tasks WHERE dedup_key = ${dedupKey} LIMIT 1`;
    if (existingTaskRows[0]) {
      return errorResponse('Validation failed: title — a task with this title already exists on this opportunity (dedup_key conflict)', 409, origin);
    }
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    try {
      await sql()`INSERT INTO follow_up_tasks (id, opportunity_id, dedup_key, title, description, status, priority, assignee_user_id, created_by, due_date, created_at, updated_at)
           VALUES (${id}, ${oppId}, ${dedupKey}, ${title}, ${description}, 'PENDING', ${priority}, ${assigneeUserId}, ${auth.user.id}, ${dueDate}, ${now}, ${now})`;
      const createdRows = await sql()`SELECT t.*, u.name AS assignee_name, ou.name AS created_by_name
           FROM follow_up_tasks t
           LEFT JOIN users u ON t.assignee_user_id = u.id
           LEFT JOIN users ou ON t.created_by = ou.id
           WHERE t.id = ${id}
           LIMIT 1`;
      return jsonResponse({ task: createdRows[0] }, 201, origin);
    } catch (err) {
      console.error('[shanan-api] V6 task create failed:', err);
      return errorResponse('Could not create follow-up task.', 500, origin);
    }
  }

  // GET /api/admin/activity/opportunities/:id/tasks
  if (oppTasksMatch && method === 'GET') {
    const auth = await requireInternal(req, origin);
    if (auth.error) return auth.error;
    const oppId = decodeURIComponent(oppTasksMatch[1]);
    const oppRows = await sql()`SELECT id FROM opportunities WHERE id = ${oppId} LIMIT 1`;
    if (!oppRows[0]) return errorResponse('Opportunity not found', 404, origin);
    const statusFilter = url.searchParams.get('status');
    let rows;
    if (statusFilter) {
      if (!VALID_TASK_STATUSES.includes(statusFilter)) {
        return errorResponse(`Validation failed: status — must be one of: ${VALID_TASK_STATUSES.join(', ')}`, 400, origin);
      }
      rows = await sql()`SELECT t.*, u.name AS assignee_name, ou.name AS created_by_name
           FROM follow_up_tasks t
           LEFT JOIN users u ON t.assignee_user_id = u.id
           LEFT JOIN users ou ON t.created_by = ou.id
           WHERE t.opportunity_id = ${oppId} AND t.status = ${statusFilter}
           ORDER BY t.created_at DESC`;
    } else {
      rows = await sql()`SELECT t.*, u.name AS assignee_name, ou.name AS created_by_name
           FROM follow_up_tasks t
           LEFT JOIN users u ON t.assignee_user_id = u.id
           LEFT JOIN users ou ON t.created_by = ou.id
           WHERE t.opportunity_id = ${oppId}
           ORDER BY t.created_at DESC`;
    }
    return jsonResponse({ tasks: rows, count: rows.length }, 200, origin);
  }

  // GET /api/admin/follow-up-tasks
  if (url.pathname === '/api/admin/follow-up-tasks' && method === 'GET') {
    const auth = await requireInternal(req, origin);
    if (auth.error) return auth.error;
    try {
      const statusFilter = url.searchParams.get('status');
      const priorityFilter = url.searchParams.get('priority');
      const assigneeFilter = url.searchParams.get('assigneeUserId');
      const opportunityFilter = url.searchParams.get('opportunityId');
      if (statusFilter && !VALID_TASK_STATUSES.includes(statusFilter)) {
        return errorResponse(`Validation failed: status — must be one of: ${VALID_TASK_STATUSES.join(', ')}`, 400, origin);
      }
      if (priorityFilter && !VALID_TASK_PRIORITIES.includes(priorityFilter)) {
        return errorResponse(`Validation failed: priority — must be one of: ${VALID_TASK_PRIORITIES.join(', ')}`, 400, origin);
      }
      const conditions: string[] = [];
      const params: any[] = [];
      if (statusFilter) { conditions.push(`t.status = $${params.length + 1}`); params.push(statusFilter); }
      if (priorityFilter) { conditions.push(`t.priority = $${params.length + 1}`); params.push(priorityFilter); }
      if (assigneeFilter) { conditions.push(`t.assignee_user_id = $${params.length + 1}`); params.push(assigneeFilter); }
      if (opportunityFilter) { conditions.push(`t.opportunity_id = $${params.length + 1}`); params.push(opportunityFilter); }
      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const rows = params.length > 0
        ? await sql().unsafe(
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
            params,
          )
        : await sql()`SELECT t.*, u.name AS assignee_name, ou.name AS created_by_name,
                o.opportunity_type, o.rule, o.status AS opportunity_status
           FROM follow_up_tasks t
           LEFT JOIN users u ON t.assignee_user_id = u.id
           LEFT JOIN users ou ON t.created_by = ou.id
           LEFT JOIN opportunities o ON t.opportunity_id = o.id
           ORDER BY
             CASE t.priority
               WHEN 'CRITICAL' THEN 0
               WHEN 'HIGH' THEN 1
               WHEN 'MEDIUM' THEN 2
               WHEN 'LOW' THEN 3
               ELSE 4
             END ASC,
             t.created_at DESC`;
      return jsonResponse({ tasks: rows, count: rows.length }, 200, origin);
    } catch (err) {
      console.error('[shanan-api] V6 task list failed:', err);
      return errorResponse('Could not retrieve follow-up tasks.', 500, origin);
    }
  }

  // PATCH /api/admin/follow-up-tasks/:id
  const followUpTaskMatch = url.pathname.match(/^\/api\/admin\/follow-up-tasks\/([^/]+)$/);
  if (followUpTaskMatch && method === 'PATCH') {
    const auth = await requireInternal(req, origin);
    if (auth.error) return auth.error;
    const taskId = decodeURIComponent(followUpTaskMatch[1]);
    const existingRows = await sql()`SELECT * FROM follow_up_tasks WHERE id = ${taskId} LIMIT 1`;
    const existing = existingRows[0];
    if (!existing) return errorResponse('Follow-up task not found', 404, origin);
    const parsed = await tryParseJson(req);
    if (!parsed.ok) return errorResponse('Invalid JSON body', 400, origin);
    const b = parsed.body as Record<string, unknown>;
    const now = new Date().toISOString();
    const updates: string[] = ['updated_at = $1'];
    const values: any[] = [now];
    let n = 1;
    if (b.status !== undefined) {
      if (typeof b.status !== 'string' || !VALID_TASK_STATUSES.includes(b.status)) {
        return errorResponse(`Validation failed: status — must be one of: ${VALID_TASK_STATUSES.join(', ')}`, 400, origin);
      }
      updates.push(`status = $${String(++n)}`); values.push(b.status);
    }
    if (b.priority !== undefined) {
      if (typeof b.priority !== 'string' || !VALID_TASK_PRIORITIES.includes(b.priority)) {
        return errorResponse(`Validation failed: priority — must be one of: ${VALID_TASK_PRIORITIES.join(', ')}`, 400, origin);
      }
      updates.push(`priority = $${String(++n)}`); values.push(b.priority);
    }
    if (b.title !== undefined) {
      if (typeof b.title !== 'string' || b.title.trim() === '') {
        return errorResponse('Validation failed: title — must be a non-empty string', 400, origin);
      }
      const newTitle = b.title.trim().slice(0, 200);
      const newDedupKey = computeTaskDedupKey(existing.opportunity_id, newTitle);
      if (newDedupKey !== existing.dedup_key) {
        const conflictRows = await sql()`SELECT id FROM follow_up_tasks WHERE dedup_key = ${newDedupKey} AND id != ${taskId} LIMIT 1`;
        if (conflictRows[0]) {
          return errorResponse('Validation failed: title — a task with this title already exists on this opportunity', 409, origin);
        }
        updates.push(`dedup_key = $${String(++n)}`); values.push(newDedupKey);
      }
      updates.push(`title = $${String(++n)}`); values.push(newTitle);
    }
    if (b.description !== undefined) {
      if (b.description === null) {
        updates.push('description = NULL');
      } else if (typeof b.description === 'string') {
        updates.push(`description = $${String(++n)}`); values.push(b.description.trim().slice(0, 2000));
      } else {
        return errorResponse('Validation failed: description — must be a string or null', 400, origin);
      }
    }
    if (b.dueDate !== undefined) {
      if (b.dueDate === null) {
        updates.push('due_date = NULL');
      } else if (isValidIsoDate(b.dueDate as string)) {
        updates.push(`due_date = $${String(++n)}`); values.push((b.dueDate as string).trim());
      } else {
        return errorResponse('Validation failed: dueDate — must be a valid ISO date or null', 400, origin);
      }
    }
    if (b.assigneeUserId !== undefined) {
      if (b.assigneeUserId === null) {
        updates.push('assignee_user_id = NULL');
      } else {
        if (typeof b.assigneeUserId !== 'string') {
          return errorResponse('Validation failed: assigneeUserId — must be a string or null', 400, origin);
        }
        const targetRows = await sql()`SELECT id, user_type FROM users WHERE id = ${b.assigneeUserId} LIMIT 1`;
        const targetUser = targetRows[0];
        if (!targetUser) {
          return errorResponse('Validation failed: assigneeUserId — user not found', 422, origin);
        }
        if (targetUser.user_type !== 'internal') {
          return errorResponse('Validation failed: assigneeUserId — can only assign to internal users', 400, origin);
        }
        updates.push(`assignee_user_id = $${String(++n)}`); values.push(targetUser.id);
      }
    }
    if (updates.length === 1) {
      return errorResponse('No valid fields to update', 422, origin);
    }
    values.push(taskId);
    try {
      await sql().unsafe(`UPDATE follow_up_tasks SET ${updates.join(', ')} WHERE id = $${updates.length + 1}`, values);
      const updatedRows = await sql()`SELECT t.*, u.name AS assignee_name, ou.name AS created_by_name
           FROM follow_up_tasks t
           LEFT JOIN users u ON t.assignee_user_id = u.id
           LEFT JOIN users ou ON t.created_by = ou.id
           WHERE t.id = ${taskId}
           LIMIT 1`;
      return jsonResponse({ task: updatedRows[0] }, 200, origin);
    } catch (err) {
      console.error('[shanan-api] V6 task update failed:', err);
      return errorResponse('Could not update follow-up task.', 500, origin);
    }
  }

  // POST /api/admin/activity/opportunities/:id/actions
  const oppActionMatch = url.pathname.match(/^\/api\/admin\/activity\/opportunities\/([^/]+)\/actions$/);
  if (oppActionMatch && method === 'POST') {
    const auth = await requireInternal(req, origin);
    if (auth.error) return auth.error;
    const oppId = decodeURIComponent(oppActionMatch[1]);
    const existingRows = await sql()`SELECT id, status FROM opportunities WHERE id = ${oppId} LIMIT 1`;
    const existing = existingRows[0];
    if (!existing) return errorResponse('Opportunity not found', 404, origin);
    const parsed = await tryParseJson(req);
    if (!parsed.ok) return errorResponse('Invalid JSON body', 400, origin);
    const b = parsed.body as Record<string, unknown>;
    if (typeof b.actionType !== 'string' || !VALID_ACTION_TYPES.includes(b.actionType)) {
      return errorResponse(`Validation failed: actionType — must be one of: ${VALID_ACTION_TYPES.join(', ')}`, 400, origin);
    }
    const note = (typeof b.note === 'string' && b.note.length <= 500) ? b.note.trim() : null;
    const actionId = crypto.randomUUID();
    const now = new Date().toISOString();
    let newStatus: string | null = null;
    if (b.actionType === 'CONVERTED') newStatus = 'CONVERTED';
    if (b.actionType === 'DISMISSED') newStatus = 'DISMISSED';
    if (b.actionType === 'REVIEWED' && existing.status === 'NEW') newStatus = 'UNDER_REVIEW';
    if (b.actionType === 'CUSTOMER_CONTACTED') newStatus = 'CONTACTED';
    if (newStatus) {
      await sql()`UPDATE opportunities SET status = ${newStatus}, updated_at = ${now} WHERE id = ${oppId}`;
    }
    try {
      await sql()`INSERT INTO opportunity_actions (id, opportunity_id, action_type, actor_id, note, previous_status, new_status, created_at)
           VALUES (${actionId}, ${oppId}, ${b.actionType}, ${auth.user.id}, ${note}, ${existing.status}, ${newStatus}, ${now})`;
      return jsonResponse({ id: actionId, createdAt: now }, 201, origin);
    } catch (err) {
      console.error('[shanan-api] Opportunity action insert failed:', err);
      return errorResponse('Could not record action.', 500, origin);
    }
  }

  return errorResponse('Not found', 404, origin);
}

export async function GET(req: Request): Promise<Response> {
  try {
    return await route(req, 'GET');
  } catch (err: any) {
    console.error('[shanan-api] GET failed:', err?.message ?? String(err));
    return errorResponse('Internal server error', 500, req.headers.get('Origin'));
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    return await route(req, 'POST');
  } catch (err: any) {
    console.error('[shanan-api] POST failed:', err?.message ?? String(err));
    return errorResponse('Internal server error', 500, req.headers.get('Origin'));
  }
}

export async function PUT(req: Request): Promise<Response> {
  try {
    return await route(req, 'PUT');
  } catch (err: any) {
    console.error('[shanan-api] PUT failed:', err?.message ?? String(err));
    return errorResponse('Internal server error', 500, req.headers.get('Origin'));
  }
}

export async function PATCH(req: Request): Promise<Response> {
  try {
    return await route(req, 'PATCH');
  } catch (err: any) {
    console.error('[shanan-api] PATCH failed:', err?.message ?? String(err));
    return errorResponse('Internal server error', 500, req.headers.get('Origin'));
  }
}

export async function DELETE(req: Request): Promise<Response> {
  try {
    return await route(req, 'DELETE');
  } catch (err: any) {
    console.error('[shanan-api] DELETE failed:', err?.message ?? String(err));
    return errorResponse('Internal server error', 500, req.headers.get('Origin'));
  }
}

export async function OPTIONS(req: Request): Promise<Response> {
  const origin = req.headers.get('Origin');
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}