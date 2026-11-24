import { guardAdmin } from '@/lib/auth.js';
import { getCompanies, saveCompanies } from '@/lib/store.js';
import { newToken, parseTerms } from '@/lib/companies.js';
import { normEmail, validEmail } from '@/lib/codes.js';
import { addClientContact, removeClientContact } from '@/lib/users.js';

export async function PATCH(request, { params }) {
  const denied = await guardAdmin(request);
  if (denied) return denied;
  const { slug } = await params;
  const { name, keyterms, newLink, addContact, removeContact } = await request.json().catch(() => ({}));
  // People: added without any email going out. Handled on their own so nothing else changes by accident.
  if (addContact || removeContact) {
    try {
      if (addContact) {
        const email = normEmail(addContact.email);
        if (!validEmail(email)) return Response.json({ error: 'Enter a valid email address.' }, { status: 400 });
        await addClientContact(slug, { email, first: addContact.first, last: addContact.last });
      } else {
        await removeClientContact(slug, normEmail(removeContact));
      }
      return Response.json({ company: (await getCompanies()).find((x) => x.slug === slug) || null });
    } catch (e) {
      return Response.json({ error: e.message }, { status: e.status || 500 });
    }
  }
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
