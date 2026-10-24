'use client';
// The project checklist. role="client": the sponsor completes items. role="admin": HTR reviews them.
import { uploadPresigned } from '@vercel/blob/client';
import { useState } from 'react';
import { GROUP_HINT, INTERNAL_FIELDS, ITEM_LABEL, ITEMS, STATUS_TEXT, projectStatus } from '@/lib/project-shared.js';
import { assetType, mediaType, safeName } from '@/lib/media.js';
import { api, bytes, useToast, when } from './ui.js';

const fileUrl = (path) => `/api/files?p=${encodeURIComponent(path)}`;

export function StatusPill({ status, forClient = false }) {
  const text = forClient && status === 'waiting' ? 'Waiting on you' : forClient && status === 'review' ? 'In review' : STATUS_TEXT[status] || status;
  return <span className={`pill st-${status}`}>{text}</span>;
}

export default function ProjectView({ initial, role, templateUrl, job, htrEnabled = false }) {
  const [p, setP] = useState(initial);
  const [toast, say] = useToast();
  const admin = role === 'admin';

  const act = async (action, ok) => {
    try {
      const d = await api(`/api/projects/${p.id}`, { method: 'POST', body: action });
      setP(d.project);
      if (ok) say(ok);
      return true;
    } catch (e) { say(e.message); return false; }
  };
  const reload = async () => { try { setP((await api(`/api/projects/${p.id}`)).project); } catch { /* ignore */ } };

  const status = projectStatus(p);
  const done = ITEMS.filter((i) => ['submitted', 'approved'].includes(p.items[i].status)).length;

  return (
    <>
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

      <div className="steps">
        <Item n={1} item="dossier" p={p} admin={admin} act={act}>
          <Dossier p={p} admin={admin} act={act} templateUrl={templateUrl} />
        </Item>
        <Item n={2} item="assets" p={p} admin={admin} act={act}>
          <Assets p={p} admin={admin} act={act} say={say} />
        </Item>
        <Item n={3} item="video" p={p} admin={admin} act={act}>
          <Video p={p} admin={admin} reload={reload} say={say} job={job} />
        </Item>
      </div>
      {admin && <InternalDossier p={p} act={act} htrEnabled={htrEnabled} say={say} />}
      {toast}
    </>
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
          {it.submittedAt && <div className="muted small">Submitted {when(it.submittedAt)}</div>}
        </div>
        <StatusPill status={it.status} />
      </header>

      {it.status === 'changes' && lastChange && !admin && (
        <div className="callout">
          <b>Update needed.</b> {lastChange.text}
        </div>
      )}

      <div className="step-body">{children}</div>

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
    return it.url
      ? <a className="btn" href={it.url} target="_blank" rel="noreferrer">Open dossier ↗</a>
      : <p className="muted small">Not submitted yet.</p>;
  }
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

  async function addFiles(list) {
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
              {!admin && !locked && <button className="linkbtn" onClick={() => act({ type: 'assets.remove', item: 'assets', pathname: f.pathname })}>Remove</button>}
            </div>
          ))}
        </div>
      )}
      {admin && !it.files.length && <p className="muted small">No files yet.</p>}
      {!admin && !locked && (
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
              Submit {it.files.length ? `${it.files.length} file${it.files.length > 1 ? 's' : ''}` : ''}
            </button>
          )}
          {it.status === 'submitted' && <p className="hint">Submitted. You can still add files; we&apos;ll see them.</p>}
        </>
      )}
    </>
  );
}

function Video({ p, admin, reload, say, job }) {
  const it = p.items.video;
  const locked = it.status === 'approved';
  const [replacing, setReplacing] = useState(!it.jobId);
  const [pct, setPct] = useState(null);

  async function upload(file) {
    if (!file) return;
    if (!mediaType(file.name)) { say('Please choose a video file (MP4, MOV, …).'); return; }
    try {
      setPct(0);
      const blob = await uploadPresigned(`uploads/${p.company}/${safeName(file.name)}`, file, {
        access: 'private', handleUploadUrl: '/api/upload', headers: { 'x-htr': '1' },
        contentType: mediaType(file.name), multipart: true, onUploadProgress: ({ percentage }) => setPct(percentage),
      });
      await api('/api/jobs', { method: 'POST', body: { pathname: blob.pathname, filename: file.name, projectId: p.id } });
      await reload();
      setReplacing(false);
      say('Video submitted');
    } catch (e) { say(e.message); } finally { setPct(null); }
  }

  if (admin) {
    if (!it.jobId) return <p className="muted small">Not uploaded yet.</p>;
    return (
      <div className="row">
        <span className="muted small" style={{ flex: 1 }}>{it.filename}{job ? ` · transcript ${job.status === 'done' ? 'ready' : job.status === 'error' ? 'failed' : 'in progress'}` : ''}</span>
        <a className="btn" href={`/jobs/${it.jobId}`}>Transcript & editor link</a>
      </div>
    );
  }

  return (
    <>
      {it.jobId && !replacing && (
        <div className="row">
          <span className="muted small" style={{ flex: 1 }}>Uploaded: <b>{it.filename}</b></span>
          {!locked && <button className="linkbtn" onClick={() => setReplacing(true)}>Replace video</button>}
        </div>
      )}
      {(replacing && !locked) && (
        <>
          <p className="muted small" style={{ marginTop: 0 }}>Upload an unedited screen-share demo of your software: ideally 20+ minutes covering every key part of the platform, with voice-over and no talking head over the product. Not a marketing video. Large files are fine; keep this page open until it finishes.</p>
          <label className="drop small-drop">
            <strong>{pct !== null ? `Uploading… ${Math.floor(pct)}%` : 'Drop your video or click to choose'}</strong>
            <input type="file" hidden accept="video/*" disabled={pct !== null} onChange={(e) => upload(e.target.files[0])} />
          </label>
          {pct !== null && <div className="bar"><div style={{ width: `${pct}%` }} /></div>}
          {it.jobId && pct === null && <button className="linkbtn" style={{ marginTop: 8 }} onClick={() => setReplacing(false)}>Cancel</button>}
        </>
      )}
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
function InternalDossier({ p, act, htrEnabled, say }) {
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
    <section className="card internal">
      <div className="internal-head">
        <div>
          <div className="step-title">Internal dossier <span className="htr-only">HTR only</span></div>
          <p className="muted small" style={{ margin: 0 }}>Copy from the vendor&apos;s Hotel Tech Report profile. All fields are optional. The client never sees this.</p>
        </div>
        <span className={`pill ${complete ? 'st-approved' : 'st-todo'}`}>{complete ? 'Complete' : `${filled} of ${INTERNAL_FIELDS.length} filled`}</span>
      </div>
      <HtrPull p={p} enabled={htrEnabled} src={src} say={say} onPulled={(data) => {
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
function HtrPull({ p, enabled, src, say, onPulled }) {
  const [q, setQ] = useState(p.companyName || '');
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  if (!enabled) {
    return (
      <div className="htr-bar muted small">
        Connect the Hotel Tech Report data feed to fill this from the vendor&apos;s profile automatically (set HTR_MCP_URL and HTR_MCP_KEY in Vercel).
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
