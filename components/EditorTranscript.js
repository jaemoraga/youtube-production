'use client';
// Read-only transcript for editors: timestamps on every paragraph, plus TXT / DOCX / SRT downloads.
import { blocks, clock, fileStem, toSrt, toTxt } from '@/lib/format.js';
import { download } from './ui.js';

export default function EditorTranscript({ t, job }) {
  const names = job.speakerNames || {};
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
        <span style={{ fontWeight: 500, alignSelf: 'center' }}>Transcript</span>
        <span className="spacer" />
        <button className="btn" onClick={() => download(`${stem}.txt`, new Blob([toTxt(t, job, names)], { type: 'text/plain' }))}>TXT</button>
        <button className="btn" onClick={() => docx()}>DOCX</button>
        <button className="btn" onClick={() => download(`${stem}.srt`, new Blob([toSrt(t, names)], { type: 'application/x-subrip' }))}>SRT</button>
      </div>
      <div className="viewer">
        {blocks(t, names).map((b, i) => (
          <div className="turn" key={i}>
            <div className="who">{b.speaker}<time>{clock(b.start)}</time></div>
            {b.paragraphs.map((p, k) => (
              <p key={k}>{k > 0 && p.start != null && <time className="pts">{clock(p.start)}</time>}{p.text}</p>
            ))}
          </div>
        ))}
      </div>
      <div className="foot">Timestamps are from the start of the video file.</div>
    </div>
  );
}
