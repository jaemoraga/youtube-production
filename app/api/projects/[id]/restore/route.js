// Admin: bring a project back from the trash, or (DELETE) remove it for good right away.
import { getProject, purgeProject, restoreProject } from '@/lib/projects.js';
import { guard } from '@/lib/session.js';

export async function POST(request, { params }) {
  const [s, denied] = await guard(request, ['admin']);
  if (denied) return denied;
  const { id } = await params;
  try {
    const p = await restoreProject(id, { role: 'admin', email: s.e, name: s.e ? s.e.split('@')[0] : 'HTR' });
    return Response.json({ ok: true, id: p.id });
  } catch (e) {
    return Response.json({ error: e.message }, { status: e.status || 500 });
  }
}

export async function DELETE(request, { params }) {
  const [, denied] = await guard(request, ['admin']);
  if (denied) return denied;
  const { id } = await params;
  const p = await getProject(id, { includeDeleted: true });
  if (!p?.deletedAt) return Response.json({ error: 'Move it to the trash first.' }, { status: 400 });
  await purgeProject(p);
  return Response.json({ ok: true });
}
