// The audit trail for a project: emails to the client with what Resend reported, and the client's visits.
import { getLog, summarize } from '@/lib/notifications.js';
import { getProject } from '@/lib/projects.js';
import { guard } from '@/lib/session.js';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const [, denied] = await guard(request, ['admin']);
  if (denied) return denied;
  const { id } = await params;
  const p = await getProject(id);
  if (!p) return Response.json({ error: 'Not found' }, { status: 404 });
  return Response.json(summarize(await getLog(p.id)));
}
