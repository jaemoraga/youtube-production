import { companyForUpload, slugFromPath } from '@/lib/access.js';
import { guardAdmin, isAdmin } from '@/lib/auth.js';
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
// Allowed for the admin, or for a client holding the company's private link token.
export async function POST(request) {
  const { pathname, filename, token, terms } = await request.json().catch(() => ({}));
  const admin = await isAdmin();
  if (!token && !admin) return Response.json({ error: 'Not allowed' }, { status: 401 });
  if (admin && !token && request.headers.get('x-htr') !== '1') {
    return Response.json({ error: 'Missing header' }, { status: 400 });
  }
  const slug = slugFromPath(pathname);
  const company = slug && (await companyForUpload({ token, slug }));
  if (!company || company.slug !== slug) return Response.json({ error: 'This upload link is not valid.' }, { status: 403 });

  const extraTerms = admin && !token ? String(terms || '').split(/[,\n]/) : [];
  try {
    const job = await createJob({
      request, company, pathname, filename: filename || pathname.split('/').pop(),
      source: token ? 'client' : 'admin', extraTerms,
    });
    // Clients only learn that it worked; transcripts are visible to the admin only.
    return Response.json(admin && !token ? job : { ok: job.status !== 'error' });
  } catch (e) {
    return Response.json({ error: e.message }, { status: e.status || 500 });
  }
}
