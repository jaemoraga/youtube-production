'use client';
import { uploadPresigned } from '@vercel/blob/client';
import { useEffect, useRef, useState } from 'react';
import { mediaType, safeName } from '@/lib/media.js';
import { api, bytes } from './ui.js';

const MAX = 5 * 1024 ** 3;

// mode "client": the page behind a company's private link (token + companyName given).
// mode "admin":  the signed-in upload page (companies list given; extra terms box).
export default function Uploader({ mode, token, companySlug, companyName, companies = [] }) {
  const admin = mode === 'admin';
  const input = useRef(null);
  const [file, setFile] = useState(null);
  const [slug, setSlug] = useState(admin ? 'internal' : null);
  const [terms, setTerms] = useState('');
  const [phase, setPhase] = useState('pick'); // pick | uploading | starting | done
  const [pct, setPct] = useState(0);
  const [error, setError] = useState('');
  const [over, setOver] = useState(false);

  useEffect(() => {
    const warn = (e) => { if (phase === 'uploading') { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [phase]);

  function choose(f) {
    setError('');
    if (!f) return;
    if (!mediaType(f.name)) return setError('Please choose a video or audio file (MP4, MOV, WebM, MP3, M4A, WAV…).');
    if (f.size > MAX) return setError(`That file is ${bytes(f.size)}. The limit is 5 GB.`);
    setFile(f);
  }

  async function start() {
    setError('');
    setPhase('uploading');
    setPct(0);
    try {
      const pathname = `uploads/${admin ? slug : companySlug}/${safeName(file.name)}`;
      const blob = await uploadPresigned(pathname, file, {
        access: 'private',
        handleUploadUrl: '/api/upload',
        clientPayload: JSON.stringify(admin ? {} : { token }),
        headers: { 'x-htr': '1' },
        contentType: mediaType(file.name),
        multipart: true,
        onUploadProgress: ({ percentage }) => setPct(percentage),
      });
      setPhase('starting');
      const res = await api('/api/jobs', {
        method: 'POST',
        body: { pathname: blob.pathname, filename: file.name, token: admin ? undefined : token, terms: admin ? terms : undefined },
      });
      if (admin && res.id) { window.location.href = `/jobs/${res.id}`; return; }
      if (!admin && !res.ok) throw new Error('The upload worked but transcription could not start. Please let us know.');
      setPhase('done');
    } catch (e) {
      setPhase('pick');
      setError(e.message || 'Upload failed. Please try again.');
    }
  }

  if (phase === 'done') {
    return (
      <div className="card success">
        <div className="tick"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5 10 17l9-10" /></svg></div>
        <h1>Thanks, we have it</h1>
        <p className="muted">“{file.name}” uploaded successfully. You can close this page.</p>
        <button className="btn" onClick={() => { setFile(null); setPhase('pick'); }}>Upload another file</button>
      </div>
    );
  }

  const busy = phase !== 'pick';
  return (
    <div>
      {!file ? (
        <label
          className={`drop${over ? ' over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); choose(e.dataTransfer.files[0]); }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></svg>
          <strong>Drop a video or audio file</strong>
          <small>or click to browse · up to 5 GB</small>
          <input ref={input} type="file" hidden accept="video/*,audio/*" onChange={(e) => choose(e.target.files[0])} />
        </label>
      ) : (
        <div className="card pad">
          <div className="file">
            <div className="icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M2 10v4M6 6v12M10 3v18M14 8v8M18 5v14M22 10v4" /></svg></div>
            <div className="meta">
              <div className="name">{file.name}</div>
              <div className="muted small">{bytes(file.size)}{!admin && companyName ? ` · for ${companyName}` : ''}</div>
            </div>
            {!busy && <button className="linkbtn" onClick={() => setFile(null)}>Change</button>}
          </div>

          {admin && !busy && (
            <>
              <label className="field">
                <span>Company</span>
                <select value={slug} onChange={(e) => setSlug(e.target.value)}>
                  <option value="internal">Hotel Tech Report (internal)</option>
                  {companies.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
                </select>
              </label>
              <label className="field">
                <span>Names and terms in this video <span className="muted">(optional)</span></span>
                <textarea value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="Speaker names, companies, products. Comma separated." />
                <div className="hint">Added to the company&apos;s saved terms as spelling hints. Up to 6 words each.</div>
              </label>
            </>
          )}

          {busy ? (
            <>
              <div className="row small" style={{ justifyContent: 'space-between', marginTop: 16 }}>
                <span>{phase === 'uploading' ? 'Uploading…' : 'Starting transcription…'}</span>
                <span className="muted">{phase === 'uploading' ? `${Math.floor(pct)}%` : ''}</span>
              </div>
              <div className="bar"><div style={{ width: `${phase === 'uploading' ? pct : 100}%` }} /></div>
              {phase === 'uploading' && <div className="hint">Keep this page open until the upload finishes.</div>}
            </>
          ) : (
            <button className="btn primary big" style={{ marginTop: 20 }} onClick={start}>
              {admin ? 'Upload and transcribe' : 'Upload'}
            </button>
          )}
        </div>
      )}
      {error && <div className="alert">{error}</div>}
    </div>
  );
}
