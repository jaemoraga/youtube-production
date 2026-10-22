import { head } from '@vercel/blob';
import { guardAdmin } from '@/lib/auth.js';
import { deleteTranscript } from '@/lib/assemblyai.js';
import { syncJob } from '@/lib/jobs.js';
import { getJob, jobPath, readJSON, remove, saveJob, transcriptPath } from '@/lib/store.js';

export const maxDuration = 60;

async function load(params) {
  const { id } = await params;
  return getJob(id);
}

export async function GET(request, { params }) {
  const denied = await guardAdmin(request);
  if (denied) return denied;
  let job = await load(params);
  if (!job) return Response.json({ error: 'Not found' }, { status: 404 });
  job = await syncJob(job).catch(() => job);
  const [transcript, video] = await Promise.all([
    job.status === 'done' ? readJSON(transcriptPath(job.id)) : null,
    head(job.pathname).catch(() => null),
  ]);
  return Response.json({ job, transcript, videoStored: !!video });
}

// Save speaker names (e.g. "A" -> "Jordan Hollander") and/or a new display title.
export async function PATCH(request, { params }) {
  const denied = await guardAdmin(request);
  if (denied) return denied;
  const job = await load(params);
  if (!job) return Response.json({ error: 'Not found' }, { status: 404 });
  const { speakerNames, title } = await request.json().catch(() => ({}));
  if (speakerNames !== undefined) {
    job.speakerNames = Object.fromEntries(Object.entries(speakerNames || {})
      .filter(([k]) => /^[A-Z?]{1,3}$/.test(k)).map(([k, v]) => [k, String(v).slice(0, 80)]));
  }
  if (title !== undefined) {
    const clean = String(title).replace(/\s+/g, ' ').trim().slice(0, 200);
    job.title = clean || null; // empty = back to the original file name
  }
  await saveJob(job);
  return Response.json({ job });
}

export async function DELETE(request, { params }) {
  const denied = await guardAdmin(request);
  if (denied) return denied;
  const job = await load(params);
  if (!job) return Response.json({ error: 'Not found' }, { status: 404 });
  await Promise.all([remove(job.pathname), remove(transcriptPath(job.id)),
    job.shareToken ? remove(`shares/${job.shareToken}.json`) : null,
    job.transcriptId ? deleteTranscript(job.transcriptId) : null]);
  await remove(jobPath(job.id));
  return Response.json({ ok: true });
}
