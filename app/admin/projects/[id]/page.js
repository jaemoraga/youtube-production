import { notFound } from 'next/navigation';
import ProjectView from '@/components/ProjectView.js';
import { Brand } from '@/components/ui.js';
import { htrStatus } from '@/lib/htr.js';
import { syncJob } from '@/lib/jobs.js';
import { syncScriptStamps } from '@/lib/production.js';
import { forRole, getProject, videoParts } from '@/lib/projects.js';
import { getScript } from '@/lib/script.js';
import { requirePage } from '@/lib/session.js';
import { getCompanies, getJob, readJSON, transcriptPath } from '@/lib/store.js';
import { getUser } from '@/lib/users.js';

export const dynamic = 'force-dynamic';

const dur = (s) => { s = Math.round(s || 0); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}h ${m}m` : `${m}m ${s % 60}s`; };

export default async function AdminProject({ params }) {
  await requirePage('admin');
  const { id } = await params;
  let p = await getProject(id);
  if (!p) notFound();

  // One entry per video file (a demo can come in several parts).
  const videos = (await Promise.all(videoParts(p).map(async (part) => {
    let job = await getJob(part.jobId).catch(() => null);
    if (!job) return null;
    job = await syncJob(job).catch(() => job);
    const t = job.status === 'done' ? await readJSON(transcriptPath(job.id)).catch(() => null) : null;
    return {
      id: job.id, status: job.status, filename: job.title || job.filename, createdAt: job.createdAt, completedAt: job.completedAt || null,
      updatedAt: job.updatedAt || null, error: job.error || null, durationText: job.duration ? dur(job.duration) : null,
      seconds: job.duration || null, words: t?.words?.length ?? null, speakers: t?.speakers?.length ?? null, language: t?.language || null,
    };
  }))).filter(Boolean);

  const company = (await getCompanies()).find((c) => c.slug === p.company);
  const people = await Promise.all((company?.contacts || []).map(async (c) => {
    const u = await getUser(c.email).catch(() => null);
    return { name: `${c.first || ''} ${c.last || ''}`.trim() || c.email, email: c.email, joinedAt: u?.createdAt || null, lastLoginAt: u?.lastLoginAt || null, addedByAdmin: !!u?.addedByAdmin };
  }));

  const sc = await getScript(p.id);
  p = await syncScriptStamps(p, sc, { role: 'admin', email: null, name: 'Hotel Tech Report' }).catch(() => p);
  const open = (sc?.comments || []).filter((c) => c.status === 'open').length;
  const held = (sc?.comments || []).filter((c) => c.status === 'needs-decision').length;
  const drafted = (sc?.comments || []).filter((c) => c.status === 'drafted').length;
  const script = sc && {
    line: sc.client?.approvedAt ? 'Approved by the client. Locked for filming.'
      : !sc.versions.length ? 'Being written.'
        : drafted ? `Revisions are drafted and waiting for your review${held ? `, and ${held} ${held === 1 ? 'request needs' : 'requests need'} your decision` : ''}.`
        : held ? `${held} client ${held === 1 ? 'request needs' : 'requests need'} your decision.`
          : open ? `${open} new client ${open === 1 ? 'comment' : 'comments'}.`
            : sc.shared ? `The client can see version ${sc.shared.version}.` : 'Written. Not shown to the client yet.',
  };

  return (
    <div className="wrap">
      <header className="top"><Brand /><div className="row"><a className="linkbtn" href={`/admin/projects/${p.id}/preview`}>Client view</a><a className="linkbtn" href={`/editor/p/${p.id}`}>Editor view</a><a className="linkbtn" href="/admin">All projects</a></div></header>
      <ProjectView initial={forRole(p, 'admin')} role="admin" htr={await htrStatus()} jobs={videos} people={people} script={script} />
    </div>
  );
}
