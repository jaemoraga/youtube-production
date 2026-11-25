// Is this buyer's company a Premium member of Hotel Tech Report? Decides which price they see.
// The email is already verified by a sign-in code, so we match on it:
//   1. the HTR user with exactly that email, else a vendor colleague on the same email domain
//   2. that user's company -> its membership plan
// Returns { tier: 'basic' | 'premium' | null, source, plan, htrCompanyId, htrCompanyName, stripeId, marketLeader }.
//   source 'htr'         found the company; tier is its real plan
//   source 'no-match'    nobody at HTR with that email or domain: Basic pricing
//   source 'unavailable' the HTR connection is off or failed: tier null, the order waits for HTR
import { emailDomain, isPersonalDomain } from './companies.js';

const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

export async function lookupTier(call, email, companyName = '') {
  const domain = emailDomain(email);
  const found = await call('htr_search_users', { query: email, per_page: 10 });
  let candidates = (found?.users || []).filter((u) => same(u.email, email));
  if (!candidates.length && domain && !isPersonalDomain(domain)) {
    const peers = await call('htr_search_users', { query: `@${domain}`, type: 'vendor', per_page: 20 });
    candidates = (peers?.users || []).filter((u) => String(u.email || '').toLowerCase().endsWith(`@${domain}`)).slice(0, 3);
  }
  let company = null;
  for (const u of candidates) {
    const companies = (await call('htr_get_user', { user_id: u.id }))?.user?.companies || [];
    company = companies.find((c) => same(c.name, companyName)) || companies[0] || null;
    if (company) break;
  }
  if (!company) return { tier: 'basic', source: 'no-match' };
  const m = await call('htr_get_membership_plan', { company_id: company.id });
  const plan = m?.current_plan;
  if (!plan) throw new Error('The HTR data server returned no membership plan.');
  const names = [plan.label, plan.dashboard_name, ...(m.active_deals || []).flatMap((d) => (d.all_plans || []).map((p) => p.name))];
  return {
    tier: plan.is_basic ? 'basic' : 'premium', source: 'htr', plan: plan.dashboard_name || plan.label || null,
    htrCompanyId: company.id, htrCompanyName: m.company?.name || company.name, stripeId: m.company?.stripe_id || null,
    marketLeader: names.some((n) => /market\s*leader/i.test(String(n || ''))),
  };
}
