// An order = someone buying YouTube videos in the app. One JSON file each: orders/<id>.json.
//   review    waiting for HTR (membership could not be checked, a Market Leader's included video,
//             or Stripe is not connected / refused). HTR confirms the price and sends the invoice.
//   invoiced  a Stripe invoice is out; the buyer can pay it by card, ACH or bank transfer
//   paid      Stripe confirmed payment (or HTR marked it paid). The project is created here.
//   void      cancelled
import { randomBytes } from 'node:crypto';
import { adminAlert, siteUrl } from './alerts.js';
import { countUse, findDiscount, listDiscounts } from './discounts.js';
import { notify } from './email.js';
import { htrSession, htrStatus } from './htr.js';
import { lookupTier } from './membership.js';
import { cleanItems, itemsProblem, lineText, normCode, priceOrder, usd } from './pricing.js';
import { createProject, listProjects } from './projects.js';
import { ensureCustomer, getInvoice, issueInvoice, markPaidOutOfBand, stripeReady, voidInvoice } from './stripe.js';
import { getCompanies, listPaths, readJSON, saveCompanies, writeJSON } from './store.js';

const err = (message, status = 400) => Object.assign(new Error(message), { status });
const orderPath = (id) => `orders/${id}.json`;
const now = () => new Date().toISOString();
const DAY = 86400e3;

export async function getOrder(id) {
  if (!/^[a-f0-9]{16}$/.test(String(id))) return null;
  return readJSON(orderPath(id));
}
const saveOrder = (o) => writeJSON(orderPath(o.id), { ...o, updatedAt: now() });

export async function listOrders({ company } = {}) {
  const all = await Promise.all((await listPaths('orders/')).map((p) => readJSON(p).catch(() => null)));
  return all.filter((o) => o && (!company || o.company === company)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// What the buyer may see: no review reasons, no membership internals, no log.
export function forClient(o) {
  return {
    id: o.id, status: o.status, mode: o.mode, createdAt: o.createdAt, paidAt: o.paidAt || null,
    lines: o.lines, total: o.total, code: o.code || null, projectIds: o.projectIds || [],
    invoice: o.invoice ? { number: o.invoice.number, url: o.invoice.url, pdf: o.invoice.pdf, due: o.invoice.due } : null,
  };
}

// ---------- membership (which price) ----------
// Checked against Hotel Tech Report and remembered on the company for a day.
export async function companyTier(companySlug, email, { fresh = false } = {}) {
  const companies = await getCompanies();
  const company = companies.find((c) => c.slug === companySlug);
  if (!company) throw err('Company not found.', 404);
  const cached = company.membership;
  if (!fresh && cached?.tier && Date.now() - Date.parse(cached.at) < DAY) return cached;
  let m;
  try {
    if (!(await htrStatus()).connected) throw new Error('not connected');
    m = await lookupTier(await htrSession(), email, company.name);
  } catch (e) {
    console.error('membership lookup failed', e.message);
    return { tier: null, source: 'unavailable', error: e.message };
  }
  const fresh_ = (await getCompanies());
  const c = fresh_.find((x) => x.slug === companySlug);
  if (c) { c.membership = { ...m, at: now() }; await saveCompanies(fresh_); }
  return m;
}

// ---------- quoting and placing ----------
// Used by the order page to show the price, and by placeOrder. Never throws for a bad code: it returns codeProblem.
export async function quote({ company, email, items, code }) {
  const tier = await companyTier(company, email);
  const { discount, problem } = await findDiscount(code);
  const priced = priceOrder(items, tier.tier || 'basic', discount || null);
  return { tier, discount: discount || null, codeProblem: problem || null, priced };
}

const invoiceLines = (priced) => priced.lines.map((l) => ({ ...l, text: lineText(l) }));

// user { email, first, last, company }. mode 'pay' | 'invoice'.
export async function placeOrder({ user, items, code, mode, po, billingEmail }) {
  const problem = itemsProblem(items);
  if (problem) throw err(problem);
  const q = await quote({ company: user.company, email: user.email, items, code });
  if (normCode(code) && q.codeProblem) throw err(q.codeProblem);
  const company = (await getCompanies()).find((c) => c.slug === user.company);
  const review = [];
  if (q.tier.source === 'unavailable') review.push('Membership could not be checked with Hotel Tech Report, so the price is not confirmed.');
  if (q.tier.marketLeader && q.priced.items.long) review.push('This company is on the Market Leader plan, which includes one complimentary long form video.');
  if (!stripeReady()) review.push('Stripe is not connected, so no invoice could be created.');
  const order = {
    id: randomBytes(8).toString('hex'), company: user.company, companyName: company?.name || user.company,
    email: user.email, name: `${user.first || ''} ${user.last || ''}`.trim(), billingEmail: billingEmail || user.email,
    po: String(po || '').trim().slice(0, 30) || null, mode: mode === 'pay' ? 'pay' : 'invoice',
    items: q.priced.items, tier: q.priced.tier, membership: q.tier, code: q.discount?.code || null, discountRule: q.discount ? { kind: q.discount.kind, value: q.discount.value } : null,
    lines: invoiceLines(q.priced), subtotal: q.priced.subtotal, discount: q.priced.discount, total: q.priced.total,
    status: 'review', review, createdAt: now(), attempt: 1,
    log: [{ at: now(), type: 'placed', by: user.email }],
  };
  await saveOrder(order);
  if (order.code) await countUse(order.code).catch(() => null);
  if (!review.length) await issueOrder(order).catch(() => null); // on failure the order stays in review with the reason
  const saved = await getOrder(order.id);
  await adminAlert(saved.status === 'review'
    ? { subject: `YouTube order needs you: ${saved.companyName} (${usd(saved.total)})`, text: `${saved.name} (${saved.email}) at ${saved.companyName} placed an order, and it is waiting for you before an invoice goes out.\n\n${saved.review.map((r) => `- ${r}`).join('\n')}\n\n${summary(saved)}\n\nConfirm the price and send the invoice: ${siteUrl()}/admin/orders` }
    : { subject: `New YouTube order: ${saved.companyName} (${usd(saved.total)})`, text: `${saved.name} (${saved.email}) at ${saved.companyName} ${saved.mode === 'pay' ? 'chose to pay now' : 'requested an invoice'}.\n\n${summary(saved)}\nInvoice ${saved.invoice?.number || ''}: ${saved.invoice?.url || ''}\n\nThe project opens automatically when the invoice is paid.\n\n${siteUrl()}/admin/orders` });
  return saved;
}

const summary = (o) => `${o.lines.map((l) => `${l.text}: ${usd(l.amount)}`).join('\n')}\nTotal: ${usd(o.total)}\nPricing: ${o.tier === 'premium' ? 'Premium member' : 'Basic'}${o.membership?.plan ? ` (${o.membership.plan})` : ''}${o.po ? `\nPO number: ${o.po}` : ''}`;

const recipients = (o) => [...new Set([o.email, o.billingEmail].filter(Boolean))];

// Creates the Stripe invoice. tier (admin only) re-prices the order first.
export async function issueOrder(order, { tier = null, by = null } = {}) {
  if (!['review'].includes(order.status)) throw err('This order already has an invoice.', 409);
  if (tier) {
    const discount = order.code ? (await listDiscounts()).find((d) => d.code === order.code) || { code: order.code, ...order.discountRule } : null;
    const priced = priceOrder(order.items, tier, discount);
    Object.assign(order, { tier: priced.tier, lines: invoiceLines(priced), subtotal: priced.subtotal, discount: priced.discount, total: priced.total });
  }
  try {
    const companies = await getCompanies();
    const company = companies.find((c) => c.slug === order.company);
    const customer = await ensureCustomer({ tryIds: [company?.stripeCustomer, order.membership?.stripeId], email: order.billingEmail, name: order.companyName, company: order.company });
    if (company && company.stripeCustomer !== customer) { company.stripeCustomer = customer; await saveCompanies(companies); }
    const invoice = await issueInvoice(order, customer, { send: order.mode === 'invoice' });
    Object.assign(order, { status: 'invoiced', review: [], invoice, stripeCustomer: customer, invoicedAt: now() });
    order.log.push({ at: now(), type: 'invoiced', by, text: invoice.number });
    await saveOrder(order);
  } catch (e) {
    order.attempt = (order.attempt || 1) + 1;
    order.review = [...new Set([...(order.review || []).filter((r) => !r.startsWith('The invoice could not be created')), `The invoice could not be created: ${e.message}`])];
    order.log.push({ at: now(), type: 'invoice-failed', text: e.message });
    await saveOrder(order);
    throw e;
  }
  if (order.invoice.status === 'paid') return fulfillOrder(order, { via: 'nothing to pay' });
  await notify({
    to: recipients(order),
    subject: `Your Hotel Tech Report invoice${order.invoice.number ? ` ${order.invoice.number}` : ''}`,
    text: `Hi ${order.name.split(' ')[0] || 'there'},\n\nThanks for your order with the Hotel Tech Report YouTube Content Studio.\n\n${order.lines.map((l) => `${l.text}: ${usd(l.amount)}`).join('\n')}\nTotal: ${usd(order.total)}\n\nView and pay your invoice here (card, ACH or bank transfer):\n${order.invoice.url}\n\nYour project opens in the portal as soon as payment is received, and you can start your pre-production checklist right away.\n\nHotel Tech Report`,
  });
  return order;
}

// Payment confirmed: open one project per long form video and tell everyone. Safe to call twice.
export async function fulfillOrder(order, { via = 'Stripe', by = null } = {}) {
  const current = (await getOrder(order.id)) || order;
  if (current.status === 'paid') return current;
  Object.assign(current, { status: 'paid', paidAt: now(), paidVia: via, review: [] });
  current.log.push({ at: now(), type: 'paid', by, text: via });
  await saveOrder(current); // mark first, so a repeated webhook can't open the projects twice
  const existing = (await listProjects({ company: current.company })).length;
  const ids = [];
  for (let i = 0; i < (current.items.long || 0); i++) {
    const n = existing + i + 1;
    const p = await createProject(current.company, n > 1 ? `${current.companyName} YouTube video ${n}` : null, { role: 'admin', email: null, name: 'Order paid' });
    ids.push(p.id);
  }
  current.projectIds = ids;
  await saveOrder(current);
  const portal = `${siteUrl()}/client-submission/youtube`;
  await notify({
    to: recipients(current),
    subject: 'Payment received: your Hotel Tech Report video is booked',
    text: `Hi ${current.name.split(' ')[0] || 'there'},\n\nWe received your payment of ${usd(current.total)}. Thank you.\n\n${ids.length ? `Your project is open. Sign in with ${current.email} to start your pre-production checklist:\n${portal}` : 'Our team will be in touch to kick off production.'}\n\nHotel Tech Report`,
  });
  const noWorkflow = current.items.short || current.items.clips;
  await adminAlert({
    subject: `PAID: ${current.companyName} YouTube order (${usd(current.total)})`,
    text: `${current.companyName} paid ${usd(current.total)} (${via}).\n\n${summary(current)}\n\n${ids.length ? `${ids.length} project${ids.length > 1 ? 's' : ''} opened automatically:\n${ids.map((id) => `${siteUrl()}/admin/projects/${id}`).join('\n')}` : 'No project was opened.'}${noWorkflow ? '\n\nThis order includes short form videos or social clips. The app has no production workflow for those yet, so kick them off yourself.' : ''}`,
  });
  return current;
}

// ---------- admin ----------
export async function adminMarkPaid(order, by) {
  if (order.status === 'paid') return order;
  if (order.status === 'void') throw err('This order was cancelled.', 409);
  if (order.invoice?.id) await markPaidOutOfBand(order.invoice.id).catch((e) => { if (!/already paid/i.test(e.message)) throw e; });
  return fulfillOrder(order, { via: 'marked paid by Hotel Tech Report', by });
}

export async function cancelOrder(order, by) {
  if (order.status === 'paid') throw err('This order is paid. Refund it in Stripe instead.', 409);
  if (order.invoice?.id) {
    const inv = await getInvoice(order.invoice.id);
    if (inv.status === 'paid') throw err('Stripe shows this invoice as paid.', 409);
    if (inv.status === 'open') await voidInvoice(order.invoice.id);
  }
  Object.assign(order, { status: 'void', review: [] });
  order.log.push({ at: now(), type: 'cancelled', by });
  await saveOrder(order);
  return order;
}

// From the Stripe webhook. Finds the order named in the invoice's metadata.
export async function onInvoiceEvent(type, invoice) {
  const order = await getOrder(invoice?.metadata?.order);
  if (!order || order.invoice?.id !== invoice.id) return 'ignored';
  if (type === 'invoice.paid') { await fulfillOrder(order, { via: invoice.paid_out_of_band ? 'paid outside Stripe' : 'Stripe' }); return 'paid'; }
  if (type === 'invoice.voided' || type === 'invoice.marked_uncollectible') {
    if (order.status === 'invoiced') { order.status = 'void'; order.log.push({ at: now(), type: 'cancelled', text: type }); await saveOrder(order); }
    return 'void';
  }
  if (type === 'invoice.payment_failed') {
    order.log.push({ at: now(), type: 'payment-failed' });
    await saveOrder(order);
    await adminAlert({ subject: `Payment FAILED: ${order.companyName} YouTube order`, text: `A payment attempt on invoice ${invoice.number || invoice.id} for ${order.companyName} (${usd(order.total)}) failed. The invoice is still open and they can try again.\n\n${order.invoice.url}\n\n${siteUrl()}/admin/orders` });
    return 'failed';
  }
  return 'ignored';
}

export { cleanItems };
