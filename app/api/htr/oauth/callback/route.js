// Hotel Tech Report sends the admin back here after they sign in. Stores the connection, then returns
// them to the project they started from.
import { adminAlert, siteUrl } from '@/lib/alerts.js';
import { finishConnect } from '@/lib/htr-oauth.js';
import { publicBaseUrl } from '@/lib/jobs.js';
import { getSession } from '@/lib/session.js';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(request) {
  const s = await getSession();
  const base = siteUrl() || publicBaseUrl(request);
  if (!s || s.r !== 'admin') return Response.redirect(`${base}/admin/login`, 302);
  const q = new URL(request.url).searchParams;
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fail = (msg) => new Response(
    `<!doctype html><meta charset="utf-8"><title>Hotel Tech Report not connected</title><body style="font:16px/1.5 system-ui;max-width:520px;margin:80px auto;padding:0 20px"><h1 style="font-size:20px">Hotel Tech Report was not connected</h1><p>${esc(msg)}</p><p><a href="/admin">Back to projects</a></p></body>`,
    { status: 400, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } },
  );
  if (q.get('error')) return fail(q.get('error_description') || `Hotel Tech Report sign-in was not completed (${q.get('error')}).`);
  if (!q.get('code') || !/^[\w-]{20,40}$/.test(q.get('state') || '')) return fail('That sign-in link is not valid. Click Connect again.');
  try {
    const back = await finishConnect({ id: q.get('state'), code: q.get('code'), email: s.e });
    await adminAlert({ subject: 'Hotel Tech Report connected', text: `${s.e || 'An admin'} connected the YouTube Studio app to Hotel Tech Report. Internal dossiers can now be filled from vendor profiles.\n\n${base}${back}` }).catch(() => {});
    return new Response(null, { status: 302, headers: { location: `${base}${back}?htr=connected#internal-dossier`, 'cache-control': 'no-store' } });
  } catch (e) {
    return fail(e.message);
  }
}
