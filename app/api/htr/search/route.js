// Admin: find the vendor's product on Hotel Tech Report to link a project to its profile.
import { HTR_ENABLED, htrSession } from '@/lib/htr.js';
import { guard } from '@/lib/session.js';

export const maxDuration = 30;

export async function GET(request) {
  const [, denied] = await guard(request, ['admin']);
  if (denied) return denied;
  if (!HTR_ENABLED()) return Response.json({ enabled: false, products: [] });
  const q = (new URL(request.url).searchParams.get('q') || '').trim().slice(0, 100);
  if (q.length < 2) return Response.json({ enabled: true, products: [] });
  try {
    const call = await htrSession();
    const r = await call('htr_search_products', { name: q, per_page: 10, sort: 'review_count_desc' });
    const products = (r?.products || []).map((p) => ({
      id: p.id, name: p.name, company: p.company_name, category: p.category_name, reviews: p.review_count,
    }));
    return Response.json({ enabled: true, products });
  } catch (e) {
    return Response.json({ error: e.message }, { status: e.status || 502 });
  }
}
