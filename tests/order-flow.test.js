// The whole order journey against a fake blob store, fake Stripe and fake HTR: place -> invoice -> paid -> project.
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

process.env.APP_SECRET = 'x'.repeat(32);
process.env.STRIPE_SECRET_KEY = 'sk_test_abc';
process.env.HTR_MCP_KEY = 'k';
process.env.RESEND_API_KEY = 're_x';

const blobs = new Map();
mock.module('@vercel/blob', {
  namedExports: {
    get: async (p) => (blobs.has(p) ? { statusCode: 200, stream: new Response(blobs.get(p)).body } : null),
    put: async (p, body) => { blobs.set(p, body); return { pathname: p }; },
    del: async (p) => { blobs.delete(p); },
    list: async ({ prefix }) => ({ blobs: [...blobs.keys()].filter((k) => k.startsWith(prefix)).map((pathname) => ({ pathname })), hasMore: false }),
    head: async () => null, issueSignedToken: async () => ({}), presignUrl: async () => ({}),
  },
});

// HTR: what lookupTier returns is set per test.
let membership = { tier: 'premium', source: 'htr', plan: 'Startup', htrCompanyId: 9, htrCompanyName: 'Acme', stripeId: 'cus_htr', marketLeader: false };
mock.module('../lib/membership.js', { namedExports: { lookupTier: async () => { if (membership instanceof Error) throw membership; return membership; } } });
mock.module('../lib/htr.js', { namedExports: { htrStatus: async () => ({ connected: true }), htrSession: async () => async () => ({}) } });

// Stripe + Resend over fetch.
const stripeCalls = [], emails = [];
let lastVersion = null;
const init_version = () => lastVersion;
let stripeFails = false;
const invoices = new Map();
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  if (u.startsWith('https://api.resend.com')) { emails.push(JSON.parse(init.body)); return json({ id: `em_${emails.length}` }); }
  if (!u.startsWith('https://api.stripe.com/v1/')) throw new Error(`unexpected fetch ${u}`);
  const path = u.slice('https://api.stripe.com/v1/'.length), form = Object.fromEntries(new URLSearchParams(init.body || ''));
  stripeCalls.push([init.method, path, form]);
  lastVersion = init.headers['stripe-version'];
  if (stripeFails) return json({ error: { message: 'card network down' } }, 500);
  if (path === 'customers/cus_htr') return json({ id: 'cus_htr', metadata: {} });
  if (path === 'customers/cus_new') return json({ id: 'cus_new', metadata: { app: 'youtube-studio' } });
  if (path.startsWith('customers?')) return json({ data: [{ id: 'cus_platform', metadata: {} }] });
  if (path === 'customers') return json({ id: 'cus_new' });
  if (path === 'invoices') { const inv = { id: `in_${invoices.size + 1}`, status: 'draft', total: 0, metadata: { order: form['metadata[order]'] } }; invoices.set(inv.id, inv); return json(inv); }
  if (path === 'invoiceitems') { invoices.get(form.invoice).total += Number(form.amount); return json({ id: 'ii' }); }
  const m = /^invoices\/(in_\d+)(?:\/(\w+))?$/.exec(path);
  const inv = m && invoices.get(m[1]);
  if (inv && m[2] === 'finalize') { Object.assign(inv, { status: inv.total === 0 ? 'paid' : 'open', number: `HTR-${m[1].slice(3)}`, hosted_invoice_url: `https://invoice.stripe.com/i/${m[1]}`, invoice_pdf: `https://pay.stripe.com/${m[1]}.pdf`, due_date: 1798000000 }); return json(inv); }
  if (inv && m[2] === 'send') { inv.sent = true; return json(inv); }
  if (inv && m[2] === 'void') { inv.status = 'void'; return json(inv); }
  if (inv && m[2] === 'pay') { inv.status = 'paid'; return json(inv); }
  if (inv) return json(inv);
  return json({ error: { message: `no route ${path}` } }, 404);
};

const { saveCompanies } = await import('../lib/store.js');
const O = await import('../lib/orders.js');
const D = await import('../lib/discounts.js');
const { listProjects } = await import('../lib/projects.js');

const user = { email: 'ann@acme.com', first: 'Ann', last: 'Lee', company: 'acme' };
const reset = async () => {
  blobs.clear(); stripeCalls.length = 0; emails.length = 0; invoices.clear(); stripeFails = false;
  membership = { tier: 'premium', source: 'htr', plan: 'Startup', htrCompanyId: 9, htrCompanyName: 'Acme', stripeId: 'cus_htr', marketLeader: false };
  await saveCompanies([{ slug: 'acme', name: 'Acme', domains: ['acme.com'], contacts: [] }]);
};
const to = (e) => e.to.join(',');

test('request an invoice: Premium price, its own Stripe customer, Stripe sends it, no project until paid', async () => {
  await reset();
  const o = await O.placeOrder({ user, items: { long: 1, clips: 1 }, mode: 'invoice', po: 'PO-7', billingEmail: 'ap@acme.com' });
  assert.equal(o.status, 'invoiced');
  assert.equal(o.total, 1050000);
  assert.equal(o.stripeCustomer, 'cus_new'); // never the customer the HTR platform bills, nor one found by email that isn't ours
  assert.equal(stripeCalls.every(([, , , ]) => true) && init_version(), '2024-06-20');
  const inv = invoices.get(o.invoice.id);
  assert.equal(inv.total, 1050000);
  assert.equal(inv.sent, true);
  const create = stripeCalls.find(([, p]) => p === 'invoices')[2];
  assert.equal(create.collection_method, 'send_invoice'); // never charges a saved card
  assert.equal(create.pending_invoice_items_behavior, 'exclude'); // never sweeps in the member's other pending charges
  assert.equal(create['custom_fields[0][value]'], 'PO-7');
  assert.equal((await listProjects({ company: 'acme' })).length, 0);
  assert.ok(emails.some((e) => to(e) === 'ann@acme.com,ap@acme.com' && e.text.includes(o.invoice.url)));
  assert.ok(emails.some((e) => /^New YouTube order: Acme \(\$10,500\)/.test(e.subject)));
  assert.equal(O.forClient(o).membership, undefined);
});

test('pay now: same invoice, Stripe does not email it; the paid webhook opens the project exactly once', async () => {
  await reset();
  const o = await O.placeOrder({ user, items: { long: 2 }, mode: 'pay', billingEmail: user.email });
  assert.equal(invoices.get(o.invoice.id).sent, undefined);
  const event = { id: o.invoice.id, number: o.invoice.number, metadata: { order: o.id } };
  assert.equal(await O.onInvoiceEvent('invoice.paid', event), 'paid');
  assert.equal(await O.onInvoiceEvent('invoice.paid', event), 'paid'); // Stripe retries webhooks
  const projects = await listProjects({ company: 'acme' });
  assert.deepEqual(projects.map((p) => p.name).sort(), ['Acme YouTube video', 'Acme YouTube video 2']);
  const paid = await O.getOrder(o.id);
  assert.equal(paid.status, 'paid');
  assert.equal(paid.projectIds.length, 2);
  assert.equal(emails.filter((e) => /^Payment received/.test(e.subject)).length, 1);
  assert.equal(emails.filter((e) => /^PAID:/.test(e.subject)).length, 1);
});

test('a webhook for someone else\'s invoice, or a mismatched one, changes nothing', async () => {
  await reset();
  const o = await O.placeOrder({ user, items: { long: 1 }, mode: 'pay', billingEmail: user.email });
  assert.equal(await O.onInvoiceEvent('invoice.paid', { id: 'in_999', metadata: { order: o.id } }), 'ignored');
  assert.equal(await O.onInvoiceEvent('invoice.paid', { id: 'in_5', metadata: {} }), 'ignored');
  assert.equal((await O.getOrder(o.id)).status, 'invoiced');
});

test('membership could not be checked: no invoice, order waits; HTR picks the price and sends', async () => {
  await reset();
  membership = new Error('HTR down');
  const o = await O.placeOrder({ user, items: { long: 1 }, mode: 'invoice', billingEmail: user.email });
  assert.equal(o.status, 'review');
  assert.equal(invoices.size, 0);
  assert.ok(emails.some((e) => /^YouTube order needs you/.test(e.subject)));
  const sent = await O.issueOrder(await O.getOrder(o.id), { tier: 'premium', by: 'jordan@hoteltechreport.com' });
  assert.equal(sent.status, 'invoiced');
  assert.equal(sent.total, 1000000);
  assert.equal(invoices.get(sent.invoice.id).total, 1000000);
  await assert.rejects(O.issueOrder(await O.getOrder(o.id), { tier: 'basic' }), /already has an invoice/);
});

test('Market Leader ordering a long form waits for HTR; short form only goes straight through', async () => {
  await reset();
  membership = { ...membership, plan: 'Market Leader', marketLeader: true };
  assert.equal((await O.placeOrder({ user, items: { long: 1 }, mode: 'pay', billingEmail: user.email })).status, 'review');
  assert.equal((await O.placeOrder({ user, items: { short: 4 }, mode: 'pay', billingEmail: user.email })).status, 'invoiced');
});

test('no HTR match is Basic pricing with a new Stripe customer', async () => {
  await reset();
  membership = { tier: 'basic', source: 'no-match' };
  const o = await O.placeOrder({ user, items: { long: 1 }, mode: 'invoice', billingEmail: user.email });
  assert.equal(o.total, 1500000);
  assert.equal(o.stripeCustomer, 'cus_new');
});

test('Stripe refusing leaves the order in review with the reason, and it can be retried', async () => {
  await reset();
  stripeFails = true;
  const o = await O.placeOrder({ user, items: { long: 1 }, mode: 'pay', billingEmail: user.email });
  assert.equal(o.status, 'review');
  assert.match(o.review.join(' '), /invoice could not be created: Stripe: card network down/);
  stripeFails = false;
  assert.equal((await O.issueOrder(await O.getOrder(o.id), { tier: 'premium' })).status, 'invoiced');
});

test('discount codes: applied, counted, limited, and a bad code blocks the order', async () => {
  await reset();
  await D.createDiscount({ code: 'launch20', kind: 'percent', value: 20, expiresOn: '2099-01-01', maxUses: 1 }, 'jordan');
  await assert.rejects(D.createDiscount({ code: 'LAUNCH20', kind: 'percent', value: 5 }), /already exists/);
  await assert.rejects(D.createDiscount({ code: 'X1', kind: 'percent', value: 5 }), /at least 3/);
  await assert.rejects(D.createDiscount({ code: 'OVER', kind: 'percent', value: 120 }), /more than 100/);
  const o = await O.placeOrder({ user, items: { long: 1 }, code: ' launch20 ', mode: 'pay', billingEmail: user.email });
  assert.equal(o.total, 800000);
  assert.equal(invoices.get(o.invoice.id).total, 800000);
  assert.equal((await D.listDiscounts())[0].uses, 1);
  await assert.rejects(O.placeOrder({ user, items: { long: 1 }, code: 'LAUNCH20', mode: 'pay', billingEmail: user.email }), /already been used/);
  await assert.rejects(O.placeOrder({ user, items: { long: 1 }, code: 'NOPE', mode: 'pay', billingEmail: user.email }), /not valid/);
  await assert.rejects(D.removeDiscount('LAUNCH20'), /only be switched off/);
  const fixed = await D.createDiscount({ code: 'TAKE1K', kind: 'amount', value: 1000 });
  assert.equal(fixed.value, 100000);
});

test('a 100% code: nothing to pay, project opens straight away', async () => {
  await reset();
  await D.createDiscount({ code: 'COMP', kind: 'percent', value: 100 });
  const o = await O.placeOrder({ user, items: { long: 1 }, code: 'COMP', mode: 'invoice', billingEmail: user.email });
  assert.equal(o.status, 'paid');
  assert.equal(o.total, 0);
  assert.equal((await listProjects({ company: 'acme' })).length, 1);
  assert.equal(invoices.get(o.invoice.id).sent, undefined); // a paid invoice is not "sent"
});

test('admin: mark paid outside Stripe opens the project; cancel voids the invoice; paid orders cannot be cancelled', async () => {
  await reset();
  const a = await O.placeOrder({ user, items: { long: 1 }, mode: 'invoice', billingEmail: user.email });
  const paid = await O.adminMarkPaid(a, 'jordan@hoteltechreport.com');
  assert.equal(paid.status, 'paid');
  assert.equal(invoices.get(a.invoice.id).status, 'paid');
  assert.equal((await listProjects({ company: 'acme' })).length, 1);
  await assert.rejects(O.cancelOrder(await O.getOrder(a.id), 'jordan'), /Refund it in Stripe/);
  const b = await O.placeOrder({ user, items: { short: 4 }, mode: 'invoice', billingEmail: user.email });
  assert.equal((await O.cancelOrder(b, 'jordan')).status, 'void');
  assert.equal(invoices.get(b.invoice.id).status, 'void');
  await assert.rejects(O.adminMarkPaid(await O.getOrder(b.id), 'jordan'), /cancelled/);
});

test('short form only: paid, no project, HTR told there is no workflow', async () => {
  await reset();
  const o = await O.placeOrder({ user, items: { short: 8 }, mode: 'pay', billingEmail: user.email });
  assert.equal(o.total, 1280000);
  await O.onInvoiceEvent('invoice.paid', { id: o.invoice.id, metadata: { order: o.id } });
  assert.equal((await listProjects({ company: 'acme' })).length, 0);
  assert.ok(emails.some((e) => /^PAID:/.test(e.subject) && e.text.includes('no production workflow')));
});

test('STRIPE_REUSE_HTR_CUSTOMER=true bills the member\'s existing HTR customer', async () => {
  await reset();
  process.env.STRIPE_REUSE_HTR_CUSTOMER = 'true';
  try {
    const o = await O.placeOrder({ user, items: { long: 1 }, mode: 'invoice', billingEmail: user.email });
    assert.equal(o.stripeCustomer, 'cus_htr');
  } finally { delete process.env.STRIPE_REUSE_HTR_CUSTOMER; }
});
