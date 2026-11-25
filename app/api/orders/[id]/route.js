// Admin actions on one order: send the invoice (after confirming the price), mark paid, cancel.
import { adminMarkPaid, cancelOrder, getOrder, issueOrder } from '@/lib/orders.js';
import { TIERS } from '@/lib/pricing.js';
import { guard } from '@/lib/session.js';

export const maxDuration = 60;

export async function POST(request, { params }) {
  const [s, denied] = await guard(request, ['admin']);
  if (denied) return denied;
  const { id } = await params;
  const order = await getOrder(id);
  if (!order) return Response.json({ error: 'Order not found.' }, { status: 404 });
  const { action, tier } = await request.json().catch(() => ({}));
  try {
    if (action === 'send') {
      if (!TIERS.includes(tier)) return Response.json({ error: 'Choose Basic or Premium pricing first.' }, { status: 400 });
      return Response.json({ order: await issueOrder(order, { tier, by: s.e }) });
    }
    if (action === 'paid') return Response.json({ order: await adminMarkPaid(order, s.e) });
    if (action === 'cancel') return Response.json({ order: await cancelOrder(order, s.e) });
    return Response.json({ error: 'Unknown action.' }, { status: 400 });
  } catch (e) {
    return Response.json({ error: e.message }, { status: e.status || 500 });
  }
}
