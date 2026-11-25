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

// One clip the model proposed, checked against the real transcript. Nothing the model says about time is
// trusted as it stands: the clip is placed on the real word time when its quote is found, marked
// approximate when only its clock time fits the file, and dropped (null) when neither does.
function checkClip(c, parts, text) {
  const pi = Number(c?.part) - 1;
  const part = parts[pi];
  if (!part) return null;
  const max = Math.round((part.duration || 0) * 1000) || (part.words?.length ? part.words[part.words.length - 1][1] : 0);
  const hint = parseClock(c.start);
  const exact = locateQuote(part.words, c.quote, hint);
  const start = exact ?? (hint != null && hint <= max ? hint : null);
  if (start == null) return null;
  let end = parseClock(c.end);
  // No usable end, or a quote found far from the stated time (the model pointed at the wrong place): 30 seconds.
  if (end == null || end <= start || end > max + 2000 || (exact != null && hint != null && Math.abs(exact - hint) > 90000)) end = start + 30000;
  return { part: pi, start, end: max ? Math.min(end, max) : end, exact: exact != null, show: text(c.show, 400), quote: exact != null ? text(c.quote, 200) : '' };
}

export const GUIDE_FORMAT = 2;

// Turns the model's answer into the stored guide.
// paragraphs = script paragraphs (headings included); parts = [{ label, filename, duration (s), words }].
// The guide is a list of FEATURES (things the product does that the script talks about). Each feature has
// where to find it in the demo (clips) and where it goes in the script (paragraph numbers).
export function normalizeGuide(raw, { paragraphs, parts }) {
  const text = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  const features = []; const idOf = new Map();
  for (const f of Array.isArray(raw?.features) ? raw.features.slice(0, 60) : []) {
    const name = text(f?.name, 70);
    const clips = (Array.isArray(f?.clips) ? f.clips.slice(0, 3) : []).map((c) => checkClip(c, parts, text)).filter(Boolean);
    if (!name || !clips.length || idOf.has(String(f.id))) continue;
    const id = `f${features.length + 1}`;
    idOf.set(String(f.id), id);
    features.push({ id, name, about: text(f.about, 300), clips, paragraphs: [] });
  }
  const byId = new Map(features.map((f) => [f.id, f]));
  const byPara = new Map();
  for (const it of Array.isArray(raw?.script) ? raw.script : []) {
    const n = Number(it?.paragraph);
    if (!Number.isInteger(n) || n < 1 || n > paragraphs.length || isHeading(paragraphs[n - 1]) || byPara.has(n)) continue;
    const ids = [...new Set((Array.isArray(it.features) ? it.features : []).map((x) => idOf.get(String(x))).filter(Boolean))].slice(0, 4);
    const kind = ids.length ? 'demo' : it.kind === 'host' ? 'host' : 'other';
    ids.forEach((id) => byId.get(id).paragraphs.push(n));
    byPara.set(n, { paragraph: n, kind, features: ids, note: text(it.note, 400) });
  }
  // Every spoken paragraph gets a row, so a gap in the model's answer is visible instead of silent.
  const script = paragraphs.map((p, i) => (isHeading(p) ? null : byPara.get(i + 1) || { paragraph: i + 1, kind: 'other', features: [], note: 'No matching moment was found in the demo recording.', missing: true })).filter(Boolean);
  // Features the script never uses are left out: the editor only needs what goes in the video.
  const used = features.filter((f) => f.paragraphs.length).sort((a, b) => a.paragraphs[0] - b.paragraphs[0]);
  used.forEach((f) => f.paragraphs.sort((a, b) => a - b));
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
  return { format: GUIDE_FORMAT, summary: text(raw?.summary, 700), glossary, chapters, features: used, script };
}

// The section heading each script paragraph sits under: Map(paragraph number -> heading text).
export function sectionOf(paragraphs) {
  const out = new Map(); let cur = '';
  paragraphs.forEach((p, i) => { if (isHeading(p)) cur = headingText(p); else out.set(i + 1, cur); });
  return out;
}

// What the transcript viewer needs for one part: which features point at which paragraph.
// Returns Map(paragraphKey "block-para" -> [{ id, feature, name, start }]) plus the chapter starts.
export function marksForPart(guide, partIndex, t, names = {}) {
  const paras = [];
  blocks(t, names).forEach((b, bi) => b.paragraphs.forEach((p, pi) => { if (p.start != null) paras.push({ key: `${bi}-${pi}`, start: p.start }); }));
  const keyAt = (ms) => { let k = paras[0]?.key || null; for (const p of paras) { if (p.start <= ms + 500) k = p.key; else break; } return k; };
  const clips = new Map(); const chapters = new Map();
  const add = (map, key, v) => { if (key) map.set(key, [...(map.get(key) || []), v]); };
  for (const f of guide?.features || []) f.clips.forEach((c, ci) => { if (c.part === partIndex) add(clips, keyAt(c.start), { id: `clip-${f.id}-${ci}`, feature: f.id, name: f.name, start: c.start }); });
  for (const c of guide?.chapters || []) if (c.part === partIndex) add(chapters, keyAt(c.start), c);
  return { clips, chapters };
}

export const range = (c) => `${clock(c.start)} to ${clock(c.end)}`;
const where = (c, parts) => `${parts.length > 1 ? `Part ${c.part + 1} ` : ''}at ${c.exact ? '' : 'about '}${clock(c.start)}`;
export const clipWhere = where;
const opening = (p, n = 90) => (p.length > n ? `${p.slice(0, n).replace(/\s+\S*$/, '')}…` : p);
export const lineOpening = opening;

// A plain-text cue sheet the editor can keep open beside their editing software.
export function guideToTxt(guide, { paragraphs, parts, company }) {
  const sec = sectionOf(paragraphs);
  const out = [`${company}: editing guide`, `Script version ${guide.scriptVersion}. Times are from the start of each demo recording file.`, ''];
  if (guide.summary) out.push('WHAT THIS PRODUCT IS', guide.summary, '');
  out.push('FEATURES: WHERE TO FIND EACH ONE IN THE DEMO, AND WHERE IT GOES IN THE SCRIPT', '');
  for (const f of guide.features || []) {
    out.push(f.name.toUpperCase());
    if (f.about) out.push(`  What it is: ${f.about}`);
    f.clips.forEach((c, i) => out.push(`  ${i ? 'Also in' : 'Find it in'} the demo: ${partName(parts[c.part], c.part, parts.length)}, ${where(c, [0])} (to ${clock(c.end)}). ${c.show}${c.quote ? ` They say: "${c.quote}"` : ''}`));
    f.paragraphs.forEach((n) => out.push(`  Put it in the script: ${sec.get(n) ? `${sec.get(n)}, ` : ''}line ${n}, "${opening(paragraphs[n - 1])}"`));
    out.push('');
  }
  const none = (guide.script || []).filter((r) => r.kind === 'other');
  if (none.length) out.push('SCRIPT LINES WITH NO DEMO FOOTAGE', ...none.map((r) => `- Line ${r.paragraph}, "${opening(paragraphs[r.paragraph - 1], 60)}" ${r.note}`), '');
  if (guide.glossary?.length) out.push('WORDS YOU WILL HEAR', ...guide.glossary.map((g) => `- ${g.term}: ${g.meaning}`), '');
  return out.join('\n');
}
