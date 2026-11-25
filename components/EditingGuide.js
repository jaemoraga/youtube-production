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
  const features = guide.features || [];
  const [open, setOpen] = useState(features[0]?.id || null);
  const [clipAt, setClipAt] = useState(0);
  const several = parts.length > 1;
  const sec = sectionOf(paragraphs);
  const byId = new Map(features.map((f) => [f.id, f]));
  const rows = new Map((guide.script || []).map((r) => [r.paragraph, r]));
  const none = (guide.script || []).filter((r) => r.kind === 'other');
  const approx = features.some((f) => f.clips.some((c) => !c.exact));
  const pick = (id, clip = 0) => { setOpen(id); setClipAt(clip); };

  // Links from the transcript (#f3) and between the views (#s-12) open the right view first.
  useEffect(() => {
    const go = () => {
      const h = window.location.hash.slice(1);
      if (/^f\d+$/.test(h)) { setQ(''); setTab('features'); setOpen(h); setClipAt(0); setTimeout(() => document.getElementById('editing-guide')?.scrollIntoView({ block: 'start' }), 60); }
      else if (/^s-\d+$/.test(h)) { setTab('script'); setTimeout(() => document.getElementById(h)?.scrollIntoView({ block: 'start' }), 60); }
    };
    go();
    window.addEventListener('hashchange', go);
    return () => window.removeEventListener('hashchange', go);
  }, []);

  const needle = q.trim().toLowerCase();
  const hit = (f) => !needle || [f.name, f.about, ...f.clips.flatMap((c) => [c.show, c.quote]), ...f.paragraphs.map((n) => paragraphs[n - 1])].join(' ').toLowerCase().includes(needle);
  // When searching, features whose name matches come first; otherwise script order.
  const named = (f) => (needle && f.name.toLowerCase().includes(needle) ? 0 : 1);
  const shown = features.filter(hit).sort((a, b) => named(a) - named(b));
  const current = shown.find((f) => f.id === open) || shown[0] || null;
  const at = current ? shown.indexOf(current) : -1;
  const clip = current ? current.clips[Math.min(clipAt, current.clips.length - 1)] : null;
  const clipIndex = current ? current.clips.indexOf(clip) : 0;
  const time = (c) => `${c.exact ? '' : '≈ '}${clock(c.start)}`;
  const when = (c) => `${several ? `Part ${c.part + 1} at ` : ''}${c.exact ? '' : 'about '}${clock(c.start)}`;
  // The menu is grouped by the script section where each feature is first used.
  const groups = [];
  shown.forEach((f) => { const g = needle ? '' : sec.get(f.paragraphs[0]) || ''; if (!groups.length || groups[groups.length - 1].title !== g) groups.push({ title: g, items: [] }); groups[groups.length - 1].items.push(f); });

  const sections = [];
  paragraphs.forEach((p, i) => {
    if (isHeading(p)) { sections.push({ title: headingText(p), items: [] }); return; }
    if (!sections.length) sections.push({ title: '', items: [] });
    sections[sections.length - 1].items.push({ n: i + 1, text: p, row: rows.get(i + 1) });
  });

  return (
    <section className="card guide" id="editing-guide">
      <div className="guide-top">
        <div>
          <div className="guide-title">Editing guide</div>
        </div>
        <button className="btn" onClick={() => download(`${company} editing guide.txt`, new Blob([guideToTxt(guide, { paragraphs, parts, company })], { type: 'text/plain' }))}>Download as text</button>
      </div>
      <ol className="guide-how">
        <li><span>1</span>Pick a feature from the list</li>
        <li><span>2</span>Go to that time in the demo video</li>
        <li><span>3</span>Put that footage over the script lines shown</li>
      </ol>
      <div className="guide-searchbar">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
        <input type="text" placeholder="Search for a feature: report, WhatsApp, phone, inbox…" value={q} onChange={(e) => { setQ(e.target.value); setTab('features'); }} aria-label="Search features" />
        {q && <button className="linkbtn" onClick={() => setQ('')}>Clear</button>}
      </div>
      {stale && <div className="callout" style={{ margin: '0 18px 12px' }}><b>This guide may be out of date.</b> {stale} Ask Hotel Tech Report to rebuild it.</div>}

      <div className="guide-tabs">
        <button className={tab === 'features' ? 'on' : ''} onClick={() => setTab('features')}>Features <span>{features.length}</span></button>
        <button className={tab === 'script' ? 'on' : ''} onClick={() => setTab('script')}>Script order</button>
        <button className={tab === 'none' ? 'on' : ''} onClick={() => setTab('none')}>No demo footage <span>{none.length}</span></button>
        <button className={tab === 'words' ? 'on' : ''} onClick={() => setTab('words')}>Glossary <span>{guide.glossary?.length || 0}</span></button>
        <button className={tab === 'help' ? 'on' : ''} onClick={() => setTab('help')}>How this works</button>
      </div>

      {tab === 'features' && (
        <div className="guide-split">
          <nav className="guide-menu" aria-label="Features">
            <div className="gd-label" style={{ padding: '8px 10px 0', margin: 0 }}><span className="gd-step">1</span> Pick a feature</div>
            {shown.length === 0 && <div className="muted small" style={{ padding: 12 }}>Nothing matches “{q}”.</div>}
            {groups.map((g, gi) => (
              <div key={gi}>
                {g.title && <div className="guide-menu-head">{g.title}</div>}
                {g.items.map((f) => (
                  <button key={f.id} className={`guide-menu-item${current?.id === f.id ? ' on' : ''}`} onClick={() => pick(f.id)}>
                    <span className="gm-name">{f.name}</span>
                    <span className="gm-time">{several ? `P${f.clips[0].part + 1} · ` : ''}{time(f.clips[0])}</span>
                  </button>
                ))}
              </div>
            ))}
          </nav>

          <div className="guide-detail" id={current?.id}>
            {!current && <div className="empty">No feature matches “{q}”. Try another word, or look in the demo transcript below.</div>}
            {current && (
              <>
                <div className="gd-head">
                  <div>
                    <div className="gd-count">Feature {at + 1} of {shown.length}</div>
                    <h3>{current.name}</h3>
                    {current.about && <p className="muted">{current.about}</p>}
                  </div>
                  <div className="gd-nav">
                    <button className="btn" disabled={at <= 0} onClick={() => pick(shown[at - 1].id)} aria-label="Previous feature">←</button>
                    <button className="btn" disabled={at >= shown.length - 1} onClick={() => pick(shown[at + 1].id)} aria-label="Next feature">→</button>
                  </div>
                </div>

                <div className="gd-block">
                  <div className="gd-label"><span className="gd-step">2</span> Go to this time in the demo video</div>
                  <div className="gd-chips">
                    {current.clips.map((c, ci) => (
                      <button key={ci} className={`gd-chip${ci === clipIndex ? ' on' : ''}`} onClick={() => setClipAt(ci)}>
                        {several && <span className="gd-part">Part {c.part + 1}</span>}
                        <span className="gd-time">{time(c)}</span>
                        <span className="gd-to">to {clock(c.end)}</span>
                        {ci === 0 && current.clips.length > 1 && <span className="gd-best">Best</span>}
                      </button>
                    ))}
                  </div>
                  <div className="gd-clip">
                    {several && <div className="muted small">{partName(parts[clip.part], clip.part, parts.length)}</div>}
                    <div className="gd-see"><span>On screen</span>{clip.show}</div>
                    {clip.quote && <div className="gd-see"><span>They say</span>“{clip.quote}”</div>}
                    <a className="linkbtn" style={{ padding: 0 }} href={`#clip-${current.id}-${clipIndex}`}>Show this moment in the demo transcript ↓</a>
                  </div>
                </div>

                <div className="gd-block">
                  <div className="gd-label"><span className="gd-step">3</span> Put that footage over {current.paragraphs.length === 1 ? 'this script line' : `these ${current.paragraphs.length} script lines`}</div>
                  {current.paragraphs.map((n) => (
                    <a className="feature-line" key={n} href={`#s-${n}`}>
                      <span className="gd-tag">{sec.get(n) ? `${sec.get(n)} · ` : ''}line {n}</span>
                      <span>“{lineOpening(paragraphs[n - 1], 170)}”</span>
                    </a>
                  ))}
                </div>
              </>
            )}
          </div>
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

      {tab === 'help' && (
        <div className="guide-intro">
          {guide.summary && <p style={{ marginTop: 0 }}><b>What this product is.</b> {guide.summary}</p>}
          <p><b>Times.</b> Each time is the second the client starts talking about the feature in their demo recording. The screen you want should appear right then or a few seconds after. Times count from the start of each demo file{approx ? '; one marked ≈ could not be pinned to the exact second, so look a little either side' : ''}.</p>
          <p><b>Script.</b> Version {guide.scriptVersion}{approved ? ', approved by the client and locked' : ', not yet approved by the client, so it may still change'}.</p>
          <p className="muted small" style={{ marginBottom: 0 }}>This guide was drafted by AI from the transcript and checked against it. If a time does not show what the guide says, tell Hotel Tech Report.</p>
        </div>
      )}
    </section>
  );
}
