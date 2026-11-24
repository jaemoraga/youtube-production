// The editing guide for one project. Admins build it; admins and editors read it.
import { buildGuide, getGuide, guideStats, readiness, staleReason } from '@/lib/guide.js';
import { whoFromSession } from '@/lib/notify.js';
import { getProject } from '@/lib/projects.js';
import { getScript } from '@/lib/script.js';
import { guard } from '@/lib/session.js';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function load(request, params, roles) {
  const [s, denied] = await guard(request, roles);
  if (denied) return { denied };
  const { id } = await params;
  const p = await getProject(id);
  if (!p) return { denied: Response.json({ error: 'Not found' }, { status: 404 }) };
  return { s, p };
}

const view = async (p, guide) => ({ guide: guideStats(guide), stale: staleReason(guide, await getScript(p.id), p), blocker: await readiness(p) });

export async function GET(request, { params }) {
  const { p, denied } = await load(request, params, ['admin', 'editor']);
  if (denied) return denied;
  return Response.json(await view(p, await getGuide(p.id)));
}

export async function POST(request, { params }) {
  const { s, p, denied } = await load(request, params, ['admin']);
  if (denied) return denied;
  try {
    return Response.json(await view(p, await buildGuide(p, await whoFromSession(s))));
  } catch (e) {
    return Response.json({ error: e.message }, { status: e.status || 500 });
  }
}
