// Orders. Clients see and place their own company's; admins see all.
import { validEmail, normEmail } from '@/lib/codes.js';
import { forClient, listOrders, placeOrder } from '@/lib/orders.js';
import { guard } from '@/lib/session.js';
import { stripeKeyProblem, stripeMode } from '@/lib/stripe.js';
import { getUser } from '@/lib/users.js';

export const maxDuration = 60;

export async function GET(request) {
  const [s, denied] = await guard(request, ['admin', 'client']);
  if (denied) return denied;
  if (s.r === 'client') return Response.json({ orders: (await listOrders({ company: s.c })).map(forClient) });
  return Response.json({ orders: await listOrders(), stripe: stripeMode(), stripeProblem: stripeKeyProblem(), webhook: !!process.env.STRIPE_WEBHOOK_SECRET });
}

export async function POST(request) {
  const [s, denied] = await guard(request, ['client']);
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  const user = await getUser(s.e);
  if (!user || user.company !== s.c) return Response.json({ error: 'Account not found. Sign in again.' }, { status: 401 });
  const billingEmail = body.billingEmail ? normEmail(body.billingEmail) : user.email;
  if (!validEmail(billingEmail)) return Response.json({ error: 'The billing email is not a valid address.' }, { status: 400 });
  const open = (await listOrders({ company: s.c })).filter((o) => ['review', 'invoiced'].includes(o.status));
  if (open.length >= 3) return Response.json({ error: 'You already have open invoices with us. Pay or ask us to cancel one before placing another order.' }, { status: 409 });
  try {
    const order = await placeOrder({ user, items: body.items, code: body.code, mode: body.mode, po: body.po, billingEmail });
    return Response.json({ order: forClient(order), redirect: order.mode === 'pay' && order.status === 'invoiced' ? order.invoice.url : null });
  } catch (e) {
    return Response.json({ error: e.message }, { status: e.status || 500 });
  }
}
