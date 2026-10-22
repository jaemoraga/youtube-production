import { endSession } from '@/lib/auth.js';

export async function POST() {
  await endSession();
  return Response.json({ ok: true });
}
