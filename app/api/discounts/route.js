// Admin: discount codes. { action: 'create' | 'toggle' | 'remove', ... }
import { createDiscount, listDiscounts, removeDiscount, setDiscountActive } from '@/lib/discounts.js';
import { guard } from '@/lib/session.js';

export async function GET(request) {
  const [, denied] = await guard(request, ['admin']);
  if (denied) return denied;
  return Response.json({ discounts: await listDiscounts() });
}

export async function POST(request) {
  const [s, denied] = await guard(request, ['admin']);
  if (denied) return denied;
  const b = await request.json().catch(() => ({}));
  try {
    if (b.action === 'create') await createDiscount(b, s.e);
    else if (b.action === 'toggle') await setDiscountActive(b.code, b.active);
    else if (b.action === 'remove') await removeDiscount(b.code);
    else return Response.json({ error: 'Unknown action.' }, { status: 400 });
    return Response.json({ discounts: await listDiscounts() });
  } catch (e) {
    return Response.json({ error: e.message }, { status: e.status || 500 });
  }
}
