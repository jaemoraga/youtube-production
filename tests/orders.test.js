// Ordering: prices from the Help Center, discount codes, membership lookup, and the Stripe plumbing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { codeExpiry, codeProblem, itemsProblem, lineText, normCode, priceOrder, usd } from '../lib/pricing.js';
import { lookupTier } from '../lib/membership.js';
import { encode, verifyWebhook } from '../lib/stripe.js';

test('long form is $15,000 for Basic and $10,000 for Premium', () => {
  assert.equal(priceOrder({ long: 1 }, 'basic').total, 1500000);
  assert.equal(priceOrder({ long: 1 }, 'premium').total, 1000000);
  assert.equal(priceOrder({ long: 1 }, 'nonsense').tier, 'basic');
});

test('short form: tier price, minimum of 4, 20% off 8 or more', () => {
  assert.equal(priceOrder({ short: 4 }, 'basic').total, 1000000);
  assert.equal(priceOrder({ short: 4 }, 'premium').total, 800000);
  assert.match(itemsProblem({ short: 3 }), /minimum order of 4/);
  const eight = priceOrder({ short: 8 }, 'premium');
  assert.equal(eight.total, 1280000); // 8 x $2,000 less 20%
  assert.equal(eight.lines.find((l) => l.key === 'volume').amount, -320000);
  assert.equal(priceOrder({ short: 7 }, 'premium').lines.some((l) => l.key === 'volume'), false);
});

test('social clips are $500 and need a long form video', () => {
  assert.equal(priceOrder({ long: 1, clips: 2 }, 'premium').total, 1100000);
  assert.match(itemsProblem({ clips: 1 }), /add-on to a long form/);
  assert.match(itemsProblem({}), /at least one/);
  assert.match(itemsProblem({ long: 6 }), /custom quote/);
  assert.equal(itemsProblem({ long: 1, short: 4, clips: 1 }), null);
});

test('discount codes: percent and fixed, after the volume discount, never below zero', () => {
  const pct = priceOrder({ short: 8 }, 'premium', { code: 'TEN', kind: 'percent', value: 10 });
  assert.equal(pct.discount, 128000);
  assert.equal(pct.total, 1152000);
  assert.equal(priceOrder({ long: 1 }, 'premium', { code: 'K', kind: 'amount', value: 100000 }).total, 900000);
  assert.equal(priceOrder({ long: 1 }, 'premium', { code: 'BIG', kind: 'amount', value: 99999999 }).total, 0);
  assert.equal(priceOrder({ long: 1 }, 'premium', { code: 'FREE', kind: 'percent', value: 100 }).total, 0);
  const sum = pct.lines.reduce((s, l) => s + l.amount, 0);
  assert.equal(sum, pct.total); // the invoice lines always add up to the total
});

test('a code stops working when switched off, expired or used up', () => {
  const d = { code: 'X', active: true, kind: 'percent', value: 10, expiresOn: '2026-12-31', maxUses: 2, uses: 1 };
  const during = Date.parse('2026-12-31T23:00:00-08:00'); // 11pm Pacific on the last day
  const after = Date.parse('2027-01-01T00:30:00-08:00');
  assert.equal(codeProblem(d, during), null);
  assert.match(codeProblem(d, after), /expired/);
  assert.match(codeProblem({ ...d, uses: 2 }, during), /already been used/);
  assert.match(codeProblem({ ...d, active: false }, during), /not valid/);
  assert.match(codeProblem(null, during), /not valid/);
  assert.equal(codeProblem({ ...d, expiresOn: null, maxUses: null }, after), null);
  assert.equal(codeExpiry(null), null);
  assert.equal(normCode(' launch-20! '), 'LAUNCH-20');
});

test('money and invoice line text', () => {
  assert.equal(usd(1500000), '$15,000');
  assert.equal(usd(-320050), '-$3,200.50');
  assert.equal(lineText({ qty: 8, label: 'Short form video', unit: 200000 }), '8 x Short form video ($2,000 each)');
  assert.equal(lineText({ label: 'Discount code TEN (10% off)' }), 'Discount code TEN (10% off)');
});

// A fake HTR data server.
const htr = ({ users = [], companies = {}, plans = {} }) => {
  const calls = [];
  const call = async (name, args) => {
    calls.push([name, args]);
    if (name === 'htr_search_users') return { users: users.filter((u) => u.email.includes(args.query.toLowerCase()) && (!args.type || u.type === args.type)) };
    if (name === 'htr_get_user') return { user: { companies: companies[args.user_id] || [] } };
    if (name === 'htr_get_membership_plan') return plans[args.company_id];
    throw new Error(`unexpected ${name}`);
  };
  return { call, calls };
};
const plan = (over) => ({ company: { id: 9, name: 'Acme', stripe_id: 'cus_123' }, current_plan: { label: 'Startup 4.0', dashboard_name: 'Startup', is_basic: false }, active_deals: [], ...over });

test('membership: exact email match on a paid plan is Premium and carries the Stripe customer', async () => {
  const { call } = htr({ users: [{ id: 1, email: 'ann@acme.com', type: 'vendor' }], companies: { 1: [{ id: 9, name: 'Acme' }] }, plans: { 9: plan() } });
  assert.deepEqual(await lookupTier(call, 'ann@acme.com', 'Acme'), { tier: 'premium', source: 'htr', plan: 'Startup', htrCompanyId: 9, htrCompanyName: 'Acme', stripeId: 'cus_123', marketLeader: false });
});

test('membership: a colleague on the same domain counts; a look-alike domain does not', async () => {
  const world = { users: [{ id: 1, email: 'ann@acme.com', type: 'vendor' }, { id: 2, email: 'eve@notacme.com', type: 'vendor' }], companies: { 1: [{ id: 9, name: 'Acme' }], 2: [{ id: 7, name: 'Other' }] }, plans: { 9: plan(), 7: plan() } };
  assert.equal((await lookupTier(htr(world).call, 'bob@acme.com', 'Acme')).htrCompanyId, 9);
  // "@acme.com" is a substring of nothing at notacme.com, but "acme.com" would be: only true suffix matches count.
  assert.equal((await lookupTier(htr({ ...world, users: [world.users[1]] }).call, 'bob@acme.com', 'Acme')).source, 'no-match');
});

test('membership: basic plan, no HTR account, personal email, Market Leader', async () => {
  const basic = htr({ users: [{ id: 1, email: 'ann@acme.com', type: 'vendor' }], companies: { 1: [{ id: 9, name: 'Acme' }] }, plans: { 9: plan({ current_plan: { label: 'Basic', is_basic: true } }) } });
  assert.equal((await lookupTier(basic.call, 'ann@acme.com')).tier, 'basic');
  assert.deepEqual(await lookupTier(htr({}).call, 'new@startup.io'), { tier: 'basic', source: 'no-match' });
  const personal = htr({ users: [{ id: 3, email: 'someone@gmail.com', type: 'vendor' }], companies: { 3: [{ id: 9, name: 'Acme' }] }, plans: { 9: plan() } });
  assert.equal((await lookupTier(personal.call, 'me@gmail.com')).source, 'no-match');
  assert.equal(personal.calls.length, 1); // never searches a free-mail domain for "colleagues"
  const ml = htr({ users: [{ id: 1, email: 'ann@acme.com', type: 'vendor' }], companies: { 1: [{ id: 9, name: 'Acme' }] }, plans: { 9: plan({ current_plan: { label: "Market Leader 4.0 ('25)", dashboard_name: 'Market Leader', is_basic: false } }) } });
  assert.equal((await lookupTier(ml.call, 'ann@acme.com')).marketLeader, true);
});

test('membership: a failing data server throws, so the order waits for HTR instead of guessing', async () => {
  await assert.rejects(lookupTier(async () => { throw new Error('down'); }, 'ann@acme.com'), /down/);
});

test('Stripe form encoding nests objects and arrays', () => {
  assert.equal(encode({ customer: 'cus_1', metadata: { order: 'abc' }, custom_fields: [{ name: 'PO number', value: '77' }], skip: null }).toString(),
    'customer=cus_1&metadata%5Border%5D=abc&custom_fields%5B0%5D%5Bname%5D=PO+number&custom_fields%5B0%5D%5Bvalue%5D=77');
});

test('Stripe webhook: accepts a correctly signed, recent event and nothing else', () => {
  const secret = 'whsec_test', body = JSON.stringify({ type: 'invoice.paid', data: { object: { id: 'in_1' } } });
  const now = 1795000000000, t = Math.floor(now / 1000);
  const sig = (b, s = secret, at = t) => `t=${at},v1=${createHmac('sha256', s).update(`${at}.${b}`).digest('hex')}`;
  assert.equal(verifyWebhook(body, sig(body), secret, now).type, 'invoice.paid');
  assert.equal(verifyWebhook(body, sig(body, 'whsec_other'), secret, now), null);
  assert.equal(verifyWebhook(`${body} `, sig(body), secret, now), null); // body changed after signing
  assert.equal(verifyWebhook(body, sig(body, secret, t - 3600), secret, now), null); // replayed an hour later
  assert.equal(verifyWebhook(body, sig(body), '', now), null); // no secret configured: reject everything
  assert.equal(verifyWebhook(body, '', secret, now), null);
});
