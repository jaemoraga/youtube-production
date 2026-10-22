// 6-digit sign-in codes: valid 10 minutes, 5 wrong tries, at most 5 codes per email per hour.
import { createHash, randomInt } from 'node:crypto';
import { hmac, safeEqual } from './secrets.js';
import { readJSON, remove, writeJSON } from './store.js';

export const normEmail = (e) => String(e || '').trim().toLowerCase();
export const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 200;
const key = (email) => `codes/${createHash('sha256').update(email).digest('hex').slice(0, 32)}.json`;

export async function issueCode(email, meta = null) {
  const prev = (await readJSON(key(email))) || { sends: [] };
  const sends = (prev.sends || []).filter((t) => Date.now() - t < 3600e3);
  if (sends.length >= 5) throw Object.assign(new Error('Too many codes requested. Try again in an hour.'), { status: 429 });
  const code = String(randomInt(0, 1e6)).padStart(6, '0');
  await writeJSON(key(email), { h: hmac(`${email}|${code}`, 'code'), exp: Date.now() + 10 * 60e3, tries: 0, sends: [...sends, Date.now()], meta });
  return code;
}

// Returns { result: 'ok'|'wrong'|'expired'|'locked', meta } — meta is whatever issueCode stored.
export async function checkCode(email, code) {
  const rec = await readJSON(key(email));
  if (!rec || !rec.h || rec.exp < Date.now()) return { result: 'expired' };
  if (rec.tries >= 5) return { result: 'locked' };
  if (!safeEqual(rec.h, hmac(`${email}|${String(code).trim()}`, 'code'))) {
    await writeJSON(key(email), { ...rec, tries: rec.tries + 1 });
    return { result: 'wrong' };
  }
  await writeJSON(key(email), { sends: rec.sends }); // code can't be reused
  return { result: 'ok', meta: rec.meta || null };
}

export const forgetCodes = (email) => remove(key(email));
