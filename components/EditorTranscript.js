'use client';
// Read-only transcript for editors: timestamps on every paragraph, plus TXT / DOCX / SRT downloads.
import { blocks, clock, fileStem, toSrt, toTxt } from '@/lib/format.js';
import { marksForPart } from '@/lib/guide-shared.js';
import { download } from './ui.js';

export default function EditorTranscript({ t, job, guide = null, partIndex = 0, heading = 'Demo recording transcript' }) {
  const names = job.speakerNames || {};
  // Where the script points into this recording, and where each segment of the demo begins.
  const marks = guide ? marksForPart(guide, partIndex, t, names) : { clips: new Map(), chapters: new Map() };
  const name = job.title || job.filename;
  const stem = fileStem(name);

  async function docx() {
    const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import('docx');
    const grey = '6B6F76';
    const children = [new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(name)] })];
    for (const b of blocks(t, names)) {
      children.push(new Paragraph({ spacing: { before: 240 }, children: [new TextRun({ text: b.speaker, bold: true }), new TextRun({ text: `   ${clock(b.start)}`, color: grey, size: 18 })] }));
      b.paragraphs.forEach((p, i) => children.push(new Paragraph({ spacing: { after: 120 }, children: [
        ...(i > 0 ? [new TextRun({ text: `[${p.start == null ? '--:--:--' : clock(p.start)}]  `, color: grey, size: 18 })] : []),
        new TextRun(p.text)] })));
    }
    download(`${stem}.docx`, await Packer.toBlob(new Document({ styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } }, sections: [{ children }] })));
  }

  return (
    <div className="card">
      <div className="toolbar">
        <span style={{ fontWeight: 500, alignSelf: 'center' }}>{heading}</span>
        <span className="spacer" />
        <button className="btn" onClick={() => download(`${stem}.txt`, new Blob([toTxt(t, job, names)], { type: 'text/plain' }))}>TXT</button>
        <button className="btn" onClick={() => docx()}>DOCX</button>
        <button className="btn" onClick={() => download(`${stem}.srt`, new Blob([toSrt(t, names)], { type: 'application/x-subrip' }))}>SRT</button>
      </div>
      <div className="viewer">
        {blocks(t, names).map((b, i) => (
          <div className="turn" key={i}>
            <div className="who">{b.speaker}<time>{clock(b.start)}</time></div>
            {b.paragraphs.map((p, k) => {
              const key = `${i}-${k}`;
              const used = marks.clips.get(key) || [];
              return (
                <div key={k} className={used.length ? 'used' : undefined}>
                  {(marks.chapters.get(key) || []).map((c, ci) => (
                    <div className="chapter" key={ci}><time>{clock(c.start)}</time><b>{c.title}</b>{c.about ? <span className="muted"> · {c.about}</span> : null}</div>
                  ))}
                  <p>{k > 0 && p.start != null && <time className="pts">{clock(p.start)}</time>}{p.text}</p>
                  {used.length > 0 && (
                    <div className="used-by">
                      {used.map((u) => <a key={u.id} id={u.id} href={`#${u.feature}`}>{u.name} starts here · {clock(u.start)}</a>)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="foot">This is what the client says in their own screen recording. It is not the script, and none of it is spoken in the finished video: use it to find footage. Timestamps are from the start of this video file.</div>
    </div>
  );
}
