import { guard } from '@/lib/session.js';
import { createProject, forRole, listProjects, projectStatus } from '@/lib/projects.js';

export async function GET(request) {
  const [s, denied] = await guard(request, ['admin', 'client', 'editor']);
  if (denied) return denied;
  const projects = await listProjects(s.r === 'client' ? { company: s.c } : {});
  const views = projects.map((p) => forRole(p, s.r));
  return Response.json({ projects: views.map((p) => ({ ...p, status: projectStatus(p) })) });
}

// HTR starts a new project for a company (the first one is created when the client signs up).
export async function POST(request) {
  const [, denied] = await guard(request, ['admin']);
  if (denied) return denied;
  const { company, name } = await request.json().catch(() => ({}));
  try {
    return Response.json({ project: forRole(await createProject(company, name), 'admin') });
  } catch (e) {
    return Response.json({ error: e.message }, { status: e.status || 500 });
  }
}
