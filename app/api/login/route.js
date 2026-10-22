import { checkPassword, startSession } from '@/lib/auth.js';
import { problems } from '@/lib/config.js';

export async function POST(request) {
  const missing = problems();
  if (missing.length) return Response.json({ error: `Setup incomplete: ${missing.join('; ')}.` }, { status: 500 });
  const { password } = await request.json().catch(() => ({}));
  if (!checkPassword(String(password || ''))) {
    await new Promise((r) => setTimeout(r, 1000)); // slows down guessing
    return Response.json({ error: 'Wrong password.' }, { status: 401 });
  }
  await startSession();
  return Response.json({ ok: true });
}
