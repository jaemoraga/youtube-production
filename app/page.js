import Dashboard from '@/components/Dashboard.js';
import { requireAdminPage } from '@/lib/auth.js';

export const dynamic = 'force-dynamic';

export default async function Home() {
  await requireAdminPage();
  return <Dashboard />;
}
