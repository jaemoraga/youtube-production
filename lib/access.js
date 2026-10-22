import { getSession } from './session.js';
import { companyByToken, getCompanies } from './store.js';

export const INTERNAL = { slug: 'internal', name: 'Hotel Tech Report (internal)', keyterms: [] };

// Who may upload into a company's folder?
//  - a client holding that company's private link token (older upload links)
//  - a signed-in client of that company
//  - the signed-in admin, for any company (or "internal")
export async function companyForUpload({ token, slug }) {
  if (token) return companyByToken(token);
  const s = await getSession();
  if (s?.r === 'client' && s.c === slug) return (await getCompanies()).find((c) => c.slug === slug) || null;
  if (s?.r !== 'admin') return null;
  if (slug === INTERNAL.slug) return INTERNAL;
  return (await getCompanies()).find((c) => c.slug === slug) || null;
}

export function slugFromPath(pathname) {
  const m = /^uploads\/([a-z0-9-]+)\/[^/]+$/.exec(pathname || '');
  return m ? m[1] : null;
}

// assets/<company>/<projectId>/<file>
export function assetPathParts(pathname) {
  const m = /^assets\/([a-z0-9-]+)\/([a-z0-9]{8,32})\/[^/]+$/.exec(pathname || '');
  return m ? { slug: m[1], projectId: m[2] } : null;
}
