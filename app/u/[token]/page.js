// The page behind a client's private link. Shows only that client's name; upload only.
import { notFound } from 'next/navigation';
import Uploader from '@/components/Uploader.js';
import { companyByToken } from '@/lib/store.js';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Upload a video · Hotel Tech Report', robots: { index: false, follow: false } };

export default async function ClientUpload({ params }) {
  const { token } = await params;
  const company = await companyByToken(token);
  if (!company) notFound();
  return (
    <div className="wrap narrow">
      <header className="top"><span className="brand"><span className="mark"><span /></span>Hotel Tech Report</span></header>
      <h1>Upload your video</h1>
      <p className="sub">For {company.name}. Large files are fine; keep this page open until the upload finishes.</p>
      <Uploader mode="client" token={token} companySlug={company.slug} companyName={company.name} />
    </div>
  );
}
