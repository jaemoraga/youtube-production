import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ADMIN_PASSWORD } from './config.js';
import { hmac, safeEqual } from './secrets.js';

export { safeEqual, webhookSecret } from './secrets.js';

const COOKIE = 'htr_transcribe';
const DAYS = 30;

export function checkPassword(pw) {
  return ADMIN_PASSWORD.length >= 12 && safeEqual(pw, ADMIN_PASSWORD);
}

export async function startSession() {
  const exp = Date.now() + DAYS * 86400e3;
  (await cookies()).set(COOKIE, `${exp}.${hmac(String(exp), 'session')}`, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax',
    path: '/', maxAge: DAYS * 86400,
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

export async function isAdmin() {
  if (!process.env.APP_SECRET || !ADMIN_PASSWORD) return false;
  const raw = (await cookies()).get(COOKIE)?.value || '';
  const [exp, sig] = raw.split('.');
  return Number(exp) > Date.now() && !!sig && safeEqual(sig, hmac(exp, 'session'));
}

// For pages: send to /login when not signed in.
export async function requireAdminPage() {
  if (!(await isAdmin())) redirect('/login');
}

// For API routes: returns a Response to send back, or null when allowed.
// Mutations also need the x-htr header, which a cross-site form or link can't add.
export async function guardAdmin(request) {
  if (!(await isAdmin())) return Response.json({ error: 'Not signed in' }, { status: 401 });
  if (request.method !== 'GET' && request.headers.get('x-htr') !== '1') {
    return Response.json({ error: 'Missing header' }, { status: 400 });
  }
  return null;
}
