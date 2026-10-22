import { createHmac, timingSafeEqual } from 'node:crypto';
import { ADMIN_PASSWORD, APP_SECRET } from './config.js';

export function hmac(value, purpose) {
  return createHmac('sha256', `${APP_SECRET}|${ADMIN_PASSWORD}|${purpose}`).update(value).digest('hex');
}

export function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

// Shared secret AssemblyAI sends back on every webhook call.
export function webhookSecret() {
  return hmac('assemblyai-webhook', 'webhook');
}
