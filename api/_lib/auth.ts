import { createHmac, timingSafeEqual } from 'node:crypto';
import { handleAuthProxyRequest } from '@neondatabase/auth/server';
import { db } from './db.js';
import { HttpError } from './http.js';

export interface Admin {
  id: string;
  auth_user_id: string | null;
  email: string;
  name: string;
  affiliation: string | null;
  role: 'admin' | 'superadmin';
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  approved_at: string | null;
  approved_by: string | null;
}

export interface Identity {
  // Signed-in Neon Auth (Google) user, if any
  authUser: { id: string; email: string; name: string | null } | null;
  // Matching admins row (may be pending or rejected), if any
  admin: Admin | null;
}

export function authConfig() {
  const baseUrl = process.env.NEON_AUTH_BASE_URL;
  const cookieSecret = process.env.NEON_AUTH_COOKIE_SECRET;
  if (!baseUrl || !cookieSecret) throw new Error('NEON_AUTH_BASE_URL / NEON_AUTH_COOKIE_SECRET are not set');
  return { baseUrl, cookieSecret };
}

// Proxies a browser auth request (sign-in, OAuth callback, get-session, sign-out)
// to Neon Auth so its cookies are first-party on this origin.
export function proxyAuth(request: Request, path: string): Promise<Response> {
  const { baseUrl, cookieSecret } = authConfig();
  return handleAuthProxyRequest({ request, path, baseUrl, cookieSecret, sameSite: 'lax' });
}

// ---------- Superadmin password session ----------

const ADMIN_COOKIE = 'pa_superadmin';
const ADMIN_COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

// Key depends on the password itself, so changing SUPERADMIN_PASSWORD signs everyone out.
function cookieKey(): Buffer {
  const password = process.env.SUPERADMIN_PASSWORD;
  if (!password) throw new HttpError(503, 'Password login is not configured');
  return createHmac('sha256', authConfig().cookieSecret).update(password).digest();
}

function sign(payload: string): string {
  return createHmac('sha256', cookieKey()).update(payload).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function checkSuperadminPassword(password: string): boolean {
  const expected = process.env.SUPERADMIN_PASSWORD;
  if (!expected) throw new HttpError(503, 'Password login is not configured');
  const a = createHmac('sha256', 'pw').update(password).digest();
  const b = createHmac('sha256', 'pw').update(expected).digest();
  return timingSafeEqual(a, b);
}

export function superadminCookie(secure: boolean): string {
  const expires = Date.now() + ADMIN_COOKIE_MAX_AGE * 1000;
  const payload = `superadmin.${expires}`;
  return `${ADMIN_COOKIE}=${payload}.${sign(payload)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${ADMIN_COOKIE_MAX_AGE}${secure ? '; Secure' : ''}`;
}

export function clearSuperadminCookie(secure: boolean): string {
  return `${ADMIN_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie') ?? '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

function hasSuperadminCookie(request: Request): boolean {
  const value = readCookie(request, ADMIN_COOKIE);
  if (!value || !process.env.SUPERADMIN_PASSWORD) return false;
  const [kind, expires, sig] = value.split('.');
  if (kind !== 'superadmin' || !expires || !sig) return false;
  if (!safeEqual(sig, sign(`${kind}.${expires}`))) return false;
  return Number(expires) > Date.now();
}

// ---------- Identity resolution ----------

async function getAuthUser(request: Request): Promise<Identity['authUser']> {
  if (!process.env.NEON_AUTH_BASE_URL) return null;
  const cookie = request.headers.get('cookie');
  if (!cookie) return null;
  const sessionRequest = new Request(new URL('/api/auth/get-session', request.url), {
    headers: { cookie, origin: new URL(request.url).origin },
  });
  try {
    const res = await proxyAuth(sessionRequest, 'get-session');
    if (!res.ok) return null;
    const data = (await res.json()) as { user?: { id?: string; email?: string; name?: string; emailVerified?: boolean } } | null;
    const user = data?.user;
    // Only trust verified emails (Google sign-in always verifies)
    if (!user?.id || !user.email || user.emailVerified === false) return null;
    return { id: user.id, email: user.email.toLowerCase(), name: user.name ?? null };
  } catch {
    return null;
  }
}

export async function getIdentity(request: Request): Promise<Identity> {
  const sql = db();
  if (hasSuperadminCookie(request)) {
    const [admin] = await sql`SELECT * FROM admins WHERE role = 'superadmin' ORDER BY created_at LIMIT 1`;
    return { authUser: null, admin: (admin as Admin) ?? null };
  }

  const authUser = await getAuthUser(request);
  if (!authUser) return { authUser: null, admin: null };

  let [admin] = await sql`SELECT * FROM admins WHERE auth_user_id = ${authUser.id}`;
  if (!admin) {
    // First sign-in for an admin row created by email (e.g. the seeded superadmin): link it
    [admin] = await sql`
      UPDATE admins SET auth_user_id = ${authUser.id}
      WHERE lower(email) = ${authUser.email} AND auth_user_id IS NULL
      RETURNING *`;
  }
  return { authUser, admin: (admin as Admin) ?? null };
}

export async function requireApprovedAdmin(request: Request): Promise<Admin> {
  const { admin } = await getIdentity(request);
  if (!admin) throw new HttpError(401, 'Not signed in');
  if (admin.status !== 'approved') throw new HttpError(403, 'Admin access is not approved');
  return admin;
}

export async function requireSuperadmin(request: Request): Promise<Admin> {
  const admin = await requireApprovedAdmin(request);
  if (admin.role !== 'superadmin') throw new HttpError(403, 'Superadmin only');
  return admin;
}
