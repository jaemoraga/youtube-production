// One signed cookie per browser, carrying the role: admin | client | editor.
// Format: base64url(JSON {r, e, c, x}) + "." + HMAC. Expires after SESSION_DAYS.
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_DAYS } from './config.js';
import { hmac, safeEqual } from './secrets.js';

const COOKIE = 'htr_session';

export function encodeSession(data) {
  const body = Buffer.from(JSON.stringify(data)).toString('base64url');
  return `${body}.${hmac(body, 'session-v2')}`;
}

export function decodeSession(raw) {
  const [body, sig] = String(raw || '').split('.');
  if (!body || !sig || !safeEqual(sig, hmac(body, 'session-v2'))) return null;
  try {
    const s = JSON.parse(Buffer.from(body, 'base64url').toString());
    return s.x > Date.now() ? s : null;
  } catch { return null; }
}

export async function getSession() {
  if (!process.env.APP_SECRET) return null;
  return decodeSession((await cookies()).get(COOKIE)?.value);
}

// role: 'admin' | 'client' | 'editor'; email for admin/client; company slug for clients.
export async function startSession({ role, email = null, company = null }) {
  const x = Date.now() + SESSION_DAYS * 86400e3;
  (await cookies()).set(COOKIE, encodeSession({ r: role, e: email, c: company, x }), {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax',
    path: '/', maxAge: SESSION_DAYS * 86400,
  });
}

export async function endSession() {
  const jar = await cookies();
  jar.delete(COOKIE);
  jar.delete('htr_transcribe'); // old admin cookie
}

const LOGIN = { admin: '/login', client: '/portal/login', editor: '/editor/login' };

// For pages. Admins may open editor pages too.
export async function requirePage(role) {
  const s = await getSession();
  if (s && (s.r === role || (role === 'editor' && s.r === 'admin'))) return s;
  redirect(LOGIN[role]);
}

// For API routes: returns [session, null] or [null, errorResponse].
// Changes (non-GET) also need the x-htr header, which a cross-site form or link can't add.
export async function guard(request, roles) {
  const s = await getSession();
  if (!s || !roles.includes(s.r)) return [null, Response.json({ error: 'Not signed in' }, { status: 401 })];
  if (request.method !== 'GET' && request.headers.get('x-htr') !== '1') {
    return [null, Response.json({ error: 'Missing header' }, { status: 400 })];
  }
  return [s, null];
}
