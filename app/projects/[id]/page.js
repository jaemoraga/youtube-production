import { notFound } from 'next/navigation';
import ProjectView from '@/components/ProjectView.js';
import { Brand } from '@/components/ui.js';
import { HTR_ENABLED } from '@/lib/htr.js';
import { syncJob } from '@/lib/jobs.js';
import { forRole, getProject } from '@/lib/projects.js';
import { requirePage } from '@/lib/session.js';
import { getCompanies, getJob, readJSON, transcriptPath } from '@/lib/store.js';
import { getUser } from '@/lib/users.js';

export const dynamic = 'force-dynamic';

const dur = (s) => { s = Math.round(s || 0); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}h ${m}m` : `${m}m ${s % 60}s`; };

export default async function AdminProject({ params }) {
  await requirePage('admin');
  const { id } = await params;
  const p = await getProject(id);
  if (!p) notFound();

  let job = p.items.video.jobId ? await getJob(p.items.video.jobId) : null;
  if (job) job = await syncJob(job).catch(() => job);
  let video = null;
  if (job) {
    const t = job.status === 'done' ? await readJSON(transcriptPath(job.id)).catch(() => null) : null;
    video = {
      id: job.id, status: job.status, filename: job.title || job.filename, createdAt: job.createdAt, completedAt: job.completedAt || null,
      updatedAt: job.updatedAt || null, error: job.error || null, durationText: job.duration ? dur(job.duration) : null,
      seconds: job.duration || null, words: t?.words?.length ?? null, speakers: t?.speakers?.length ?? null, language: t?.language || null,
    };
  }

  const company = (await getCompanies()).find((c) => c.slug === p.company);
  const people = await Promise.all((company?.contacts || []).map(async (c) => {
    const u = await getUser(c.email).catch(() => null);
    return { name: `${c.first || ''} ${c.last || ''}`.trim() || c.email, email: c.email, joinedAt: u?.createdAt || null, lastLoginAt: u?.lastLoginAt || null };
  }));

  return (
    <div className="wrap">
      <header className="top"><Brand /><div className="row"><a className="linkbtn" href={`/editor/p/${p.id}`}>Editor view</a><a className="linkbtn" href="/">All projects</a></div></header>
      <ProjectView initial={forRole(p, 'admin')} role="admin" htrEnabled={HTR_ENABLED()} job={video} people={people} />
    </div>
  );
}
