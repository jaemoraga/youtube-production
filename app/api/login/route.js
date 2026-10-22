// Admin password sign-in: only works until email codes are set up (RESEND_API_KEY).
import { checkPassword, startSession } from '@/lib/auth.js';
import { EMAIL_ENABLED, problems } from '@/lib/config.js';

export async function POST(request) {
  if (EMAIL_ENABLED) return Response.json({ error: 'Sign in with your email code.' }, { status: 403 });
  const missing = problems();
  if (missing.length) return Response.json({ error: `Setup incomplete: ${missing.join('; ')}.` }, { status: 500 });
  const { password } = await request.json().catch(() => ({}));
  if (!checkPassword(String(password || ''))) {
    await new Promise((r) => setTimeout(r, 1000));
    return Response.json({ error: 'Wrong password.' }, { status: 401 });
  }
  await startSession({ role: 'admin', email: null });
  return Response.json({ ok: true, redirect: '/' });
}
