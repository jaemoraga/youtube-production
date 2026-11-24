import { notFound } from 'next/navigation';
import EditingGuide from '@/components/EditingGuide.js';
import EditorTranscript from '@/components/EditorTranscript.js';
import TopBar from '@/components/TopBar.js';
import { bytesText } from '@/lib/format-bytes.js';
import { partName, scriptParagraphs } from '@/lib/guide-shared.js';
import { editorScript, getGuide, staleReason } from '@/lib/guide.js';
import { getProject, videoParts } from '@/lib/projects.js';
import { getScript } from '@/lib/script.js';
import { requirePage } from '@/lib/session.js';
import { syncJob } from '@/lib/jobs.js';
import { getJob, readJSON, transcriptPath } from '@/lib/store.js';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Editor · Hotel Tech Report' };

const fileUrl = (path) => `/api/files?p=${encodeURIComponent(path)}`;
const dur = (s) => { s = Math.round(s || 0); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}h ${m}m` : `${m}m ${s % 60}s`; };

// Makes links in HTR's note clickable (a Drive folder, usually).
function Linked({ text }) {
  return String(text || '').split(/(https?:\/\/[^\s]+)/).map((x, i) => (/^https?:\/\//.test(x) ? <a key={i} href={x} target="_blank" rel="noreferrer">{x}</a> : x));
}

export default async function EditorProject({ params }) {
  await requirePage('editor');
  const { id } = await params;
  const p = await getProject(id);
  if (!p) notFound();
  // The demo can come in several files; each has its own transcript, with timestamps from the start of that file.
  const parts = videoParts(p);
  const videos = (await Promise.all(parts.map(async (part) => {
    let job = await getJob(part.jobId).catch(() => null);
    if (!job) return null;
    job = await syncJob(job).catch(() => job);   // in case the finished-webhook was missed
    return { part, job, t: job.status === 'done' ? await readJSON(transcriptPath(job.id)).catch(() => null) : null };
  }))).filter(Boolean);
  const several = videos.length > 1;
  const files = p.items.assets.files;
  const script = await getScript(p.id);
  const v = editorScript(script);
  // The guide is only shown against the demo files it was built from.
  const stored = await getGuide(p.id);
  const guide = stored && stored.partsKey === videos.map((x) => x.part.jobId).join(',') ? stored : null;
  const stale = stored ? staleReason(stored, script, p) : null;
  const names = videos.map((x) => ({ label: x.part.label || '', filename: x.job.title || x.job.filename }));

  return (
    <div className="wrap">
      <TopBar label="Editor" home="/editor" />
      <a className="linkbtn" href="/editor" style={{ marginLeft: -6 }}>← All projects</a>
      <h1 style={{ marginTop: 8 }}>{p.companyName}</h1>
      <p className="sub">{p.name}</p>

      <section className="card pad editor-steps">
        <div className="step-title">What is on this page</div>
        <ol>
          <li><a href="#raw-video">The raw demo {several ? 'videos' : 'video'}</a>: the client&apos;s screen recording of their product. Download {several ? 'them' : 'it'}; this is the footage you cut from.</li>
          <li><a href="#brand-materials">Brand materials</a>: the client&apos;s logo, screenshots and anything else to use on screen.</li>
          <li><a href="#editing-guide">The editing guide</a>: the script, line by line, with the exact place in the demo that shows each thing.</li>
          <li><a href="#demo-transcript">The demo transcript</a>: everything said in the demo, with timestamps. It is not the script.</li>
        </ol>
      </section>

      <section className="card pad" id="raw-video" style={{ marginTop: 16 }}>
        <div className="step-title">Raw demo {several ? `videos (${videos.length})` : 'video'}</div>
        <p className="muted small" style={{ marginTop: 0 }}>The client&apos;s unedited screen recording. {several ? 'It came in more than one file; the parts are in the order they should be watched.' : ''}</p>
        {!videos.length && <p className="muted small">{p.items.video.external ? <>Not in the app. <Linked text={p.items.video.externalNote} /></> : 'Not uploaded yet.'}</p>}
        {videos.map(({ part, job }, i) => (
          <div className="editor-video" key={job.id}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 500 }}>{several ? `Part ${i + 1}` : 'Demo recording'}{part.label ? `: ${part.label}` : ''}</div>
              <div className="muted small">{job.title || job.filename} · {bytesText(job.size)}{job.duration ? ` · ${dur(job.duration)}` : ''}</div>
              {several && !part.label && <div className="small" style={{ color: 'var(--warn)' }}>The client has not labelled this file. Check the first minute of its transcript below to see what it covers.</div>}
            </div>
            <a className="btn primary" href={fileUrl(job.pathname)} target="_blank" rel="noreferrer">Download{several ? ` part ${i + 1}` : ''}</a>
            <a className="btn" href={`#demo-transcript-${i + 1}`}>Transcript</a>
          </div>
        ))}
      </section>

      <section className="card pad" id="brand-materials" style={{ marginTop: 16 }}>
        <div className="step-title">Brand materials {files.length ? `(${files.length})` : ''}</div>
        <p className="muted small" style={{ marginTop: 0 }}>The client&apos;s logo, product screenshots and other files to use on screen. Click a file to open or download it.</p>
        {p.items.assets.external && <p className="small"><b>Kept outside the app.</b> <Linked text={p.items.assets.externalNote} /></p>}
        {files.length === 0 && !p.items.assets.external && <p className="muted small">None yet.</p>}
        {files.length > 0 && (
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
        {guide && v
          ? <EditingGuide guide={guide} paragraphs={scriptParagraphs(guide.scriptVersion === v.n ? v.text : script.versions[guide.scriptVersion - 1]?.text || v.text)} parts={names} company={p.companyName} stale={stale} approved={guide.scriptVersion === v.n && v.approved} />
          : (
            <section className="card pad" id="editing-guide">
              <div className="step-title">Editing guide: script matched to the demo recording</div>
              <p className="muted small" style={{ margin: 0 }}>{!v ? 'The script has not been written yet.' : stored ? 'The demo videos changed, so the guide is being redone. Check back soon.' : 'Hotel Tech Report has not built the guide for this project yet. Check back soon, or ask them for it.'}</p>
            </section>
          )}
      </div>

      <h2 className="section-title" id="demo-transcript" style={{ marginTop: 32, marginBottom: 6 }}>Demo recording {several ? 'transcripts' : 'transcript'}</h2>
      <p className="muted small" style={{ margin: '0 0 16px' }}>What the client says while showing their product. <b>This is not the script</b> and it is not spoken in the finished video. It is here so you can find footage{guide ? ': the highlighted lines are the moments the script uses, and the bold lines mark where each topic starts' : ''}.</p>
      {!videos.length && <div className="card pad"><p className="muted small" style={{ margin: 0 }}>Available once the video is uploaded.</p></div>}
      {videos.map(({ job, t }, i) => (
        <div key={job.id} id={`demo-transcript-${i + 1}`} style={{ marginTop: i ? 16 : 0 }}>
          {t ? <EditorTranscript t={t} guide={guide} partIndex={i} heading={`Demo transcript · ${partName(names[i], i, videos.length)}`} job={{ title: job.title || null, filename: job.filename, companyName: p.companyName, speakerNames: job.speakerNames || {} }} />
            : <div className="card pad"><div className="step-title">Demo transcript · {partName(names[i], i, videos.length)}</div><p className="muted small">Being transcribed. Check back in a few minutes.</p></div>}
        </div>
      ))}
    </div>
  );
}
