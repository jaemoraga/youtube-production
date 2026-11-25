// Minimal Stripe client (plain fetch, no SDK). Every order becomes one Stripe invoice:
//   "Pay now"            -> the buyer is sent straight to Stripe's hosted invoice page
//   "Request an invoice" -> Stripe also emails the invoice
// Either way the buyer pays on that page with whatever is switched on in Stripe (Settings -> Billing ->
// Invoices -> Default payment methods): card, ACH debit, bank transfer. Stripe then calls
// /api/webhook/stripe and the app opens the project. Nothing is ever charged automatically.
import { createHmac, timingSafeEqual } from 'node:crypto';

const KEY = () => process.env.STRIPE_SECRET_KEY || '';
export const stripeReady = () => /^(sk|rk)_(test|live)_/.test(KEY());
export const stripeMode = () => (!stripeReady() ? 'off' : KEY().includes('_test_') ? 'test' : 'live');
export const DAYS_UNTIL_DUE = Math.max(1, Math.floor(Number(process.env.INVOICE_DAYS_UNTIL_DUE)) || 30);

// { a: { b: [1, 2] } } -> a[b][0]=1&a[b][1]=2, the form encoding Stripe expects.
export function encode(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj || {})) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') encode(v, key, out); else out.append(key, String(v));
  }
  return out;
}

async function stripe(method, path, params = null, idempotencyKey = null) {
  if (!stripeReady()) throw Object.assign(new Error('Stripe is not connected yet.'), { status: 503 });
  const qs = method === 'GET' && params ? `?${encode(params)}` : '';
  const res = await fetch(`https://api.stripe.com/v1/${path}${qs}`, {
    method,
    headers: {
      authorization: `Bearer ${KEY()}`,
      ...(method !== 'GET' ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
      ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
    },
    body: method !== 'GET' && params ? encode(params).toString() : undefined,
    cache: 'no-store', signal: AbortSignal.timeout(30000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(`Stripe: ${body.error?.message || res.status}`), { status: 502, code: body.error?.code, http: res.status });
  return body;
}

// The Stripe customer to bill: the one HTR already has for this company if there is one, else one with
// the buyer's email, else a new one. tryIds are customer ids we already know (cached, or from HTR).
export async function ensureCustomer({ tryIds = [], email, name, company }) {
  for (const id of tryIds.filter((x) => /^cus_\w+$/.test(String(x || '')))) {
    try { const c = await stripe('GET', `customers/${id}`); if (!c.deleted) return c.id; } catch (e) { if (e.http !== 404) throw e; }
  }
  const found = await stripe('GET', 'customers', { email, limit: 1 });
  if (found.data?.[0]) return found.data[0].id;
  return (await stripe('POST', 'customers', { email, name, metadata: { app: 'youtube-studio', company } }, `cust-${company}-${email}`)).id;
}

const view = (inv) => ({ id: inv.id, number: inv.number || null, url: inv.hosted_invoice_url || null, pdf: inv.invoice_pdf || null, status: inv.status, due: inv.due_date ? new Date(inv.due_date * 1000).toISOString() : null });

// order: { id, lines: [{ text, amount }], po }. send = also have Stripe email it.
export async function issueInvoice(order, customer, { send = false } = {}) {
  const draft = await stripe('POST', 'invoices', {
    customer, collection_method: 'send_invoice', days_until_due: DAYS_UNTIL_DUE, auto_advance: false,
    pending_invoice_items_behavior: 'exclude', currency: 'usd',
    description: 'Hotel Tech Report YouTube Content Studio',
    metadata: { app: 'youtube-studio', order: order.id },
    ...(order.po ? { custom_fields: [{ name: 'PO number', value: order.po }] } : {}),
  }, `inv-${order.id}-${order.attempt || 1}`);
  try {
    for (const [i, l] of order.lines.entries()) {
      await stripe('POST', 'invoiceitems', { customer, invoice: draft.id, amount: l.amount, currency: 'usd', description: l.text }, `item-${order.id}-${order.attempt || 1}-${i}`);
    }
    let inv = await stripe('POST', `invoices/${draft.id}/finalize`, { auto_advance: false });
    if (send && inv.status === 'open') inv = await stripe('POST', `invoices/${inv.id}/send`);
    return view(inv);
  } catch (e) {
    await stripe('DELETE', `invoices/${draft.id}`).catch(() => null); // only drafts can be deleted
    throw e;
  }
}

export const getInvoice = async (id) => view(await stripe('GET', `invoices/${id}`));
export const voidInvoice = async (id) => view(await stripe('POST', `invoices/${id}/void`));
// Paid by wire or cheque outside Stripe: closes the Stripe invoice without moving money.
export const markPaidOutOfBand = async (id) => view(await stripe('POST', `invoices/${id}/pay`, { paid_out_of_band: true }));

// Stripe-Signature: t=<unix>,v1=<hex hmac of "t.body">. Returns the parsed event or null.
export function verifyWebhook(body, header, secret = process.env.STRIPE_WEBHOOK_SECRET || '', now = Date.now()) {
  if (!secret || !header) return null;
  const parts = String(header).split(',').map((p) => p.split('='));
  const t = parts.find(([k]) => k === 't')?.[1];
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!t || !sigs.length || Math.abs(now / 1000 - Number(t)) > 300) return null;
  const expected = Buffer.from(createHmac('sha256', secret).update(`${t}.${body}`).digest('hex'));
  if (!sigs.some((s) => { const a = Buffer.from(s); return a.length === expected.length && timingSafeEqual(a, expected); })) return null;
  try { return JSON.parse(body); } catch { return null; }
}
