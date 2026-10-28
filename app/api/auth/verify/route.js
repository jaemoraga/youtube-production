// Step 2 of sign-in: check the code, start a 7-day session.
import { after } from 'next/server';
import { adminAlert, siteUrl } from '@/lib/alerts.js';
import { getCompanies } from '@/lib/store.js';
import { checkCode, normEmail } from '@/lib/codes.js';
import { createProject, listProjects } from '@/lib/projects.js';
import { startSession } from '@/lib/session.js';
import { getMember, registerUser, touchLogin } from '@/lib/users.js';

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

  let user = await getMember(email);
  const isNew = !user && !!meta?.register;
  if (isNew) user = await registerUser({ email, ...meta.register });
  if (!user) return Response.json({ error: 'Account not found. Start again.' }, { status: 400 });
  if (!(await listProjects({ company: user.company })).length) {
    await createProject(user.company, null, { role: 'client', email, name: `${user.first} ${user.last}`.trim() });
  }
  await touchLogin(user);
  const [project] = await listProjects({ company: user.company });
  after(async () => {
    const company = (await getCompanies()).find((c) => c.slug === user.company)?.name || user.company;
    const name = `${user.first} ${user.last}`.trim();
    await adminAlert(isNew
      ? { subject: `New client account: ${name} at ${company}`, text: `${name} (${email}) just created an account for ${company}.${meta?.register?.companyName && meta.register.companyName !== company ? `\nThey typed "${meta.register.companyName}" and were added to the existing ${company} company by email domain.` : ''}\n\n${siteUrl()}/projects/${project?.id || ''}` }
      : { subject: `Client signed in: ${name} (${company})`, text: `${name} (${email}) from ${company} signed in to the sponsor portal.\n\n${siteUrl()}/projects/${project?.id || ''}` });
  });
  await startSession({ role: 'client', email, company: user.company });
  return Response.json({ redirect: '/portal' });
}
