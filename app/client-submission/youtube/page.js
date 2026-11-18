import { redirect } from 'next/navigation';
import { StatusPill } from '@/components/ProjectView.js';
import TopBar from '@/components/TopBar.js';
import { VideoExamples } from '@/components/VideoExamples.js';
import { forRole, listProjects, projectStatus } from '@/lib/projects.js';
import { requirePage } from '@/lib/session.js';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sponsor portal · Hotel Tech Report' };

export default async function Portal() {
  const s = await requirePage('client');
  const projects = (await listProjects({ company: s.c })).map((p) => forRole(p, 'client'));
  if (projects.length === 1) redirect(`/client-submission/youtube/p/${projects[0].id}`);
  if (projects.length === 0) {
    // Signed up but hasn't bought a video yet: keep it to what we do, and let them know we'll reach out.
    return (
      <div className="wrap narrow">
        <TopBar label="YouTube Content Studio" home="/client-submission/youtube" />
        <h1>Thanks, you&apos;re on our list</h1>
        <p className="sub">Our team will be in touch about a product review video for the Hotel Tech Report YouTube channel. Once your video is booked, your pre-production checklist will appear here.</p>
        <h2 className="section-title" style={{ marginTop: 32 }}>Recent reviews</h2>
        <VideoExamples />
      </div>
    );
  }
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
