import AdminOrders from '@/components/AdminOrders.js';
import { requireAdminPage } from '@/lib/auth.js';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Orders · Hotel Tech Report' };

export default async function Orders() {
  await requireAdminPage();
  return <AdminOrders />;
}
