import { companyForUpload, slugFromPath } from '@/lib/access.js';
import { guardAdmin } from '@/lib/auth.js';
import { notifyEvent, whoFromSession } from '@/lib/notify.js';
import { applyAction, getProject } from '@/lib/projects.js';
import { getSession } from '@/lib/session.js';
import { createJob, syncJob } from '@/lib/jobs.js';
import { listJobs } from '@/lib/store.js';

export const maxDuration = 60;

// Admin: list every transcript, checking on any still in progress.
export async function GET(request) {
  const denied = await guardAdmin(request);
  if (denied) return denied;
  const jobs = await listJobs();
  await Promise.all(jobs.filter((j) => j.status === 'processing').map((j) => syncJob(j).catch(() => j)));
  return Response.json({ jobs });
}

// Called by the browser right after an upload finishes: starts the transcription.
// Allowed for the admin, a signed-in client (their own company), or a holder of a company upload link.
export async function POST(request) {
  const { pathname, filename, token, terms, projectId } = await request.json().catch(() => ({}));
  const s = await getSession();
  const role = token ? 'link' : s?.r;
  if (!['link', 'admin', 'client'].includes(role)) return Response.json({ error: 'Not allowed' }, { status: 401 });
  if (role !== 'link' && request.headers.get('x-htr') !== '1') return Response.json({ error: 'Missing header' }, { status: 400 });
  const slug = slugFromPath(pathname);
  const company = slug && (await companyForUpload({ token, slug }));
  if (!company || company.slug !== slug) return Response.json({ error: 'This upload link is not valid.' }, { status: 403 });

  let project = null;
  if (projectId) {
    project = await getProject(projectId);
    if (!project || project.company !== slug) return Response.json({ error: 'Project not found.' }, { status: 404 });
  }

  const extraTerms = role === 'admin' ? String(terms || '').split(/[,\n]/) : [];
  try {
    const job = await createJob({
      request, company, pathname, filename: filename || pathname.split('/').pop(),
      source: role === 'admin' ? 'admin' : 'client', extraTerms, projectId: project?.id,
    });
    if (project) {
      const who = await whoFromSession(s);
      const { event } = await applyAction(project, who, { type: 'video.set', item: 'video', jobId: job.id, filename: job.filename });
      await notifyEvent(project, who, event);
    }
    // Clients only learn that it worked; transcripts are visible to HTR only.
    return Response.json(role === 'admin' ? job : { ok: job.status !== 'error' });
  } catch (e) {
    return Response.json({ error: e.message }, { status: e.status || 500 });
  }
}
