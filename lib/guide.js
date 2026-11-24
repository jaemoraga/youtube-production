// Builds and stores the editing guide for a project (guides/<projectId>.json). One AI call reads the
// script and the timestamped demo transcripts and says, for each script paragraph, where the same thing
// is shown in the demo. The app then checks every time against the real transcript (lib/guide-shared.js).
import { toTxt } from './format.js';
import { normalizeGuide, partName, scriptParagraphs } from './guide-shared.js';
import { videoParts } from './project-shared.js';
import { AI_READY, SCRIPT_MODEL, callModel, getScript } from './script.js';
import { getJob, readJSON, transcriptPath, writeJSON } from './store.js';

const err = (message, status = 400) => Object.assign(new Error(message), { status });
const path = (id) => `guides/${id}.json`;
export const getGuide = (projectId) => readJSON(path(projectId)).catch(() => null);

// The script the editor cuts to: the version the client approved if there is one, otherwise the latest.
export function editorScript(s) {
  if (!s?.versions?.length) return null;
  const approved = s.client?.approvedAt ? s.versions[(s.client.approvedVersion || s.shared?.version || s.versions.length) - 1] : null;
  const v = approved || s.versions[s.versions.length - 1];
  return { n: v.n, text: v.text, editorNotes: v.editorNotes || '', approved: !!approved };
}

// Every part of the demo with its finished transcript, in project order. null until all are ready.
export async function demoParts(project) {
  const parts = videoParts(project);
  if (!parts.length) return null;
  const out = [];
  for (const part of parts) {
    const job = await getJob(part.jobId).catch(() => null);
    const t = job?.status === 'done' ? await readJSON(transcriptPath(job.id)).catch(() => null) : null;
    if (!t) return null;
    out.push({ ...part, job, t });
  }
  return out;
}

const partsKey = (parts) => parts.map((p) => p.jobId).join(',');

// Why the stored guide no longer matches the project, or null when it is current.
export function staleReason(guide, script, project) {
  if (!guide) return null;
  const v = editorScript(script);
  if (v && guide.scriptVersion !== v.n) return `The script is now version ${v.n}; this guide was built from version ${guide.scriptVersion}.`;
  if (guide.partsKey !== partsKey(videoParts(project))) return 'The demo videos changed after this guide was built.';
  return null;
}

export async function readiness(project) {
  if (!AI_READY()) return 'The AI writer is not connected yet.';
  if (!editorScript(await getScript(project.id))) return 'There is no script yet. Generate or import one first.';
  if (!videoParts(project).length) return 'The demo video has not been uploaded to the app.';
  if (!(await demoParts(project))) return 'A demo video is still being transcribed.';
  return null;
}

function prompt({ company, product, paragraphs, parts }) {
  const script = paragraphs.map((p, i) => `[S${i + 1}] ${p}`).join('\n\n');
  const demo = parts.map((p, i) => `### PART ${i + 1} of ${parts.length}: ${partName(p, i, 1)} (file ${p.filename}, ${Math.round((p.t.duration || 0) / 60)} minutes)\n${toTxt(p.t, { title: p.filename, companyName: company }, p.job.speakerNames || {})}`).join('\n\n');
  return `You are preparing an editing guide for a freelance video editor at Hotel Tech Report.

The editor is cutting a YouTube review of ${product} (made by ${company}), a software product for hotels. A presenter reads the SCRIPT below on camera. While she talks, the editor covers her with screen footage taken from the DEMO RECORDING: a screen-share of the product that ${company} recorded, in ${parts.length === 1 ? 'one file' : `${parts.length} files`}. You are given the transcript of what the person in the demo says, with a timestamp at the start of each paragraph. Timestamps count from the start of that file.

The editor knows nothing about hotels or about this software and will not learn it. They cannot tell which screen is the "unified inbox" or what a "PMS" is. Your job is to tell them, for every paragraph of the script, exactly where in the demo recording the same thing is on screen, in words anyone could follow.

Return ONE JSON object and nothing else (no code fence, no commentary), in this shape:

{
  "summary": "Two or three plain sentences: what this product does and who uses it, for someone who has never worked in a hotel.",
  "glossary": [ { "term": "a word or product name the editor will hear or read", "meaning": "one plain sentence" } ],
  "chapters": [ { "part": 1, "start": "00:00:00", "title": "a few words", "about": "one plain sentence on what is on screen and being explained from here" } ],
  "script": [
    {
      "paragraph": 7,
      "kind": "demo" | "host" | "other",
      "topic": "three to six words naming what this paragraph is about",
      "clips": [ { "part": 1, "start": "00:06:12", "end": "00:06:55", "quote": "six to twelve words copied exactly from the demo transcript at the moment this starts", "show": "what is on screen there and what to look for, in plain words" } ],
      "note": "optional: anything the editor should know, for example that the demo never shows this"
    }
  ]
}

Rules for "script":
- One entry for every script paragraph [S#] except section headings (the lines in square brackets). Use the paragraph's number.
- kind "demo": the paragraph describes something the demo shows or talks about. Give one clip, or up to three if the demo covers it in more than one place, best first.
- kind "host": the presenter should simply be on camera (greetings, opinions, verdicts, questions to the viewer). No clips.
- kind "other": the paragraph needs pictures but the demo recording does not contain them (a customer story, pricing, a hotel that is named). No clips. In "note", say what would work instead, such as the client's brand materials, the customer's website, or simple on-screen text.
- Only point at a moment that is really in the transcript. If you are not sure the demo shows it, use "other" and say so in the note. A wrong timestamp costs the editor more time than a missing one.
- "start" and "end" are clock times inside that part, taken from the transcript's own timestamps (you may estimate within a paragraph from how far into it the words are). Keep clips short enough to be usable, normally 15 to 60 seconds.
- "quote" must be copied word for word from the demo transcript, including its mistakes. It is used to find the exact second, so do not tidy or paraphrase it.
- "show" describes the screen, not the idea: which page or panel is open, what is being clicked, what number or list to look for. Never assume the editor knows a product term; say what it looks like.
- Several script paragraphs can point at the same moment.

Rules for "chapters": divide each part of the demo into its natural segments (usually 6 to 14 per part) so the editor can see what happens when. "start" is the timestamp of the transcript paragraph where the segment begins.

Rules for "glossary": 8 to 20 entries. Include every product feature name and every hotel or software term used in the script. The transcript was made by speech recognition and may misspell the product or people's names; in the glossary use the spelling from the script and mention the misspelling the editor will see in the transcript.

# SCRIPT

${script}

# DEMO RECORDING TRANSCRIPT

${demo}`;
}

function parseJson(text) {
  const a = text.indexOf('{'); const b = text.lastIndexOf('}');
  if (a < 0 || b <= a) throw err('The AI did not return a guide in the expected form. Try again.', 502);
  try { return JSON.parse(text.slice(a, b + 1)); } catch { throw err('The AI returned a guide that could not be read. Try again.', 502); }
}

export async function buildGuide(project, who = null) {
  const blocker = await readiness(project);
  if (blocker) throw err(blocker);
  const s = await getScript(project.id);
  const v = editorScript(s);
  const parts = await demoParts(project);
  const paragraphs = scriptParagraphs(v.text);
  const product = s.product || project.internal?.htr?.name || project.companyName;
  const r = await callModel([{ role: 'user', content: prompt({ company: project.companyName, product, paragraphs, parts }) }], 16000, 'low');
  const body = normalizeGuide(parseJson(r.text), { paragraphs, parts: parts.map((p) => ({ label: p.label, filename: p.filename, duration: p.t.duration, words: p.t.words })) });
  const demo = body.script.filter((x) => x.kind === 'demo');
  if (!demo.length) throw err('The AI could not match any part of the script to the demo recording. Check that the right videos are on this project, then try again.', 502);
  const guide = {
    projectId: project.id, builtAt: new Date().toISOString(), builtBy: who?.email || null, model: SCRIPT_MODEL(), ms: r.ms,
    scriptVersion: v.n, scriptApproved: v.approved, partsKey: partsKey(parts), ...body,
  };
  await writeJSON(path(project.id), guide);
  return guide;
}

// Counts for the admin page.
export function guideStats(guide) {
  if (!guide) return null;
  const rows = guide.script || [];
  const clips = rows.flatMap((r) => r.clips);
  return {
    builtAt: guide.builtAt, scriptVersion: guide.scriptVersion,
    demo: rows.filter((r) => r.kind === 'demo').length, host: rows.filter((r) => r.kind === 'host').length,
    other: rows.filter((r) => r.kind === 'other').length, clips: clips.length, approximate: clips.filter((c) => !c.exact).length,
  };
}
