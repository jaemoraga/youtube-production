// Script generation, review and client revisions for one project.
//
// Generation follows the "Youtube Product Review Prompts" document exactly as it is run by hand:
// one conversation, opened with the pre-prompt and the research materials, then steps 1 to 9 sent
// one at a time, each answer kept in the conversation before the next prompt goes in. Step 8
// assembles the sections and step 9 is the entertainment edit. Prompts live in lib/script-prompts.js.
//
// Everything is stored in scripts/<projectId>.json in the private store.
import { randomBytes } from 'node:crypto';
import { toTxt } from './format.js';
import { INTERNAL_FIELDS } from './project-shared.js';
import PROMPTS from './script-prompts.js';
import { getJob, readJSON, remove, transcriptPath, writeJSON } from './store.js';

const API_KEY = () => process.env.ANTHROPIC_API_KEY || '';
export const SCRIPT_MODEL = () => process.env.SCRIPT_MODEL || 'claude-opus-5-5';
export const AI_READY = () => !!API_KEY();

const err = (message, status = 400) => Object.assign(new Error(message), { status });
const path = (id) => `scripts/${id}.json`;
const now = () => new Date().toISOString();
const START = '===SCRIPT START===';
const END = '===SCRIPT END===';
const RUN_LOCK_MS = 6 * 60e3;

export const STEPS = [
  { key: 'ingest', title: 'Read the materials', max: 1500 },
  ...PROMPTS.steps.map((s) => ({ key: s.key, title: s.title, max: s.n >= 8 ? 12000 : 4500 })),
];
const promptFor = (key) => PROMPTS.steps.find((s) => s.key === key);

export const getScript = (projectId) => readJSON(path(projectId)).catch(() => null);
const save = (s) => writeJSON(path(s.projectId), { ...s, updatedAt: now() });
export const removeScript = (projectId) => remove(path(projectId));

// ---------- the model ----------
async function callModel(messages, maxTokens) {
  if (!API_KEY()) throw err('The AI writer is not connected yet. Add ANTHROPIC_API_KEY in Vercel and redeploy.', 503);
  const started = Date.now();
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': API_KEY(), 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: SCRIPT_MODEL(), max_tokens: maxTokens, messages }),
    signal: AbortSignal.timeout(280000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw err(`The AI writer returned an error (${res.status}): ${data?.error?.message || 'no details'}`, 502);
  const text = (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('').trim();
  if (!text) throw err('The AI writer returned an empty answer.', 502);
  if (data.stop_reason === 'max_tokens') throw err('The AI writer ran out of room before finishing this step. Run it again.', 502);
  return { text, ms: Date.now() - started, usage: data.usage || null };
}

// ---------- research materials ----------
const docId = (url) => /\/document\/d\/([\w-]{20,})/.exec(url || '')?.[1] || null;

async function clientDossier(url) {
  const id = docId(url);
  if (!id) throw err('The client has not submitted a dossier link yet.');
  const res = await fetch(`https://docs.google.com/document/d/${id}/export?format=txt`, { redirect: 'follow', signal: AbortSignal.timeout(30000) });
  const type = res.headers.get('content-type') || '';
  if (!res.ok || !type.includes('text/plain')) {
    throw err('The client\'s dossier could not be read. Its sharing must be set to "Anyone with the link". Open the dossier, fix the sharing, and try again.');
  }
  const text = (await res.text()).replace(/^﻿/, '').trim();
  if (text.length < 200) throw err('The client\'s dossier looks empty.');
  return text.slice(0, 120000);
}

const publicHost = (u) => {
  try {
    const url = new URL(u);
    return url.protocol === 'https:' && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(url.hostname) && !/^(localhost|.*\.local|.*\.internal)$/i.test(url.hostname);
  } catch { return false; }
};

// Step 2 says "visit and analyze the company website". The app reads the page and hands over its text.
async function websiteText(url) {
  if (!publicHost(url)) return null;
  try {
    const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; HotelTechReport-YouTubeStudio/1.0)', accept: 'text/html' }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
    if (!res.ok || !(res.headers.get('content-type') || '').includes('html')) return null;
    const html = (await res.text()).slice(0, 1500000);
    const text = html.replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
    return text.length > 300 ? text.slice(0, 20000) : null;
  } catch { return null; }
}

export const guessWebsite = (dossier) => {
  for (const m of String(dossier || '').matchAll(/https?:\/\/[^\s)>\]"']+/g)) {
    try {
      const u = new URL(m[0]);
      if (!/google\.|hoteltechreport\.|youtube\.|youtu\.be|linkedin\.|loom\.|vimeo\.|drive\./i.test(u.hostname)) return `https://${u.hostname}`;
    } catch { /* keep looking */ }
  }
  return '';
};

async function gather(project, website) {
  const internal = project.internal?.fields || {};
  if (!project.internal?.completedAt) throw err('Mark the internal dossier complete first.');
  const job = project.items?.video?.jobId ? await getJob(project.items.video.jobId) : null;
  const t = job?.status === 'done' ? await readJSON(transcriptPath(job.id)).catch(() => null) : null;
  if (!t) throw err('The demo video transcript is not ready yet.');
  const dossier = await clientDossier(project.items.dossier.url);
  const product = project.internal?.htr?.name || project.companyName;
  const reviewCount = /([\d,]+)\s+verified reviews/.exec(internal.ratings || '')?.[1] || null;
  const site = website || guessWebsite(dossier);
  const internalText = INTERNAL_FIELDS.filter((f) => internal[f.key])
    .map((f) => `### ${f.group ? `${f.group}: ` : ''}${f.label}\n${internal[f.key]}`).join('\n\n');
  const facts = [
    `Product: ${product}`, `Vendor: ${project.companyName}`,
    reviewCount ? `Verified reviews on Hotel Tech Report: ${reviewCount}. Use exactly this number everywhere the script cites a review or survey count (for example "${reviewCount} reviews"). Never round it up or replace it with a generic figure.` : null,
    site ? `Vendor website: ${site}` : null,
  ].filter(Boolean).join('\n');
  const materials = [
    '# RESEARCH MATERIALS (the dossier input)', `## Key facts\n${facts}`,
    `## Vendor dossier (filled in by ${project.companyName}; treat as vendor claims)\n${dossier}`,
    `## HTR internal dossier (Hotel Tech Report's own data from the product profile: ratings, verified reviews, expert views, case studies, integrations)\n${internalText}`,
    `## Demo video transcript (timestamps are from the start of the demo video file)\n${toTxt(t, job, job.speakerNames || {})}`,
  ].join('\n\n');
  return { materials, product, reviewCount, website: site, websiteText: await websiteText(site) };
}

// ---------- the conversation ----------
function stepPrompt(s, key) {
  const p = promptFor(key);
  let text = `${p.heading}\n\n${p.prompt}`;
  if (key === 'step1') text = text.replaceAll('[PRODUCT]', s.product).replaceAll('[REVIEW COUNT]', s.reviewCount || '[REVIEW COUNT]');
  if (key === 'step2') {
    text = text.replace('[INSERT WEBSITE]', s.website || 'not provided');
    text += s.websiteText
      ? `\n\n[App note: you cannot browse from here, so the text of ${s.website} was fetched for you and is below. Use it together with the dossier.]\n\n${s.websiteText}`
      : '\n\n[App note: the website could not be fetched from here. Work from the vendor dossier, the HTR internal dossier and the demo transcript instead, and do not describe modules those sources do not support.]';
  }
  if (key === 'step4') text += '\n\n[App note: no URL is supplied for this step. Use the case studies in the HTR internal dossier and the vendor dossier above. Choose the one with the clearest measurable results.]';
  if (key === 'step8' || key === 'step9') {
    text += `\n\n[App note: put the complete teleprompter-ready script, and nothing else, between a line that reads exactly ${START} and a line that reads exactly ${END}. Put the title card suggestion, grades, critique and notes outside those two lines.]`;
  }
  return text;
}

function conversation(s, upTo) {
  const first = `${PROMPTS.opening}\n\n${PROMPTS.pre}\n\n${s.materials}`;
  const messages = [{ role: 'user', content: [{ type: 'text', text: first, cache_control: { type: 'ephemeral' } }] }];
  for (const st of s.steps) {
    if (st.key === upTo) break;
    if (st.key !== 'ingest') messages.push({ role: 'user', content: stepPrompt(s, st.key) });
    messages.push({ role: 'assistant', content: st.output });
  }
  if (upTo !== 'ingest') messages.push({ role: 'user', content: stepPrompt(s, upTo) });
  return messages;
}

export function extractScript(output) {
  const a = output.indexOf(START);
  const b = output.indexOf(END);
  const body = a >= 0 && b > a ? output.slice(a + START.length, b) : output;
  return body.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
}

// ---------- generation ----------
export async function startScript(project, { website = '', who = null } = {}) {
  const existing = await getScript(project.id);
  if (existing?.versions?.length) throw err('This project already has a script. Use Start over to replace it.');
  const g = await gather(project, String(website || '').trim());
  const s = {
    projectId: project.id, createdAt: now(), startedBy: who?.email || null, model: SCRIPT_MODEL(),
    product: g.product, reviewCount: g.reviewCount, website: g.website, websiteText: g.websiteText, materials: g.materials,
    status: 'running', steps: STEPS.map((x) => ({ key: x.key, title: x.title, status: 'pending' })),
    versions: [], shared: null, comments: [], revisions: [], client: {},
  };
  await save(s);
  return s;
}

export async function runNextStep(project) {
  const s = await getScript(project.id);
  if (!s) throw err('Start the script first.');
  const st = s.steps.find((x) => x.status !== 'done');
  if (!st) return s;
  if (s.running && Date.now() - Date.parse(s.running.at) < RUN_LOCK_MS) throw err('A step is already being written. Give it a minute.', 409);
  s.running = { key: st.key, at: now() };
  await save(s);
  try {
    const r = await callModel(conversation(s, st.key), STEPS.find((x) => x.key === st.key).max);
    Object.assign(st, { status: 'done', output: r.text, error: null, at: now(), ms: r.ms, usage: r.usage });
  } catch (e) {
    Object.assign(st, { status: 'error', error: e.message });
    s.running = null; s.status = 'error';
    await save(s);
    throw e;
  }
  s.running = null;
  if (s.steps.every((x) => x.status === 'done')) {
    s.status = 'done';
    const last = s.steps[s.steps.length - 1];
    s.versions.push({ n: s.versions.length + 1, text: extractScript(last.output), at: now(), source: 'generated' });
  } else s.status = 'running';
  await save(s);
  return s;
}

// Throw away one step and everything after it, so they are written again.
export async function redoFrom(project, key) {
  const s = await getScript(project.id);
  const i = s?.steps.findIndex((x) => x.key === key) ?? -1;
  if (i < 0) throw err('Unknown step.');
  if (s.shared) throw err('The client has already been shown this script. Edit it or use Implement revisions instead.');
  s.steps = s.steps.map((x, j) => (j < i ? x : { key: x.key, title: x.title, status: 'pending' }));
  s.versions = []; s.status = 'running'; s.running = null;
  await save(s);
  return s;
}

// ---------- versions, approval, comments ----------
export const current = (s) => s?.versions?.[s.versions.length - 1] || null;
export const paragraphsOf = (text) => String(text || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

export async function saveEdit(project, text, who) {
  const s = await getScript(project.id);
  const clean = String(text || '').replace(/\r/g, '').trim();
  if (!current(s)) throw err('There is no script yet.');
  if (clean.length < 200) throw err('That script is too short to save.');
  if (clean === current(s).text) return s;
  s.versions.push({ n: s.versions.length + 1, text: clean, at: now(), source: 'edit', by: who?.email || null });
  await save(s);
  return s;
}

// Nothing reaches the client until an admin approves a version here.
export async function share(project, who) {
  const s = await getScript(project.id);
  const v = current(s);
  if (!v) throw err('There is no script to share yet.');
  const first = !s.shared;
  s.shared = { version: v.n, at: now(), by: who?.email || null, firstAt: s.shared?.firstAt || now() };
  s.client = { ...s.client, approvedAt: null, approvedBy: null };
  await save(s);
  return { script: s, first };
}

export async function unshare(project) {
  const s = await getScript(project.id);
  if (s) { s.shared = null; await save(s); }
  return s;
}

export async function addComment(project, who, { para, quote, text }) {
  const s = await getScript(project.id);
  if (!s?.shared) throw err('The script is not available yet.', 404);
  if (s.client?.approvedAt) throw err('This script is already approved.');
  const body = String(text || '').trim().slice(0, 4000);
  if (!body) throw err('Write a comment first.');
  const paras = paragraphsOf(s.versions[s.shared.version - 1].text);
  const i = Number.isInteger(para) && para >= 0 && para < paras.length ? para : null;
  s.comments.push({
    id: randomBytes(6).toString('hex'), version: s.shared.version, para: i, paraText: i === null ? null : paras[i].slice(0, 600),
    quote: String(quote || '').trim().slice(0, 600) || null, text: body, at: now(), status: 'open',
    by: { name: who.name || null, email: who.email || null },
  });
  s.client = { ...s.client, submittedAt: null };
  await save(s);
  return s;
}

export async function removeComment(project, who, id) {
  const s = await getScript(project.id);
  const c = s?.comments.find((x) => x.id === id);
  if (!c || c.status !== 'open' || c.by?.email !== who.email) throw err('That comment can no longer be removed.');
  s.comments = s.comments.filter((x) => x.id !== id);
  await save(s);
  return s;
}

export async function clientSubmit(project, who) {
  const s = await getScript(project.id);
  const open = (s?.comments || []).filter((c) => c.status === 'open');
  if (!s?.shared || !open.length) throw err('Add at least one comment first.');
  s.client = { ...s.client, submittedAt: now(), submittedBy: who.email || null };
  await save(s);
  return { script: s, count: open.length };
}

export async function clientApprove(project, who) {
  const s = await getScript(project.id);
  if (!s?.shared) throw err('The script is not available yet.', 404);
  if (s.comments.some((c) => c.status === 'open')) throw err('You have comments we have not answered yet. Send them, or remove them, before approving.');
  s.client = { ...s.client, approvedAt: now(), approvedBy: who.email || null, approvedVersion: s.shared.version };
  await save(s);
  return s;
}

// ---------- implement revisions ----------
const JSON_START = '===DECISIONS START===';
const JSON_END = '===DECISIONS END===';

function revisionPrompt(s, v, comments, forced) {
  const paras = paragraphsOf(v.text);
  const numbered = paras.map((p, i) => `[P${i + 1}] ${p}`).join('\n\n');
  const list = comments.map((c) => ({
    id: c.id, from: c.by?.name || 'Client', paragraph: c.para === null ? 'general comment on the whole script' : `P${c.para + 1}`,
    highlighted_text: c.quote || undefined, comment: c.text,
    editor_decision: forced.has(c.id) ? 'Hotel Tech Report\'s editor has reviewed this request and approved it. Treat it as category A and implement it.' : undefined,
  }));
  return [
    PROMPTS.revisions,
    `[App note: this review happens inside the Hotel Tech Report YouTube Studio app, not in a Google Doc. Wherever the instructions above say to change the Google Doc or add a comment, do this instead.

1. Return the full revised script between a line that reads exactly ${START} and a line that reads exactly ${END}. Include every category A change and no category B or C change. Keep every paragraph you did not need to touch word for word, keep the timestamps, and do not include the [P1] style markers.
2. Then return one JSON array between a line that reads exactly ${JSON_START} and a line that reads exactly ${JSON_END}, with one object per client comment, in the same order:
   {"id": "<the comment id>", "category": "A" | "B" | "C", "change": "<A only: what you changed, one or two sentences>", "reply": "<A only: the short comment back to the client saying what changed>", "recommendation": "<B and C only: what you recommend Hotel Tech Report does and why, for our editor's eyes only>", "proposed_reply": "<B and C only: a diplomatic reply our editor could send the client>"}
Replies to the client are written in plain text, signed by nobody, with no em dashes.]`,
    s.materials,
    `# CURRENT SCRIPT (paragraph markers are for reference only)\n\n${numbered}`,
    `# CLIENT COMMENTS\n\n${JSON.stringify(list, null, 2)}`,
  ].join('\n\n');
}

function parseDecisions(text) {
  const a = text.indexOf(JSON_START);
  const b = text.indexOf(JSON_END);
  if (a < 0 || b < a) throw err('The AI editor did not return its decisions in the expected form. Run Implement revisions again.', 502);
  try {
    const arr = JSON.parse(text.slice(a + JSON_START.length, b).trim().replace(/^```(?:json)?|```$/g, '').trim());
    if (!Array.isArray(arr)) throw new Error('not a list');
    return arr;
  } catch { throw err('The AI editor returned decisions that could not be read. Run Implement revisions again.', 502); }
}

// Runs the client revisions prompt over every open comment (or just `only`, with the editor's approval).
// Category A changes go into a new version the client sees straight away, with a comment back.
// Category B and C are held for the editor: nothing changes and nothing is sent until they decide.
export async function implementRevisions(project, { only = null } = {}) {
  const s = await getScript(project.id);
  if (!s?.shared) throw err('Share the script with the client first.');
  if (s.running && Date.now() - Date.parse(s.running.at) < RUN_LOCK_MS) throw err('Revisions are already being written. Give it a minute.', 409);
  const forced = new Set(only ? [only] : []);
  const todo = s.comments.filter((c) => (only ? c.id === only && c.status === 'needs-decision' : c.status === 'open'));
  if (!todo.length) throw err('There are no client comments waiting.');
  const v = current(s);
  s.running = { key: 'revisions', at: now() };
  await save(s);
  let r;
  try {
    r = await callModel([{ role: 'user', content: revisionPrompt(s, v, todo, forced) }], 14000);
  } catch (e) { await save({ ...(await getScript(project.id)), running: null }); throw e; }
  let decisions; let text;
  try {
    decisions = parseDecisions(r.text);
    text = r.text.includes(START) ? extractScript(r.text) : null;
    if (!text || text.length < v.text.length * 0.5) throw err('The AI editor did not return a complete revised script. Run Implement revisions again.', 502);
  } catch (e) { await save({ ...(await getScript(project.id)), running: null }); throw e; }

  const fresh = await getScript(project.id);
  const changed = text !== v.text;
  const n = changed ? fresh.versions.length + 1 : v.n;
  const tally = { implemented: 0, held: 0 };
  for (const c of fresh.comments) {
    if (!todo.some((x) => x.id === c.id)) continue;
    const d = decisions.find((x) => x.id === c.id);
    const cat = forced.has(c.id) ? 'A' : ['A', 'B', 'C'].includes(d?.category) ? d.category : 'B';
    if (cat === 'A') {
      Object.assign(c, { status: 'implemented', category: c.category || 'A', change: d?.change || null, reply: d?.reply || 'Updated in the script.', replyAt: now(), replyBy: 'auto', resolvedIn: n });
      tally.implemented++;
    } else {
      Object.assign(c, { status: 'needs-decision', category: cat, recommendation: d?.recommendation || 'No recommendation was returned. Read the request and decide.', proposedReply: d?.proposed_reply || '' });
      tally.held++;
    }
  }
  if (changed) {
    fresh.versions.push({ n, text, at: now(), source: 'revision' });
    fresh.shared = { ...fresh.shared, version: n, at: now() };
  }
  fresh.revisions.push({ at: now(), version: n, ...tally, ms: r.ms });
  fresh.client = { ...fresh.client, submittedAt: null };
  fresh.running = null;
  await save(fresh);
  return { script: fresh, ...tally, changed };
}

// The editor's answer on a held comment: send a reply and leave the script as it is.
export async function replyToComment(project, who, id, text) {
  const s = await getScript(project.id);
  const c = s?.comments.find((x) => x.id === id);
  const body = String(text || '').trim().slice(0, 4000);
  if (!c || c.status !== 'needs-decision') throw err('That comment is not waiting on a decision.');
  if (!body) throw err('Write the reply first.');
  Object.assign(c, { status: 'declined', reply: body, replyAt: now(), replyBy: who?.email || 'htr' });
  await save(s);
  return s;
}

// ---------- what each role sees ----------
export function forAdmin(s) {
  if (!s) return null;
  const { materials, websiteText, ...rest } = s;
  return { ...rest, materialsChars: materials?.length || 0, websiteRead: !!websiteText };
}

// Clients only ever get the version an admin shared, their comments and our replies.
export function forClient(s) {
  if (!s?.shared) return null;
  const v = s.versions[s.shared.version - 1];
  return {
    version: v.n, text: v.text, sharedAt: s.shared.at, product: s.product,
    approvedAt: s.client?.approvedAt || null, submittedAt: s.client?.submittedAt || null,
    comments: s.comments.map((c) => ({
      id: c.id, version: c.version, para: c.version === v.n ? c.para : null, paraText: c.paraText, quote: c.quote, text: c.text, at: c.at, by: c.by,
      status: c.status === 'needs-decision' ? 'open' : c.status, reply: c.status === 'needs-decision' ? null : c.reply || null, replyAt: c.reply ? c.replyAt : null,
    })),
  };
}

// For the Generate form: a first guess at the vendor's website, taken from their dossier.
export async function suggestWebsite(project) {
  try { return guessWebsite(await clientDossier(project.items?.dossier?.url)); } catch { return ''; }
}

// Whether a project has everything generation needs, and if not, what is missing.
export async function readiness(project) {
  if (!project.items?.dossier?.url) return 'The client has not submitted their dossier yet.';
  const job = project.items?.video?.jobId ? await getJob(project.items.video.jobId).catch(() => null) : null;
  if (job?.status !== 'done') return 'The demo video transcript is not ready yet.';
  if (!project.internal?.completedAt) return 'Mark the internal dossier complete first.';
  return null;
}
