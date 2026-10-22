import { notFound } from 'next/navigation';
import EditorTranscript from '@/components/EditorTranscript.js';
import TopBar from '@/components/TopBar.js';
import { bytesText } from '@/lib/format-bytes.js';
import { getProject } from '@/lib/projects.js';
import { requirePage } from '@/lib/session.js';
import { syncJob } from '@/lib/jobs.js';
import { getJob, readJSON, transcriptPath } from '@/lib/store.js';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Editor · Hotel Tech Report' };

const fileUrl = (path) => `/api/files?p=${encodeURIComponent(path)}`;

export default async function EditorProject({ params }) {
  await requirePage('editor');
  const { id } = await params;
  const p = await getProject(id);
  if (!p) notFound();
  let job = p.items.video.jobId ? await getJob(p.items.video.jobId) : null;
  if (job) job = await syncJob(job).catch(() => job);   // in case the finished-webhook was missed
  const t = job?.status === 'done' ? await readJSON(transcriptPath(job.id)) : null;
  const files = p.items.assets.files;

  return (
    <div className="wrap">
      <TopBar label="Editor" home="/editor" />
      <a className="linkbtn" href="/editor" style={{ marginLeft: -6 }}>← All projects</a>
      <h1 style={{ marginTop: 8 }}>{p.companyName}</h1>
      <p className="sub">{p.name}</p>

      <div className="editor-grid">
        <section className="card pad">
          <div className="step-title">Raw video</div>
          {job
            ? <><p className="muted small">{job.title || job.filename} · {bytesText(job.size)}</p>
              <a className="btn primary" href={fileUrl(job.pathname)} target="_blank" rel="noreferrer">Watch / download</a></>
            : <p className="muted small">Not uploaded yet.</p>}
        </section>
        <section className="card pad">
          <div className="step-title">Sponsor dossier</div>
          <p className="muted small">What the company does, its products, and what to show.</p>
          {p.items.dossier.url
            ? <a className="btn" href={p.items.dossier.url} target="_blank" rel="noreferrer">Open dossier ↗</a>
            : <p className="muted small">Not submitted yet.</p>}
        </section>
      </div>

      <section className="card pad" style={{ marginTop: 16 }}>
        <div className="step-title">Brand materials {files.length ? `(${files.length})` : ''}</div>
        {files.length === 0 ? <p className="muted small">None yet.</p> : (
          <div className="assets">
            {files.map((f) => (
              <a className="asset" key={f.pathname} href={fileUrl(f.pathname)} target="_blank" rel="noreferrer">
                <span className="thumb">
                  {String(f.type).startsWith('image/') && !/svg|tiff|heic|photoshop/.test(f.type)
                    ? <img src={fileUrl(f.pathname)} alt="" loading="lazy" />
                    : <span>{(f.name.split('.').pop() || '').toUpperCase()}</span>}
                </span>
                <span className="asset-meta"><span className="asset-name">{f.name}</span><span className="muted small">{bytesText(f.size)}</span></span>
              </a>
            ))}
          </div>
        )}
      </section>

      <div style={{ marginTop: 16 }}>
        {t ? <EditorTranscript t={t} job={{ title: job.title || null, filename: job.filename, companyName: p.companyName, speakerNames: job.speakerNames || {} }} />
          : <div className="card pad"><div className="step-title">Transcript</div><p className="muted small">{job ? 'Being transcribed. Check back in a few minutes.' : 'Available once the video is uploaded.'}</p></div>}
      </div>
    </div>
  );
}
