'use client';
// The order page: choose videos, see the price for your membership, add a code, then pay now or ask for an invoice.
import { useEffect, useState } from 'react';
import { PRODUCTS, SHORT_VOLUME, itemsProblem, priceOrder, usd } from '@/lib/pricing.js';
import { api } from './ui.js';

const STATUS = { review: ['Being confirmed', 'st-waiting'], invoiced: ['Awaiting payment', 'st-submitted'], paid: ['Paid', 'st-approved'], void: ['Cancelled', 'st-todo'] };

function step(key, qty, dir) {
  const { min = 1, max } = PRODUCTS[key];
  if (dir > 0) return Math.min(max, qty ? qty + 1 : min);
  return qty <= min ? 0 : qty - 1;
}

export function OrderList({ orders }) {
  if (!orders.length) return null;
  return (
    <div className="card" style={{ marginBottom: 20 }}>
      {orders.map((o) => (
        <div key={o.id} className="list-row" style={{ alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontWeight: 500 }}>{o.lines.filter((l) => l.qty).map((l) => `${l.qty} x ${l.label}`).join(', ')}</div>
            <div className="muted small">
              {usd(o.total)}{o.invoice?.number ? ` · Invoice ${o.invoice.number}` : ''}
              {o.status === 'review' && ' · We are confirming your pricing and will email your invoice shortly.'}
              {o.status === 'invoiced' && ' · Your project opens as soon as payment is received.'}
              {o.status === 'paid' && !o.projectIds.length && ' · Our team will be in touch to kick off production.'}
            </div>
          </div>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <span className={`pill ${STATUS[o.status][1]}`}>{STATUS[o.status][0]}</span>
            {o.status === 'invoiced' && o.invoice?.url && <a className="btn primary" href={o.invoice.url} target="_blank" rel="noreferrer">Pay invoice</a>}
            {o.status === 'paid' && o.invoice?.pdf && <a className="linkbtn" href={o.invoice.pdf}>Receipt</a>}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function OrderForm({ email, companyName, orders: initial }) {
  const [orders, setOrders] = useState(initial);
  const [items, setItems] = useState({ long: 1, short: 0, clips: 0 });
  const [pricing, setPricing] = useState(null); // { tier, confirmed }
  const [codeInput, setCodeInput] = useState('');
  const [discount, setDiscount] = useState(null);
  const [codeMsg, setCodeMsg] = useState('');
  const [f, setF] = useState({ billingEmail: email, po: '' });
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);

  useEffect(() => {
    api('/api/orders/quote', { method: 'POST', body: { items: { long: 1 } } })
      .then((q) => setPricing({ tier: q.tier, confirmed: q.confirmed }))
      .catch(() => setPricing({ tier: 'basic', confirmed: false }));
  }, []);

  const tier = pricing?.tier || 'basic';
  const priced = priceOrder(items, tier, discount);
  const problem = itemsProblem(items);

  async function applyCode(e) {
    e.preventDefault();
    setCodeMsg(''); setBusy('code');
    try {
      const q = await api('/api/orders/quote', { method: 'POST', body: { items, code: codeInput } });
      if (q.discount) { setDiscount(q.discount); setCodeMsg(''); } else { setDiscount(null); setCodeMsg(q.codeProblem || 'Enter a code.'); }
    } catch (x) { setCodeMsg(x.message); } finally { setBusy(''); }
  }

  async function submit(mode) {
    setErr(''); setBusy(mode);
    try {
      const r = await api('/api/orders', { method: 'POST', body: { items, code: discount?.code || '', mode, po: f.po, billingEmail: f.billingEmail } });
      if (r.redirect) { window.location.href = r.redirect; return; }
      setOrders([r.order, ...orders]); setDone(r.order);
    } catch (x) { setErr(x.message); } finally { setBusy(''); }
  }

  if (done) {
    return (
      <div className="card pad success">
        <div className="tick">✓</div>
        {done.status === 'review' ? (
          <>
            <h2 style={{ margin: '0 0 6px' }}>Order received</h2>
            <p className="muted">We&apos;re confirming your pricing and will email your invoice to <b>{f.billingEmail}</b> shortly.</p>
          </>
        ) : done.status === 'paid' ? (
          <>
            <h2 style={{ margin: '0 0 6px' }}>You&apos;re booked</h2>
            <p className="muted">Nothing to pay. <a href="/client-submission/youtube">Open your portal</a> to get started.</p>
          </>
        ) : (
          <>
            <h2 style={{ margin: '0 0 6px' }}>Invoice sent</h2>
            <p className="muted">We emailed invoice {done.invoice?.number} for {usd(done.total)} to <b>{f.billingEmail}</b>. Pay it by card, ACH or bank transfer. Your project opens as soon as payment is received.</p>
            {done.invoice?.url && <a className="btn primary" href={done.invoice.url} target="_blank" rel="noreferrer" style={{ marginTop: 8 }}>View invoice</a>}
          </>
        )}
      </div>
    );
  }

  return (
    <>
      <OrderList orders={orders} />
      <div className="card pad">
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ fontWeight: 600 }}>Choose your videos</div>
          {pricing === null ? <span className="muted small">Checking your membership…</span>
            : !pricing.confirmed ? <span className="pill st-waiting">Pricing confirmed before invoicing</span>
            : <span className={`pill ${tier === 'premium' ? 'st-approved' : 'st-todo'}`}>{tier === 'premium' ? 'Premium member pricing' : 'Standard pricing'}</span>}
        </div>
        {Object.entries(PRODUCTS).map(([key, p]) => (
          <div key={key} className="order-line">
            <div>
              <div style={{ fontWeight: 500 }}>{p.label} <span className="muted" style={{ fontWeight: 400 }}>{usd(p.unit[tier])} each</span></div>
              <div className="muted small">{p.note}{key === 'short' ? ` ${SHORT_VOLUME.percent}% off when you order ${SHORT_VOLUME.qty} or more.` : ''}</div>
            </div>
            <div className="qty">
              <button type="button" className="btn" aria-label={`Fewer: ${p.label}`} disabled={!items[key]} onClick={() => setItems({ ...items, [key]: step(key, items[key], -1) })}>−</button>
              <span aria-live="polite">{items[key]}</span>
              <button type="button" className="btn" aria-label={`More: ${p.label}`} disabled={items[key] >= p.max || (key === 'clips' && !items.long)} onClick={() => setItems({ ...items, [key]: step(key, items[key], 1) })}>+</button>
            </div>
          </div>
        ))}
        {tier === 'basic' && pricing?.confirmed && (
          <p className="hint">Premium members of Hotel Tech Report pay {usd(PRODUCTS.long.unit.premium)} for a long form video. If your company is a Premium member, sign in with the email on your Hotel Tech Report account.</p>
        )}

        <form onSubmit={applyCode} className="row" style={{ marginTop: 16, flexWrap: 'nowrap' }}>
          <input type="text" placeholder="Discount code" value={codeInput} onChange={(e) => setCodeInput(e.target.value.toUpperCase())} autoComplete="off" style={{ maxWidth: 220 }} />
          <button className="btn" disabled={busy === 'code' || !codeInput.trim()}>{busy === 'code' ? 'Checking…' : 'Apply'}</button>
          {discount && <button type="button" className="linkbtn" onClick={() => { setDiscount(null); setCodeInput(''); }}>Remove</button>}
        </form>
        {codeMsg && <div className="small" style={{ color: 'var(--err)', marginTop: 6 }}>{codeMsg}</div>}

        <div className="order-total">
          {priced.lines.map((l) => (
            <div key={l.key} className="row" style={{ justifyContent: 'space-between' }}>
              <span className={l.amount < 0 ? '' : 'muted'}>{l.qty ? `${l.qty} x ${l.label}` : l.label}</span><span>{usd(l.amount)}</span>
            </div>
          ))}
          <div className="row" style={{ justifyContent: 'space-between', fontWeight: 600, fontSize: 17, marginTop: 8 }}>
            <span>Total</span><span>{usd(priced.total)}</span>
          </div>
        </div>

        <div className="row" style={{ flexWrap: 'nowrap', marginTop: 16, alignItems: 'flex-start' }}>
          <label style={{ flex: 2 }}><span className="small muted">Send the invoice to</span>
            <input type="text" inputMode="email" value={f.billingEmail} onChange={(e) => setF({ ...f, billingEmail: e.target.value })} autoComplete="email" /></label>
          <label style={{ flex: 1 }}><span className="small muted">PO number (optional)</span>
            <input type="text" value={f.po} maxLength={30} onChange={(e) => setF({ ...f, po: e.target.value })} /></label>
        </div>
        <p className="muted small" style={{ margin: '8px 0 0' }}>Billed to {companyName}.</p>

        {(err || (problem && (items.long || items.short || items.clips))) && <div className="alert">{err || problem}</div>}
        <div className="row" style={{ marginTop: 16, flexWrap: 'nowrap' }}>
          <button className="btn primary big" disabled={!!busy || !!problem || pricing === null} onClick={() => submit('pay')}>{busy === 'pay' ? 'One moment…' : 'Pay now'}</button>
          <button className="btn big" disabled={!!busy || !!problem || pricing === null} onClick={() => submit('invoice')}>{busy === 'invoice' ? 'One moment…' : 'Request an invoice'}</button>
        </div>
        <p className="hint">Pay now takes you to a secure Stripe page to pay by card, ACH or bank transfer. Request an invoice emails it to you to pay later the same ways. Your project opens as soon as payment is received.</p>
      </div>
    </>
  );
}
