import { notFound } from 'next/navigation';
import ProjectView from '@/components/ProjectView.js';
import TopBar from '@/components/TopBar.js';
import { DOSSIER_TEMPLATE_URL } from '@/lib/config.js';
import { forRole, getProject, listProjects } from '@/lib/projects.js';
import { requirePage } from '@/lib/session.js';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sponsor portal · Hotel Tech Report' };

export default async function ClientProject({ params }) {
  const s = await requirePage('client');
  const { id } = await params;
  const p = await getProject(id);
  if (!p || p.company !== s.c) notFound();
  const several = (await listProjects({ company: s.c })).length > 1;
  return (
    <div className="wrap narrow">
      <TopBar label={p.companyName} home="/client-submission/youtube" />
      {several && <a className="linkbtn" href="/client-submission/youtube" style={{ marginLeft: -6 }}>← All projects</a>}
      <ProjectView initial={forRole(p, 'client')} role="client" templateUrl={DOSSIER_TEMPLATE_URL} />
    </div>
  );
}
