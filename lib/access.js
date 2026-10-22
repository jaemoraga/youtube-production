import { isAdmin } from './auth.js';
import { companyByToken, getCompanies } from './store.js';

export const INTERNAL = { slug: 'internal', name: 'Hotel Tech Report (internal)', keyterms: [] };

// Who may upload into uploads/<slug>/... ?
//  - a client holding that company's private link token
//  - the signed-in admin, for any company (or "internal")
export async function companyForUpload({ token, slug }) {
  if (token) return companyByToken(token);
  if (!(await isAdmin())) return null;
  if (slug === INTERNAL.slug) return INTERNAL;
  return (await getCompanies()).find((c) => c.slug === slug) || null;
}

export function slugFromPath(pathname) {
  const m = /^uploads\/([a-z0-9-]+)\/[^/]+$/.exec(pathname || '');
  return m ? m[1] : null;
}
