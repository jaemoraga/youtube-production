// Stripe tells us when an invoice is paid, voided or a payment fails. Signed with STRIPE_WEBHOOK_SECRET.
// In Stripe: Developers -> Webhooks -> Add endpoint, URL https://youtube-studio.hoteltechinsider.com/api/webhook/stripe,
// events invoice.paid, invoice.payment_failed, invoice.voided, invoice.marked_uncollectible.
import { onInvoiceEvent } from '@/lib/orders.js';
import { verifyWebhook } from '@/lib/stripe.js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request) {
  const body = await request.text();
  const event = verifyWebhook(body, request.headers.get('stripe-signature'));
  if (!event) return Response.json({ error: 'Bad signature' }, { status: 401 });
  if (!String(event.type || '').startsWith('invoice.')) return Response.json({ ok: true, ignored: true });
  try {
    return Response.json({ ok: true, result: await onInvoiceEvent(event.type, event.data?.object) });
  } catch (e) {
    console.error('stripe webhook', e.message);
    return Response.json({ error: 'Could not process' }, { status: 500 }); // Stripe retries
  }
}
