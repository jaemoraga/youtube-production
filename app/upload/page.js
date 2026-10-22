import Uploader from '@/components/Uploader.js';
import { Brand } from '@/components/ui.js';
import { requireAdminPage } from '@/lib/auth.js';
import { getCompanies } from '@/lib/store.js';

export const dynamic = 'force-dynamic';

export default async function AdminUpload() {
  await requireAdminPage();
  const companies = (await getCompanies()).map(({ slug, name }) => ({ slug, name }));
  return (
    <div className="wrap narrow">
      <header className="top"><Brand /><a className="linkbtn" href="/">All transcripts</a></header>
      <h1>Upload a recording</h1>
      <p className="sub">Video or audio up to 5 GB. You&apos;ll be taken to the transcript, which is usually ready within a few minutes.</p>
      <Uploader mode="admin" companies={companies} />
    </div>
  );
}
