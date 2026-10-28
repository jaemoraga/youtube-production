// Admin QA: the client's project page exactly as they see it, with every action switched off.
import { notFound } from 'next/navigation';
import ProjectView from '@/components/ProjectView.js';
import { DOSSIER_TEMPLATE_URL } from '@/lib/config.js';
import { forRole, getProject } from '@/lib/projects.js';
import { requirePage } from '@/lib/session.js';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Client preview' };

export default async function ClientPreview({ params }) {
  await requirePage('admin');
  const { id } = await params;
  const p = await getProject(id);
  if (!p) notFound();
  return (
    <>
      <div className="preview-banner">
        <span><b>Client preview.</b> This is what {p.companyName} sees. Nothing you click here is saved.</span>
        <span className="row">
          <a href="/client-submission/youtube/login" target="_blank" rel="noreferrer">Sign-in page ↗</a>
          <a href={`/projects/${p.id}`}>← Back to project</a>
        </span>
      </div>
      <div className="wrap narrow">
        <header className="top">
          <span className="brand"><span className="mark"><span /></span>Hotel Tech Report<span className="muted" style={{ fontWeight: 400 }}>&nbsp;· {p.companyName}</span></span>
          <span className="linkbtn" aria-disabled="true">Sign out</span>
        </header>
        <fieldset disabled className="preview-lock">
          <ProjectView initial={forRole(p, 'client')} role="client" templateUrl={DOSSIER_TEMPLATE_URL} preview />
        </fieldset>
      </div>
    </>
  );
}
