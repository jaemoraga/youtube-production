import { redirect } from 'next/navigation';
import Dashboard from '@/components/Dashboard.js';
import { getSession } from '@/lib/session.js';

export const dynamic = 'force-dynamic';

// The site root is the sponsor landing page. Signed-in admins still get the dashboard here;
// admins who are signed out sign in at /login.
export default async function Home() {
  const s = await getSession();
  if (s?.r === 'admin') return <Dashboard />;
  if (s?.r === 'client') redirect('/client-submission/youtube');
  if (s?.r === 'editor') redirect('/editor');
  redirect('/client-submission/youtube/login');
}
