'use client';
// The project checklist. role="client": the sponsor completes items. role="admin": HTR reviews them.
import { uploadPresigned } from '@vercel/blob/client';
import { createContext, useContext, useEffect, useState } from 'react';
import { GROUP_HINT, INTERNAL_FIELDS, ITEM_LABEL, ITEMS, STATUS_TEXT, projectStatus, timeline, unlabeledParts, videoParts } from '@/lib/project-shared.js';
import { assetType, mediaType, safeName } from '@/lib/media.js';
import { api, bytes, duration, useToast, when } from './ui.js';

// Admin "client preview": everything renders as the client sees it, but nothing can be changed.
const Preview = createContext(false);
const PREVIEW_MSG = 'Preview only: nothing is saved.';

const fileUrl = (path) => `/api/files?p=${encodeURIComponent(path)}`;

export function StatusPill({ status, forClient = false }) {
  const text = forClient && status === 'waiting' ? 'Waiting on you' : forClient && status === 'review' ? 'In review' : STATUS_TEXT[status] || status;
  return <span className={`pill st-${status}`}>{text}</span>;
}

export default function ProjectView({ initial, role, templateUrl, jobs = [], htr = null, people = [], preview = false, script = null }) {
  const htrEnabled = !!htr?.connected;
  const [p, setP] = useState(initial);
  const [toast, say] = useToast();
  const admin = role === 'admin';

  const act = async (action, ok) => {
    if (preview) { say(PREVIEW_MSG); return false; }
    try {
      const d = await api(`/api/projects/${p.id}`, { method: 'POST', body: action });
      setP(d.project);
      if (ok) say(ok);
      return true;
    } catch (e) { say(e.message); return false; }
  };
  const reload = async () => { if (preview) return; try { setP((await api(`/api/projects/${p.id}`)).project); } catch { /* ignore */ } };

  const status = projectStatus(p);
  const done = ITEMS.filter((i) => ['submitted', 'approved'].includes(p.items[i].status)).length;

  return (
    <Preview.Provider value={preview}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'nowrap' }}>
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Pre-production checklist</div>
          <h1>{admin ? p.companyName : p.name}</h1>
          <p className="sub">
            {admin ? <>{p.name} · </> : null}
            {status === 'scripting' ? 'Client checklist approved and internal dossier complete. Ready for scripting.'
              : status === 'internal' ? 'Client checklist approved. Complete the internal dossier below to move to scripting.'
              : status === 'approved' ? 'Everything is approved. Thank you!'
              : status === 'review' ? (admin ? 'Everything is in. Ready for your review.' : 'All submitted. We’re reviewing and will reach out if we need anything.')
              : admin ? `Waiting on the client: ${done} of 3 submitted.` : `${done} of 3 done. Complete each step below.`}
          </p>
        </div>
        <span style={{ flex: 'none', marginTop: 8 }}><StatusPill status={status} forClient={!admin} /></span>
      </div>

      {admin && <Overview p={p} jobs={jobs} htrEnabled={htrEnabled} />}
      {admin && (
        <div className="admin-grid">
          <People people={people} p={p} act={act} say={say} />
          <Timeline p={p} jobs={jobs} />
        </div>
      )}
      {admin && <h2 className="section-title" style={{ marginTop: 32 }}>Client checklist</h2>}
      {admin && status === 'waiting' && <p className="muted small" style={{ marginTop: -6 }}>The client normally completes these. If they sent materials another way, add them here yourself or mark a step as received outside the app. Nothing you add here emails the client.</p>}

      <div className="steps">
        <Item n={1} item="dossier" p={p} admin={admin} act={act}>
          <Dossier p={p} admin={admin} act={act} templateUrl={templateUrl} />
        </Item>
        <Item n={2} item="assets" p={p} admin={admin} act={act}>
          <Assets p={p} admin={admin} act={act} say={say} />
        </Item>
        <Item n={3} item="video" p={p} admin={admin} act={act}>
          <Video p={p} admin={admin} act={act} reload={reload} say={say} jobs={jobs} />
        </Item>
      </div>
      {!admin && script && (
        <section className="card step st-border-submitted" style={{ marginTop: 12 }}>
          <header className="step-head">
            <span className={`num ${script.approvedAt ? 'st-approved' : 'st-submitted'}`}>{script.approvedAt ? '✓' : 4}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="step-title">Your script</div>
              <div className="muted small">{script.approvedAt ? 'Approved. Locked for filming.' : 'Ready for your review. Leave comments on any paragraph, or approve it.'}</div>
            </div>
            <a className="btn primary" href={preview ? undefined : `/client-submission/youtube/p/${p.id}/script`}>{script.approvedAt ? 'Open script' : 'Review script'}</a>
          </header>
        </section>
      )}
      {admin && <InternalDossier p={p} act={act} htr={htr} say={say} />}
      {admin && (
        <section className="card pad script-entry" id="script">
          <div>
            <div className="step-title">Script</div>
            <div className="muted small">{script?.line || (status === 'scripting'
              ? 'Everything is in. Generate the script from the two dossiers and the demo transcript.'
              : 'The app writes the script once the checklist and the internal dossier are done. A script that was written somewhere else can be imported at any time.')}</div>
          </div>
          <a className={`btn${script || status === 'scripting' ? ' primary' : ''}`} href={`/admin/projects/${p.id}/script`}>{script ? 'Open script' : status === 'scripting' ? 'Generate script' : 'Import a script'}</a>
        </section>
      )}
      {admin && <GuideCard p={p} hasScript={!!script} say={say} />}
      {admin && (
        <div className="trash-row">
          <button className="btn danger" onClick={async () => {
            if (!window.confirm(`Move "${p.companyName}: ${p.name}" to the trash?\n\nThe client and editor lose access right away. You can restore it from the dashboard's Trash for 30 days; after that it's deleted for good, with its files and video.`)) return;
            if (await act({ type: 'trash' })) window.location.href = '/?trashed=1';
          }}>Move to trash</button>
        </div>
      )}
      {toast}
    </Preview.Provider>
  );
}

function Item({ n, item, p, admin, act, children }) {
  const it = p.items[item];
  const comments = p.comments.filter((c) => c.item === item);
  const [open, setOpen] = useState(comments.length > 0 || it.status === 'changes');
  const [msg, setMsg] = useState('');
  const [asking, setAsking] = useState(false);
  const lastChange = [...comments].reverse().find((c) => c.kind === 'changes');

  const send = async (type) => {
    if (await act({ type, item, text: msg }, type === 'changes' ? 'Update requested. The client was emailed.' : 'Sent')) {
      setMsg(''); setAsking(false); setOpen(true);
    }
  };

  return (
    <section className={`card step st-border-${it.status}`}>
      <header className="step-head">
        <span className={`num st-${it.status}`}>{it.status === 'approved' || it.status === 'submitted' ? '✓' : n}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="step-title">{ITEM_LABEL[item]}</div>
          {it.submittedAt && <div className="muted small">Submitted {when(it.submittedAt)}{admin && it.submittedBy?.name ? <> by {it.submittedBy.name}{it.submittedBy.email ? <> · <a href={`mailto:${it.submittedBy.email}`}>{it.submittedBy.email}</a></> : null}</> : null}</div>}
        </div>
        <StatusPill status={it.status} />
      </header>

      {it.status === 'changes' && lastChange && !admin && (
        <div className="callout">
          <b>Update needed.</b> {lastChange.text}
        </div>
      )}

      <div className="step-body">
        {admin && it.external && <p className="muted small" style={{ marginTop: 0 }}><b>Received outside the app.</b>{it.externalNote ? ` ${it.externalNote}` : ''}</p>}
        {!admin && it.external && <p className="muted small" style={{ marginTop: 0 }}>We already have this from you. Nothing to do here.</p>}
        {children}
        {admin && it.status !== 'approved' && <Outside item={item} act={act} />}
      </div>

      {admin && it.status !== 'todo' && (
        <div className="review-bar">
          {it.status !== 'approved'
            ? <button className="btn ok" onClick={() => act({ type: 'approve', item }, 'Approved')}>Approve</button>
            : <button className="btn" onClick={() => act({ type: 'reopen', item }, 'Reopened')}>Undo approval</button>}
          {it.status !== 'changes' && <button className="btn" onClick={() => { setAsking(true); setOpen(true); }}>Request update</button>}
        </div>
      )}

      <div className="thread">
        <button className="linkbtn" onClick={() => setOpen(!open)}>
          {comments.length ? `${comments.length} message${comments.length > 1 ? 's' : ''}` : admin ? 'Message the client' : 'Message Hotel Tech Report'} {open ? '▴' : '▾'}
        </button>
        {open && (
          <>
            {comments.map((c, i) => (
              <div key={i} className={`msg ${c.by === 'admin' ? 'from-htr' : ''}`}>
                <div className="muted small"><b>{c.name}</b> · {when(c.at)}{c.kind === 'changes' ? ' · requested an update' : ''}</div>
                <div className="msg-text">{c.text}</div>
              </div>
            ))}
            <textarea value={msg} onChange={(e) => setMsg(e.target.value)}
              placeholder={asking ? 'What needs to change? e.g. "This is a marketing video. We need the raw demo recording."' : 'Write a message…'} />
            <div className="row" style={{ marginTop: 8 }}>
              {asking
                ? <><button className="btn primary" disabled={!msg.trim()} onClick={() => send('changes')}>Request update</button>
                  <button className="linkbtn" onClick={() => setAsking(false)}>Cancel</button></>
                : <button className="btn" disabled={!msg.trim()} onClick={() => send('comment')}>Send</button>}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function Dossier({ p, admin, act, templateUrl }) {
  const it = p.items.dossier;
  const [url, setUrl] = useState(it.url || '');
  const [editing, setEditing] = useState(!it.url);
  const locked = it.status === 'approved';

  if (admin) {
    if (it.url && (!editing || locked)) {
      return (
        <div className="row">
          <a className="btn" href={it.url} target="_blank" rel="noreferrer">Open dossier ↗</a>
          {!locked && <button className="linkbtn" onClick={() => setEditing(true)}>Change link</button>}
        </div>
      );
    }
    if (locked) return null;
    return (
      <>
        <p className="muted small" style={{ marginTop: 0 }}>{it.url ? 'Replace the link to the client’s dossier.' : 'Not submitted yet. If the client sent their dossier another way, paste its Google Doc link to add it for them.'}</p>
        <form className="row" style={{ flexWrap: 'nowrap' }} onSubmit={async (e) => { e.preventDefault(); if (await act({ type: 'dossier.save', item: 'dossier', url }, 'Dossier added')) setEditing(false); }}>
          <input type="text" placeholder="https://docs.google.com/document/d/…" value={url} onChange={(e) => setUrl(e.target.value)} />
          <button className="btn" disabled={!url.trim()}>Add for the client</button>
        </form>
      </>
    );
  }
  if (locked && !it.url) return null;
  if (!editing || locked) {
    return (
      <div className="row">
        <a className="btn" href={it.url} target="_blank" rel="noreferrer">Open your dossier ↗</a>
        {!locked && <button className="linkbtn" onClick={() => setEditing(true)}>Change link</button>}
      </div>
    );
  }
  return (
    <>
      <ol className="howto">
        <li>{templateUrl ? <>Open the <a href={templateUrl} target="_blank" rel="noreferrer">dossier template ↗</a> and click <b>Make a copy</b>.</> : <>Make a copy of the dossier template your Hotel Tech Report contact sent you (<b>File → Make a copy</b>).</>}</li>
        <li>Fill in your copy. Keep answers short and clear. You can skip the demo video question: upload the video in step 3 below.</li>
        <li>Click <b>Share</b>, set <b>General access</b> to <b>Anyone with the link</b>, and copy the link.</li>
        <li>Paste the link here.</li>
      </ol>
      <form className="row" style={{ flexWrap: 'nowrap' }} onSubmit={async (e) => { e.preventDefault(); if (await act({ type: 'dossier.save', item: 'dossier', url }, 'Dossier submitted')) setEditing(false); }}>
        <input type="text" placeholder="https://docs.google.com/document/d/…" value={url} onChange={(e) => setUrl(e.target.value)} />
        <button className="btn primary" disabled={!url.trim()}>Submit</button>
      </form>
    </>
  );
}

function Assets({ p, admin, act, say }) {
  const it = p.items.assets;
  const locked = it.status === 'approved';
  const [uploading, setUploading] = useState(null); // { name, pct }
  const [over, setOver] = useState(false);

  const preview = useContext(Preview);
  async function addFiles(list) {
    if (preview) { say(PREVIEW_MSG); return; }
    for (const file of Array.from(list || [])) {
      if (!assetType(file.name)) { say(`${file.name}: file type not supported`); continue; }
      try {
        setUploading({ name: file.name, pct: 0 });
        const blob = await uploadPresigned(`assets/${p.company}/${p.id}/${safeName(file.name)}`, file, {
          access: 'private', handleUploadUrl: '/api/upload', headers: { 'x-htr': '1' },
          contentType: assetType(file.name), multipart: file.size > 50 * 1024 ** 2,
          onUploadProgress: ({ percentage }) => setUploading({ name: file.name, pct: percentage }),
        });
        await act({ type: 'assets.add', item: 'assets', pathname: blob.pathname, name: file.name });
      } catch (e) { say(`${file.name}: ${e.message}`); }
    }
    setUploading(null);
  }

  return (
    <>
      {!admin && !locked && <p className="muted small" style={{ marginTop: 0 }}>Your logo, product screenshots, and anything else you&apos;d like us to use. Images, PDFs, decks, ZIPs or short videos.</p>}
      {it.files.length > 0 && (
        <div className="assets">
          {it.files.map((f) => (
            <div className="asset" key={f.pathname}>
              <a href={fileUrl(f.pathname)} target="_blank" rel="noreferrer" className="thumb">
                {String(f.type).startsWith('image/') && !/svg|tiff|heic|photoshop/.test(f.type)
                  ? <img src={fileUrl(f.pathname)} alt="" loading="lazy" />
                  : <span>{(f.name.split('.').pop() || '').toUpperCase()}</span>}
              </a>
              <div className="asset-meta">
                <div className="asset-name" title={f.name}>{f.name}</div>
                <div className="muted small">{bytes(f.size)}</div>
              </div>
              {!locked && <button className="linkbtn" onClick={() => act({ type: 'assets.remove', item: 'assets', pathname: f.pathname })}>Remove</button>}
            </div>
          ))}
        </div>
      )}
      {admin && !it.files.length && !it.external && <p className="muted small" style={{ marginTop: 0 }}>No files yet. If the client sent files another way, add them here for them.</p>}
      {!locked && (
        <>
          <label className={`drop small-drop${over ? ' over' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); addFiles(e.dataTransfer.files); }}>
            <strong>{uploading ? `Uploading ${uploading.name}… ${Math.floor(uploading.pct)}%` : 'Drop files or click to add'}</strong>
            <input type="file" hidden multiple onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} disabled={!!uploading} />
          </label>
          {it.status !== 'submitted' && (
            <button className="btn primary" style={{ marginTop: 12 }} disabled={!it.files.length || !!uploading}
              onClick={() => act({ type: 'assets.submit', item: 'assets' }, 'Brand materials submitted')}>
              Submit {it.files.length ? `${it.files.length} file${it.files.length > 1 ? 's' : ''}` : ''}{admin ? ' for the client' : ''}
            </button>
          )}
          {it.status === 'submitted' && !admin && <p className="hint">Submitted. You can still add files; we&apos;ll see them.</p>}
        </>
      )}
    </>
  );
}

// "Received outside the app": HTR closes a step itself, with a note saying where the material is.
function Outside({ item, act }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  if (!open) return <div style={{ marginTop: 10 }}><button className="linkbtn" style={{ padding: 0 }} onClick={() => setOpen(true)}>Received outside the app</button></div>;
  return (
    <form className="row" style={{ flexWrap: 'nowrap', marginTop: 10 }} onSubmit={async (e) => { e.preventDefault(); if (await act({ type: 'external', item, note }, 'Marked as received')) setOpen(false); }}>
      <input type="text" autoFocus placeholder="Where is it? e.g. a Drive folder link, or “sent by email on Nov 20”" value={note} onChange={(e) => setNote(e.target.value)} />
      <button className="btn">Mark as received</button>
      <button type="button" className="linkbtn" onClick={() => setOpen(false)}>Cancel</button>
    </form>
  );
}

// What this file shows, in the client's words. Saved when the field loses focus or Enter is pressed.
function PartLabel({ value, onSave }) {
  const [v, setV] = useState(value);
  const save = () => { if (v.trim() !== value) onSave(v); };
  return (
    <input type="text" className={`part-label${value ? '' : ' empty'}`} value={v} maxLength={120}
      placeholder="What does this file show? e.g. Part 1: inbox, AI assistant and guest profiles"
      onChange={(e) => setV(e.target.value)} onBlur={save} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } }} />
  );
}

// The demo can be one file or several (a recording that was split in two). Each file is transcribed on its own.
function Video({ p, admin, act, reload, say, jobs = [] }) {
  const it = p.items.video;
  const parts = videoParts(p);
  const locked = it.status === 'approved';
  const [adding, setAdding] = useState(false);
  const [pct, setPct] = useState(null);
  const [name, setName] = useState('');

  const preview = useContext(Preview);
  async function upload(list) {
    const files = Array.from(list || []);
    if (!files.length) return;
    if (preview) { say(PREVIEW_MSG); return; }
    for (const file of files) {
      if (!mediaType(file.name)) { say(`${file.name}: please choose a video file (MP4, MOV, …).`); continue; }
      try {
        setPct(0); setName(file.name);
        const blob = await uploadPresigned(`uploads/${p.company}/${safeName(file.name)}`, file, {
          access: 'private', handleUploadUrl: '/api/upload', headers: { 'x-htr': '1' },
          contentType: mediaType(file.name), multipart: true, onUploadProgress: ({ percentage }) => setPct(percentage),
        });
        await api('/api/jobs', { method: 'POST', body: { pathname: blob.pathname, filename: file.name, projectId: p.id, add: true } });
        await reload();
        say(admin ? 'Video added' : 'Video submitted');
      } catch (e) { say(e.message); }
    }
    setPct(null); setName(''); setAdding(false);
  }

  const several = parts.length > 1;
  const missing = unlabeledParts(p);
  const change = (jobId, extra) => { if (preview) { say(PREVIEW_MSG); return; } act({ type: 'video.update', item: 'video', jobId, ...extra }); };
  // Labels and order stay editable for HTR after approval; for the client, until then.
  const canLabel = admin || !locked;
  return (
    <>
      {admin && !parts.length && !it.external && <p className="muted small" style={{ marginTop: 0 }}>Not uploaded yet. If the client sent the recording another way, upload it here for them.</p>}
      {several && missing > 0 && (
        <div className="callout" style={{ margin: '0 0 12px' }}>
          <b>{admin ? `${missing} of ${parts.length} videos ${missing === 1 ? 'has' : 'have'} no label.` : 'Please label each video.'}</b>{' '}
          {admin
            ? 'The editor sees these labels beside each download. Label them here, or use Request update to ask the client.'
            : 'Say what each file shows (for example “Part 1: inbox and AI assistant”) and put them in the order they should be watched. This is critical: our video editor does not know your product, and the labels are how they find the right clip for each part of the script.'}
        </div>
      )}
      {parts.map((part, i) => {
        const job = jobs.find((j) => j.id === part.jobId);
        return (
          <div className="video-part" key={part.jobId}>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <span className="muted small" style={{ flex: 1, minWidth: 0 }}>
                {several ? `Part ${i + 1}: ` : admin ? '' : 'Uploaded: '}<b>{part.filename}</b>
                {admin && job ? ` · transcript ${job.status === 'done' ? 'ready' : job.status === 'error' ? 'failed' : 'in progress'}` : ''}
              </span>
              {several && canLabel && i > 0 && <button className="linkbtn" title="Move earlier" onClick={() => change(part.jobId, { move: 'up' })}>↑</button>}
              {several && canLabel && i < parts.length - 1 && <button className="linkbtn" title="Move later" onClick={() => change(part.jobId, { move: 'down' })}>↓</button>}
              {admin && <a className="btn" href={`/admin/jobs/${part.jobId}`}>Transcript</a>}
              {!locked && pct === null && <button className="linkbtn" onClick={() => { if (preview) { say(PREVIEW_MSG); return; } if (window.confirm(`Remove ${part.filename} from this project?`)) act({ type: 'video.remove', item: 'video', jobId: part.jobId }, 'Removed'); }}>Remove</button>}
            </div>
            {(several || part.label) && (canLabel
              ? <PartLabel key={`${part.jobId}-${part.label || ''}`} value={part.label || ''} onSave={(label) => change(part.jobId, { label })} />
              : <div className="small" style={{ marginTop: 4 }}>{part.label}</div>)}
          </div>
        );
      })}
      {!locked && (parts.length === 0 || adding || pct !== null) && (
        <>
          {!admin && <p className="muted small" style={{ marginTop: 0 }}>Upload an unedited screen-share demo of your software: ideally 20+ minutes covering every key part of the platform, with voice-over and no talking head over the product. Not a marketing video. Large files are fine; keep this page open until it finishes. If your demo is in more than one file, add each part.</p>}
          <label className="drop small-drop">
            <strong>{pct !== null ? `Uploading ${name}… ${Math.floor(pct)}%` : admin ? 'Drop the video (or each part) or click to choose' : 'Drop your video or click to choose'}</strong>
            <input type="file" hidden multiple accept="video/*" disabled={pct !== null} onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
          </label>
          {pct !== null && <div className="bar"><div style={{ width: `${pct}%` }} /></div>}
          {parts.length > 0 && pct === null && <button className="linkbtn" style={{ marginTop: 8 }} onClick={() => setAdding(false)}>Cancel</button>}
        </>
      )}
      {!locked && parts.length > 0 && !adding && pct === null && <button className="linkbtn" style={{ padding: 0 }} onClick={() => setAdding(true)}>Add another part</button>}
    </>
  );
}

// Rows that fit the text (about 80 characters per line), between 3 and 16.
const fitRows = (v) => Math.max(3, Math.min(16, String(v || '').split('\n').reduce((n, line) => n + Math.max(1, Math.ceil(line.length / 80)), 0) + 1));

// Group consecutive fields: each block has an optional heading; short fields sit side by side.
function blocks(fields) {
  const out = [];
  for (const x of fields) {
    const last = out[out.length - 1];
    if (last && x.group && last.group === x.group && !!last.short === !!x.short) last.fields.push(x);
    else out.push({ group: x.group || null, heading: x.group && (!last || last.group !== x.group) ? x.group : null, short: !!x.short, fields: [x] });
  }
  return out;
}

// HTR-only. Free text copied from the vendor's HTR profile; every field optional.
function InternalDossier({ p, act, htr, say }) {
  const saved = p.internal?.fields || {};
  const [f, setF] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [src, setSrc] = useState(p.internal?.htr || null);
  const [kept, setKept] = useState(null);   // { fields } pulled values we didn't apply because the box had text
  const complete = !!p.internal?.completedAt;
  const dirty = INTERNAL_FIELDS.some((x) => (f[x.key] || '').trim() !== (saved[x.key] || ''));
  const filled = INTERNAL_FIELDS.filter((x) => (f[x.key] || '').trim()).length;
  const save = async (extra, msg) => {
    setBusy(true);
    const ok = await act({ type: 'internal.save', fields: f, htr: src, ...extra }, msg);
    setBusy(false);
    return ok;
  };
  return (
    <section className="card internal" id="internal-dossier">
      <div className="internal-head">
        <div>
          <div className="step-title">Internal dossier <span className="htr-only">HTR only</span></div>
          <p className="muted small" style={{ margin: 0 }}>Copy from the vendor&apos;s Hotel Tech Report profile. All fields are optional. The client never sees this.</p>
        </div>
        <span className={`pill ${complete ? 'st-approved' : 'st-todo'}`}>{complete ? 'Complete' : `${filled} of ${INTERNAL_FIELDS.length} filled`}</span>
      </div>
      <HtrPull p={p} htr={htr} src={src} say={say} onPulled={(data) => {
        const next = { ...f };
        const skipped = {};
        for (const [k, v] of Object.entries(data.fields)) {
          if ((f[k] || '').trim() && (f[k] || '').trim() !== v) skipped[k] = v; else next[k] = v;
        }
        setF(next);
        setSrc(data.source);
        setKept(Object.keys(skipped).length ? skipped : null);
        say(`Filled ${Object.keys(data.fields).length - Object.keys(skipped).length} fields from the HTR profile. Review, then Save.`);
      }} />
      {kept && (
        <div className="callout" style={{ margin: '10px 18px 0' }}>
          {Object.keys(kept).length} field{Object.keys(kept).length > 1 ? 's' : ''} already had your text, so I left {Object.keys(kept).length > 1 ? 'them' : 'it'} alone
          ({INTERNAL_FIELDS.filter((x) => kept[x.key]).map((x) => x.label).join(', ')}).{' '}
          <button className="linkbtn" style={{ padding: 0 }} onClick={() => { setF({ ...f, ...kept }); setKept(null); }}>Replace with HTR data</button>
        </div>
      )}
      <div className="internal-body">
        {blocks(INTERNAL_FIELDS).map((blk) => (
          <div key={blk.fields[0].key}>
            {blk.heading && <div className="internal-group">{blk.heading}{GROUP_HINT[blk.heading] && <span className="group-hint">{GROUP_HINT[blk.heading]}</span>}</div>}
            <div className={blk.short ? 'short-grid' : undefined}>
              {blk.fields.map((x, i) => (
                <label key={x.key} className="field" style={{ marginTop: blk.short ? 6 : blk.heading && i === 0 ? 6 : 14 }}>
                  <span>{x.label}</span>
                  {x.short
                    ? <input type="text" inputMode="decimal" placeholder="e.g. 4.7" value={f[x.key] || ''} onChange={(e) => setF({ ...f, [x.key]: e.target.value })} />
                    : <textarea rows={fitRows(f[x.key])} className="autogrow" value={f[x.key] || ''} onChange={(e) => setF({ ...f, [x.key]: e.target.value })} />}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="internal-foot">
        <span className="muted small" style={{ flex: 1 }}>
          {complete ? `Marked complete ${when(p.internal.completedAt)}${p.internal.completedBy ? ` by ${p.internal.completedBy.split('@')[0]}` : ''}.`
            : p.internal?.updatedAt ? `Last saved ${when(p.internal.updatedAt)}.` : 'Not saved yet.'}
          {dirty ? ' Unsaved changes.' : ''}
        </span>
        <button className="btn" disabled={busy || !dirty} onClick={() => save({}, 'Internal dossier saved')}>Save</button>
        {complete
          ? <button className="btn" disabled={busy} onClick={() => save({ complete: false }, 'Reopened')}>Reopen</button>
          : <button className="btn ok" disabled={busy} onClick={() => save({ complete: true }, 'Internal dossier complete')}>{dirty ? 'Save & mark complete' : 'Mark complete'}</button>}
      </div>
    </section>
  );
}

// Find the vendor's product on Hotel Tech Report and pull its profile into the form.
function HtrPull({ p, htr, src, say, onPulled }) {
  const enabled = !!htr?.connected;
  const [q, setQ] = useState(p.companyName || '');
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  // Coming back from the Hotel Tech Report sign-in: ?htr=connected, or ?htr=<what went wrong>.
  useEffect(() => {
    const u = new URL(window.location.href);
    const v = u.searchParams.get('htr');
    if (!v) return;
    if (v === 'connected') say('Hotel Tech Report connected'); else setProblem(v);
    u.searchParams.delete('htr');
    window.history.replaceState(null, '', u.pathname + u.search + u.hash);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!enabled) {
    return (
      <div className="htr-bar row" style={{ justifyContent: 'space-between' }}>
        <span className="muted small">
          {htr?.broken ? 'The Hotel Tech Report sign-in has expired. Connect again to fill this from the vendor\u2019s profile.'
            : 'Connect Hotel Tech Report once to fill this from the vendor\u2019s profile automatically. You sign in with your HTR admin account.'}
          {problem ? <><br /><b>Could not connect: {problem}</b></> : null}
        </span>
        <a className="btn primary" href={`/api/htr/oauth/start?back=${encodeURIComponent(`/admin/projects/${p.id}`)}`}>Connect Hotel Tech Report</a>
      </div>
    );
  }
  const search = async (e) => {
    e?.preventDefault();
    setBusy(true);
    try { setResults((await api(`/api/htr/search?q=${encodeURIComponent(q)}`)).products); } catch (err) { say(err.message); }
    setBusy(false);
  };
  const pull = async (productId) => {
    setBusy(true);
    try { onPulled(await api(`/api/projects/${p.id}/htr`, { method: 'POST', body: { productId } })); setResults(null); } catch (err) { say(err.message); }
    setBusy(false);
  };
  return (
    <div className="htr-bar">
      {src && !results ? (
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="small">From HTR profile: <b>{src.name}</b>{src.category ? <span className="muted"> · {src.category}</span> : null}{src.pulledAt ? <span className="muted"> · pulled {when(src.pulledAt)}</span> : null}</span>
          <span className="row">
            <button className="btn" disabled={busy} onClick={() => pull(src.productId)}>{busy ? 'Pulling…' : 'Refresh'}</button>
            <button className="linkbtn" onClick={() => setResults([])}>Change product</button>
          </span>
        </div>
      ) : (
        <>
          <form className="row" style={{ flexWrap: 'nowrap' }} onSubmit={search}>
            <input type="text" placeholder="Product name on Hotel Tech Report" value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="btn primary" disabled={busy || q.trim().length < 2}>{busy ? 'Working…' : 'Find on HTR'}</button>
          </form>
          {results && (
            <div className="htr-results">
              {results.length === 0 ? <div className="muted small" style={{ padding: '8px 2px' }}>{busy ? 'Searching…' : 'Search for the product, then pick it to fill the form.'}</div> : results.map((r) => (
                <button key={r.id} className="htr-result" disabled={busy} onClick={() => pull(r.id)}>
                  <span><b>{r.name}</b> <span className="muted">· {r.category}</span></span>
                  <span className="muted small">{r.reviews ?? 0} reviews · Pull profile →</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------- admin-only panels ----------
// The editing guide maps each script paragraph to the moment in the demo recording that shows it.
function GuideCard({ p, hasScript, say }) {
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  useEffect(() => { api(`/api/projects/${p.id}/guide`).then(setD).catch(() => {}); }, [p.id, hasScript, p.items.video.parts?.length]);
  const build = async () => {
    setBusy(true); setProblem('');
    try { setD(await api(`/api/projects/${p.id}/guide`, { method: 'POST', body: {} })); say('Editing guide built'); }
    catch (e) { setProblem(e.message); }
    setBusy(false);
  };
  const g = d?.guide;
  return (
    <section className="card pad script-entry" id="editing-guide">
      <div style={{ minWidth: 0 }}>
        <div className="step-title">Editing guide <span className="htr-only">For the editor</span></div>
        <div className="muted small">
          {busy ? 'Reading the script and the demo transcript. This takes one to three minutes; keep this page open.'
            : g ? <>Built {when(g.builtAt)} from script version {g.scriptVersion}: {g.demo} script {g.demo === 1 ? 'paragraph is' : 'paragraphs are'} matched to {g.clips} {g.clips === 1 ? 'moment' : 'moments'} in the demo{g.approximate ? ` (${g.approximate} approximate)` : ''}, {g.host} on camera, {g.other} with no demo footage.{d.stale ? <> <b>Out of date.</b> {d.stale}</> : null}</>
              : d?.blocker ? d.blocker
                : 'Matches each part of the script to the moment in the demo recording that shows it, in plain language, so the editor needs no product knowledge.'}
          {problem ? <><br /><b>That didn&apos;t work.</b> {problem}</> : null}
        </div>
      </div>
      <div className="row" style={{ flex: 'none' }}>
        {g && <a className="linkbtn" href={`/editor/p/${p.id}#editing-guide`}>Open in editor view</a>}
        <button className={`btn${!g || d?.stale ? ' primary' : ''}`} disabled={busy || !d || !!d.blocker} onClick={build}>{busy ? 'Building…' : g ? 'Rebuild' : 'Build editing guide'}</button>
      </div>
    </section>
  );
}

const fmtNum = (n) => Number(n).toLocaleString('en-US');

function Check({ state, title, children }) {
  const icon = { done: '✓', partial: '◐', warn: '!', todo: '○', error: '✕' }[state];
  return (
    <div className="check">
      <span className={`check-icon ck-${state}`} aria-hidden="true">{icon}</span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="check-title">{title}</div>
        <div className="muted small">{children}</div>
      </div>
    </div>
  );
}

function Overview({ p, jobs = [], htrEnabled }) {
  const sts = ITEMS.map((i) => p.items[i].status);
  const submitted = sts.filter((s) => s === 'submitted' || s === 'approved').length;
  const approved = sts.filter((s) => s === 'approved').length;
  const clientState = sts.includes('changes') ? 'warn' : approved === 3 ? 'done' : submitted ? 'partial' : 'todo';

  const internal = p.internal || {};
  const filled = Object.keys(internal.fields || {}).length;
  const htrState = internal.completedAt ? 'done' : filled ? 'partial' : 'todo';

  const failed = jobs.find((j) => j.status === 'error');
  const working = jobs.filter((j) => j.status === 'processing');
  const ready = jobs.filter((j) => j.status === 'done');
  let tState = 'todo'; let tText = p.items.video.external ? 'The video was received outside the app, so there is no transcript here.' : 'No video uploaded yet.';
  if (failed) { tState = 'error'; tText = `Failed${jobs.length > 1 ? ` on ${failed.filename}` : ''}${failed.error ? `: ${failed.error}` : ''}. Upload that file again.`; }
  else if (working.length) { tState = 'partial'; tText = `Transcribing ${working.map((j) => j.filename || 'the video').join(' and ')}…`; }
  else if (ready.length) {
    const seconds = ready.reduce((n, j) => n + (j.seconds || 0), 0);
    const known = ready.every((j) => j.words != null);
    const words = ready.reduce((n, j) => n + (j.words || 0), 0);
    const wpm = seconds && known ? words / (seconds / 60) : null;
    const thin = wpm != null && wpm < 40;
    const speakers = Math.max(...ready.map((j) => j.speakers ?? 0));
    tState = thin ? 'warn' : 'done';
    tText = [ready.length > 1 ? `${ready.length} parts` : null, ready.length > 1 ? duration(seconds) : ready[0].durationText, speakers ? `${speakers} speaker${speakers === 1 ? '' : 's'}` : null, known && `${fmtNum(words)} words`].filter(Boolean).join(' · ')
      + (thin ? '. Very few words for the length; check the audio before scripting.' : '.');
  }

  return (
    <section className="card overview">
      <Check state={clientState} title="Client submission">
        {submitted} of 3 submitted, {approved} approved{sts.includes('changes') ? ', update requested' : ''}.{' '}
        {ITEMS.map((i) => <span key={i} className="ov-item"><span className={`dot st-${p.items[i].status}`} />{ITEM_LABEL[i]}</span>)}
      </Check>
      <Check state={htrState} title="HTR profile data">
        {internal.htr ? <>Pulled from <b>{internal.htr.name}</b> {when(internal.htr.pulledAt)}. </> : htrEnabled ? 'Not pulled yet. ' : 'Filled by hand (Hotel Tech Report not connected). '}
        {filled} of {INTERNAL_FIELDS.length} fields filled{internal.completedAt ? ', marked complete' : ''}. <a href="#internal-dossier">Open</a>
      </Check>
      <Check state={tState} title="Transcript">
        {tText}{' '}
        {ready.map((j, i) => <a key={j.id} href={`/admin/jobs/${j.id}`} style={{ marginRight: 10 }}>{jobs.length > 1 ? `Open part ${jobs.indexOf(j) + 1}` : 'Open transcript'}</a>)}
      </Check>
    </section>
  );
}

// People who can sign in for the client. HTR can add someone by hand; that never sends an email.
function People({ people, p, act, say }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ first: '', last: '', email: '' });
  const [busy, setBusy] = useState(false);
  const change = async (body, note) => {
    setBusy(true);
    try {
      await api(`/api/companies/${p.company}`, { method: 'PATCH', body });
      if (note) await act({ type: 'note', kind: 'contact.added', text: note });
      window.location.reload();
    } catch (e) { say(e.message); setBusy(false); }
  };
  return (
    <section className="card pad">
      <div className="step-title">People at the client</div>
      {!people.length ? <p className="muted small">No one from the client has signed up yet.</p> : people.map((x) => (
        <div key={x.email} className="person">
          <div style={{ fontWeight: 500 }}>{x.name}</div>
          <div className="small"><a href={`mailto:${x.email}`}>{x.email}</a></div>
          <div className="muted small">
            {x.addedByAdmin && !x.lastLoginAt
              ? <>Added by Hotel Tech Report{x.joinedAt ? ` ${when(x.joinedAt)}` : ''} · has not signed in yet · <button className="linkbtn" style={{ padding: 0 }} disabled={busy} onClick={() => window.confirm(`Remove ${x.email}?`) && change({ removeContact: x.email })}>Remove</button></>
              : <>{x.joinedAt ? `Joined ${when(x.joinedAt)}` : 'Joined date unknown'}{x.lastLoginAt ? ` · last signed in ${when(x.lastLoginAt)}` : ''}</>}
          </div>
        </div>
      ))}
      {!open ? <button className="linkbtn" style={{ padding: 0, marginTop: 8 }} onClick={() => setOpen(true)}>Add a person</button> : (
        <form style={{ marginTop: 10 }} onSubmit={(e) => { e.preventDefault(); change({ addContact: f }, f.email.trim().toLowerCase()); }}>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <input type="text" placeholder="First name" value={f.first} onChange={(e) => setF({ ...f, first: e.target.value })} />
            <input type="text" placeholder="Last name" value={f.last} onChange={(e) => setF({ ...f, last: e.target.value })} />
          </div>
          <input type="email" placeholder="Work email" style={{ marginTop: 8 }} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn" disabled={busy || !f.email.trim()}>Add without emailing</button>
            <button type="button" className="linkbtn" onClick={() => setOpen(false)}>Cancel</button>
          </div>
          <p className="hint">No email is sent now. They can sign in with this address and will land in this project, and so will colleagues on the same email domain. From then on, update requests, messages and script shares do email them.</p>
        </form>
      )}
    </section>
  );
}

function Timeline({ p, jobs }) {
  const events = timeline(p, jobs);
  return (
    <section className="card pad">
      <div className="step-title">Timeline</div>
      <ol className="timeline">
        {events.map((e, i) => (
          <li key={i} className={e.client ? 'from-client' : ''}>
            <div className="small">{e.text}</div>
            <div className="muted small">{when(e.at)}{e.by?.name ? ` · ${e.by.name}` : ''}{e.client ? ' (client)' : ''}</div>
          </li>
        ))}
      </ol>
    </section>
  );
}
