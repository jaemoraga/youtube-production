// Resend tells us what happened to each email (delivered, opened, clicked, bounced). Each event is
// filed under the project named in the email's tags. Signed with the webhook's secret (Svix format).
import { createHmac, timingSafeEqual } from 'node:crypto';
import { RESEND_WEBHOOK_SECRET } from '@/lib/config.js';
import { recordEmailEvent } from '@/lib/notifications.js';

export const dynamic = 'force-dynamic';

function verify(request, body) {
  if (!RESEND_WEBHOOK_SECRET) return false;
  const id = request.headers.get('svix-id') || '';
  const ts = request.headers.get('svix-timestamp') || '';
  const sigs = (request.headers.get('svix-signature') || '').split(' ').map((s) => s.split(',')[1]).filter(Boolean);
  if (!id || !ts || !sigs.length || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const secret = Buffer.from(RESEND_WEBHOOK_SECRET.replace(/^whsec_/, ''), 'base64');
  const expected = createHmac('sha256', secret).update(`${id}.${ts}.${body}`).digest('base64');
  return sigs.some((s) => { const a = Buffer.from(s); const b = Buffer.from(expected); return a.length === b.length && timingSafeEqual(a, b); });
}

const TYPES = { 'email.delivered': 'delivered', 'email.opened': 'opened', 'email.clicked': 'clicked', 'email.bounced': 'bounced', 'email.complained': 'complained', 'email.delivery_delayed': 'delayed' };

export async function POST(request) {
  const body = await request.text();
  if (!verify(request, body)) return Response.json({ error: 'Bad signature' }, { status: 401 });
  let e;
  try { e = JSON.parse(body); } catch { return Response.json({ error: 'Bad body' }, { status: 400 }); }
  const type = TYPES[e.type];
  const d = e.data || {};
  const tags = Array.isArray(d.tags) ? Object.fromEntries(d.tags.map((t) => [t.name, t.value])) : (d.tags || {});
  const project = tags.project;
  if (!type || !project || !d.email_id) return Response.json({ ok: true, ignored: true });
  await recordEmailEvent(project, d.email_id, type, { at: e.created_at || new Date().toISOString(), link: d.click?.link || null }).catch((err) => console.error('resend webhook', err.message));
  return Response.json({ ok: true });
}
