import { guard } from '@/lib/session.js';
import { createProject, forRole, listProjects, projectStatus, trashExpiry } from '@/lib/projects.js';

export async function GET(request) {
  const [s, denied] = await guard(request, ['admin', 'client', 'editor']);
  if (denied) return denied;
  if (new URL(request.url).searchParams.get('trash')) {
    if (s.r !== 'admin') return Response.json({ error: 'Not allowed' }, { status: 403 });
    const trash = await listProjects({ trash: true });
    return Response.json({ projects: trash.map((p) => ({ id: p.id, name: p.name, companyName: p.companyName, deletedAt: p.deletedAt, deletedBy: p.deletedBy, expiresAt: trashExpiry(p).toISOString() })) });
  }
  const projects = await listProjects(s.r === 'client' ? { company: s.c } : {});
  const views = projects.map((p) => forRole(p, s.r));
  return Response.json({ projects: views.map((p) => ({ ...p, status: projectStatus(p) })) });
}

// HTR starts a new project for a company (the first one is created when the client signs up).
export async function POST(request) {
  const [s, denied] = await guard(request, ['admin']);
  if (denied) return denied;
  const { company, name } = await request.json().catch(() => ({}));
  try {
    return Response.json({ project: forRole(await createProject(company, name, { role: 'admin', email: s.e, name: s.e ? s.e.split('@')[0] : 'HTR' }), 'admin') });
  } catch (e) {
    return Response.json({ error: e.message }, { status: e.status || 500 });
  }
}
