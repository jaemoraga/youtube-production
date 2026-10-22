import { randomBytes } from 'node:crypto';

export const parseTerms = (raw) =>
  (Array.isArray(raw) ? raw : String(raw || '').split(/[,\n]/)).map((s) => String(s).trim()).filter(Boolean).slice(0, 200);

// 24-character random token; the private upload link is /u/<token>.
export const newToken = () => randomBytes(18).toString('base64url');
