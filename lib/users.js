// Client users: one record per email. A user belongs to one company.
import { createHash } from 'node:crypto';
import { emailDomain, isPersonalDomain, newToken, slugify } from './companies.js';
import { getCompanies, readJSON, saveCompanies, writeJSON } from './store.js';

const userPath = (email) => `users/${createHash('sha256').update(email).digest('hex').slice(0, 32)}.json`;

export const getUser = (email) => readJSON(userPath(email));

// Joins the company that owns the email domain, or creates a new company.
export async function registerUser({ email, first, last, companyName }) {
  const existing = await getUser(email);
  if (existing) return existing;
  const companies = await getCompanies();
  const domain = emailDomain(email);
  let company = !isPersonalDomain(domain) && companies.find((c) => (c.domains || []).includes(domain));
  if (!company) {
    company = {
      slug: slugify(companyName, companies.map((c) => c.slug)), name: String(companyName).trim().slice(0, 100),
      token: newToken(), keyterms: [], domains: isPersonalDomain(domain) ? [] : [domain],
      createdAt: new Date().toISOString(), selfRegistered: true,
    };
    await saveCompanies([...companies, company]);
  }
  const user = {
    email, first: String(first).trim().slice(0, 60), last: String(last).trim().slice(0, 60),
    company: company.slug, createdAt: new Date().toISOString(),
  };
  await writeJSON(userPath(email), user);
  await addContact(company.slug, user);
  return user;
}

// Keep a light contact list on the company so admins can see who's involved and email them.
async function addContact(slug, user) {
  const companies = await getCompanies();
  const c = companies.find((x) => x.slug === slug);
  if (!c) return;
  c.contacts = [...(c.contacts || []).filter((x) => x.email !== user.email), { email: user.email, first: user.first, last: user.last }];
  await saveCompanies(companies);
}

export async function companyContacts(slug) {
  return ((await getCompanies()).find((c) => c.slug === slug)?.contacts || []).map((c) => c.email);
}
