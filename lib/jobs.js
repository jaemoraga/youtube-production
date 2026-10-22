import { createHash } from 'node:crypto';
import { head, issueSignedToken, presignUrl } from '@vercel/blob';
import { webhookSecret } from './secrets.js';
import { DEFAULT_KEYTERMS, PRICE_PER_HOUR } from './config.js';
import { cleanKeyterms, compactTranscript, deleteTranscript, getTranscript, submitTranscript } from './assemblyai.js';
import { getJob, saveJob, transcriptPath, writeJSON } from './store.js';

// Job id is derived from the stored file path, so submitting the same upload twice is harmless.
export const jobIdFor = (pathname) => createHash('sha256').update(pathname).digest('hex').slice(0, 24);

export function publicBaseUrl(request) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, '');
  if (process.env.VERCEL_ENV === 'production' && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || '';
  const proto = request.headers.get('x-forwarded-proto') || 'https';
  return `${proto}://${host}`;
}

// A temporary link to the private video (used by AssemblyAI, and behind the editor link).
export async function temporaryVideoUrl(pathname, hours = 24) {
  const validUntil = Date.now() + hours * 3600e3;
  const token = await issueSignedToken({ pathname, operations: ['get'], validUntil });
  const { presignedUrl } = await presignUrl(token, { operation: 'get', pathname, access: 'private', validUntil });
  return presignedUrl;
}

export async function createJob({ request, company, pathname, filename, source, extraTerms = [], projectId = null }) {
  const id = jobIdFor(pathname);
  const existing = await getJob(id);
  if (existing) return existing;

  const blob = await head(pathname).catch(() => null);
  if (!blob) throw Object.assign(new Error('Upload not found. Please try again.'), { status: 400 });

  const job = {
    id, pathname, filename: String(filename).slice(0, 200), size: blob.size,
    companySlug: company.slug, companyName: company.name, source,
    keyterms: cleanKeyterms([...DEFAULT_KEYTERMS, ...(company.keyterms || []), ...extraTerms]),
    status: 'processing', createdAt: new Date().toISOString(), transcriptId: null,
    error: null, duration: null, completedAt: null, speakerNames: {}, costEstimate: null, projectId,
  };
  await submit(job, request);
  return job;
}

async function submit(job, request) {
  const base = publicBaseUrl(request);
  const reachable = !/localhost|127\.0\.0\.1/.test(base);
  try {
    const t = await submitTranscript({
      audioUrl: await temporaryVideoUrl(job.pathname),
      keyterms: job.keyterms,
      webhookUrl: reachable ? `${base}/api/webhook?job=${job.id}` : null,
      webhookSecret: webhookSecret(),
    });
    Object.assign(job, { transcriptId: t.id, status: 'processing', error: null, submittedAt: new Date().toISOString() });
  } catch (e) {
    Object.assign(job, { status: 'error', error: `Could not start transcription: ${e.message}` });
  }
  await saveJob(job);
}

export async function retryJob(job, request) {
  if (job.status !== 'error') throw Object.assign(new Error('Only failed jobs can be retried.'), { status: 409 });
  if (!(await head(job.pathname).catch(() => null))) {
    throw Object.assign(new Error('The original video is gone; upload it again.'), { status: 409 });
  }
  await submit(job, request);
  return job;
}

// Called from the webhook and whenever the dashboard looks at an unfinished job.
// Safe to run twice: a finished job is left alone.
export async function syncJob(job) {
  if (job.status !== 'processing' || !job.transcriptId) return job;
  let t;
  try {
    t = await getTranscript(job.transcriptId);
  } catch (e) {
    if (e.status === 404) {
      const fresh = await getJob(job.id);   // another call may have finished it moments ago
      if (fresh?.status === 'done') return fresh;
    }
    return job;   // temporary problem: try again next time
  }
  if (t.status === 'completed') {
    const data = compactTranscript(t);
    await writeJSON(transcriptPath(job.id), data);
    const hours = (data.duration || 0) / 3600;
    Object.assign(job, {
      status: 'done', duration: data.duration, completedAt: new Date().toISOString(), model: data.model,
      costEstimate: +(hours * (PRICE_PER_HOUR.model + PRICE_PER_HOUR.speakers +
        (job.keyterms.length ? PRICE_PER_HOUR.keyterms : 0))).toFixed(3),
    });
    await saveJob(job);
    await deleteTranscript(job.transcriptId); // we keep our own copy; remove theirs
  } else if (t.status === 'error') {
    Object.assign(job, { status: 'error', error: t.error || 'Transcription failed.' });
    await saveJob(job);
  }
  return job;
}
