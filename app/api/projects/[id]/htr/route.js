// Admin: pull a product's Hotel Tech Report profile into text for the internal dossier.
// Returns the text; the admin reviews it in the form and saves as usual.
import { htrSession } from '@/lib/htr.js';
import { pullProfile } from '@/lib/htr-profile.js';
import { getProject } from '@/lib/projects.js';
import { guard } from '@/lib/session.js';

export const maxDuration = 60;

export async function POST(request, { params }) {
  const [, denied] = await guard(request, ['admin']);
  if (denied) return denied;
  const { id } = await params;
  if (!(await getProject(id))) return Response.json({ error: 'Not found' }, { status: 404 });
  const { productId } = await request.json().catch(() => ({}));
  if (!Number.isInteger(Number(productId)) || Number(productId) < 1) return Response.json({ error: 'Choose a product first.' }, { status: 400 });
  try {
    const call = await htrSession();
    return Response.json(await pullProfile(call, productId));
  } catch (e) {
    return Response.json({ error: e.message }, { status: e.status || 502 });
  }
}
