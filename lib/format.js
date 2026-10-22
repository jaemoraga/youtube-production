// Pure formatting helpers used in the browser (downloads) and in tests.
// Formatting only: words are never added, removed or changed; all times come from the API.

export function clock(ms) {
  const s = Math.round((ms || 0) / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}`;
}

export function srtTime(ms) {
  ms = Math.max(0, Math.round(ms));
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor((ms % 3600000) / 60000))}:${p(Math.floor((ms % 60000) / 1000))},${p(ms % 1000, 3)}`;
}

export function speakerLabel(code, names = {}) {
  const custom = (names[code] || '').trim();
  return custom || `Speaker ${code}`;
}

// Split a long speaker turn into paragraphs at sentence ends (~5 sentences / ~700 characters).
export function paragraphs(text, target = 700, maxSentences = 5) {
  const sentences = (text || '').replace(/\s+/g, ' ').trim()
    .split(/(?<=[.!?…]["”’)]?)\s+(?=["“‘(]?[A-Z0-9])/).filter(Boolean);
  const out = [];
  let cur = [], len = 0;
  for (const s of sentences) {
    cur.push(s); len += s.length + 1;
    if (len >= target || cur.length >= maxSentences) { out.push(cur.join(' ')); cur = []; len = 0; }
  }
  if (cur.length) out.push(cur.join(' '));
  return out;
}

// Index of the first word starting at or after `ms` (words are sorted by start time).
function firstWordAt(words, ms) {
  let lo = 0, hi = words.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (words[mid][0] < ms) lo = mid + 1; else hi = mid; }
  return lo;
}

// [{ speaker, start, paragraphs: [{ start, text }] }] — the shape used by the viewer, TXT and DOCX.
// Each paragraph's start is the real start time of its first word, found by counting words from
// the start of the speaker turn. If the words don't line up (should not happen), the paragraph
// gets no timestamp rather than a guessed one.
export function blocks(t, names = {}) {
  const words = t.words || [];
  return (t.turns || []).filter((u) => u.text && u.text.trim()).map((u) => {
    const first = firstWordAt(words, u.start);
    let offset = 0;
    const paras = paragraphs(u.text).map((text, i) => {
      const n = text.split(' ').length;
      const w = words[first + offset];
      const ok = w && w[2] === text.split(' ')[0] && w[0] >= u.start && w[0] <= u.end;
      offset += n;
      return { start: i === 0 ? u.start : ok ? w[0] : null, text };
    });
    return { speaker: speakerLabel(u.s, names), code: u.s, start: u.start, paragraphs: paras };
  });
}

export function toTxt(t, meta, names = {}) {
  const head = [`${meta.title || meta.filename}`, `${meta.companyName} · ${clock((t.duration || 0) * 1000)}`, '', ''];
  const body = blocks(t, names).map((b) => b.paragraphs.map((p, i) =>
    `[${p.start == null ? '--:--:--' : clock(p.start)}] ${i === 0 ? `${b.speaker}: ` : ''}${p.text}`).join('\n\n'));
  return head.join('\n') + body.join('\n\n') + '\n';
}

// For the Copy button: clean text for quoting, no timestamps.
export function toPlain(t, names = {}) {
  return blocks(t, names).map((b) => `${b.speaker}: ${b.paragraphs.map((p) => p.text).join('\n\n')}`).join('\n\n');
}

// Subtitle cues built from word timings: a new cue at each speaker change, after ~6 s,
// after ~84 characters, or at a pause longer than 1 s. Every cue time is a real word time.
export function toSrt(t, names = {}, { maxMs = 6000, maxChars = 84, gapMs = 1000 } = {}) {
  const words = t.words || [];
  const cues = [];
  let cur = null;
  for (const [start, end, text, sp] of words) {
    const prev = cur && cur.words[cur.words.length - 1];
    const startNew = !cur || sp !== cur.sp || start - cur.start > maxMs ||
      cur.chars + text.length + 1 > maxChars || (prev && start - prev[1] > gapMs);
    if (startNew) {
      if (cur) cues.push(cur);
      const turnChange = !cur || sp !== cur.sp;
      cur = { sp, start, end, words: [], chars: 0, label: turnChange };
    }
    cur.words.push([start, end, text]);
    cur.end = end;
    cur.chars += text.length + 1;
  }
  if (cur) cues.push(cur);
  return cues.map((c, i) => {
    const text = c.words.map((w) => w[2]).join(' ');
    const prefix = c.label ? `${speakerLabel(t.speakers[c.sp], names)}: ` : '';
    return `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${wrap(prefix + text, 42)}\n`;
  }).join('\n');
}

function wrap(text, width) {
  const lines = [];
  let line = '';
  for (const w of text.split(' ')) {
    if (line && (line + ' ' + w).length > width) { lines.push(line); line = w; } else line = line ? `${line} ${w}` : w;
  }
  if (line) lines.push(line);
  return lines.join('\n');
}

export function fileStem(filename) {
  return (filename || 'transcript').replace(/\.[a-z0-9]{2,4}$/i, '').replace(/[^\w\- ]+/g, '').trim() || 'transcript';
}
