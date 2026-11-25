// Step 2 of sign-in: check the code, start a 7-day session.
import { after } from 'next/server';
import { adminAlert, siteUrl } from '@/lib/alerts.js';
import { getCompanies } from '@/lib/store.js';
import { checkCode, normEmail } from '@/lib/codes.js';
import { listProjects } from '@/lib/projects.js';
import { startSession } from '@/lib/session.js';
import { recordVisit } from '@/lib/notifications.js';
import { getMember, registerUser, touchLogin } from '@/lib/users.js';

const MESSAGES = { wrong: 'That code is not right.', expired: 'That code has expired. Request a new one.', locked: 'Too many wrong tries. Request a new code.' };

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const email = normEmail(body.email);
  const { result, meta } = await checkCode(email, body.code);
  if (result !== 'ok') return Response.json({ error: MESSAGES[result] }, { status: 400 });

  if (meta?.as === 'admin') {
    await startSession({ role: 'admin', email });
    return Response.json({ redirect: '/admin' });
  }

  let user = await getMember(email);
  const isNew = !user && !!meta?.register;
  if (isNew) user = await registerUser({ email, ...meta.register });
  if (!user) return Response.json({ error: 'Account not found. Start again.' }, { status: 400 });
  // Signing in never creates a project. A project opens when an order is paid (lib/orders.js) or HTR
  // creates one in the admin. Someone with no project lands on the order page.
  await touchLogin(user);
  const projects = await listProjects({ company: user.company });
  const [project] = projects;
  for (const pr of projects) await recordVisit(pr.id, { email, page: 'signed in' }).catch(() => null);
  after(async () => {
    const company = (await getCompanies()).find((c) => c.slug === user.company)?.name || user.company;
    const name = `${user.first} ${user.last}`.trim();
    const where = project ? `${siteUrl()}/admin/projects/${project.id}` : `${siteUrl()}/admin`;
    await adminAlert(isNew && !project
      ? { subject: `New YouTube video lead: ${name} at ${company}`, text: `${name} (${email}) at ${company} just created an account in the YouTube Content Studio.\n\nThey have no project, so they were sent to the order page to pay or request an invoice. You'll get another email if they order.\n\n${siteUrl()}/admin/orders` }
      : isNew
      ? { subject: `New client account: ${name} at ${company}`, text: `${name} (${email}) just created an account for ${company}.${meta?.register?.companyName && meta.register.companyName !== company ? `\nThey typed "${meta.register.companyName}" and were added to the existing ${company} company by email domain.` : ''}\n\n${where}` }
      : { subject: `Client signed in: ${name} (${company})`, text: `${name} (${email}) from ${company} signed in to the sponsor portal.\n\n${where}` });
  });
  await startSession({ role: 'client', email, company: user.company });
  return Response.json({ redirect: '/client-submission/youtube' });
}
