// The editing guide: for each passage of the script, where the same thing is shown in the client's demo
// recording. Pure helpers shared by the server and the browser; no server-only imports here.
import { blocks, clock } from './format.js';

export const KIND_LABEL = {
  demo: 'Show the demo recording',
  host: 'Host on camera',
  other: 'No demo footage for this',
};

const HEADING = /^\[[A-Z][A-Z &/\-]{2,40}\]$/;
export const isHeading = (p) => HEADING.test(p);
export const headingText = (p) => p.replace(/[[\]]/g, '');
export const scriptParagraphs = (text) => String(text || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
// Demo timestamps the script writer left in the text are kept for the editor but are not spoken.
export const partName = (part, i, count) => `${count > 1 ? `Part ${i + 1}: ` : ''}${part.label || part.filename || 'Demo recording'}`;

// "00:06:12", "6:12" or "372" (seconds) -> milliseconds, or null.
export function parseClock(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v * 1000);
  const m = /^(?:(\d{1,2}):)?(\d{1,3}):(\d{2})(?:\.\d+)?$/.exec(String(v || '').trim());
  if (!m) return null;
  return ((Number(m[1] || 0) * 60 + Number(m[2])) * 60 + Number(m[3])) * 1000;
}

const norm = (w) => String(w || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '');

// Finds a short quote in a transcript's word list and returns the real start time of its first word.
// Tries the whole quote, then its first six and first four words. With several matches, the one closest
// to hintMs wins. Returns null when the words are not in the transcript: the caller then says "about".
export function locateQuote(words, quote, hintMs = null) {
  const q = String(quote || '').split(/\s+/).map(norm).filter(Boolean);
  if (q.length < 3 || !words?.length) return null;
  const hay = words.map((w) => norm(w[2]));
  for (const n of [...new Set([q.length, 6, 4])].filter((x) => x <= q.length && x >= 3)) {
    const needle = q.slice(0, n);
    const hits = [];
    // Transcript tokens that are pure punctuation normalise to '' and are skipped.
    for (let i = 0; i < hay.length; i++) {
      if (hay[i] !== needle[0]) continue;
      let k = 0; let j = i;
      while (k < needle.length && j < hay.length) {
        if (hay[j] === '') { j++; continue; }
        if (hay[j] !== needle[k]) break;
        k++; j++;
      }
      if (k === needle.length) hits.push(words[i][0]);
    }
    if (hits.length) return hintMs == null ? hits[0] : hits.reduce((a, b) => (Math.abs(b - hintMs) < Math.abs(a - hintMs) ? b : a));
  }
  return null;
}

// Turns the model's answer into the stored guide. Nothing the model says about time is trusted as it
// stands: every clip is checked against the real transcript, placed on a real word time when its quote
// is found, marked approximate when only its clock time fits, and dropped when neither does.
// paragraphs = script paragraphs (headings included); parts = [{ label, filename, duration (s), words }].
export function normalizeGuide(raw, { paragraphs, parts }) {
  const text = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  const byPara = new Map();
  for (const it of Array.isArray(raw?.script) ? raw.script : []) {
    const n = Number(it?.paragraph);
    if (!Number.isInteger(n) || n < 1 || n > paragraphs.length || isHeading(paragraphs[n - 1]) || byPara.has(n)) continue;
    const clips = [];
    for (const c of Array.isArray(it.clips) ? it.clips.slice(0, 3) : []) {
      const pi = Number(c?.part) - 1;
      const part = parts[pi];
      if (!part) continue;
      const max = Math.round((part.duration || 0) * 1000) || (part.words?.length ? part.words[part.words.length - 1][1] : 0);
      const hint = parseClock(c.start);
      const exact = locateQuote(part.words, c.quote, hint);
      const start = exact ?? (hint != null && hint <= max ? hint : null);
      if (start == null) continue;
      let end = parseClock(c.end);
      if (end == null || end <= start || end > max + 2000) end = Math.min(max || start + 20000, start + 30000);
      // A quote found far from the stated time means the model pointed at the wrong place: keep the real one.
      if (exact != null && hint != null && Math.abs(exact - hint) > 90000) end = Math.min(max || exact + 30000, exact + 30000);
      clips.push({ part: pi, start, end: Math.min(end, max || end), exact: exact != null, show: text(c.show, 400), quote: exact != null ? text(c.quote, 200) : '' });
    }
    let kind = ['demo', 'host', 'other'].includes(it.kind) ? it.kind : clips.length ? 'demo' : 'other';
    if (kind === 'demo' && !clips.length) kind = 'other';
    byPara.set(n, { paragraph: n, kind, topic: text(it.topic, 80), clips: kind === 'demo' ? clips : [], note: text(it.note, 400) });
  }
  // Every spoken paragraph gets a row, so a gap in the model's answer is visible instead of silent.
  const script = paragraphs.map((p, i) => (isHeading(p) ? null : byPara.get(i + 1) || { paragraph: i + 1, kind: 'other', topic: '', clips: [], note: 'No matching moment was found in the demo recording.', missing: true })).filter(Boolean);
  const glossary = (Array.isArray(raw?.glossary) ? raw.glossary : []).map((g) => ({ term: text(g?.term, 60), meaning: text(g?.meaning, 300) })).filter((g) => g.term && g.meaning).slice(0, 30);
  const chapters = [];
  (Array.isArray(raw?.chapters) ? raw.chapters : []).forEach((c) => {
    const pi = Number(c?.part) - 1;
    const part = parts[pi];
    const start = part ? parseClock(c.start) : null;
    const max = part ? Math.round((part.duration || 0) * 1000) : 0;
    if (start == null || (max && start > max) || !text(c.title, 80)) return;
    chapters.push({ part: pi, start, title: text(c.title, 80), about: text(c.about, 300) });
  });
  chapters.sort((a, b) => a.part - b.part || a.start - b.start);
  return { summary: text(raw?.summary, 700), glossary, chapters, script };
}

// What the transcript viewer needs for one part: which script passages point at which paragraph.
// Returns Map(paragraphKey "block-para" -> [{ id, label, start }]) plus the chapter starts.
export function marksForPart(guide, partIndex, t, names = {}) {
  const paras = [];
  blocks(t, names).forEach((b, bi) => b.paragraphs.forEach((p, pi) => { if (p.start != null) paras.push({ key: `${bi}-${pi}`, start: p.start }); }));
  const keyAt = (ms) => { let k = paras[0]?.key || null; for (const p of paras) { if (p.start <= ms + 500) k = p.key; else break; } return k; };
  const clips = new Map(); const chapters = new Map();
  const add = (map, key, v) => { if (key) map.set(key, [...(map.get(key) || []), v]); };
  for (const row of guide?.script || []) row.clips.forEach((c, ci) => { if (c.part === partIndex) add(clips, keyAt(c.start), { id: `clip-${row.paragraph}-${ci}`, paragraph: row.paragraph, topic: row.topic, start: c.start }); });
  for (const c of guide?.chapters || []) if (c.part === partIndex) add(chapters, keyAt(c.start), c);
  return { clips, chapters };
}

export const range = (c) => `${clock(c.start)} to ${clock(c.end)}`;

// A plain-text cue sheet the editor can keep open beside their editing software.
export function guideToTxt(guide, { paragraphs, parts, company }) {
  const out = [`${company}: editing guide`, `Script version ${guide.scriptVersion}. Times are from the start of each demo recording file.`, ''];
  if (guide.summary) out.push('WHAT THIS PRODUCT IS', guide.summary, '');
  if (guide.glossary?.length) out.push('WORDS YOU WILL HEAR', ...guide.glossary.map((g) => `- ${g.term}: ${g.meaning}`), '');
  out.push('SCRIPT, LINE BY LINE', '');
  const rows = new Map((guide.script || []).map((r) => [r.paragraph, r]));
  paragraphs.forEach((p, i) => {
    if (isHeading(p)) { out.push('', `== ${headingText(p)} ==`, ''); return; }
    const r = rows.get(i + 1);
    out.push(`SCRIPT: ${p}`);
    if (!r || r.kind !== 'demo') out.push(`  -> ${r?.kind === 'host' ? 'Host on camera.' : 'No demo footage.'}${r?.note ? ` ${r.note}` : ''}`);
    else {
      r.clips.forEach((c) => out.push(`  -> ${partName(parts[c.part], c.part, parts.length)}, ${c.exact ? '' : 'about '}${range(c)}. ${c.show}${c.quote ? ` They say: "${c.quote}"` : ''}`));
      if (r.note) out.push(`     Note: ${r.note}`);
    }
    out.push('');
  });
  return out.join('\n');
}
