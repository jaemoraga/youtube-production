'use client';
// The editor's guide. Main view: one card per feature, saying where to find it in the demo recording and
// which script lines it goes over. Second view: the script in order. Third: lines with no demo footage.
import { useEffect, useState } from 'react';
import { clock } from '@/lib/format.js';
import { KIND_LABEL, guideToTxt, headingText, isHeading, lineOpening, partName, sectionOf } from '@/lib/guide-shared.js';
import { download } from './ui.js';

export default function EditingGuide({ guide, paragraphs, parts, company, stale, approved }) {
  const [tab, setTab] = useState('features');
  const [q, setQ] = useState('');
  const several = parts.length > 1;
  const sec = sectionOf(paragraphs);
  const features = guide.features || [];
  const byId = new Map(features.map((f) => [f.id, f]));
  const rows = new Map((guide.script || []).map((r) => [r.paragraph, r]));
  const none = (guide.script || []).filter((r) => r.kind === 'other');
  const approx = features.some((f) => f.clips.some((c) => !c.exact));

  // Links from the transcript (#f3) and between the views (#s-12) open the right view first.
  useEffect(() => {
    const go = () => {
      const h = window.location.hash.slice(1);
      const want = /^f\d+$/.test(h) ? 'features' : /^s-\d+$/.test(h) ? 'script' : null;
      if (!want) return;
      setQ(''); setTab(want);
      setTimeout(() => document.getElementById(h)?.scrollIntoView({ block: 'start' }), 60);
    };
    go();
    window.addEventListener('hashchange', go);
    return () => window.removeEventListener('hashchange', go);
  }, []);

  const needle = q.trim().toLowerCase();
  const hit = (f) => !needle || [f.name, f.about, ...f.clips.flatMap((c) => [c.show, c.quote]), ...f.paragraphs.map((n) => paragraphs[n - 1])].join(' ').toLowerCase().includes(needle);
  const shown = features.filter(hit);
  const when = (c) => `${several ? `Part ${c.part + 1} at ` : ''}${c.exact ? '' : 'about '}${clock(c.start)}`;

  const sections = [];
  paragraphs.forEach((p, i) => {
    if (isHeading(p)) { sections.push({ title: headingText(p), items: [] }); return; }
    if (!sections.length) sections.push({ title: '', items: [] });
    sections[sections.length - 1].items.push({ n: i + 1, text: p, row: rows.get(i + 1) });
  });

  return (
    <section className="card guide" id="editing-guide">
      <div className="toolbar">
        <span style={{ fontWeight: 500, alignSelf: 'center' }}>Editing guide: where each feature is in the demo, and where it goes in the script</span>
        <span className="spacer" />
        <button className="btn" onClick={() => download(`${company} editing guide.txt`, new Blob([guideToTxt(guide, { paragraphs, parts, company })], { type: 'text/plain' }))}>Download as text</button>
      </div>
      <div className="guide-intro">
        <p style={{ marginTop: 0 }}>
          <b>How to use this.</b> Each card below is one thing the product does. It tells you the time to go to in the demo recording to find it,
          and the lines of the script to put it over. The time is the second the client starts talking about it; the screen you want should appear right then or a few seconds after.
        </p>
        {guide.summary && <p><b>What this product is.</b> {guide.summary}</p>}
        <p className="muted small" style={{ marginBottom: 0 }}>
          Script version {guide.scriptVersion}{approved ? ', approved by the client and locked' : ', not yet approved by the client, so it may still change'}.
          {' '}Times count from the start of each demo file{approx ? '; a time marked “about” could not be pinned to the exact second, so look a little either side' : ''}.
          {' '}This guide was drafted by AI from the transcript and checked against it; if a time does not show what the guide says, tell Hotel Tech Report.
        </p>
        {stale && <div className="callout" style={{ margin: '12px 0 0' }}><b>This guide may be out of date.</b> {stale} Ask Hotel Tech Report to rebuild it.</div>}
      </div>

      <div className="guide-tabs">
        <button className={tab === 'features' ? 'on' : ''} onClick={() => setTab('features')}>By feature ({features.length})</button>
        <button className={tab === 'script' ? 'on' : ''} onClick={() => setTab('script')}>In script order</button>
        <button className={tab === 'none' ? 'on' : ''} onClick={() => setTab('none')}>No demo footage ({none.length})</button>
        <button className={tab === 'words' ? 'on' : ''} onClick={() => setTab('words')}>Words explained ({guide.glossary?.length || 0})</button>
        {tab === 'features' && <input type="search" className="guide-search" placeholder="Search features, e.g. report, WhatsApp, phone" value={q} onChange={(e) => setQ(e.target.value)} />}
      </div>

      {tab === 'features' && (
        <div>
          {shown.length === 0 && <div className="empty">No feature matches “{q}”. Try another word, or look in the demo transcript below.</div>}
          {shown.map((f) => (
            <div className="feature" key={f.id} id={f.id}>
              <div className="feature-name">{f.name}</div>
              {f.about && <div className="muted small">{f.about}</div>}
              <div className="feature-grid">
                <div>
                  <div className="feature-label">Find it in the demo</div>
                  {f.clips.map((c, ci) => (
                    <div className="guide-clip" key={ci}>
                      <a href={`#clip-${f.id}-${ci}`} className="guide-time">{ci ? 'Also ' : 'Go to '}{when(c)}</a>
                      <span className="muted small"> · runs to {clock(c.end)}</span>
                      {several && <div className="muted small">{partName(parts[c.part], c.part, parts.length)}</div>}
                      <div className="guide-what">{c.show}</div>
                      {c.quote && <div className="muted small">They say: “{c.quote}”</div>}
                    </div>
                  ))}
                </div>
                <div>
                  <div className="feature-label">Put it in the script</div>
                  {f.paragraphs.map((n) => (
                    <a className="feature-line" key={n} href={`#s-${n}`}>
                      <span className="muted small">{sec.get(n) ? `${sec.get(n)} · ` : ''}line {n}</span>
                      <span>“{lineOpening(paragraphs[n - 1], 150)}”</span>
                    </a>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'script' && sections.map((s, si) => (
        <div key={si} className="guide-section">
          {s.title && <h3>{s.title}</h3>}
          {s.items.map(({ n, text, row }) => (
            <div className={`guide-row kind-${row?.kind || 'other'}`} key={n} id={`s-${n}`}>
              <div className="guide-script">
                <div className="guide-n">Line {n}</div>
                <p>{text}</p>
              </div>
              <div className="guide-show">
                {(!row || row.kind !== 'demo') && <div className="guide-kind">{KIND_LABEL[row?.kind || 'other']}</div>}
                {(row?.features || []).map((id) => {
                  const f = byId.get(id); if (!f) return null;
                  return (
                    <div className="guide-clip" key={id}>
                      <a href={`#${id}`} className="guide-time">{f.name}</a>
                      <div className="guide-what">Go to {when(f.clips[0])}{f.clips.length > 1 ? ` (${f.clips.length - 1} more ${f.clips.length === 2 ? 'place' : 'places'})` : ''}</div>
                      <div className="muted small">{f.clips[0].show}</div>
                    </div>
                  );
                })}
                {row?.note && <div className="guide-note">{row.note}</div>}
              </div>
            </div>
          ))}
        </div>
      ))}

      {tab === 'none' && (
        <div>
          <div className="guide-intro"><p className="muted small" style={{ margin: 0 }}>These script lines need pictures, but the demo recording does not show them. Use the suggestion beside each, or ask Hotel Tech Report for the material.</p></div>
          {none.length === 0 && <div className="empty">Every script line is either covered by the demo or is the host on camera.</div>}
          {none.map((r) => (
            <div className="guide-row kind-other" key={r.paragraph}>
              <div className="guide-script"><div className="guide-n">{sec.get(r.paragraph) ? `${sec.get(r.paragraph)} · ` : ''}line {r.paragraph}</div><p>{paragraphs[r.paragraph - 1]}</p></div>
              <div className="guide-show"><div className="guide-kind">Use instead</div><div className="guide-what">{r.note || 'Nothing suggested.'}</div></div>
            </div>
          ))}
        </div>
      )}

      {tab === 'words' && (
        <div className="guide-glossary">
          <dl>{(guide.glossary || []).map((g) => <div key={g.term}><dt>{g.term}</dt><dd>{g.meaning}</dd></div>)}</dl>
        </div>
      )}
    </section>
  );
}
