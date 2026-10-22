// Admin helpers kept for the existing routes. Sessions live in session.js.
import { ADMIN_PASSWORD } from './config.js';
import { safeEqual } from './secrets.js';
import { getSession, guard, requirePage } from './session.js';

export { safeEqual, webhookSecret } from './secrets.js';
export { endSession, startSession } from './session.js';

export function checkPassword(pw) {
  return ADMIN_PASSWORD.length >= 12 && safeEqual(pw, ADMIN_PASSWORD);
}

export async function isAdmin() {
  return (await getSession())?.r === 'admin';
}

export async function requireAdminPage() {
  return requirePage('admin');
}

export async function guardAdmin(request) {
  const [, denied] = await guard(request, ['admin']);
  return denied;
}
