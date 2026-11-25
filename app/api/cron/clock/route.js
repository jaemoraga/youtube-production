// The review-window clock. Vercel calls this on the schedule in vercel.json; it sends the reminders that
// are due and closes windows whose deadline has passed. Protected by CRON_SECRET (Vercel adds the header).
import { CRON_SECRET } from '@/lib/config.js';
import { tick } from '@/lib/production.js';
import { getSession } from '@/lib/session.js';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(request) {
  const auth = request.headers.get('authorization') || '';
  const fromVercel = CRON_SECRET && auth === `Bearer ${CRON_SECRET}`;
  const admin = (await getSession())?.r === 'admin';   // an admin can also run it by hand
  if (!fromVercel && !admin) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const r = await tick();
  return Response.json({ ok: true, ...r, at: new Date().toISOString() });
}
