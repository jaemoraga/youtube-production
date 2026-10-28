import { redirect } from 'next/navigation';
import { StatusPill } from '@/components/ProjectView.js';
import TopBar from '@/components/TopBar.js';
import { forRole, listProjects, projectStatus } from '@/lib/projects.js';
import { requirePage } from '@/lib/session.js';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sponsor portal · Hotel Tech Report' };

export default async function Portal() {
  const s = await requirePage('client');
  const projects = (await listProjects({ company: s.c })).map((p) => forRole(p, 'client'));
  if (projects.length === 1) redirect(`/client-submission/youtube/p/${projects[0].id}`);
  return (
    <div className="wrap narrow">
      <TopBar label="Sponsor portal" home="/client-submission/youtube" />
      <h1>Your projects</h1>
      <p className="sub">Choose a project to see what&apos;s left to do.</p>
      <div className="card">
        {projects.length === 0 && <div className="empty">No projects yet. Your Hotel Tech Report contact will set one up.</div>}
        {projects.map((p) => (
          <a key={p.id} href={`/client-submission/youtube/p/${p.id}`} className="list-row">
            <span style={{ fontWeight: 500 }}>{p.name}</span><StatusPill status={projectStatus(p)} />
          </a>
        ))}
      </div>
    </div>
  );
}
