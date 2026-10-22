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
  const transcript = job.status === 'done' ? await readJSON(transcriptPath(job.id)) : null;
  return Response.json({ job, transcript });
}

// Save speaker names (e.g. "A" -> "Jordan Hollander").
export async function PATCH(request, { params }) {
  const denied = await guardAdmin(request);
  if (denied) return denied;
  const job = await load(params);
  if (!job) return Response.json({ error: 'Not found' }, { status: 404 });
  const { speakerNames } = await request.json().catch(() => ({}));
  job.speakerNames = Object.fromEntries(Object.entries(speakerNames || {})
    .filter(([k]) => /^[A-Z?]{1,3}$/.test(k)).map(([k, v]) => [k, String(v).slice(0, 80)]));
  await saveJob(job);
  return Response.json({ job });
}

export async function DELETE(request, { params }) {
  const denied = await guardAdmin(request);
  if (denied) return denied;
  const job = await load(params);
  if (!job) return Response.json({ error: 'Not found' }, { status: 404 });
  await Promise.all([remove(job.pathname), remove(transcriptPath(job.id)),
    job.transcriptId ? deleteTranscript(job.transcriptId) : null]);
  await remove(jobPath(job.id));
  return Response.json({ ok: true });
}
