import { notFound } from 'next/navigation';
import ScriptView from '@/components/ScriptView.js';
import { Brand } from '@/components/ui.js';
import { getProject } from '@/lib/projects.js';
import { AI_READY, SCRIPT_MODEL, forAdmin, getScript, readiness, suggestWebsite } from '@/lib/script.js';
import { requirePage } from '@/lib/session.js';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Script · Hotel Tech Report' };

export default async function AdminScript({ params }) {
  await requirePage('admin');
  const { id } = await params;
  const p = await getProject(id);
  if (!p) notFound();
  const script = await getScript(p.id);
  const blocker = script ? null : await readiness(p);
  const product = script?.product || p.internal?.htr?.name || p.companyName;
  return (
    <div className="wrap">
      <header className="top"><Brand /><div className="row"><a className="linkbtn" href={`/admin/projects/${p.id}`}>← {p.companyName}</a><a className="linkbtn" href="/admin">All projects</a></div></header>
      <h1>{product}: script</h1>
      <p className="sub">{p.name}</p>
      <ScriptView projectId={p.id} role="admin" initial={forAdmin(script)} ai={{ ready: AI_READY(), model: SCRIPT_MODEL() }}
        project={{ product, fileStem: p.companyName, ready: !blocker, blocker }}
        suggestedWebsite={script || blocker ? '' : await suggestWebsite(p)} />
    </div>
  );
}
