import { endSession } from '@/lib/session.js';

export async function POST() {
  await endSession();
  return Response.json({ ok: true });
}
