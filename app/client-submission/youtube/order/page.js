// Where someone without a project lands after signing in: order a video, pay now or request an invoice.
import OrderForm from '@/components/OrderForm.js';
import TopBar from '@/components/TopBar.js';
import { STEPS } from '@/components/VideoExamples.js';
import { forClient, listOrders } from '@/lib/orders.js';
import { listProjects } from '@/lib/projects.js';
import { requirePage } from '@/lib/session.js';
import { getCompanies } from '@/lib/store.js';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Order a review video · Hotel Tech Report', robots: { index: false } };

export default async function Order() {
  const s = await requirePage('client');
  const [orders, projects, companies] = await Promise.all([listOrders({ company: s.c }), listProjects({ company: s.c }), getCompanies()]);
  const company = companies.find((c) => c.slug === s.c);
  return (
    <div className="wrap narrow">
      <TopBar label="YouTube Content Studio" home="/client-submission/youtube" />
      <h1>Order your review video</h1>
      <p className="sub">Book a product review on the Hotel Tech Report YouTube channel. Once payment is received, your pre-production checklist opens here.</p>
      {projects.length > 0 && <p className="small"><a href="/client-submission/youtube">Back to your projects</a></p>}
      <OrderForm email={s.e} companyName={company?.name || ''} orders={orders.map(forClient)} />
      <h2 className="section-title" style={{ marginTop: 32 }}>How it works</h2>
      <ol className="process compact">
        {STEPS.map((st, i) => (
          <li key={st.title} className={st.who === 'You' ? 'you' : ''}>
            <span className="pnum">{i + 1}</span>
            <div><div className="ptitle">{st.title} <span className="who">{st.who === 'You' ? 'You' : 'Hotel Tech Report'}</span></div><div className="muted small">{st.text}</div></div>
          </li>
        ))}
      </ol>
    </div>
  );
}
