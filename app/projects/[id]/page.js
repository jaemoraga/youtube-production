import { notFound } from 'next/navigation';
import ProjectView from '@/components/ProjectView.js';
import { Brand } from '@/components/ui.js';
import { getProject } from '@/lib/projects.js';
import { requirePage } from '@/lib/session.js';
import { syncJob } from '@/lib/jobs.js';
import { getJob } from '@/lib/store.js';

export const dynamic = 'force-dynamic';

export default async function AdminProject({ params }) {
  await requirePage('admin');
  const { id } = await params;
  const p = await getProject(id);
  if (!p) notFound();
  let job = p.items.video.jobId ? await getJob(p.items.video.jobId) : null;
  if (job) job = await syncJob(job).catch(() => job);
  return (
    <div className="wrap narrow">
      <header className="top"><Brand /><div className="row"><a className="linkbtn" href={`/editor/p/${p.id}`}>Editor view</a><a className="linkbtn" href="/">All projects</a></div></header>
      <ProjectView initial={p} role="admin" job={job && { status: job.status }} />
    </div>
  );
}
