import { notifyEvent, whoFromSession } from '@/lib/notify.js';
import { announce } from '@/lib/production.js';
import { applyAction, forRole, getProject, projectStatus } from '@/lib/projects.js';
import { getScript } from '@/lib/script.js';
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

// The video editor may only touch the production steps: footage, the two cuts, completion.
const EDITOR_ACTIONS = ['footage.set', 'cut.set', 'complete'];

// Every change goes through here: { type, item, ...fields }. See applyAction in lib/projects.js.
export async function POST(request, { params }) {
  const { s, p, denied } = await load(request, params, ['admin', 'client', 'editor']);
  if (denied) return denied;
  const action = await request.json().catch(() => ({}));
  if (action.type === 'video.set') return Response.json({ error: 'Upload the video instead.' }, { status: 400 });
  if (s.r === 'editor' && !EDITOR_ACTIONS.includes(action.type)) return Response.json({ error: 'Not allowed' }, { status: 403 });
  if (action.type === 'script.stamp') return Response.json({ error: 'Use the script page.' }, { status: 400 });
  try {
    // "Revisions implemented": lock the script from the project page. Only once the client has had it.
    if (action.type === 'script.lock') {
      if (s.r !== 'admin') return Response.json({ error: 'Not allowed' }, { status: 403 });
      if (!(await getScript(p.id))?.shared) return Response.json({ error: 'Release the script to the client first.' }, { status: 400 });
      Object.assign(action, { type: 'script.stamp', event: 'locked' });
    }
    const who = s.r === 'editor' ? { role: 'editor', email: null, name: 'Video editor' } : await whoFromSession(s);
    const { project, event, scripting, stage, wasStage } = await applyAction(p, who, action);
    await notifyEvent(project, who, event, { scripting });
    await announce(project, who, wasStage, stage, action).catch((e) => console.error('announce failed', e.message));
    const view = forRole(project, s.r);
    return Response.json({ project: { ...view, status: projectStatus(view) } });
  } catch (e) {
    return Response.json({ error: e.message }, { status: e.status || 500 });
  }
}
