'use client';
import { useCallback, useEffect, useState } from 'react';
import { blocks, clock, fileStem, toPlain, toSrt, toTxt } from '@/lib/format.js';
import { api, Brand, bytes, download, duration, useToast, when } from './ui.js';

export default function TranscriptView({ id }) {
  const [job, setJob] = useState(null);
  const [t, setT] = useState(null);
  const [names, setNames] = useState({});
  const [error, setError] = useState('');
  const [toast, say] = useToast();

  const load = useCallback(async () => {
    try {
      const d = await api(`/api/jobs/${id}`);
      setJob(d.job); setT(d.transcript); setNames(d.job.speakerNames || {});
    } catch (e) { setError(e.message); }
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (job?.status !== 'processing') return;
    const timer = setTimeout(load, 10000);
    return () => clearTimeout(timer);
  }, [job, load]);

  const saveNames = async (next) => {
    try { await api(`/api/jobs/${id}`, { method: 'PATCH', body: { speakerNames: next } }); } catch (e) { say(e.message); }
  };

  async function docx() {
    const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import('docx');
    const grey = '6B6F76';
    const children = [
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(job.filename)] }),
      new Paragraph({ children: [new TextRun({ text: `${job.companyName} · ${clock(t.duration * 1000)}`, color: grey, size: 18 })] }),
    ];
    for (const b of blocks(t, names)) {
      children.push(new Paragraph({ spacing: { before: 240 }, children: [
        new TextRun({ text: b.speaker, bold: true }), new TextRun({ text: `   ${clock(b.start)}`, color: grey, size: 18 }),
      ] }));
      for (const p of b.paragraphs) children.push(new Paragraph({ spacing: { after: 120 }, children: [new TextRun(p)] }));
    }
    const doc = new Document({ styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } }, sections: [{ children }] });
    download(`${fileStem(job.filename)}.docx`, await Packer.toBlob(doc));
  }

  if (error) return <div className="wrap"><header className="top"><Brand /></header><div className="alert">{error}</div></div>;
  if (!job) return <div className="wrap"><header className="top"><Brand /></header><div className="empty">Loading…</div></div>;

  return (
    <div className="wrap">
      <header className="top">
        <Brand />
        <a className="linkbtn" href="/">All transcripts</a>
      </header>
      <h1 style={{ wordBreak: 'break-word' }}>{job.filename}</h1>
      <p className="sub">{job.companyName} · uploaded {when(job.createdAt)}{job.source === 'client' ? ' by the client' : ''} · {bytes(job.size)}</p>

      {job.status === 'processing' && (
        <div className="card pad">
          <div style={{ fontWeight: 500 }}>Transcribing</div>
          <div className="muted small">Usually takes a few minutes, even for long videos. This page refreshes on its own; you can also close it and come back.</div>
          <div className="bar"><div style={{ width: '35%' }} /></div>
        </div>
      )}

      {job.status === 'error' && (
        <div className="card pad">
          <div style={{ fontWeight: 500, color: 'var(--err)' }}>Transcription failed</div>
          <div className="muted small" style={{ marginTop: 4 }}>{job.error}</div>
          <div className="row" style={{ marginTop: 14 }}>
            <button className="btn primary" onClick={async () => {
              try { await api(`/api/jobs/${id}/retry`, { method: 'POST' }); await load(); } catch (e) { say(e.message); }
            }}>Retry</button>
            <DeleteButton id={id} />
          </div>
        </div>
      )}

      {job.status === 'done' && t && (
        <div className="card">
          <dl className="stats">
            <div><dt>Length</dt><dd>{duration(t.duration)}</dd></div>
            <div><dt>Speakers</dt><dd>{t.speakers.filter((s) => s !== '?').length}</dd></div>
            <div><dt>Words</dt><dd>{t.words.length.toLocaleString()}</dd></div>
            <div><dt>Est. cost</dt><dd>${(job.costEstimate ?? 0).toFixed(2)}</dd></div>
          </dl>
          <div className="toolbar">
            <button className="btn" onClick={() => navigator.clipboard.writeText(toPlain(t, names)).then(() => say('Copied'))}>Copy</button>
            <button className="btn" onClick={() => download(`${fileStem(job.filename)}.txt`, new Blob([toTxt(t, job, names)], { type: 'text/plain' }))}>TXT</button>
            <button className="btn" onClick={() => docx().catch((e) => say(e.message))}>DOCX</button>
            <button className="btn" onClick={() => download(`${fileStem(job.filename)}.srt`, new Blob([toSrt(t, names)], { type: 'application/x-subrip' }))}>SRT</button>
            <span className="spacer" />
            <DeleteButton id={id} />
          </div>
          <div className="speakers">
            <span className="muted">Speaker names</span>
            {t.speakers.filter((s) => s !== '?').map((s) => (
              <input key={s} type="text" placeholder={`Speaker ${s}`} value={names[s] || ''} maxLength={80}
                onChange={(e) => setNames({ ...names, [s]: e.target.value })}
                onBlur={() => saveNames(names)} aria-label={`Name for speaker ${s}`} />
            ))}
          </div>
          <div className="viewer">
            {blocks(t, names).map((b, i) => (
              <div className="turn" key={i}>
                <div className="who">{b.speaker}<time>{clock(b.start)}</time></div>
                {b.paragraphs.map((p, k) => <p key={k}>{p}</p>)}
              </div>
            ))}
          </div>
          <div className="foot">
            {t.model ? `${t.model} · ` : ''}{t.language ? `language ${t.language} · ` : ''}
            Speaker letters come from the transcription service; rename them above and every download uses the names.
            Cost is an estimate from list prices.
          </div>
        </div>
      )}
      {toast}
    </div>
  );

  function DeleteButton() {
    return (
      <button className="btn danger" onClick={async () => {
        if (!confirm('Delete this transcript (and the video if it is still stored)? This cannot be undone.')) return;
        try { await api(`/api/jobs/${id}`, { method: 'DELETE' }); location.href = '/'; } catch (e) { say(e.message); }
      }}>Delete</button>
    );
  }
}

