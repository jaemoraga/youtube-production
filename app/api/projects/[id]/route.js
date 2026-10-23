import { notifyEvent, whoFromSession } from '@/lib/notify.js';
import { applyAction, forRole, getProject, projectStatus } from '@/lib/projects.js';
import { guard } from '@/lib/session.js';

async function load(request, params, roles) {
  const [s, denied] = await guard(request, roles);
  if (denied) return { denied };
  const { id } = await params;
  const p = await getProject(id);
  if (!p || (s.r === 'client' && p.company !== s.c)) return { denied: Response.json({ error: 'Not found' }, { status: 404 }) };
  return { s, p };
}

export async function GET(request, { params }) {
  const { s, p, denied } = await load(request, params, ['admin', 'client', 'editor']);
  if (denied) return denied;
  const view = forRole(p, s.r);
  return Response.json({ project: { ...view, status: projectStatus(view) }, role: s.r });
}

// Every change goes through here: { type, item, ...fields }. See applyAction in lib/projects.js.
export async function POST(request, { params }) {
  const { s, p, denied } = await load(request, params, ['admin', 'client']);
  if (denied) return denied;
  const action = await request.json().catch(() => ({}));
  if (action.type === 'video.set') return Response.json({ error: 'Upload the video instead.' }, { status: 400 });
  try {
    const who = await whoFromSession(s);
    const { project, event, scripting } = await applyAction(p, who, action);
    await notifyEvent(project, who, event, { scripting });
    const view = forRole(project, s.r);
    return Response.json({ project: { ...view, status: projectStatus(view) } });
  } catch (e) {
    return Response.json({ error: e.message }, { status: e.status || 500 });
  }
}
