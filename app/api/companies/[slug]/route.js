import { guardAdmin } from '@/lib/auth.js';
import { getCompanies, saveCompanies } from '@/lib/store.js';
import { newToken, parseTerms } from '@/lib/companies.js';

export async function PATCH(request, { params }) {
  const denied = await guardAdmin(request);
  if (denied) return denied;
  const { slug } = await params;
  const { name, keyterms, newLink } = await request.json().catch(() => ({}));
  const companies = await getCompanies();
  const c = companies.find((x) => x.slug === slug);
  if (!c) return Response.json({ error: 'Not found' }, { status: 404 });
  if (name !== undefined && String(name).trim()) c.name = String(name).trim().slice(0, 100);
  if (keyterms !== undefined) c.keyterms = parseTerms(keyterms);
  if (newLink) c.token = newToken(); // the old link stops working immediately
  await saveCompanies(companies);
  return Response.json({ company: c });
}

export async function DELETE(request, { params }) {
  const denied = await guardAdmin(request);
  if (denied) return denied;
  const { slug } = await params;
  await saveCompanies((await getCompanies()).filter((c) => c.slug !== slug));
  return Response.json({ ok: true });
}
