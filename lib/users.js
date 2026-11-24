// Client users: one record per email. A user belongs to one company.
import { createHash } from 'node:crypto';
import { emailDomain, isPersonalDomain, newToken, slugify } from './companies.js';
import { getCompanies, readJSON, remove, saveCompanies, writeJSON } from './store.js';

const userPath = (email) => `users/${createHash('sha256').update(email).digest('hex').slice(0, 32)}.json`;

export const getUser = (email) => readJSON(userPath(email));

// Remember the last sign-in so admins can see who is active.
export async function touchLogin(user) {
  await writeJSON(userPath(user.email), { ...user, lastLoginAt: new Date().toISOString() }).catch(() => null);
}

// A user whose company still exists. If an admin removed the company, the person signs up again.
export async function getMember(email) {
  const u = await getUser(email);
  if (!u) return null;
  return (await getCompanies()).some((c) => c.slug === u.company) ? u : null;
}

// Joins the company that owns the email domain, or creates a new company.
export async function registerUser({ email, first, last, companyName }) {
  const existing = await getMember(email);
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

// HTR adds a person to a company by hand. No email is sent. The person can then sign in with this
// address (email code) and lands in the company's projects; colleagues on the same domain join them.
export async function addClientContact(slug, { email, first, last }) {
  const companies = await getCompanies();
  const company = companies.find((c) => c.slug === slug);
  if (!company) throw Object.assign(new Error('Company not found.'), { status: 404 });
  const existing = await getMember(email);
  if (existing && existing.company !== slug) {
    const other = companies.find((c) => c.slug === existing.company)?.name || existing.company;
    throw Object.assign(new Error(`${email} already has an account under ${other}.`), { status: 409 });
  }
  const domain = emailDomain(email);
  if (!isPersonalDomain(domain)) {
    const owner = companies.find((c) => c.slug !== slug && (c.domains || []).includes(domain));
    if (owner) throw Object.assign(new Error(`People at ${domain} already sign in to ${owner.name}. Add this person there instead.`), { status: 409 });
    if (!(company.domains || []).includes(domain)) {
      company.domains = [...(company.domains || []), domain];
      await saveCompanies(companies);
    }
  }
  const user = existing || {
    email, first: String(first || '').trim().slice(0, 60), last: String(last || '').trim().slice(0, 60),
    company: slug, createdAt: new Date().toISOString(), addedByAdmin: true,
  };
  if (!existing) await writeJSON(userPath(email), user);
  await addContact(slug, user);
  return user;
}

// Undo for a mistyped address: only for people HTR added who have never signed in.
export async function removeClientContact(slug, email) {
  const u = await getUser(email);
  if (u && u.company === slug && (!u.addedByAdmin || u.lastLoginAt)) throw Object.assign(new Error('This person has signed in, so they cannot be removed here.'), { status: 409 });
  const companies = await getCompanies();
  const c = companies.find((x) => x.slug === slug);
  if (!c) throw Object.assign(new Error('Company not found.'), { status: 404 });
  c.contacts = (c.contacts || []).filter((x) => x.email !== email);
  await saveCompanies(companies);
  if (u && u.company === slug) await remove(userPath(email));
}
