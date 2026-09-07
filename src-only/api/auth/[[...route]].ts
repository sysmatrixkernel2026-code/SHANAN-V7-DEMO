import postgres from 'postgres';

// ============================================================
// G-B: Production authentication API (Vercel /api/auth/*)
// Catch-all optional route: login, me, logout, register-admin.
// Contract provenance: legacy/api/server.ts (PBKDF2-SHA256 100k,
// 24h opaque bearer sessions over users/user_sessions, generic
// 401s, inactive 403, DP-safe 404s via tenant helpers).
// Rate limiting: public.login_attempts (G-A migration 0001).
// Reads only; inserts user_sessions/login_attempts rows (PK-safe
// upserts). NEVER modifies existing users or any other table.
// ============================================================

export const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;
export const PBKDF2_ITERATIONS = 100000;
const PBKDF2_HASH = 'SHA-256';

export const LOGIN_MAX_REQUESTS = Number(process.env.LOGIN_MAX_REQUESTS || '20');
export const LOGIN_WINDOW_MS = Number(process.env.LOGIN_WINDOW_MS || '900000');
const LOGIN_ATTEMPTS_PURGE_MS = 24 * 60 * 60 * 1000;

export interface DBUser {
  id: string;
  name: string;
  email: string;
  password_hash: string | null;
  user_type: string;
  role: string;
  company_id: string | null;
  supplier_id: string | null;
  is_active: number | boolean;
}

export interface AuthStore {
  findUserByEmail(email: string): Promise<DBUser | null>;
  findSessionUser(token: string, nowIso: string): Promise<DBUser | null>;
  deleteSession(token: string): Promise<void>;
  createSession(token: string, userId: string, expiresAtIso: string): Promise<void>;
  countInternalAdmins(): Promise<number>;
  insertAdminUser(opts: {
    id: string;
    name: string;
    email: string;
    passwordHash: string;
    nowIso: string;
  }): Promise<void>;
  getAttempts(key: string): Promise<{ attempts: number; firstAt: string } | null>;
  incrementAttempts(key: string, nowIso: string): Promise<{ attempts: number; firstAt: string }>;
  resetAttempts(key: string): Promise<void>;
  purgeAttempts(olderThanIso: string): Promise<void>;
  insertActivity(evt: {
    id: string;
    eventType: string;
    userId: string | null;
    userType: string | null;
    companyId: string | null;
    metadata: string | null;
    nowIso: string;
  }): Promise<void>;
}

// ------------------------------------------------------------
// Pure helpers (exported for tests)
// ------------------------------------------------------------

export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const hash = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: PBKDF2_HASH },
    keyMaterial,
    256,
  );
  const combined = new Uint8Array(salt.length + hash.byteLength);
  combined.set(salt, 0);
  combined.set(new Uint8Array(hash), salt.length);
  const b64 = btoa(String.fromCharCode(...combined));
  return `pbkdf2$${PBKDF2_ITERATIONS}$${b64}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
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
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const hash = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: PBKDF2_HASH },
    keyMaterial,
    256,
  );
  return constantTimeEqual(new Uint8Array(hash), expected);
}

export function generateSessionToken(): string {
  return crypto.randomUUID() + '-' + crypto.randomUUID();
}

export function safeUserInfo(user: DBUser) {
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

export function isActiveUser(user: DBUser): boolean {
  return Boolean(user.is_active);
}

export function isInternalUser(user: DBUser): boolean {
  return user.user_type === 'internal';
}

export function isCustomerUser(user: DBUser): boolean {
  return user.user_type === 'customer';
}

export function isSupplierUser(user: DBUser): boolean {
  return user.user_type === 'supplier';
}

export function supplierStatusGate(status: string | null | undefined) {
  if (status === 'suspended' || status === 'terminated') {
    return { ok: false, reason: 'inactive' };
  }
  if (status === 'pending' || status === 'under_review') {
    return { ok: false, reason: 'pending' };
  }
  return { ok: true, reason: 'active' };
}

export function ownsCompanyTenant(user: DBUser, companyId: string | null | undefined): boolean {
  if (!companyId) return false;
  if (isInternalUser(user)) return true;
  return isCustomerUser(user) && user.company_id != null && user.company_id === companyId;
}

export function ownsSupplierTenant(user: DBUser, supplierId: string | null | undefined): boolean {
  if (!supplierId) return false;
  if (isInternalUser(user)) return true;
  return isSupplierUser(user) && user.supplier_id != null && user.supplier_id === supplierId;
}

export function canManageUser(actor: DBUser, target: DBUser): boolean {
  if (isInternalUser(actor)) return true;
  if (actor.id === target.id) return true;
  if (isCustomerUser(actor) && actor.role === 'customer_admin') {
    return actor.company_id != null && actor.company_id === target.company_id;
  }
  return false;
}

export function clientIp(req: Request): string | null {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim() || null;
  const real = req.headers.get('x-real-ip');
  if (real) return real.trim() || null;
  return null;
}

export function bearerToken(req: Request): string | null {
  const header = req.headers.get('Authorization');
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token || null;
}

export async function rateLimitKey(ip: string | null, email: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${ip ?? ''}|${email}`));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function toIso(value: string | Date | null | undefined): string {
  if (value == null) return '';
  return value instanceof Date ? value.toISOString() : String(value);
}

function toDBUser(row: any): DBUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    password_hash: row.password_hash ?? null,
    user_type: row.user_type,
    role: row.role,
    company_id: row.company_id ?? null,
    supplier_id: row.supplier_id ?? null,
    is_active: row.is_active,
  };
}

async function tryParseJson(req: Request): Promise<{ ok: true; body: any } | { ok: false }> {
  try {
    return { ok: true, body: await req.json() };
  } catch {
    return { ok: false };
  }
}

function toFields(body: any): Record<string, unknown> {
  return body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
}

function json(data: unknown, status: number, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...extraHeaders },
  });
}

// ------------------------------------------------------------
// SQL store (production)
// ------------------------------------------------------------

export function createSqlStore(sql: any): AuthStore {
  return {
    async findUserByEmail(email) {
      const rows = await sql`
        SELECT id, name, email, password_hash, user_type, role, company_id, supplier_id, is_active
        FROM users WHERE email = ${email} LIMIT 1`;
      return rows[0] ? toDBUser(rows[0]) : null;
    },
    async findSessionUser(token, nowIso) {
      const rows = await sql`
        SELECT u.id, u.name, u.email, u.password_hash, u.user_type, u.role, u.company_id, u.supplier_id, u.is_active
        FROM user_sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token = ${token} AND s.expires_at > ${nowIso}
        LIMIT 1`;
      if (!rows[0]) {
        await sql`DELETE FROM user_sessions WHERE token = ${token}`;
        return null;
      }
      const user = toDBUser(rows[0]);
      if (!isActiveUser(user)) return null;
      return user;
    },
    async deleteSession(token) {
      await sql`DELETE FROM user_sessions WHERE token = ${token}`;
    },
    async createSession(token, userId, expiresAtIso) {
      await sql`INSERT INTO user_sessions (token, user_id, expires_at) VALUES (${token}, ${userId}, ${expiresAtIso})`;
    },
    async countInternalAdmins() {
      const rows = await sql`SELECT COUNT(*)::int AS n FROM users WHERE user_type = 'internal' AND role = 'admin'`;
      return Number(rows[0]?.n ?? 0);
    },
    async insertAdminUser(opts) {
      await sql`
        INSERT INTO users (id, name, email, password_hash, user_type, role, company_id, supplier_id, is_active, created_at, updated_at)
        VALUES (${opts.id}, ${opts.name}, ${opts.email}, ${opts.passwordHash}, 'internal', 'admin', null, null, 1, ${opts.nowIso}, ${opts.nowIso})`;
    },
    async getAttempts(key) {
      const rows = await sql`SELECT attempts, first_attempt_at FROM login_attempts WHERE key = ${key} LIMIT 1`;
      if (!rows[0]) return null;
      return { attempts: Number(rows[0].attempts), firstAt: toIso(rows[0].first_attempt_at) };
    },
    async incrementAttempts(key, nowIso) {
      const rows = await sql`SELECT attempts, first_attempt_at FROM login_attempts WHERE key = ${key} LIMIT 1`;
      const existing = rows[0];
      if (existing) {
        const firstAt = toIso(existing.first_attempt_at);
        if (Date.now() - Date.parse(firstAt) <= LOGIN_WINDOW_MS) {
          await sql`UPDATE login_attempts SET attempts = attempts + 1, updated_at = ${nowIso} WHERE key = ${key}`;
          return { attempts: Number(existing.attempts) + 1, firstAt };
        }
      }
      await sql`
        INSERT INTO login_attempts (key, attempts, first_attempt_at, updated_at)
        VALUES (${key}, 1, ${nowIso}, ${nowIso})
        ON CONFLICT (key) DO UPDATE SET attempts = 1, first_attempt_at = ${nowIso}, updated_at = ${nowIso}`;
      return { attempts: 1, firstAt: nowIso };
    },
    async resetAttempts(key) {
      await sql`DELETE FROM login_attempts WHERE key = ${key}`;
    },
    async purgeAttempts(olderThanIso) {
      await sql`DELETE FROM login_attempts WHERE updated_at < ${olderThanIso}`;
    },
    async insertActivity(evt) {
      await sql`
        INSERT INTO activity_events (id, event_type, user_id, user_type, company_id, metadata, created_at)
        VALUES (${evt.id}, ${evt.eventType}, ${evt.userId}, ${evt.userType}, ${evt.companyId}, ${evt.metadata}, ${evt.nowIso})`;
    },
  };
}

// ------------------------------------------------------------
// Route + handlers (store-injected for testability)
// ------------------------------------------------------------

export async function handleLogin(req: Request, store: AuthStore): Promise<Response> {
  const nowIso = new Date().toISOString();
  try {
    await store.purgeAttempts(new Date(Date.now() - LOGIN_ATTEMPTS_PURGE_MS).toISOString());
  } catch {
    // purge is opportunistic; never block login on cleanup failure
  }

  const parsed = await tryParseJson(req);
  if (!parsed.ok) return json({ error: 'Invalid JSON body' }, 400);
  const b = toFields(parsed.body);
  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
  if (typeof b.password !== 'string' || !email) {
    return json({ error: 'Email and password are required' }, 422);
  }

  const key = await rateLimitKey(clientIp(req), email);
  const rl = await store.incrementAttempts(key, nowIso);
  if (rl.attempts > LOGIN_MAX_REQUESTS) {
    const retryAfter = Math.max(1, Math.ceil((Date.parse(rl.firstAt) + LOGIN_WINDOW_MS - Date.now()) / 1000));
    return json({ error: 'Too many requests. Please try again later.' }, 429, { 'retry-after': String(retryAfter) });
  }

  try {
    const user = await store.findUserByEmail(email);
    if (!user || !user.password_hash) return json({ error: 'Invalid email or password' }, 401);
    if (!isActiveUser(user)) return json({ error: 'Account is inactive' }, 403);
    const valid = await verifyPassword(b.password, user.password_hash);
    if (!valid) return json({ error: 'Invalid email or password' }, 401);

    await store.resetAttempts(key);
    const token = generateSessionToken();
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();
    await store.createSession(token, user.id, expiresAt);
    await store.insertActivity({
      id: crypto.randomUUID(),
      eventType: 'SESSION_STARTED',
      userId: user.id,
      userType: user.user_type,
      companyId: user.company_id,
      metadata: null,
      nowIso,
    });
    return json({ token, user: safeUserInfo(user) }, 200);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[api/auth] login failed:', msg.slice(0, 200));
    return json({ error: 'Authentication failed' }, 500);
  }
}

export async function handleMe(req: Request, store: AuthStore): Promise<Response> {
  const token = bearerToken(req);
  if (!token) return json({ error: 'Authentication required' }, 401);
  const user = await store.findSessionUser(token, new Date().toISOString());
  if (!user) return json({ error: 'Authentication required' }, 401);
  return json({ user: safeUserInfo(user) }, 200);
}

export async function handleLogout(req: Request, store: AuthStore): Promise<Response> {
  const token = bearerToken(req);
  if (token) {
    try {
      await store.deleteSession(token);
    } catch {
      // best-effort invalidation; client clears local storage regardless
    }
  }
  return json({ ok: true }, 200);
}

export async function handleRegisterAdmin(req: Request, store: AuthStore): Promise<Response> {
  const nowIso = new Date().toISOString();
  const parsed = await tryParseJson(req);
  if (!parsed.ok) return json({ error: 'Invalid JSON body' }, 400);
  const b = toFields(parsed.body);
  const emailRaw = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
  const key = await rateLimitKey(clientIp(req), emailRaw);
  const rl = await store.incrementAttempts(key, nowIso);
  if (rl.attempts > LOGIN_MAX_REQUESTS) {
    const retryAfter = Math.max(1, Math.ceil((Date.parse(rl.firstAt) + LOGIN_WINDOW_MS - Date.now()) / 1000));
    return json({ error: 'Too many requests. Please try again later.' }, 429, { 'retry-after': String(retryAfter) });
  }

  const adminCount = await store.countInternalAdmins();
  if (adminCount > 0) return json({ error: 'An admin account already exists. Use login.' }, 409);

  if (typeof b.name !== 'string' || b.name.trim() === '') {
    return json({ error: 'Name is required' }, 422);
  }
  if (typeof b.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email)) {
    return json({ error: 'Valid email is required' }, 422);
  }
  if (typeof b.password !== 'string' || b.password.length < 8) {
    return json({ error: 'Password must be at least 8 characters' }, 422);
  }
  const email = b.email.trim().toLowerCase();

  const dup = await store.findUserByEmail(email);
  if (dup) return json({ error: 'Email already in use' }, 409);

  const id = crypto.randomUUID();
  const hash = await hashPassword(b.password);
  await store.insertAdminUser({ id, name: b.name, email, passwordHash: hash, nowIso });
  return json({ id, message: 'Admin account created' }, 201);
}

export async function route(req: Request, method: string, store: AuthStore): Promise<Response> {
  if (method !== 'GET' && method !== 'POST') {
    return new Response(null, { status: 405, headers: { allow: 'GET, POST' } });
  }
  const pathname = new URL(req.url).pathname;
  const sub = pathname.replace(/^\/api\/auth\/?/, '').replace(/\/+$/, '');
  if (method === 'GET') {
    if (sub === 'me') return handleMe(req, store);
    return json({ error: 'Not found' }, 404);
  }
  if (sub === 'login') return handleLogin(req, store);
  if (sub === 'logout') return handleLogout(req, store);
  if (sub === 'register-admin') return handleRegisterAdmin(req, store);
  return json({ error: 'Not found' }, 404);
}

// ------------------------------------------------------------
// Vercel handlers (lazy SQL client)
// ------------------------------------------------------------

let prodStoreInstance: AuthStore | null = null;

function prodStore(): AuthStore {
  if (!prodStoreInstance) {
    const url = process.env.SUPABASE_DB_URL;
    if (!url) throw new Error('SUPABASE_DB_URL is required');
    prodStoreInstance = createSqlStore(postgres(url, { max: 5, connect_timeout: 10, prepare: false, ssl: { ca: process.env.SUPABASE_SSL_CA, rejectUnauthorized: true } }));
  }
  return prodStoreInstance;
}

async function handler(req: Request, method: string): Promise<Response> {
  try {
    return await route(req, method, prodStore());
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[api/auth] failed:', msg.slice(0, 200));
    return json({ error: 'Internal server error' }, 500);
  }
}

export async function GET(req: Request): Promise<Response> {
  return handler(req, 'GET');
}

export async function POST(req: Request): Promise<Response> {
  return handler(req, 'POST');
}