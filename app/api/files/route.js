// Opens a stored file (brand asset or video) through a short-lived signed link.
// Admins and editors can open any file; clients only their own company's.
import { head } from '@vercel/blob';
import { temporaryVideoUrl } from '@/lib/jobs.js';
import { getSession } from '@/lib/session.js';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const s = await getSession();
  const path = new URL(request.url).searchParams.get('p') || '';
  if (!/^(assets|uploads)\/[a-z0-9-]+\//.test(path) || path.includes('..')) return new Response('Not found', { status: 404 });
  const company = path.split('/')[1];
  const allowed = s && (s.r === 'admin' || s.r === 'editor' || (s.r === 'client' && s.c === company));
  if (!allowed) return new Response('Not allowed', { status: 403 });
  if (!(await head(path).catch(() => null))) return new Response('Not found', { status: 404 });
  return new Response(null, { status: 302, headers: { location: await temporaryVideoUrl(path, 1), 'cache-control': 'no-store' } });
}
