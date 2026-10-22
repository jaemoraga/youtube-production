import { EDITOR_PASSWORD } from '@/lib/config.js';
import { safeEqual } from '@/lib/secrets.js';
import { startSession } from '@/lib/session.js';

export async function POST(request) {
  const { password } = await request.json().catch(() => ({}));
  if (EDITOR_PASSWORD.length < 8 || !safeEqual(String(password || ''), EDITOR_PASSWORD)) {
    await new Promise((r) => setTimeout(r, 1000));
    return Response.json({ error: EDITOR_PASSWORD ? 'Wrong password.' : 'The editor view is not set up yet.' }, { status: 401 });
  }
  await startSession({ role: 'editor' });
  return Response.json({ redirect: '/editor' });
}
