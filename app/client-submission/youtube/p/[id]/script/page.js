import { notFound } from 'next/navigation';
import ScriptView from '@/components/ScriptView.js';
import TopBar from '@/components/TopBar.js';
import { getProject } from '@/lib/projects.js';
import { forClient, getScript } from '@/lib/script.js';
import { requirePage } from '@/lib/session.js';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Your script · Hotel Tech Report' };

export default async function ClientScript({ params }) {
  const s = await requirePage('client');
  const { id } = await params;
  const p = await getProject(id);
  if (!p || p.company !== s.c) notFound();
  const script = forClient(await getScript(p.id));
  return (
    <div className="wrap">
      <TopBar label={p.companyName} home="/client-submission/youtube" />
      <a className="linkbtn" href={`/client-submission/youtube/p/${p.id}`} style={{ marginLeft: -6 }}>← {p.name}</a>
      <ScriptView projectId={p.id} role="client" initial={script} project={{ product: script?.product || p.companyName }} />
    </div>
  );
}
