'use client';
// Admin: every order with its Stripe invoice, the ones waiting on HTR, and the discount codes.
import { useCallback, useEffect, useState } from 'react';
import { codeProblem, usd } from '@/lib/pricing.js';
import { api, Brand, useToast, when } from './ui.js';

const STATUS = { review: ['Needs you', 'court-htr'], invoiced: ['Awaiting payment', 'court-client'], paid: ['Paid', 'court-done'], void: ['Cancelled', 'st-todo'] };

export default function AdminOrders() {
  const [data, setData] = useState(null);
  const [codes, setCodes] = useState(null);
  const [error, setError] = useState('');
  const [toast, say] = useToast();

  const load = useCallback(async () => {
    try {
      const [o, d] = await Promise.all([api('/api/orders'), api('/api/discounts')]);
      setData(o); setCodes(d.discounts); setError('');
    } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const orders = data?.orders || [];
  const open = orders.filter((o) => o.status === 'invoiced').reduce((s, o) => s + o.total, 0);
  const paid = orders.filter((o) => o.status === 'paid').reduce((s, o) => s + o.total, 0);

  return (
    <div className="wrap">
      <header className="top">
        <Brand />
        <div className="row"><a className="linkbtn" href="/admin">Projects</a></div>
      </header>
      <h1>Orders</h1>
      <p className="sub">Every video ordered in the app. A project opens by itself when its invoice is paid.</p>
      {error && <div className="alert">{error}</div>}
      {data && data.stripe === 'off' && <div className="alert">Stripe is not connected. Orders are collected here but no invoice goes out. {data.stripeProblem || 'Add STRIPE_SECRET_KEY in Vercel and redeploy.'}</div>}
      {data && data.stripe === 'test' && <div className="alert">Stripe is in test mode. Invoices are not real and no money moves.</div>}
      {data && data.stripe !== 'off' && !data.webhook && <div className="alert">STRIPE_WEBHOOK_SECRET is not set, so the app will not hear about payments. Until it is, use Mark paid.</div>}
      {data && <p className="muted small">Awaiting payment: <b>{usd(open)}</b> · Paid: <b>{usd(paid)}</b></p>}

      <div className="card">
        {data === null ? <div className="empty">Loading…</div> : orders.length === 0 ? <div className="empty">No orders yet.</div> : (
          <table className="orders-table">
            <thead><tr><th>Company</th><th>Order</th><th>Total</th><th>Status</th><th /></tr></thead>
            <tbody>{orders.map((o) => <OrderRow key={o.id} o={o} reload={load} say={say} />)}</tbody>
          </table>
        )}
      </div>

      <h2 className="section-title" style={{ marginTop: 36 }}>Discount codes</h2>
      <Codes codes={codes} setCodes={setCodes} say={say} />
      {toast}
    </div>
  );
}

function OrderRow({ o, reload, say }) {
  const [tier, setTier] = useState(o.membership?.source === 'unavailable' ? '' : o.tier);
  const [busy, setBusy] = useState(false);
  const act = async (action, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    try { await api(`/api/orders/${o.id}`, { method: 'POST', body: { action, tier } }); say('Done'); }
    catch (e) { say(e.message); }
    finally { setBusy(false); reload(); }
  };
  const m = o.membership || {};
  return (
    <tr>
      <td>
        <div style={{ fontWeight: 500 }}>{o.companyName}</div>
        <div className="muted small">{o.name} · {o.email}{o.billingEmail !== o.email ? ` · bill to ${o.billingEmail}` : ''}</div>
        <div className="muted small">{when(o.createdAt)} · {o.mode === 'pay' ? 'chose pay now' : 'requested an invoice'}{o.po ? ` · PO ${o.po}` : ''}</div>
      </td>
      <td>
        {o.lines.map((l, i) => <div key={i} className="small">{l.text} <span className="muted">{usd(l.amount)}</span></div>)}
        <div className="muted small">
          {m.source === 'htr' ? `HTR plan: ${m.plan || (o.tier === 'premium' ? 'Premium' : 'Basic')}${m.htrCompanyName ? ` (${m.htrCompanyName})` : ''}`
            : m.source === 'no-match' ? 'No HTR account matches this email: Basic pricing' : 'Membership not checked'}
        </div>
      </td>
      <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{usd(o.total)}</td>
      <td>
        <span className={`pill ${STATUS[o.status][1]}`}>{STATUS[o.status][0]}</span>
        {o.invoice?.url && <div className="small"><a href={o.invoice.url} target="_blank" rel="noreferrer">Invoice {o.invoice.number}</a></div>}
        {o.status === 'paid' && <div className="muted small">{when(o.paidAt)} · {o.paidVia}</div>}
        {(o.projectIds || []).map((id) => <div key={id} className="small"><a href={`/admin/projects/${id}`}>Open project</a></div>)}
        {(o.review || []).map((r) => <div key={r} className="small" style={{ color: 'var(--warn)', maxWidth: 260 }}>{r}</div>)}
      </td>
      <td>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          {o.status === 'review' && (
            <>
              <select style={{ width: 'auto' }} value={tier} onChange={(e) => setTier(e.target.value)} aria-label="Pricing">
                <option value="">Pricing…</option><option value="basic">Basic</option><option value="premium">Premium</option>
              </select>
              <button className="btn primary" disabled={busy || !tier} onClick={() => act('send', `Create and send a Stripe invoice to ${o.billingEmail} at ${tier === 'premium' ? 'Premium' : 'Basic'} pricing?`)}>Send invoice</button>
            </>
          )}
          {o.status === 'invoiced' && <button className="btn" disabled={busy} onClick={() => act('paid', `Mark this ${usd(o.total)} order as paid outside Stripe (wire or cheque)? This opens the project and emails the client.`)}>Mark paid</button>}
          {['review', 'invoiced'].includes(o.status) && <button className="btn danger" disabled={busy} onClick={() => act('cancel', 'Cancel this order? An open Stripe invoice will be voided.')}>Cancel</button>}
        </div>
      </td>
    </tr>
  );
}

function Codes({ codes, setCodes, say }) {
  const blank = { code: '', kind: 'percent', value: '', expiresOn: '', maxUses: '', note: '' };
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const send = async (body) => {
    setBusy(true);
    try { setCodes((await api('/api/discounts', { method: 'POST', body })).discounts); if (body.action === 'create') setF(blank); say('Saved'); }
    catch (e) { say(e.message); } finally { setBusy(false); }
  };
  return (
    <>
      <form className="card pad code-form" onSubmit={(e) => { e.preventDefault(); send({ action: 'create', ...f }); }}>
        <label><span className="small muted">Code</span><input type="text" required value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} placeholder="LAUNCH20" /></label>
        <label><span className="small muted">Type</span><select value={f.kind} onChange={set('kind')}><option value="percent">Percent off</option><option value="amount">Dollars off</option></select></label>
        <label><span className="small muted">{f.kind === 'percent' ? 'Percent' : 'Dollars'}</span><input type="text" inputMode="decimal" required value={f.value} onChange={set('value')} placeholder={f.kind === 'percent' ? '20' : '1000'} /></label>
        <label><span className="small muted">Expires (end of day PT)</span><input type="date" value={f.expiresOn} onChange={set('expiresOn')} /></label>
        <label><span className="small muted">Max uses</span><input type="text" inputMode="numeric" value={f.maxUses} onChange={set('maxUses')} placeholder="No limit" /></label>
        <label><span className="small muted">Note (HTR only)</span><input type="text" value={f.note} onChange={set('note')} placeholder="Who it is for" /></label>
        <button className="btn primary" disabled={busy}>Create code</button>
      </form>
      <div className="card" style={{ marginTop: 12 }}>
        {codes === null ? <div className="empty">Loading…</div> : codes.length === 0 ? <div className="empty">No codes yet.</div> : (
          <table>
            <thead><tr><th>Code</th><th>Takes off</th><th>Expires</th><th>Used</th><th className="hide-sm">Note</th><th /></tr></thead>
            <tbody>
              {codes.map((d) => {
                const problem = codeProblem(d);
                return (
                  <tr key={d.code}>
                    <td style={{ fontWeight: 600 }}>{d.code}</td>
                    <td>{d.kind === 'percent' ? `${d.value}%` : usd(d.value)}</td>
                    <td>{d.expiresOn || 'Never'}</td>
                    <td>{d.uses || 0}{d.maxUses ? ` of ${d.maxUses}` : ''}</td>
                    <td className="hide-sm muted small">{d.note}</td>
                    <td>
                      <div className="row" style={{ justifyContent: 'flex-end' }}>
                        <span className={`pill ${problem ? 'st-todo' : 'st-approved'}`}>{!d.active ? 'Off' : problem ? problem.replace('That code ', '').replace(/\.$/, '') : 'Active'}</span>
                        <button className="linkbtn" disabled={busy} onClick={() => send({ action: 'toggle', code: d.code, active: !d.active })}>{d.active ? 'Switch off' : 'Switch on'}</button>
                        {!d.uses && <button className="linkbtn" disabled={busy} onClick={() => send({ action: 'remove', code: d.code })}>Delete</button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
