// Admin: begin connecting the app to Hotel Tech Report. Sends the admin to hoteltechreport.com to sign in.
import { adminAlert, siteUrl } from '@/lib/alerts.js';
import { beginConnect } from '@/lib/htr-oauth.js';
import { publicBaseUrl } from '@/lib/jobs.js';
import { getSession } from '@/lib/session.js';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Only ever send the admin back to a page inside the admin area.
const safeBack = (v) => (/^\/admin(\/[\w\-/]*)?$/.test(v || '') ? v : '/admin');

export async function GET(request) {
  const s = await getSession();
  const base = siteUrl() || publicBaseUrl(request);
  if (!s || s.r !== 'admin') return Response.redirect(`${base}/admin/login`, 302);
  const back = safeBack(new URL(request.url).searchParams.get('back'));
  try {
    const url = await beginConnect({ base, back, email: s.e });
    return new Response(null, { status: 302, headers: { location: url, 'cache-control': 'no-store' } });
  } catch (e) {
    await adminAlert({ subject: 'Hotel Tech Report connection could not start', text: `Reason: ${e.message}\n\n${base}${back}` }).catch(() => {});
    return Response.redirect(`${base}${back}?htr=${encodeURIComponent(e.message)}#internal-dossier`, 302);
  }
}
