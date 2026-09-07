// ============================================================
// G-B: Unit tests for api/auth/[[...route]].ts
// Pure helper + store-injected handler tests. No DB required.
// Run with: bun test tests/auth-auth.test.ts
//
// NOTE: tests/a13-regression.test.ts targets the removed legacy
// Bun server (Linux paths, api/server.ts) and is out of scope.
// ============================================================

import { describe, test, expect, beforeAll } from 'bun:test';
import * as auth from '../api/auth/[[...route]]';

const LEGACY_VECTOR = 'pbkdf2$100000$AAECAwQFBgcICQoLDA0OD+JH4S7t0sjmJxa6DTYxtTkiycIHtmxtl5z0NpmE7SkE';

interface MemUser {
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

interface MemSession {
  token: string;
  userId: string;
  expiresAt: string;
}

interface MemAttempt {
  attempts: number;
  firstAt: string;
  updatedAt: string;
}

function createMemState() {
  const users: MemUser[] = [];
  const sessions: MemSession[] = [];
  const attempts = new Map<string, MemAttempt>();
  const events: any[] = [];

  const store: auth.AuthStore = {
    async findUserByEmail(email) {
      return users.find((u) => u.email === email) ?? null;
    },
    async findSessionUser(token, nowIso) {
      const idx = sessions.findIndex((s) => s.token === token);
      if (idx < 0) return null;
      const s = sessions[idx];
      if (s.expiresAt <= nowIso) {
        sessions.splice(idx, 1);
        return null;
      }
      const user = users.find((u) => u.id === s.userId);
      if (!user || !Boolean(user.is_active)) {
        sessions.splice(idx, 1);
        return null;
      }
      return user;
    },
    async deleteSession(token) {
      const idx = sessions.findIndex((s) => s.token === token);
      if (idx >= 0) sessions.splice(idx, 1);
    },
    async createSession(token, userId, expiresAtIso) {
      sessions.push({ token, userId, expiresAt: expiresAtIso });
    },
    async countInternalAdmins() {
      return users.filter((u) => u.user_type === 'internal' && u.role === 'admin').length;
    },
    async insertAdminUser(opts) {
      users.push({
        id: opts.id,
        name: opts.name,
        email: opts.email,
        password_hash: opts.passwordHash,
        user_type: 'internal',
        role: 'admin',
        company_id: null,
        supplier_id: null,
        is_active: 1,
      });
    },
    async getAttempts(key) {
      const a = attempts.get(key);
      return a ? { attempts: a.attempts, firstAt: a.firstAt } : null;
    },
    async incrementAttempts(key, nowIso) {
      const existing = attempts.get(key);
      if (existing) {
        if (Date.parse(nowIso) - Date.parse(existing.firstAt) <= auth.LOGIN_WINDOW_MS) {
          existing.attempts += 1;
          existing.updatedAt = nowIso;
          return { attempts: existing.attempts, firstAt: existing.firstAt };
        }
      }
      attempts.set(key, { attempts: 1, firstAt: nowIso, updatedAt: nowIso });
      return { attempts: 1, firstAt: nowIso };
    },
    async resetAttempts(key) {
      attempts.delete(key);
    },
    async purgeAttempts(olderThanIso) {
      for (const [k, a] of attempts) {
        if (a.updatedAt < olderThanIso) attempts.delete(k);
      }
    },
    async insertActivity(evt) {
      events.push(evt);
    },
  };

  return { store, users, sessions, attempts, events };
}

const PASS = {
  admin: 'Admin-Secret-1',
  customerA: 'Customer-Secret-A',
  customerB: 'Customer-Secret-B',
  supplier: 'Supplier-Secret-1',
  supplierPending: 'Supplier-Secret-P',
  inactive: 'Inactive-Secret-1',
};

let admin: MemUser;
let custAdminA: MemUser;
let custUserB: MemUser;
let supplier1: MemUser;
let supplierPending: MemUser;
let inactive: MemUser;
let state: ReturnType<typeof createMemState>;

beforeAll(async () => {
  admin = {
    id: 'u-admin',
    name: 'System Admin',
    email: 'admin@shanan.example',
    password_hash: await auth.hashPassword(PASS.admin),
    user_type: 'internal',
    role: 'admin',
    company_id: null,
    supplier_id: null,
    is_active: 1,
  };
  custAdminA = {
    id: 'u-ca',
    name: 'CA Admin',
    email: 'ca@customer-a.example',
    password_hash: await auth.hashPassword(PASS.customerA),
    user_type: 'customer',
    role: 'customer_admin',
    company_id: 'comp-A',
    supplier_id: null,
    is_active: 1,
  };
  custUserB = {
    id: 'u-cb',
    name: 'CB User',
    email: 'cb@customer-b.example',
    password_hash: await auth.hashPassword(PASS.customerB),
    user_type: 'customer',
    role: 'customer_user',
    company_id: 'comp-B',
    supplier_id: null,
    is_active: 1,
  };
  supplier1 = {
    id: 'u-s1',
    name: 'Supplier One',
    email: 'supplier1@example.com',
    password_hash: await auth.hashPassword(PASS.supplier),
    user_type: 'supplier',
    role: 'supplier_admin',
    company_id: null,
    supplier_id: 'sup-1',
    is_active: 1,
  };
  supplierPending = {
    id: 'u-sp',
    name: 'Supplier Pending',
    email: 'supplierp@example.com',
    password_hash: await auth.hashPassword(PASS.supplierPending),
    user_type: 'supplier',
    role: 'supplier_admin',
    company_id: null,
    supplier_id: 'sup-2',
    is_active: 1,
  };
  inactive = {
    id: 'u-inactive',
    name: 'Disabled User',
    email: 'disabled@example.com',
    password_hash: await auth.hashPassword(PASS.inactive),
    user_type: 'customer',
    role: 'customer_user',
    company_id: 'comp-B',
    supplier_id: null,
    is_active: 0,
  };
  state = createMemState();
  state.users.push(admin, custAdminA, custUserB, supplier1, supplierPending, inactive);
});

function loginReq(email: string, password: string): Request {
  return new Request('http://x/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
}

async function doLogin(email: string, password: string) {
  return auth.handleLogin(loginReq(email, password), state.store);
}

describe('PBKDF2 password hashing (legacy-compatible)', () => {
  test('generated hash matches pbkdf2$100000$ format', async () => {
    const h = await auth.hashPassword('whatever-password-1');
    expect(h.startsWith('pbkdf2$100000$')).toBe(true);
    const parts = h.split('$');
    expect(parts.length).toBe(3);
    expect(atob(parts[2]).length).toBe(48);
  });

  test('roundtrip verify true; wrong password false', async () => {
    const h = await auth.hashPassword('correct-horse-99');
    expect(await auth.verifyPassword('correct-horse-99', h)).toBe(true);
    expect(await auth.verifyPassword('wrong-horse-99', h)).toBe(false);
  });

  test('precomputed legacy vector verifies', async () => {
    expect(await auth.verifyPassword('Shanan-Test-2024!', LEGACY_VECTOR)).toBe(true);
    expect(await auth.verifyPassword('Shanan-Test-2024x', LEGACY_VECTOR)).toBe(false);
  });

  test('malformed stored hashes rejected', async () => {
    expect(await auth.verifyPassword('pw', '')).toBe(false);
    expect(await auth.verifyPassword('pw', 'md5$1234$abcd')).toBe(false);
    expect(await auth.verifyPassword('pw', 'pbkdf2$100000')).toBe(false);
    expect(await auth.verifyPassword('pw', 'pbkdf2$abc$!!!')).toBe(false);
    expect(await auth.verifyPassword('pw', 'pbkdf2$notanumber$QUJD')).toBe(false);
    expect(await auth.verifyPassword('pw', 'pbkdf2$100000$QUJDQUJDQUJD')).toBe(false);
  });

  test('constant-time compare', () => {
    expect(auth.constantTimeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true);
    expect(auth.constantTimeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false);
    expect(auth.constantTimeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3]))).toBe(false);
  });
});

describe('POST /api/auth/login', () => {
  test('success returns token + safe user, creates session, clears attempts', async () => {
    for (let i = 0; i < 5; i++) {
      await doLogin('admin@shanan.example', 'definitely-wrong');
    }
    const key = await auth.rateLimitKey(null, 'admin@shanan.example');
    expect((await state.store.getAttempts(key))?.attempts).toBe(5);

    const res = await doLogin('Admin@Shanan.Example ', PASS.admin);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.token).toBe('string');
    expect(body.token).toMatch(/^[0-9a-f-]{36}-[0-9a-f-]{36}$/);
    expect(body.user).toEqual({
      id: 'u-admin',
      name: 'System Admin',
      email: 'admin@shanan.example',
      userType: 'internal',
      role: 'admin',
      companyId: null,
      supplierId: null,
      isActive: true,
    });
    expect(body.user.password_hash).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain('password_hash');
    expect(state.sessions.length).toBe(1);
    expect(state.events.some((e) => e.eventType === 'SESSION_STARTED' && e.userId === 'u-admin')).toBe(true);
    expect(await state.store.getAttempts(key)).toBeNull();
  });

  test('wrong password -> generic 401, no session created', async () => {
    const before = state.sessions.length;
    const res = await doLogin('admin@shanan.example', 'wrong-password-1');
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('Invalid email or password');
    expect(state.sessions.length).toBe(before);
  });

  test('unknown email -> same generic 401 (no account enumeration)', async () => {
    const res = await doLogin('nobody@nowhere.example', 'wrong-password-1');
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Invalid email or password');
    expect(JSON.stringify(body)).not.toContain('nobody@nowhere.example');
  });

  test('inactive account with correct password -> 403 Account is inactive', async () => {
    const res = await doLogin('disabled@example.com', PASS.inactive);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('Account is inactive');
  });

  test('missing fields -> 422', async () => {
    const res = await auth.handleLogin(
      new Request('http://x/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'a@b.com' }) }),
      state.store,
    );
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe('Email and password are required');
  });

  test('null/non-object body -> 422 (not 500)', async () => {
    const res = await auth.handleLogin(
      new Request('http://x/api/auth/login', { method: 'POST', body: 'null' }),
      state.store,
    );
    expect(res.status).toBe(422);
  });

  test('invalid JSON -> 400', async () => {
    const res = await auth.handleLogin(
      new Request('http://x/api/auth/login', { method: 'POST', body: 'not-json' }),
      state.store,
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid JSON body');
  });

  test('rate limiting: 429 after threshold + Retry-After header', async () => {
    let got429 = false;
    let retryAfter = -1;
    for (let i = 0; i < auth.LOGIN_MAX_REQUESTS + 2; i++) {
      const res = await doLogin('rl@example.com', 'wrong-password-rate');
      if (res.status === 429) {
        got429 = true;
        retryAfter = Number(res.headers.get('retry-after'));
        expect((await res.json()).error).toBe('Too many requests. Please try again later.');
        break;
      }
    }
    expect(got429).toBe(true);
    expect(retryAfter).toBeGreaterThan(0);
  });
});

describe('GET /api/auth/me', () => {
  test('no token -> 401', async () => {
    const res = await auth.handleMe(new Request('http://x/api/auth/me'), state.store);
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('Authentication required');
  });

  test('empty / malformed bearer -> 401', async () => {
    let res = await auth.handleMe(
      new Request('http://x/api/auth/me', { headers: { authorization: 'Bearer ' } }),
      state.store,
    );
    expect(res.status).toBe(401);
    res = await auth.handleMe(
      new Request('http://x/api/auth/me', { headers: { authorization: 'Bearer totally-garbage' } }),
      state.store,
    );
    expect(res.status).toBe(401);
  });

  test('valid token -> 200 with safe user', async () => {
    const login = await doLogin('admin@shanan.example', PASS.admin);
    const { token } = await login.json();
    const res = await auth.handleMe(
      new Request('http://x/api/auth/me', { headers: { authorization: `Bearer ${token}` } }),
      state.store,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.email).toBe('admin@shanan.example');
    expect(JSON.stringify(body)).not.toContain('password_hash');
  });

  test('expired session -> 401 and session removed', async () => {
    state.sessions.push({ token: 'expired-token-x', userId: 'u-admin', expiresAt: '2000-01-01T00:00:00.000Z' });
    const res = await auth.handleMe(
      new Request('http://x/api/auth/me', { headers: { authorization: 'Bearer expired-token-x' } }),
      state.store,
    );
    expect(res.status).toBe(401);
    expect(state.sessions.some((s) => s.token === 'expired-token-x')).toBe(false);
  });
});

describe('POST /api/auth/logout', () => {
  test('invalidates the session', async () => {
    const login = await doLogin('admin@shanan.example', PASS.admin);
    const { token } = await login.json();
    const res = await auth.handleLogout(
      new Request('http://x/api/auth/logout', { method: 'POST', headers: { authorization: `Bearer ${token}` } }),
      state.store,
    );
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    expect(state.sessions.some((s) => s.token === token)).toBe(false);
    const me = await auth.handleMe(
      new Request('http://x/api/auth/me', { headers: { authorization: `Bearer ${token}` } }),
      state.store,
    );
    expect(me.status).toBe(401);
  });

  test('logout without token still 200', async () => {
    const res = await auth.handleLogout(new Request('http://x/api/auth/logout', { method: 'POST' }), state.store);
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });
});

describe('POST /api/auth/register-admin (legacy bootstrap contract)', () => {
  test('existing admin -> 409 (production has exactly one admin)', async () => {
    const res = await auth.handleRegisterAdmin(
      new Request('http://x/api/auth/register-admin', {
        method: 'POST',
        body: JSON.stringify({ name: 'Imposter', email: 'imp@x.com', password: '12345678' }),
      }),
      state.store,
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('An admin account already exists. Use login.');
    expect(state.users.filter((u) => u.user_type === 'internal' && u.role === 'admin').length).toBe(1);
  });

  test('creates first admin in empty store; normalizes email; hash format; 201', async () => {
    const fresh = createMemState();
    const res = await auth.handleRegisterAdmin(
      new Request('http://x/api/auth/register-admin', {
        method: 'POST',
        body: JSON.stringify({ name: 'Root', email: 'Root@Example.COM', password: '12345678' }),
      }),
      fresh.store,
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBeTypeOf('string');
    expect(body.message).toBe('Admin account created');
    const created = await fresh.store.findUserByEmail('root@example.com');
    expect(created).not.toBeNull();
    expect(created!.role).toBe('admin');
    expect(created!.user_type).toBe('internal');
    expect(created!.company_id).toBeNull();
    expect(created!.supplier_id).toBeNull();
    expect(Boolean(created!.is_active)).toBe(true);
    expect(created!.password_hash?.startsWith('pbkdf2$100000$')).toBe(true);
  });

  test('duplicate email -> 409 (non-admin holder, zero admins)', async () => {
    const fresh = createMemState();
    fresh.users.push({
      id: 'u-customer-dup',
      name: 'Existing Customer',
      email: 'dup@x.com',
      password_hash: await auth.hashPassword('12345678'),
      user_type: 'customer',
      role: 'customer_user',
      company_id: 'comp-X',
      supplier_id: null,
      is_active: 1,
    });
    const res = await auth.handleRegisterAdmin(
      new Request('http://x/api/auth/register-admin', {
        method: 'POST',
        body: JSON.stringify({ name: 'B', email: 'DUP@X.COM', password: '12345678' }),
      }),
      fresh.store,
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('Email already in use');
  });

  test('validation errors -> 422', async () => {
    const fresh = createMemState();
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ email: 'a@x.com', password: '12345678' }, 'Name is required'],
      [{ name: 'X', email: 'not-an-email', password: '12345678' }, 'Valid email is required'],
      [{ name: 'X', email: 'a@x.com', password: 'short' }, 'Password must be at least 8 characters'],
    ];
    for (const [payload, expected] of cases) {
      const res = await auth.handleRegisterAdmin(
        new Request('http://x/api/auth/register-admin', {
          method: 'POST',
          body: JSON.stringify(payload),
        }),
        fresh.store,
      );
      expect(res.status).toBe(422);
      expect((await res.json()).error).toBe(expected);
    }
    expect(fresh.users.length).toBe(0);
  });
});

describe('RBAC + tenant isolation helpers', () => {
  test('user-type classifiers', () => {
    expect(auth.isInternalUser(admin)).toBe(true);
    expect(auth.isCustomerUser(custAdminA)).toBe(true);
    expect(auth.isSupplierUser(supplier1)).toBe(true);
  });

  test('canManageUser matrix', () => {
    expect(auth.canManageUser(admin, custUserB)).toBe(true);
    expect(auth.canManageUser(custAdminA, custUserB)).toBe(false);
    expect(auth.canManageUser(custUserB, custUserB)).toBe(true);
    expect(auth.canManageUser(supplier1, custUserB)).toBe(false);
    expect(auth.canManageUser(supplier1, supplierPending)).toBe(false);
    expect(auth.canManageUser(admin, admin)).toBe(true);
  });

  test('customer admin can manage same-company peers', () => {
    const peer = { ...custUserB, company_id: 'comp-A', id: 'u-ca-peer' };
    expect(auth.canManageUser(custAdminA, peer)).toBe(true);
  });

  test('ownsCompanyTenant (cross-tenant safe 404 semantics)', () => {
    expect(auth.ownsCompanyTenant(custAdminA, 'comp-A')).toBe(true);
    expect(auth.ownsCompanyTenant(custAdminA, 'comp-B')).toBe(false);
    expect(auth.ownsCompanyTenant(admin, 'comp-Z')).toBe(true);
    expect(auth.ownsCompanyTenant(supplier1, 'comp-A')).toBe(false);
    expect(auth.ownsCompanyTenant(custAdminA, null)).toBe(false);
  });

  test('ownsSupplierTenant', () => {
    expect(auth.ownsSupplierTenant(supplier1, 'sup-1')).toBe(true);
    expect(auth.ownsSupplierTenant(supplier1, 'sup-2')).toBe(false);
    expect(auth.ownsSupplierTenant(admin, 'sup-anything')).toBe(true);
    expect(auth.ownsSupplierTenant(custUserB, 'sup-1')).toBe(false);
  });

  test('supplier status gate matches legacy requireSupplier', () => {
    expect(auth.supplierStatusGate('active')).toEqual({ ok: true, reason: 'active' });
    expect(auth.supplierStatusGate('suspended')).toEqual({ ok: false, reason: 'inactive' });
    expect(auth.supplierStatusGate('terminated')).toEqual({ ok: false, reason: 'inactive' });
    expect(auth.supplierStatusGate('pending')).toEqual({ ok: false, reason: 'pending' });
    expect(auth.supplierStatusGate('under_review')).toEqual({ ok: false, reason: 'pending' });
  });
});

describe('safeUserInfo / route dispatch', () => {
  test('safeUserInfo exposes exactly the SafeUser keys, no secrets', () => {
    const info = auth.safeUserInfo(admin);
    expect(Object.keys(info).sort()).toEqual([
      'companyId',
      'email',
      'id',
      'isActive',
      'name',
      'role',
      'supplierId',
      'userType',
    ]);
    const json = JSON.stringify(info);
    expect(json).not.toContain('password_hash');
    expect(json).not.toContain('token');
    expect(info.isActive).toBe(true);
  });

  test('route dispatch', async () => {
    const get404 = await auth.route(new Request('http://x/api/auth/nope'), 'GET', state.store);
    expect(get404.status).toBe(404);
    const post404 = await auth.route(new Request('http://x/api/auth/nope', { method: 'POST' }), 'POST', state.store);
    expect(post404.status).toBe(404);
    const methodNotAllowed = await auth.route(new Request('http://x/api/auth/login', { method: 'PUT' }), 'PUT', state.store);
    expect(methodNotAllowed.status).toBe(405);
    expect(methodNotAllowed.headers.get('allow')).toBe('GET, POST');
    const trailingSlash = await auth.route(new Request('http://x/api/auth/login/', { method: 'POST' }), 'POST', state.store);
    expect([200, 400, 401, 422, 429]).toContain(trailingSlash.status);
  });

  test('rate limit key is per (ip,email) and deterministic', async () => {
    const k1 = await auth.rateLimitKey('1.2.3.4', 'a@x.com');
    const k2 = await auth.rateLimitKey('1.2.3.4', 'a@x.com');
    const k3 = await auth.rateLimitKey('1.2.3.4', 'b@x.com');
    const k4 = await auth.rateLimitKey(null, 'a@x.com');
    expect(k1).toBe(k2);
    expect(k1).not.toBe(k3);
    expect(k1).not.toBe(k4);
    expect(k1).toMatch(/^[0-9a-f]{64}$/);
  });

  test('clientIp prefers first x-forwarded-for address', () => {
    const req = new Request('http://x/api/auth/login', { headers: { 'x-forwarded-for': '9.9.9.9, 8.8.8.8' } });
    expect(auth.clientIp(req)).toBe('9.9.9.9');
    expect(auth.clientIp(new Request('http://x/'))).toBeNull();
  });
});