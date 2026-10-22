import { randomBytes } from 'node:crypto';

export const parseTerms = (raw) =>
  (Array.isArray(raw) ? raw : String(raw || '').split(/[,\n]/)).map((s) => String(s).trim()).filter(Boolean).slice(0, 200);

// 24-character random token; the private upload link is /u/<token>.
export const newToken = () => randomBytes(18).toString('base64url');

export function slugify(name, taken = []) {
  const base = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'company';
  let slug = base;
  for (let i = 2; taken.includes(slug) || slug === 'internal'; i++) slug = `${base}-${i}`;
  return slug;
}

// Free-mail domains never identify a company.
const PERSONAL = new Set(['gmail.com', 'googlemail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'live.com',
  'icloud.com', 'me.com', 'aol.com', 'proton.me', 'protonmail.com', 'gmx.com', 'msn.com']);
export const emailDomain = (email) => email.split('@')[1] || '';
export const isPersonalDomain = (d) => PERSONAL.has(d);
