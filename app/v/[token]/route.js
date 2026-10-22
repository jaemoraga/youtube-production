// The link you send your editor. No login: anyone with the link gets the video.
// Each visit redirects to a fresh 12-hour download link, so this link itself never expires.
import { temporaryVideoUrl } from '../../../lib/jobs.js';
import { getJob, readJSON } from '../../../lib/store.js';

export const dynamic = 'force-dynamic';

const gone = () => new Response('This video link is no longer available. Ask Hotel Tech Report for a new one.', {
  status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' },
});

export async function GET(request, { params }) {
  const { token } = await params;
  if (!/^[\w-]{20,40}$/.test(token)) return gone();
  const share = await readJSON(`shares/${token}.json`).catch(() => null);
  const job = share && (await getJob(share.id));
  if (!job || job.shareToken !== token) return gone();
  const url = await temporaryVideoUrl(job.pathname, 12);
  return new Response(null, { status: 302, headers: { location: url, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } });
}
