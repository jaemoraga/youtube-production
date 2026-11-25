// The order page asks what the current selection costs (membership price, volume and code discounts).
import { quote } from '@/lib/orders.js';
import { guard } from '@/lib/session.js';

export const maxDuration = 60;

export async function POST(request) {
  const [s, denied] = await guard(request, ['client']);
  if (denied) return denied;
  const { items, code } = await request.json().catch(() => ({}));
  try {
    const q = await quote({ company: s.c, email: s.e, items, code });
    return Response.json({ tier: q.priced.tier, confirmed: q.tier.source !== 'unavailable', lines: q.priced.lines, total: q.priced.total, code: q.discount?.code || null, discount: q.discount ? { code: q.discount.code, kind: q.discount.kind, value: q.discount.value } : null, codeProblem: q.codeProblem });
  } catch (e) {
    return Response.json({ error: e.message }, { status: e.status || 500 });
  }
}
