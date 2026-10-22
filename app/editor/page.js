import TopBar from '@/components/TopBar.js';
import { listProjects } from '@/lib/projects.js';
import { requirePage } from '@/lib/session.js';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Editor · Hotel Tech Report' };

export default async function EditorHome() {
  await requirePage('editor');
  const projects = (await listProjects()).filter((p) => p.items.video.jobId || p.items.assets.files.length || p.items.dossier.url);
  return (
    <div className="wrap">
      <TopBar label="Editor" home="/editor" />
      <h1>Projects</h1>
      <p className="sub">Each project has the client&apos;s dossier, brand materials, raw video and transcript in one place.</p>
      <div className="card">
        {projects.length === 0 && <div className="empty">Nothing here yet.</div>}
        {projects.map((p) => (
          <a key={p.id} href={`/editor/p/${p.id}`} className="list-row">
            <span><span style={{ fontWeight: 500 }}>{p.companyName}</span><span className="muted"> · {p.name}</span></span>
            <span className="muted small">
              {[p.items.dossier.url && 'Dossier', p.items.assets.files.length && `${p.items.assets.files.length} assets`, p.items.video.jobId && 'Video'].filter(Boolean).join(' · ')}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
