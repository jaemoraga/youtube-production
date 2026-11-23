// Script generation, review and client revisions for one project.
//
// How a script is written is defined in lib/script-pipeline.js (the steps and their prompts) and
// lib/script-config.js (word budgets, scoring weights, banned phrases). This file runs those steps one
// request at a time, keeps every answer, and checks the result.
//
// Everything is stored in scripts/<projectId>.json in the private store.
import { randomBytes } from 'node:crypto';
import { toTxt } from './format.js';
import { INTERNAL_FIELDS } from './project-shared.js';
import { BANNED_PHRASES, MIN_WORKFLOW_WORDS, OVER_BUDGET_TOLERANCE, SECTIONS, WALKTHROUGH_WORKFLOWS, budgets } from './script-config.js';
import { ARIANA_LINE, CLOSING_CTA, PRICING_CTA, END, NOTES_END, NOTES_START, PIPELINE, RUNTIME, STANDARDS, START, STEPS } from './script-pipeline.js';
import PROMPTS from './script-prompts.js';
import { getJob, readJSON, remove, transcriptPath, writeJSON } from './store.js';

export { STEPS };

// The AI writer. OpenAI is used when OPENAI_API_KEY is set; otherwise Anthropic if ANTHROPIC_API_KEY is set.
const OPENAI_KEY = () => process.env.OPENAI_API_KEY || '';
const ANTHROPIC_KEY = () => process.env.ANTHROPIC_API_KEY || '';
export const PROVIDER = () => (OPENAI_KEY() ? 'openai' : ANTHROPIC_KEY() ? 'anthropic' : null);
export const SCRIPT_MODEL = () => process.env.SCRIPT_MODEL || (PROVIDER() === 'anthropic' ? 'claude-opus-5-5' : 'gpt-6.1-sol');
export const AI_READY = () => !!PROVIDER();

const err = (message, status = 400) => Object.assign(new Error(message), { status });
const path = (id) => `scripts/${id}.json`;
const now = () => new Date().toISOString();
const RUN_LOCK_MS = 6 * 60e3;

export const getScript = (projectId) => readJSON(path(projectId)).catch(() => null);
const save = (s) => writeJSON(path(s.projectId), { ...s, updatedAt: now() });
// Start over: the old run is kept in the archive, never thrown away.
export async function removeScript(projectId) {
  const old = await getScript(projectId);
  if (old?.steps?.some((x) => x.status === 'done')) await writeJSON(`scripts-archive/${projectId}/${now().replace(/[:.]/g, '-')}.json`, old);
  await remove(path(projectId));
}

// ---------- the model ----------
// Planning, scoring and revising get more thinking time. SCRIPT_REASONING=off removes the setting;
// any other value (low, medium, high) applies to every step.
const reasoning = (effort) => { const v = process.env.SCRIPT_REASONING; return v === 'off' ? null : v || effort; };
const plain = (m) => ({ role: m.role, content: typeof m.content === 'string' ? m.content : m.content.map((c) => c.text).join('\n\n') });

async function callModel(messages, maxTokens, effort = null) {
  const provider = PROVIDER();
  if (!provider) throw err('The AI writer is not connected yet. Add OPENAI_API_KEY in Vercel and redeploy.', 503);
  const started = Date.now();
  const openai = provider === 'openai';
  // OpenAI's reasoning models count their thinking against the output limit, so they get more room.
  const res = await fetch(openai ? 'https://api.openai.com/v1/chat/completions' : 'https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: openai
      ? { 'content-type': 'application/json', authorization: `Bearer ${OPENAI_KEY()}` }
      : { 'content-type': 'application/json', 'x-api-key': ANTHROPIC_KEY(), 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(openai
      ? { model: SCRIPT_MODEL(), messages: messages.map(plain), max_completion_tokens: maxTokens * 3, ...(reasoning(effort) ? { reasoning_effort: reasoning(effort) } : {}) }
      : { model: SCRIPT_MODEL(), max_tokens: maxTokens, messages }),
    signal: AbortSignal.timeout(285000),
  }).catch((e) => { throw err(e.name === 'TimeoutError' ? 'The AI writer took too long on this step. Click Continue writing to try it again.' : `Could not reach the AI writer: ${e.message}`, 502); });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw err(`The AI writer returned an error (${res.status}): ${data?.error?.message || 'no details'}`, 502);
  const choice = data.choices?.[0];
  const text = (openai ? choice?.message?.content || '' : (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('')).trim();
  if ((openai ? choice?.finish_reason === 'length' : data.stop_reason === 'max_tokens')) throw err('The AI writer ran out of room before finishing this step. Run it again.', 502);
  if (!text) throw err('The AI writer returned an empty answer.', 502);
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

async function gather(project, website, productName = '') {
  const internal = project.internal?.fields || {};
  if (!project.internal?.completedAt) throw err('Mark the internal dossier complete first.');
  const job = project.items?.video?.jobId ? await getJob(project.items.video.jobId) : null;
  const t = job?.status === 'done' ? await readJSON(transcriptPath(job.id)).catch(() => null) : null;
  if (!t) throw err('The demo video transcript is not ready yet.');
  const dossier = await clientDossier(project.items.dossier.url);
  // The product, not the company: a vendor like Jonas Hospitality sells several products, and a script
  // that names the company invites company-wide figures to be read as the product's.
  const product = String(productName || '').trim() || project.internal?.htr?.name || project.companyName;
  const reviewCount = /([\d,]+)\s+verified reviews/.exec(internal.ratings || '')?.[1] || null;
  const site = website || guessWebsite(dossier);
  const internalText = INTERNAL_FIELDS.filter((f) => internal[f.key])
    .map((f) => `### ${f.group ? `${f.group}: ` : ''}${f.label}\n${internal[f.key]}`).join('\n\n');
  const facts = [
    `Product reviewed: ${product}`, `Vendor: ${project.companyName}`,
    `Scope: the HotelTechReport review count, ratings, reviewer comments and verified integrations in the internal dossier are for ${product}'s product page unless a line says otherwise. Anything about ${project.companyName} as a whole (other products, the company portfolio, company-wide customer or integration counts, awards to the company) is company-wide evidence and must be labeled that way in the script, never presented as ${product}'s.`,
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
const stepDef = (key) => STEPS.find((x) => x.key === key);
const outputOf = (s, key) => s.steps.find((x) => x.key === key)?.output || '';

export function extractScript(output) {
  const a = output.indexOf(START);
  const b = output.indexOf(END);
  const body = a >= 0 && b > a ? output.slice(a + START.length, b) : output;
  return body.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
}

// The plan's MUST KEEP list: the buyer-relevant evidence the finished script has to retain.
export function mustKeep(plan) {
  const m = /MUST KEEP:?\s*\n?([\s\S]*?)(?:\n\s*\n\s*(?:\d+\.|#)|\n\s*\d+\.\s+[A-Z]|$)/.exec(String(plan || ''));
  if (!m) return [];
  return m[1].split('\n').map((l) => l.replace(/^\s*[-*•\d.)]+\s*/, '').trim()).filter((l) => l.length > 3).slice(0, 12);
}
// The plan's ESSENTIAL capabilities: things a buyer must understand that the script has to cover somewhere.
// Lines look like "ESSENTIAL: Survey Manager | covered in: Fit and pricing | point: surveys start at Essential".
export function essentials(plan) {
  return [...String(plan || '').matchAll(/^\s*[-*]?\s*\**ESSENTIAL\**:?\**\s*(.+)$/gim)]
    .map((m) => { const [name, ...rest] = m[1].split('|').map((x) => x.replace(/\*\*/g, '').trim()); return { name, line: [name, ...rest].join(' | ') }; })
    .filter((x) => x.name && x.name.length > 2 && !/^capabilities?$/i.test(x.name)).slice(0, 6);
}
// Covered if the capability's name, or its distinctive words, appear in the script.
const covered = (text, name) => {
  const t = text.toLowerCase();
  const n = name.toLowerCase().replace(/[()"“”]/g, ' ').replace(/\s+/g, ' ').trim();
  if (t.includes(n)) return true;
  const words = n.split(' ').filter((w) => w.length > 3 && !['module', 'feature', 'capability', 'tool', 'tools', 'management', 'platform'].includes(w));
  return words.length > 0 && words.every((w) => t.includes(w));
};
export const missingEssentials = (text, list) => list.filter((x) => !covered(text, x.name));

// Narration that describes the source document instead of the hotel or the claim.
const SOURCE_TALK = /\b(?:the |its |their )?(?:published|vendor[’']?s?)? ?(?:customer )?(?:case stud(?:y|ies)|customer stor(?:y|ies)|published (?:story|account))\b[^.\n]{0,20}\b(?:reports?|describes?|indicates?|explains?|shows?|says|notes|states|credits)\b|\baccording to the (?:published|case|customer)\b[^.\n]{0,30}|\b(?:as )?the published (?:story|account|case study)\b[^.\n]{0,30}|\bHTR reviewers report\b/gi;

// Numbers that identify an item (4.4, 94%, 623, 880). Years and one-digit counts are too common to test.
const keyNumbers = (t) => [...new Set((t.match(/\d+(?:[.,]\d+)?%?/g) || []).filter((n) => /[.,%]/.test(n) || (n.length >= 2 && !/^(19|20)\d\d$/.test(n))))];
const normNum = (n) => n.replace(/,/g, '');
export function missingEvidence(text, items) {
  const have = new Set(keyNumbers(text).map(normNum));
  return items.filter((it) => { const nums = keyNumbers(it).map(normNum); return nums.length && !nums.some((n) => have.has(n) || have.has(n.replace('%', ''))); });
}

// Protected brand language is not the model's to edit. If a pass shortened or dropped it, put it back:
// the Ariana introduction, and the closing call to action when the close has no HotelTechReport line.
export function repairProtected(text, product = '') {
  let out = text.includes(ARIANA_LINE) ? text : text.replace(/Hi,? I[’']m Ariana(?: from HotelTechReport\.com)?[^.\n]*\./, ARIANA_LINE);
  const m = /^\s*\[VERDICT[^\]]*\]\s*$/m.exec(out);
  if (m && !out.includes(CLOSING_CTA)) {
    const close = out.slice(m.index + m[0].length);
    if (!/HotelTechReport/i.test(close)) out = `${out.trimEnd()}\n\n${CLOSING_CTA}`;
  }
  // The pricing line: replace the model's own price-quote sentence in Fit and Pricing with the fixed one.
  const name = String(product || '').replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  const line = name && PRICING_CTA(name);
  const fit = /^\s*\[FIT[^\]]*\]\s*$/m.exec(out);
  if (line && fit && !out.includes(line)) {
    const start = fit.index + fit[0].length;
    const next = out.slice(start).search(/^\s*\[[A-Z][A-Z &/\-]{2,40}\]\s*$/m);
    const end = next < 0 ? out.length : start + next;
    let body = out.slice(start, end);
    const sentence = /[^.!?\n]*\b(?:price quote|request (?:a )?pric\w*|pricing for)\b[^.!?\n]*HotelTechReport[^.!?\n]*[.!?]/i;
    body = sentence.test(body) ? body.replace(sentence, (m) => (/^\s/.test(m) ? ' ' : '') + line) : `${body.trimEnd()} ${line}\n\n`;
    out = out.slice(0, start) + body + out.slice(end);
  }
  return out;
}

const between = (text, a, b) => { const i = text.indexOf(a); const j = text.indexOf(b); return i >= 0 && j > i ? text.slice(i + a.length, j).trim() : ''; };

// Drafting steps share one conversation that opens with the standards and the research. The two
// "fresh" steps (independent score, targeted revision) each get a conversation of their own, so the
// evaluator never sees the drafting and cannot be swayed by it.
function messagesFor(s, key) {
  const def = stepDef(key);
  if (def.fresh) {
    const script = extractScript(outputOf(s, 'edit'));
    const ctx = {
      script, counts: countsTable(script), plan: outputOf(s, 'plan'), evaluation: outputOf(s, 'evaluate'),
      mustKeep: mustKeep(outputOf(s, 'plan')).map((x) => `- ${x}`).join('\n'),
      checks: checks(script, s).map((x) => `- ${x}`).join('\n'),
      essentials: essentials(outputOf(s, 'plan')).map((x) => `- ${x.line}`).join('\n'),
      extras: [outputOf(s, 'assemble').split(START)[0].trim(), /DIAGRAM PROMPT[\s\S]*/i.exec(outputOf(s, 's2'))?.[0] || ''].filter(Boolean).join('\n\n') || 'none',
    };
    return [{ role: 'user', content: def.prompt(s, ctx) }];
  }
  const main = STEPS.filter((x) => !x.fresh);
  const first = `${PROMPTS.opening}\n\n${STANDARDS}\n\n${s.materials}`;
  const messages = [{ role: 'user', content: [{ type: 'text', text: first, cache_control: { type: 'ephemeral' } }, { type: 'text', text: main[0].prompt(s) }] }];
  for (const d of main.slice(1)) {
    const prev = main[main.indexOf(d) - 1];
    messages.push({ role: 'assistant', content: outputOf(s, prev.key) });
    messages.push({ role: 'user', content: d.prompt(s) });
    if (d.key === key) break;
  }
  return key === main[0].key ? messages.slice(0, 1) : messages;
}

// ---------- measuring and checking a script (done by the app, never by the model) ----------
const spokenWords = (t) => t.replace(/🕒?\s*\[\d{1,2}:\d{2}(?::\d{2})?\]/g, ' ').trim().split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

export function analyze(text) {
  const B = budgets();
  const parts = String(text || '').split(/^\s*\[([A-Z][A-Z &/\-]{2,40})\]\s*$/m);
  const sections = [];
  for (let i = 1; i < parts.length; i += 2) {
    const def = SECTIONS.find((x) => x.match.test(parts[i]));
    const words = spokenWords(parts[i + 1]);
    const [min, max] = def ? B[def.id] : [0, 0];
    sections.push({ id: def?.id || null, label: def?.label || parts[i], words, min, max, over: !!def && words > max * OVER_BUDGET_TOLERANCE, under: !!def && words < min * 0.9, timestamps: (parts[i + 1].match(/🕒/g) || []).length });
  }
  const words = sections.length ? sections.reduce((n, x) => n + x.words, 0) : spokenWords(String(text || ''));
  return { sections, words, runtime: RUNTIME(words), target: RUNTIME(Object.values(B).reduce((n, [, max]) => n + max, 0)) };
}

const countsTable = (text) => {
  const a = analyze(text);
  return [...a.sections.map((x) => `- ${x.label}: ${x.words} words [budget ${x.min} to ${x.max}]${x.over ? ' OVER BUDGET' : x.under ? ' UNDER BUDGET' : ''}${x.id === 'walkthrough' ? `, ${x.timestamps} timestamped passages` : ''}`),
    `- Total: ${a.words} spoken words, about ${a.runtime} at 140 words per minute`].join('\n');
};

// Plain checks a person would otherwise have to do by eye. Each returns a sentence for the script page.
export function checks(text, s = {}) {
  const a = analyze(text);
  const out = [];
  const lower = text.toLowerCase();
  if (a.sections.length && SECTIONS.some((d) => !a.sections.find((x) => x.id === d.id))) out.push(`Missing section: ${SECTIONS.filter((d) => !a.sections.find((x) => x.id === d.id)).map((d) => d.label).join(', ')}.`);
  for (const x of a.sections) if (x.over) out.push(`${x.label} runs ${x.words} words against a budget of ${x.min} to ${x.max}.`);
  const walk = a.sections.find((x) => x.id === 'walkthrough');
  if (walk && (walk.timestamps < WALKTHROUGH_WORKFLOWS[0] || walk.timestamps > WALKTHROUGH_WORKFLOWS[1])) out.push(`The walkthrough has ${walk.timestamps} timestamped passages; the target is ${WALKTHROUGH_WORKFLOWS[0]} to ${WALKTHROUGH_WORKFLOWS[1]} workflows.`);
  const banned = BANNED_PHRASES.filter((p) => lower.includes(p));
  if (banned.length) out.push(`Contains phrases the standards rule out: ${banned.map((p) => `"${p}"`).join(', ')}.`);
  if (/\u2014/.test(text)) out.push('Contains an em dash.');
  if (s.reviewCount) {
    const want = s.reviewCount.replace(/\D/g, '');
    const odd = [...text.matchAll(/\b(\d[\d,]{1,6})\+?\s+(?:verified\s+)?(?:hotelier\s+)?reviews\b/gi)].map((m) => m[1]).filter((n) => n.replace(/\D/g, '') !== want);
    if (odd.length) out.push(`Review count should read ${s.reviewCount} everywhere; the script also says ${[...new Set(odd)].join(', ')}.`);
  }
  if (/\?\s*$/.test(text.trim())) out.push('The script ends on a question instead of a verdict or call to action.');
  if (a.sections.length && !text.includes(ARIANA_LINE)) out.push('The approved Ariana introduction is missing or reworded.');
  if (s.product && s.vendor && s.product.trim().toLowerCase() === s.vendor.trim().toLowerCase()) out.push(`The product name is the company name (${s.product}). If ${s.vendor} sells more than one product, regenerate with the product's own name so review counts and ratings are attributed to the right product.`);
  const thirdPerson = [...new Set((text.match(/\bthe (?:presenter|demonstrator)\b[^.\n]{0,50}|\bthe (?:user|host|rep) (?:clicks|opens|selects|switches|filters|scrolls|navigates|types|goes)\b[^.\n]{0,40}/gi) || []))];
  if (thirdPerson.length) out.push(`Third-person narration of the demo: ${thirdPerson.slice(0, 3).map((x) => `"${x.trim()}"`).join(', ')}. Speak to the viewer ("Here we can see", "You can").`);
  const walkText = (String(text).split(/^\s*\[FEATURE WALKTHROUGH\]\s*$/m)[1] || '').split(/^\s*\[[A-Z][A-Z &/\-]{2,40}\]\s*$/m)[0];
  const fragments = walkText.split('🕒').slice(1).map((p) => spokenWords(p)).filter((n) => n < MIN_WORKFLOW_WORDS);
  if (fragments.length) out.push(`${fragments.length} walkthrough ${fragments.length === 1 ? 'passage is' : 'passages are'} under ${MIN_WORKFLOW_WORDS} words: timestamps are being used as sections instead of complete workflows.`);
  const name = (s.product || '').split(/[\s(]/)[0];
  const toVendor = name && new RegExp(`(ask|contact|reach out to|request [a-z ]*from)\\s+(the vendor|${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})[^.\n]{0,40}(price|pricing|quote|review|compar)`, 'i').exec(text);
  if (toVendor) out.push(`Sends viewers to the vendor for pricing or comparison ("${toVendor[0]}"); point them to HotelTechReport.`);
  const close = a.sections.length ? (String(text).split(/^\s*\[VERDICT[^\]]*\]\s*$/m)[1] || '') : '';
  const lacking = [['verified reviews', /review/i], ['integrations', /integration/i], ['alternatives', /alternative|compare/i], ['pricing', /pric|quote/i]].filter(([, re]) => close && !re.test(close)).map(([n]) => n);
  if (close && lacking.length) out.push(`The closing call to action leaves out: ${lacking.join(', ')}.`);
  const kept = mustKeep((s.steps || []).find((x) => x.key === 'plan')?.output);
  const lost = missingEvidence(text, kept);
  if (lost.length) out.push(`Evidence the plan marked MUST KEEP is missing: ${lost.map((x) => `"${x.length > 90 ? `${x.slice(0, 87)}…` : x}"`).join('; ')}.`);
  const sectionText = (re) => (String(text).split(re)[1] || '').split(/^\s*\[[A-Z][A-Z &/\-]{2,40}\]\s*$/m)[0];
  const hookText = sectionText(/^\s*\[HOOK[^\]]*\]\s*$/m);
  const hookDisclaimer = /\b(?:(?:haven[’']t|have not|hasn[’']t|has not|not|wasn[’']t|weren[’']t) (?:been )?independently (?:verified|confirmed)|unverified)\b[^.\n]{0,30}/i.exec(hookText);
  if (hookDisclaimer) out.push(`The hook is interrupted by a verification disclaimer ("${hookDisclaimer[0].trim()}"). Name who reported the result in the hook; put any needed qualification in the case study.`);
  const caseText = sectionText(/^\s*\[CASE STUDY\]\s*$/m);
  const caseNums = (caseText.match(/[$€£]\s?[\d,.]+\s?(?:k|K|million|m)?|\b\d[\d,.]*\s?%|\b\d{1,3}(?:,\d{3})+\b/g) || []).map((n) => n.replace(/\s/g, ''));
  const repeated = [...new Set(caseNums.filter((n, i) => caseNums.indexOf(n) !== i))];
  if (repeated.length) out.push(`The case study repeats ${repeated.join(', ')}. Use each figure once; a thin case study should be short, not padded.`);
  const spokenName = String(s.product || '').replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  if (a.sections.length && spokenName && !text.includes(PRICING_CTA(spokenName))) out.push(`The pricing line should read, word for word: "${PRICING_CTA(spokenName)}"`);
  const method = [...new Set((text.match(/\b(?:the |our )?(?:expert|review|reviewer|available|research|underlying) (?:evidence|data|input|feedback) (?:consists|is (?:limited|thin|based)|comes from|includes|amounts)\b[^.\n]{0,40}|\b(?:recommendations|ratings|comments),? (?:not|rather than) (?:detailed )?(?:assessments|evaluations|reviews)\b/gi) || []).map((x) => x.trim()))];
  if (method.length) out.push(`Narrates research method instead of the product: ${method.slice(0, 2).map((x) => `"${x}"`).join(', ')}. Keep evidence-quality labels in the plan unless they change the buying decision.`);
  const gaps = missingEssentials(text, essentials((s.steps || []).find((x) => x.key === 'plan')?.output));
  if (gaps.length) out.push(`Essential capabilities from the plan are not covered: ${gaps.map((x) => x.name).join(', ')}. A sentence in the assigned section is enough.`);
  const sourceTalk = [...new Set((text.match(SOURCE_TALK) || []).map((x) => x.trim()))];
  if (sourceTalk.length) out.push(`Narrates the source document instead of the hotel: ${sourceTalk.slice(0, 3).map((x) => `"${x}"`).join(', ')}. Attribute to the hotel or vendor in a few words; keep sources in the editor notes.`);
  for (const x of a.sections) if (x.under && lost.length) out.push(`${x.label} is under budget (${x.words} of ${x.min} to ${x.max}) while evidence was dropped.`);
  return out;
}

// ---------- generation ----------
export async function startScript(project, { website = '', product = '', who = null } = {}) {
  const existing = await getScript(project.id);
  if (existing?.versions?.length) throw err('This project already has a script. Use Start over to replace it.');
  const g = await gather(project, String(website || '').trim(), product);
  const s = {
    projectId: project.id, createdAt: now(), startedBy: who?.email || null, model: SCRIPT_MODEL(),
    product: g.product, vendor: project.companyName, reviewCount: g.reviewCount, website: g.website, websiteText: g.websiteText, materials: g.materials,
    status: 'running', pipeline: PIPELINE, steps: STEPS.map((x) => ({ key: x.key, title: x.title, status: 'pending' })),
    versions: [], shared: null, comments: [], revisions: [], client: {},
  };
  await save(s);
  return s;
}

// One click: archive the current run and write the script again from the same materials and website,
// with the current process. Refused while the client can see the script, so nothing changes under them.
export async function regenerateScript(project, { product = '', who = null } = {}) {
  const old = await getScript(project.id);
  if (old?.shared && !old.client?.approvedAt) throw err('The client can see this script. Click Hide from client first, then Regenerate.');
  if (old?.client?.approvedAt) throw err('The client approved this script for filming, so it is locked.');
  if (old?.running && Date.now() - Date.parse(old.running.at) < RUN_LOCK_MS) throw err('A step is being written right now. Wait for it to finish.', 409);
  const last = old?.versions?.filter((x) => x.source === 'generated').at(-1);
  await removeScript(project.id);
  const s = await startScript(project, { website: old?.website || '', product: product || old?.product || '', who });
  if (last) {
    s.previous = { at: last.at, draftScore: last.draftScore || null, words: analyze(last.text).words, pipeline: old.pipeline || 1 };
    await save(s);
  }
  return s;
}

export async function runNextStep(project) {
  const s = await getScript(project.id);
  if (!s) throw err('Start the script first.');
  const st = s.steps.find((x) => x.status !== 'done');
  if (!st) return s;
  if (s.pipeline !== PIPELINE) throw err('This script was started with the earlier writing process. Click Start over to write it with the current one.');
  if (s.running && Date.now() - Date.parse(s.running.at) < RUN_LOCK_MS) throw err('A step is already being written. Give it a minute.', 409);
  s.running = { key: st.key, at: now() };
  await save(s);
  try {
    const def = stepDef(st.key);
    const r = await callModel(messagesFor(s, st.key), def.max, def.effort || null);
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
    const final = outputOf(s, 'revise');
    // If the revision came back without a usable script, fall back to the edited draft rather than lose the run.
    const revised = final.includes(START) ? extractScript(final) : '';
    const edited = extractScript(outputOf(s, 'edit'));
    const text = repairProtected(revised.length > edited.length * 0.5 ? revised : edited, s.product);
    const evaluation = outputOf(s, 'evaluate');
    s.versions.push({
      n: s.versions.length + 1, text, at: now(), source: 'generated',
      editorNotes: between(final, NOTES_START, NOTES_END) || null,
      draftScore: Number(/TOTAL:\s*(\d{1,3})\s*\/\s*100/.exec(evaluation)?.[1]) || null,
      draft: analyze(edited),
    });
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
  if (s.pipeline !== PIPELINE) throw err('This script was written with the earlier process. Click Start over to write it with the current one.');
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

// Nothing reaches the client until an admin approves a version here. That includes revisions:
// replies drafted by Implement revisions are only released, with the revised script, by this step.
export async function share(project, who) {
  const s = await getScript(project.id);
  const v = current(s);
  if (!v) throw err('There is no script to share yet.');
  const first = !s.shared;
  let released = 0;
  for (const c of s.comments) {
    if (c.status !== 'drafted') continue;
    Object.assign(c, { status: 'implemented', reply: (c.draftReply || '').trim() || 'Updated in the script.', replyAt: now(), replyBy: who?.email || 'htr', resolvedIn: v.n });
    released++;
  }
  s.shared = { version: v.n, at: now(), by: who?.email || null, firstAt: s.shared?.firstAt || now() };
  s.client = { ...s.client, approvedAt: null, approvedBy: null, submittedAt: s.comments.some((c) => c.status === 'open') ? s.client?.submittedAt || null : null };
  await save(s);
  return { script: s, first, released };
}

// Reword the reply the client will get for a drafted revision, before it is released.
export async function editDraftReply(project, id, text) {
  const s = await getScript(project.id);
  const c = s?.comments.find((x) => x.id === id);
  if (!c || c.status !== 'drafted') throw err('That reply has already been sent or is not a draft.');
  c.draftReply = String(text || '').trim().slice(0, 4000);
  await save(s);
  return s;
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
  if (s.comments.some((c) => ['open', 'drafted', 'needs-decision'].includes(c.status))) throw err('You have comments we have not answered yet. Send them, or remove them, before approving.');
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
// Nothing here reaches the client. Category A changes are written into a new draft version, each with a
// drafted reply; category B and C are held with a recommendation. The editor reviews, then shares.
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
      Object.assign(c, { status: 'drafted', category: c.category || 'A', change: d?.change || null, draftReply: d?.reply || 'Updated in the script.', draftedIn: n });
      tally.implemented++;
    } else {
      Object.assign(c, { status: 'needs-decision', category: cat, recommendation: d?.recommendation || 'No recommendation was returned. Read the request and decide.', proposedReply: d?.proposed_reply || '' });
      tally.held++;
    }
  }
  if (changed) fresh.versions.push({ n, text, at: now(), source: 'revision' });
  fresh.revisions.push({ at: now(), version: n, ...tally, ms: r.ms });
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
const PENDING = ['needs-decision', 'drafted'];
export function forAdmin(s) {
  if (!s) return null;
  const { materials, websiteText, ...rest } = s;
  const v = current(s);
  return {
    ...rest, materialsChars: materials?.length || 0, websiteRead: !!websiteText, currentProcess: s.pipeline === PIPELINE,
    analysis: v ? analyze(v.text) : null, checks: v ? checks(v.text, s) : [],
  };
}

// Clients only ever get the version an admin shared, their comments and the replies an admin released.
// Drafted and held comments read as still waiting, with nothing of ours attached.
// Demo timestamps are for HTR's video editor. Clients see the script without them. Only markers followed
// by text on the same line are removed, so paragraphs (and the comment positions that point at them) never shift.
export const clientText = (text) => String(text || '').replace(/🕒\s*\[\d{1,2}:\d{2}(?::\d{2})?\]\s*(?=\S)/g, '');

export function forClient(s) {
  if (!s?.shared) return null;
  const v = s.versions[s.shared.version - 1];
  return {
    version: v.n, text: clientText(v.text), sharedAt: s.shared.at, product: s.product,
    approvedAt: s.client?.approvedAt || null, submittedAt: s.client?.submittedAt || null,
    comments: s.comments.map((c) => ({
      id: c.id, version: c.version, para: c.version === v.n ? c.para : null, paraText: c.paraText ? clientText(c.paraText) : c.paraText, quote: c.quote, text: c.text, at: c.at, by: c.by,
      status: PENDING.includes(c.status) ? 'open' : c.status, reply: PENDING.includes(c.status) ? null : c.reply || null, replyAt: !PENDING.includes(c.status) && c.reply ? c.replyAt : null,
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
