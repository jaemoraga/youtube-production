// Step 1 of sign-in: email a 6-digit code. Used by admins (company domain only) and clients.
import { ADMIN_DOMAIN, EMAIL_ENABLED } from '@/lib/config.js';
import { issueCode, normEmail, validEmail } from '@/lib/codes.js';
import { sendEmail } from '@/lib/email.js';
import { getMember } from '@/lib/users.js';

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const email = normEmail(body.email);
  const as = body.as === 'admin' ? 'admin' : 'client';
  if (!validEmail(email)) return Response.json({ error: 'Enter a valid email address.' }, { status: 400 });
  if (!EMAIL_ENABLED) return Response.json({ error: 'Email sign-in is not set up yet.' }, { status: 503 });

  let meta = { as };
  if (as === 'admin') {
    if (!email.endsWith(`@${ADMIN_DOMAIN}`)) {
      return Response.json({ error: `Admin sign-in is only for @${ADMIN_DOMAIN} addresses.` }, { status: 403 });
    }
  } else if (!(await getMember(email))) {
    const first = String(body.first || '').trim(), last = String(body.last || '').trim(), company = String(body.company || '').trim();
    if (!first || !last || !company) return Response.json({ needsRegistration: true });
    meta = { as, register: { first, last, companyName: company } };
  }

  try {
    const code = await issueCode(email, meta);
    await sendEmail({
      to: email,
      subject: `Your Hotel Tech Report sign-in code: ${code}`,
      text: `Your sign-in code is ${code}\n\nIt expires in 10 minutes. If you didn't ask for it, ignore this email.\n\nHotel Tech Report`,
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: e.status || 500 });
  }
  return Response.json({ sent: true });
}
