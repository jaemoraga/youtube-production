// AssemblyAI calls this when a transcript finishes. It must answer within 10 seconds, so the
// slow part (download transcript, save it, delete the video) runs after the response is sent.
// If this call is ever missed, opening the dashboard finishes the job instead.
import { after } from 'next/server';
import { safeEqual, webhookSecret } from '@/lib/auth.js';
import { syncJob } from '@/lib/jobs.js';
import { getJob } from '@/lib/store.js';

export const maxDuration = 120;

export async function POST(request) {
  if (!safeEqual(request.headers.get('x-htr-webhook') || '', webhookSecret())) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const id = new URL(request.url).searchParams.get('job') || '';
  const body = await request.json().catch(() => ({}));
  const job = await getJob(id);
  if (!job || job.transcriptId !== body.transcript_id) return Response.json({ ok: true }); // nothing to do
  after(() => syncJob(job).catch((e) => console.error('webhook sync failed', id, e)));
  return Response.json({ ok: true });
}
