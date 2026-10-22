// Step 2 of sign-in: check the code, start a 7-day session.
import { checkCode, normEmail } from '@/lib/codes.js';
import { createProject, listProjects } from '@/lib/projects.js';
import { startSession } from '@/lib/session.js';
import { getUser, registerUser } from '@/lib/users.js';

const MESSAGES = { wrong: 'That code is not right.', expired: 'That code has expired. Request a new one.', locked: 'Too many wrong tries. Request a new code.' };

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const email = normEmail(body.email);
  const { result, meta } = await checkCode(email, body.code);
  if (result !== 'ok') return Response.json({ error: MESSAGES[result] }, { status: 400 });

  if (meta?.as === 'admin') {
    await startSession({ role: 'admin', email });
    return Response.json({ redirect: '/' });
  }

  let user = await getUser(email);
  if (!user && meta?.register) user = await registerUser({ email, ...meta.register });
  if (!user) return Response.json({ error: 'Account not found. Start again.' }, { status: 400 });
  if (!(await listProjects({ company: user.company })).length) await createProject(user.company);
  await startSession({ role: 'client', email, company: user.company });
  return Response.json({ redirect: '/portal' });
}
