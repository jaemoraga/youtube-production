// Builds and stores the editing guide for a project (guides/<projectId>.json). One AI call reads the
// script and the timestamped demo transcripts and says, for each script paragraph, where the same thing
// is shown in the demo. The app then checks every time against the real transcript (lib/guide-shared.js).
import { toTxt } from './format.js';
import { GUIDE_FORMAT, normalizeGuide, partName, scriptParagraphs } from './guide-shared.js';
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
  if (guide.format !== GUIDE_FORMAT) return 'The guide layout has changed since this one was built. Rebuild it to get the feature-by-feature version.';
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

The editor knows nothing about hotels or about this software and will not learn it. They cannot tell which screen is the "reporting dashboard" or what a "PMS" is. The guidance they need has one shape: "Go to 23:21 in part 2 to find the reporting dashboard, and put it over the part of the script that talks about reporting." Your job is to produce that, feature by feature.

Return ONE JSON object and nothing else (no code fence, no commentary), in this shape:

{
  "summary": "Two or three plain sentences: what this product does and who uses it, for someone who has never worked in a hotel.",
  "glossary": [ { "term": "a word or product name the editor will hear or read", "meaning": "one plain sentence" } ],
  "chapters": [ { "part": 1, "start": "00:00:00", "title": "a few words", "about": "one plain sentence on what is on screen and being explained from here" } ],
  "features": [
    {
      "id": "F1",
      "name": "two to five words an outsider would understand, e.g. Reporting dashboard",
      "about": "one plain sentence: what this thing is and what it looks like on screen",
      "clips": [ { "part": 1, "start": "00:14:09", "end": "00:14:50", "quote": "six to twelve words copied exactly from the demo transcript where the presenter names or opens this feature", "show": "what is on screen there and what to look for, in plain words" } ]
    }
  ],
  "script": [
    { "paragraph": 7, "kind": "demo" | "host" | "other", "features": ["F1"], "note": "optional" }
  ]
}

Rules for "features":
- A feature is one distinct thing the product does or one distinct screen that the SCRIPT talks about and the DEMO shows: the shared inbox, the reporting dashboard, the phone assistant. List each once, in the order the script first uses it. Typically 10 to 25.
- Only list a feature if it is really in the demo transcript. If the script mentions something the demo never shows, do not invent a clip: leave it out and mark those script paragraphs "other".
- "clips": the best moment first, then up to two more if the demo shows it elsewhere.
- "quote" is how the app finds the exact second, so it decides the time the editor is given. Copy it word for word from the demo transcript, mistakes included, starting at the sentence where the presenter first names or opens the feature ("last but not least we have our report section"). Do NOT quote the first words of the transcript paragraph unless the feature really starts there.
- "start" is your best clock time for that sentence (estimate inside the paragraph from how far in the words are). "end" is where the presenter moves on, normally 15 to 60 seconds later.
- "show" describes the screen, not the idea: which page or panel is open, what is clicked, what number or list to look for. If the presenter only talks about the feature while a different screen is up, say so.
- Names must not assume product knowledge. Prefer "Report of common guest questions" to the product's own label, and give the product's label in "about".

Rules for "script":
- One entry for every script paragraph [S#] except section headings (the lines in square brackets). Use the paragraph's number.
- kind "demo": the paragraph is about one or more of the features. Put their ids in "features" (one is normal, up to three).
- kind "host": the presenter should simply be on camera (greetings, opinions, verdicts, questions to the viewer). No features.
- kind "other": the paragraph needs pictures but the demo does not contain them (a named customer, pricing, another website). No features. In "note", say in a few words what would work instead, such as the client's brand materials, the customer's website, or simple on-screen text.
- A wrong match costs the editor more time than a missing one. If you are not sure, use "other" and say why in the note.

Rules for "chapters": divide each part of the demo into its natural segments (usually 6 to 14 per part) so the editor can see what happens when. "start" is the timestamp of the transcript paragraph where the segment begins.

Rules for "glossary": 8 to 20 entries. Include every hotel or software term used in the script. The transcript was made by speech recognition and may misspell the product or people's names; use the spelling from the script and mention the misspelling the editor will see in the transcript.

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
  if (!body.features.length) throw err('The AI could not match any part of the script to the demo recording. Check that the right videos are on this project, then try again.', 502);
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
  const clips = (guide.features || []).flatMap((f) => f.clips);
  return {
    builtAt: guide.builtAt, scriptVersion: guide.scriptVersion, features: (guide.features || []).length,
    demo: rows.filter((r) => r.kind === 'demo').length, host: rows.filter((r) => r.kind === 'host').length,
    other: rows.filter((r) => r.kind === 'other').length, clips: clips.length, approximate: clips.filter((c) => !c.exact).length,
  };
}
