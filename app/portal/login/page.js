import { redirect } from 'next/navigation';
import CodeLogin from '@/components/CodeLogin.js';
import { getSession } from '@/lib/session.js';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sponsor portal · Hotel Tech Report' };

export default async function ClientLogin() {
  if ((await getSession())?.r === 'client') redirect('/portal');
  return <CodeLogin as="client" heading="Sponsor portal" sub="Sign in or create your account with your work email." />;
}
