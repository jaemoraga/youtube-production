'use client';
// The editor's map from the script to the demo recording: for each script paragraph, which file and
// which seconds show the same thing, and what to look for on screen.
import { clock } from '@/lib/format.js';
import { KIND_LABEL, guideToTxt, headingText, isHeading, partName } from '@/lib/guide-shared.js';
import { download } from './ui.js';

export default function EditingGuide({ guide, paragraphs, parts, company, stale, approved }) {
  const rows = new Map((guide.script || []).map((r) => [r.paragraph, r]));
  const several = parts.length > 1;
  const sections = [];
  paragraphs.forEach((p, i) => {
    if (isHeading(p)) { sections.push({ title: headingText(p), items: [] }); return; }
    if (!sections.length) sections.push({ title: '', items: [] });
    sections[sections.length - 1].items.push({ n: i + 1, text: p, row: rows.get(i + 1) });
  });
  const approx = (guide.script || []).some((r) => r.clips.some((c) => !c.exact));

  return (
    <section className="card guide" id="editing-guide">
      <div className="toolbar">
        <span style={{ fontWeight: 500, alignSelf: 'center' }}>Editing guide: script matched to the demo recording</span>
        <span className="spacer" />
        <button className="btn" onClick={() => download(`${company} editing guide.txt`, new Blob([guideToTxt(guide, { paragraphs, parts, company })], { type: 'text/plain' }))}>Download as text</button>
      </div>
      <div className="guide-intro">
        <p style={{ marginTop: 0 }}>
          <b>How to use this.</b> The left column is the script the presenter reads, in order. The right column tells you what to put on screen while she says it:
          which demo file, from when to when, and what you should see there. Click a time to jump to that spot in the demo transcript further down this page.
        </p>
        {guide.summary && <p><b>What this product is.</b> {guide.summary}</p>}
        <p className="muted small" style={{ marginBottom: 0 }}>
          Script version {guide.scriptVersion}{approved ? ', approved by the client and locked' : ', not yet approved by the client, so it may still change'}.
          {' '}Times count from the start of each demo file{approx ? '; a time marked “about” could not be pinned to the exact second, so look a little either side' : ''}.
          {' '}This guide was drafted by AI from the transcript and checked against it; if a clip does not show what the guide says, tell Hotel Tech Report.
        </p>
        {stale && <div className="callout" style={{ margin: '12px 0 0' }}><b>This guide may be out of date.</b> {stale} Ask Hotel Tech Report to rebuild it.</div>}
      </div>

      {guide.glossary?.length > 0 && (
        <details className="guide-glossary">
          <summary>Words you will hear and read ({guide.glossary.length})</summary>
          <dl>{guide.glossary.map((g) => <div key={g.term}><dt>{g.term}</dt><dd>{g.meaning}</dd></div>)}</dl>
        </details>
      )}

      {sections.map((sec, si) => (
        <div key={si} className="guide-section">
          {sec.title && <h3>{sec.title}</h3>}
          {sec.items.map(({ n, text, row }) => (
            <div className={`guide-row kind-${row?.kind || 'other'}`} key={n} id={`s-${n}`}>
              <div className="guide-script">
                <div className="guide-n">Script {n}{row?.topic ? ` · ${row.topic}` : ''}</div>
                <p>{text}</p>
              </div>
              <div className="guide-show">
                {(!row || row.kind !== 'demo') && <div className="guide-kind">{KIND_LABEL[row?.kind || 'other']}</div>}
                {row?.clips.map((c, ci) => (
                  <div className="guide-clip" key={ci}>
                    <a href={`#clip-${n}-${ci}`} className="guide-time">
                      {several ? `Part ${c.part + 1} · ` : ''}{c.exact ? '' : 'about '}{clock(c.start)} <span className="muted">to {clock(c.end)}</span>
                    </a>
                    {ci > 0 && <span className="muted small"> · another option</span>}
                    {several && ci === 0 && <div className="muted small">{partName(parts[c.part], c.part, parts.length)}</div>}
                    <div className="guide-what">{c.show}</div>
                    {c.quote && <div className="muted small">They say: “{c.quote}”</div>}
                  </div>
                ))}
                {row?.note && <div className="guide-note">{row.note}</div>}
              </div>
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}


