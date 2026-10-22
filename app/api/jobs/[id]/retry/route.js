import { guardAdmin } from '@/lib/auth.js';
import { retryJob } from '@/lib/jobs.js';
import { getJob } from '@/lib/store.js';

export async function POST(request, { params }) {
  const denied = await guardAdmin(request);
  if (denied) return denied;
  const { id } = await params;
  const job = await getJob(id);
  if (!job) return Response.json({ error: 'Not found' }, { status: 404 });
  try {
    return Response.json({ job: await retryJob(job, request) });
  } catch (e) {
    return Response.json({ error: e.message }, { status: e.status || 500 });
  }
}
