import { redirect } from 'next/navigation';
import CodeLogin from '@/components/CodeLogin.js';
import { ADMIN_DOMAIN, EMAIL_ENABLED } from '@/lib/config.js';
import { getSession } from '@/lib/session.js';

export const dynamic = 'force-dynamic';

export default async function AdminLogin() {
  if ((await getSession())?.r === 'admin') redirect('/');
  return <CodeLogin as="admin" heading="HTR admin" sub={`For @${ADMIN_DOMAIN} team members.`} passwordFallback={!EMAIL_ENABLED} />;
}
