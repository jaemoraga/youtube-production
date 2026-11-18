import TranscriptView from '@/components/TranscriptView.js';
import { requireAdminPage } from '@/lib/auth.js';

export const dynamic = 'force-dynamic';

export default async function JobPage({ params }) {
  await requireAdminPage();
  const { id } = await params;
  return <TranscriptView id={id} />;
}
