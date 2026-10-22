// Returns the permanent editor link for a transcript's video, creating it the first time.
import { randomBytes } from 'node:crypto';
import { head } from '@vercel/blob';
import { guardAdmin } from '@/lib/auth.js';
import { publicBaseUrl } from '@/lib/jobs.js';
import { getJob, saveJob, writeJSON } from '@/lib/store.js';

export async function POST(request, { params }) {
  const denied = await guardAdmin(request);
  if (denied) return denied;
  const { id } = await params;
  const job = await getJob(id);
  if (!job) return Response.json({ error: 'Not found' }, { status: 404 });
  if (!(await head(job.pathname).catch(() => null))) {
    return Response.json({ error: 'This video is no longer stored. Upload it again to get a link.' }, { status: 409 });
  }
  if (!job.shareToken) {
    job.shareToken = randomBytes(18).toString('base64url');
    await writeJSON(`shares/${job.shareToken}.json`, { id: job.id });
    await saveJob(job);
  }
  return Response.json({ url: `${publicBaseUrl(request)}/v/${job.shareToken}` });
}
