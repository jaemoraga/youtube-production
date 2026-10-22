import { guardAdmin } from '@/lib/auth.js';
import { newToken, parseTerms } from '@/lib/companies.js';
import { getCompanies, saveCompanies } from '@/lib/store.js';

export async function GET(request) {
  const denied = await guardAdmin(request);
  if (denied) return denied;
  return Response.json({ companies: await getCompanies() });
}

export async function POST(request) {
  const denied = await guardAdmin(request);
  if (denied) return denied;
  const { name, keyterms } = await request.json().catch(() => ({}));
  const clean = String(name || '').trim().slice(0, 100);
  if (!clean) return Response.json({ error: 'Company name is required.' }, { status: 400 });
  const companies = await getCompanies();
  const base = clean.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'company';
  let slug = base;
  for (let i = 2; companies.some((c) => c.slug === slug) || slug === 'internal'; i++) slug = `${base}-${i}`;
  const company = { slug, name: clean, token: newToken(), keyterms: parseTerms(keyterms), createdAt: new Date().toISOString() };
  await saveCompanies([...companies, company]);
  return Response.json({ company });
}
