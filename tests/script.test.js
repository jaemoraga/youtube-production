// Script generation and client revisions, run against an in-memory store, a fake Google Doc,
// a fake vendor website and a fake AI writer that records every request it is sent.
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

process.env.APP_SECRET = 'x'.repeat(32);
process.env.OPENAI_API_KEY = 'sk-test';
process.env.ANTHROPIC_API_KEY = 'unused-when-openai-is-set';

const blobs = new Map();
mock.module('@vercel/blob', {
  namedExports: {
    get: async (p) => (blobs.has(p) ? { statusCode: 200, stream: new Response(blobs.get(p)).body } : null),
    put: async (p, body) => { blobs.set(p, body); return { pathname: p }; },
    del: async (p) => { blobs.delete(p); }, list: async () => ({ blobs: [], hasMore: false }),
    head: async () => null, issueSignedToken: async () => ({}), presignUrl: async () => ({}),
  },
});

const DOC = 'a'.repeat(30);
const JOB = 'b'.repeat(16);
const dossierText = `TrustYou vendor application. Website: https://www.trustyou.com/cxp and video https://www.youtube.com/x. Pricing: from 99 EUR per month. ${'Features and answers. '.repeat(20)}`;
const ai = { calls: [], reply: null };
const body = (n) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ');
const SECTION_TEXT = [
  ['[HOOK AND INTRO]', `Title line for the review. Hi, I’m Ariana from HotelTechReport.com, where we help hoteliers like you future-proof your operations by finding the best tech tools to run and grow your businesses. ${body(80)}`],
  ['[PLATFORM OVERVIEW]', body(90)],
  ['[FEATURE WALKTHROUGH]', `🕒 [01:45] The inbox pulls every review into one place. ${body(100)}\n\n🕒 [03:10] ${body(100)}\n\n🕒 [05:02] ${body(100)}`],
  ['[CASE STUDY]', body(150)],
  ['[REAL-WORLD FEEDBACK]', `Across 623 verified reviews the pattern is clear. ${body(190)}`],
  ['[FIT AND PRICING]', `Pricing starts at 99 euros a month. ${body(120)}`],
  ['[VERDICT AND CTA]', `${body(60)} On HotelTechReport, read verified reviews, check integrations, compare alternatives and request pricing.`],
];
const SCRIPT_V1 = SECTION_TEXT.map(([h, t]) => `${h}\n\n${t}`).join('\n\n');
const DRAFT = SCRIPT_V1.replace('🕒 [05:02]', `🕒 [05:02] ${body(260)} extra`);
// What the fake AI writer answers at each step, recognised by how the prompt begins.
const answerFor = (prompt, n) => {
  if (prompt.startsWith('Assemble the seven sections')) return `Title card: TrustYou reviewed\n===SCRIPT START===\n${DRAFT}\n===SCRIPT END===`;
  if (prompt.startsWith('Edit the assembled script')) return `===SCRIPT START===\n${DRAFT}\n===SCRIPT END===\n1. Tightened.`;
  if (prompt.startsWith('You are an independent editorial evaluator')) return 'SCORES\nHook and intro: 8/10, fine\nTOTAL: 82/100\n\nISSUES\n1. [must-fix] Feature walkthrough: too long.\n\nKEEP\n"The inbox pulls every review into one place."';
  if (prompt.startsWith('You are the senior editor')) return `===SCRIPT START===\n${SCRIPT_V1}\n===SCRIPT END===\n\n===EDITOR NOTES START===\n🕒 [01:45] Unified inbox | Show: inbox list | Highlight: source filter | Why: one place\nTitle card: TrustYou reviewed\n===EDITOR NOTES END===\n\nCHANGES\n1. Cut the third workflow to budget.`;
  if (prompt.startsWith('Write the PLATFORM OVERVIEW')) return 'Overview narration.\nDIAGRAM PROMPT (not spoken): hub and spokes.';
  return `answer ${n}`;
};
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  if (url === `https://docs.google.com/document/d/${DOC}/export?format=txt`) return new Response(dossierText, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
  if (url === 'https://www.trustyou.com') return new Response(`<html><style>x{}</style><body><h1>Customer Experience Platform</h1>${'<p>Reviews, surveys and AI replies in one inbox.</p>'.repeat(10)}</body></html>`, { headers: { 'content-type': 'text/html' } });
  if (url === 'https://api.openai.com/v1/chat/completions') {
    assert.equal(init.headers.authorization, 'Bearer sk-test');
    const body = JSON.parse(init.body);
    assert.equal(body.model, 'gpt-6.1-sol');
    assert.ok(body.max_completion_tokens > 0 && body.temperature === undefined);
    assert.ok(body.messages.every((m) => typeof m.content === 'string'));
    ai.calls.push(body);
    const prompt = body.messages.at(-1).content;
    const text = ai.reply ? ai.reply(prompt) : answerFor(prompt, ai.calls.length);
    return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: text }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } }), { status: 200 });
  }
  throw new Error(`unexpected request ${url}`);
};

blobs.set(`jobs/${JOB}.json`, JSON.stringify({ id: JOB, status: 'done', filename: 'demo.mp4', companyName: 'TrustYou', createdAt: '2026-11-01T00:00:00Z', duration: 600 }));
blobs.set(`transcripts/${JOB}.json`, JSON.stringify({ duration: 600, turns: [{ s: 'A', start: 105000, end: 110000, text: 'This is the unified inbox.' }], words: [[105000, 105400, 'This', 'A']], speakers: ['A'] }));
const project = {
  id: 'p1p1p1p1', company: 'trustyou', companyName: 'TrustYou', name: 'TrustYou YouTube video',
  items: { dossier: { status: 'approved', url: `https://docs.google.com/document/d/${DOC}/edit` }, assets: { status: 'approved', files: [] }, video: { status: 'approved', jobId: JOB } },
  internal: { completedAt: '2026-11-19T00:00:00Z', htr: { name: 'TrustYou Customer Experience Platform (CXP)' }, fields: { ratings: 'HT Score: 97.78\n623 verified reviews from 293 hotels', caseStudies: '• ST Hotels Malta' } },
};

const S = await import('../lib/script.js');
const { default: PROMPTS } = await import('../lib/script-prompts.js');
const admin = { role: 'admin', email: 'jordan@hoteltechreport.com', name: 'jordan' };
const client = { role: 'client', email: 'ana@trustyou.com', name: 'Ana Client' };
const textOf = (m) => (typeof m.content === 'string' ? m.content : m.content[0].text);

test('the standards come from the prompt document, with the one rule that caused bloat replaced', async () => {
  const { STANDARDS, STEPS } = await import('../lib/script-pipeline.js');
  assert.match(STANDARDS, /^# \*\*Hotel Tech Report YouTube Script: Editorial & Writing Standards\*\*/);
  assert.match(STANDARDS, /Never invent statistics, customer results, product capabilities, integrations, prices, quotes/);
  assert.doesNotMatch(STANDARDS, /Do not sacrifice useful information simply to make the script shorter/);
  assert.match(STANDARDS, /Prioritize proprietary HotelTechReport research[\s\S]*A script that explains a few things well/);
  assert.match(PROMPTS.revisions, /\*\*A\. IMPLEMENT — Straightforward improvements\*\*/);
  assert.deepEqual(STEPS.map((x) => x.key), ['plan', 's1', 's2', 's3', 's4', 's5', 's6', 's7', 'assemble', 'edit', 'evaluate', 'revise']);
});

test('refuses to start before the internal dossier is complete', async () => {
  await assert.rejects(S.startScript({ ...project, internal: { fields: {} } }), /internal dossier complete/);
});

test('plans first, writes each section to a budget, then scores independently and revises', async () => {
  const s0 = await S.startScript(project, { who: admin });
  assert.equal(s0.website, 'https://www.trustyou.com', 'website guessed from the dossier, skipping video links');
  assert.equal(s0.reviewCount, '623');
  assert.equal(s0.steps.length, 12);
  let s = s0;
  for (let i = 0; i < 12; i++) s = await S.runNextStep(project);
  assert.equal(s.status, 'done');
  assert.equal(ai.calls.length, 12, 'one request per step, never one shot');
  const last = (i) => ai.calls[i].messages.at(-1).content;

  // Step 1 is the plan, sent with the standards and research in one opening message.
  const first = ai.calls[0].messages[0].content;
  assert.equal(ai.calls[0].messages.length, 1);
  assert.match(first, /^Analyze the dossier input as a hotel tech analyst[\s\S]*Editorial & Writing Standards/);
  assert.match(first, /Vendor dossier[\s\S]*TrustYou vendor application/);
  assert.match(first, /HTR internal dossier[\s\S]*623 verified reviews from 293 hotels/);
  assert.match(first, /Demo video transcript[\s\S]*This is the unified inbox\./);
  assert.match(first, /EDITORIAL PLAN\. Do not write any script yet\./);
  assert.match(first, /Write three candidates[\s\S]*a customer story may open the script only if it is the same customer told in the case study/);
  assert.match(first, /Organize it into 3 to 5 cohesive, buyer-relevant operational workflows/);
  assert.match(first, /- Feature walkthrough: 300 to 350 spoken words/);
  assert.equal(ai.calls[0].reasoning_effort, 'high', 'planning gets more thinking time');

  // Sections 2 to 8 continue that one conversation, each carrying everything before it.
  for (let i = 1; i <= 9; i++) {
    assert.equal(ai.calls[i].messages.length, 2 * i + 1);
    assert.equal(ai.calls[i].messages[0].content, first);
    assert.equal(ai.calls[i].messages[1].content, 'answer 1', 'the plan is in front of every section');
    assert.equal(ai.calls[i].reasoning_effort, undefined);
  }
  assert.match(last(1), /^Write the HOOK AND INTRO[\s\S]*Hi, I’m Ariana from HotelTechReport\.com, where we help hoteliers like you future-proof/);
  assert.match(last(1), /what 623 verified reviews and industry experts say/);
  assert.match(last(1), /Length: 100 to 140 spoken words/);
  assert.doesNotMatch(last(1), /deep dive/);
  assert.match(last(2), /Reviews, surveys and AI replies in one inbox\./, 'website text handed over');
  assert.doesNotMatch(last(2), /x\{\}/, 'styles stripped');
  assert.match(last(3), /^Write the FEATURE WALKTHROUGH[\s\S]*timestamps are editing references, not the narrative structure[\s\S]*Write exactly the workflows selected in the plan[\s\S]*Length: 300 to 350 spoken words/);
  assert.match(last(7), /which buyers should shortlist the product[\s\S]*which buyers may prefer another or narrower solution[\s\S]*what to verify before purchasing[\s\S]*protected closing call to action[\s\S]*no rhetorical question/);
  assert.match(last(8), /^Assemble the seven sections[\s\S]*\[HOOK AND INTRO\]  \[PLATFORM OVERVIEW\]/);
  assert.match(last(9), /^Edit the assembled script[\s\S]*Everything between the headings is spoken by Ariana[\s\S]*Spoken: /);

  // The evaluator gets a conversation of its own: the script, the research and the app's word counts, not the drafting.
  const ev = ai.calls[10];
  assert.equal(ev.messages.length, 1);
  assert.equal(ev.reasoning_effort, 'high');
  assert.match(ev.messages[0].content, /You did not write this script\. Score it and report findings\. Do not rewrite it\./);
  assert.match(ev.messages[0].content, /- Feature walkthrough: 25/);
  assert.match(ev.messages[0].content, /- Feature walkthrough: 5\d\d words \[budget 300 to 350\] OVER BUDGET, 3 timestamped passages/);
  assert.doesNotMatch(ev.messages[0].content, /answer 4/, 'no drafting leaks into the evaluation');
  assert.match(ev.messages[0].content, /TrustYou vendor application/);

  // The reviser sees the evaluation and the plan, and returns the script plus editor directions.
  const rv = ai.calls[11].messages[0].content;
  assert.equal(ai.calls[11].messages.length, 1);
  assert.match(rv, /Leave the passages under KEEP[\s\S]*# INDEPENDENT EVALUATION\s+SCORES[\s\S]*TOTAL: 82\/100/);
  assert.match(rv, /# EDITORIAL PLAN THE SCRIPT WAS WRITTEN TO\s+answer 1/);
  assert.match(rv, /Title card: TrustYou reviewed[\s\S]*DIAGRAM PROMPT \(not spoken\): hub and spokes\./);

  assert.equal(s.versions.length, 1);
  const v = s.versions[0];
  assert.equal(v.text, SCRIPT_V1, 'only the script itself is kept');
  assert.match(v.editorNotes, /Unified inbox \| Show: inbox list/);
  assert.equal(v.draftScore, 82);
  const view = S.forAdmin(s);
  assert.equal(view.materials, undefined);
  assert.deepEqual(view.analysis.sections.map((x) => x.label), ['Hook and intro', 'Platform overview', 'Feature walkthrough', 'Case study', 'Real-world feedback', 'Fit and pricing', 'Verdict and CTA']);
  const walk = view.analysis.sections[2];
  assert.equal(walk.words, 308, 'timestamps are not counted as spoken words');
  assert.equal(walk.over, false);
  assert.equal(v.draft.sections[2].over, true, 'the draft was over budget before the fixes');
  assert.deepEqual(view.checks, []);
  assert.equal(JSON.stringify(S.forClient({ ...s, shared: { version: 1, at: 'x' } })).includes('Unified inbox | Show'), false, 'editor directions never reach the client');
});

test('the app checks length, ruled-out phrases, review counts and the ending itself', () => {
  const bad = `[HOOK AND INTRO]\n\nIn this video we take a deep dive \u2014 ${body(60)}\n\n[FEATURE WALKTHROUGH]\n\n${Array.from({ length: 7 }, (_, i) => `🕒 [0${i}:00] ${body(100)}`).join('\n\n')}\n\n[REAL-WORLD FEEDBACK]\n\nWe read 1,000+ reviews. ${body(50)}\n\n[VERDICT AND CTA]\n\nSo is it right for you?`;
  const found = S.checks(bad, { reviewCount: '623' }).join(' | ');
  assert.match(found, /Missing section: Platform overview, Case study, Fit and pricing/);
  assert.match(found, /Feature walkthrough runs 700 words against a budget of 300 to 350/);
  assert.match(found, /The walkthrough has 7 timestamped passages; the target is 3 to 5/);
  assert.match(found, /"deep dive"/);
  assert.match(found, /em dash/);
  assert.match(found, /Review count should read 623 everywhere; the script also says 1,000/);
  assert.match(found, /ends on a question/);
  assert.equal(S.analyze(bad).runtime, '5:55');
});

test('V3: the app restores the Ariana line and flags vendor CTAs, missing MUST KEEP evidence and a one-sided close', () => {
  const plan = 'MUST KEEP:\n- ROI rating 4.4/5\n- Onboarding 4.5/5\n- 94% would recommend\n- Narrower tools may suit review-reply-only buyers\n\n2. BUYER AND ANGLE\nGroups.';
  assert.deepEqual(S.mustKeep(plan), ['ROI rating 4.4/5', 'Onboarding 4.5/5', '94% would recommend', 'Narrower tools may suit review-reply-only buyers']);
  const v2 = "[HOOK AND INTRO]\n\nHi, I’m Ariana from HotelTechReport.com.\n\n[FIT AND PRICING]\n\nAsk TrustYou for a price quote.\n\n[VERDICT AND CTA]\n\nOn HotelTechReport, read verified reviews, check integrations and compare alternatives. 94% recommend it.";
  const found = S.checks(v2, { product: 'TrustYou CXP', steps: [{ key: 'plan', output: plan }] }).join(' | ');
  assert.match(found, /Ariana introduction is missing or reworded/);
  assert.match(found, /Sends viewers to the vendor for pricing[\s\S]*Ask TrustYou for a price quote/);
  assert.match(found, /closing call to action leaves out: pricing/);
  assert.match(found, /MUST KEEP is missing: "ROI rating 4\.4\/5"; "Onboarding 4\.5\/5"\./);
  assert.doesNotMatch(found, /94%/);
  assert.match(found, /Verdict and CTA is under budget/);
  assert.match(S.repairProtected(v2), /Hi, I’m Ariana from HotelTechReport\.com, where we help hoteliers like you future-proof your operations by finding the best tech tools to run and grow your businesses\.\n/);
});

test('V3: the evaluator is given the MUST KEEP list and the protected lines', async () => {
  const { STEPS, STANDARDS } = await import('../lib/script-pipeline.js');
  const ev = STEPS.find((x) => x.key === 'evaluate').prompt({ product: 'P', materials: 'M' }, { script: 'S', counts: 'C', mustKeep: '- ROI 4.4/5' });
  assert.match(ev, /MUST KEEP items from the editorial plan:\n- ROI 4\.4\/5/);
  assert.match(ev, /future-proof your operations/);
  assert.match(ev, /who may prefer another solution/);
  const plan = STEPS[0].prompt({ product: 'P', materials: 'M' });
  assert.match(plan, /P1 proprietary HotelTechReport research[\s\S]*MUST KEEP:/);
  assert.match(plan, /a statistic alone is not a hook/i);
  assert.match(STANDARDS, /remove in this order: repetition/);
  const edit = STEPS.find((x) => x.key === 'edit').prompt({});
  assert.match(edit, /Three to five moments of expert interpretation[\s\S]*never claim hands-on testing/);
  assert.doesNotMatch(edit, /no section may get longer/);
});

test('V4: one shared priority order, timestamps as references, no third-person narration', async () => {
  const { STEPS } = await import('../lib/script-pipeline.js');
  const s = { product: 'TrustYou Customer Experience Platform (CXP)', materials: 'M', reviewCount: '623' };
  const ctx = { script: 'S', counts: 'C', mustKeep: '- x', checks: '- Third-person narration of the demo', plan: 'P', evaluation: 'E', extras: 'X' };
  const p = Object.fromEntries(STEPS.map((x) => [x.key, x.prompt(s, ctx)]));
  for (const k of ['plan', 'evaluate', 'revise']) assert.match(p[k], /PRIORITY ORDER[\s\S]*1\. Factual accuracy[\s\S]*7\. Secondary feature coverage/, k);
  for (const k of ['plan', 'edit', 'revise']) assert.match(p[k], /Never "the presenter opens"/, k);
  assert.match(p.plan, /Demo timestamps are source references for the editor, never the structure/);
  assert.match(p.s3, /Do not create a separate spoken passage because timestamps differ/);
  assert.doesNotMatch(p.s3, /around what the viewer sees at that timestamp/, 'the line that fragmented V3 is gone');
  assert.match(p.evaluate, /never ask for more timestamps or for modules to be separated/);
  assert.match(p.evaluate, /The app has already run these checks[\s\S]*- Third-person narration of the demo/);
  assert.match(p.revise, /Fix only the sections those findings name; copy every other section word for word/);
  assert.match(p.revise, /Source timestamps:/, 'supporting timestamps go to the editor notes');
  assert.match(p.s1, /the hotelier's problem first/);
  assert.match(p.plan, /"X reports that\.\.\." and "Its case study shows\.\.\." are not openings/);
  assert.match(p.s6, /request a price quote for TrustYou Customer Experience Platform on HotelTechReport/, 'no parenthetical in spoken names');
  assert.match(p.s7, /On HotelTechReport, you can read verified reviews, check integrations, compare alternatives and request pricing\./);
});

test('V4: the app catches the V3 regressions and restores a dropped closing CTA', () => {
  const walk = '[FEATURE WALKTHROUGH]\n\nInto the product.\n\n🕒 [12:28] The presenter opens the negative reviews behind that topic. ' + body(60) + '\n\n🕒 [30:17] For broader analysis, the presenter switches to Ask TrustYou.\n\n🕒 [35:35] Report Builder starts a report from a prompt.\n\n🕒 [20:27] The demo shows survey configuration rather than that connection running. ' + body(60);
  const text = `[HOOK AND INTRO]\n\nx\n\n${walk}\n\n[VERDICT AND CTA]\n\nShortlist it for groups.`;
  const found = S.checks(text, {}).join(' | ');
  assert.match(found, /Third-person narration of the demo: "The presenter opens[\s\S]*"the presenter switches/);
  assert.doesNotMatch(found, /The demo shows survey/, 'factual notes about the demo are allowed');
  assert.match(found, /2 walkthrough passages are under 45 words/);
  assert.match(S.repairProtected(text), /Shortlist it for groups\.\n\nOn HotelTechReport, you can read verified reviews, check integrations, compare alternatives and request pricing\.$/);
});

test('starting over keeps the old run in the archive', async () => {
  const p9 = { ...project, id: 'p9p9p9p9' };
  await S.startScript(p9, { who: admin });
  await S.runNextStep(p9);
  await S.removeScript(p9.id);
  assert.equal(await S.getScript(p9.id), null);
  const kept = [...blobs.keys()].filter((k) => k.startsWith('scripts-archive/p9p9p9p9/'));
  assert.equal(kept.length, 1);
  assert.equal(JSON.parse(blobs.get(kept[0])).steps[0].output, 'answer 13');
});

test('regenerate archives the run, keeps the website, and refuses while the client can see it', async () => {
  const p7 = { ...project, id: 'p7p7p7p7' };
  await S.startScript(p7, { website: 'https://www.trustyou.com/reviews', who: admin });
  for (let i = 0; i < 12; i++) await S.runNextStep(p7);
  await S.share(p7, admin);
  await assert.rejects(S.regenerateScript(p7, { who: admin }), /Hide from client first/);
  await S.unshare(p7);
  const fresh = await S.regenerateScript(p7, { who: admin });
  assert.equal(fresh.website, 'https://www.trustyou.com/reviews', 'same website as last time');
  assert.equal(fresh.versions.length, 0);
  assert.equal(fresh.steps.every((x) => x.status === 'pending'), true);
  assert.equal(fresh.previous.draftScore, 82);
  assert.ok(fresh.previous.words > 1000);
  assert.equal([...blobs.keys()].filter((k) => k.startsWith('scripts-archive/p7p7p7p7/')).length, 1, 'old run archived');
  for (let i = 0; i < 12; i++) await S.runNextStep(p7);
  assert.equal((await S.getScript(p7.id)).versions.length, 1);
});

test('a failed step is kept as stopped and can be continued', async () => {
  blobs.delete('scripts/p2p2p2p2.json');
  const p2 = { ...project, id: 'p2p2p2p2' };
  await S.startScript(p2, { who: admin });
  await S.runNextStep(p2);
  ai.reply = () => '';
  await assert.rejects(S.runNextStep(p2), /empty answer/);
  let s = await S.getScript(p2.id);
  assert.equal(s.steps[1].status, 'error');
  assert.equal(s.running, null);
  ai.reply = null;
  s = await S.runNextStep(p2);
  assert.equal(s.steps[1].status, 'done');
});

test('the client sees nothing until an admin approves', async () => {
  assert.equal(S.forClient(await S.getScript(project.id)), null);
  await assert.rejects(S.addComment(project, client, { para: 0, text: 'hi' }), /not available/);
  const { script, first } = await S.share(project, admin);
  assert.equal(first, true);
  const c = S.forClient(script);
  assert.equal(c.text, SCRIPT_V1);
  assert.deepEqual(Object.keys(c).sort(), ['approvedAt', 'comments', 'product', 'sharedAt', 'submittedAt', 'text', 'version']);
});

test('an admin edit is a new version the client does not see until it is shared', async () => {
  const s = await S.saveEdit(project, SCRIPT_V1.replace('Title line', 'Sharper title line'), admin);
  assert.equal(s.versions.length, 2);
  assert.equal(S.forClient(s).version, 1);
  const again = await S.share(project, admin);
  assert.equal(again.first, false);
  assert.equal(S.forClient(again.script).version, 2);
});

test('implement revisions: everything is drafted or held, and nothing reaches the client until an admin approves', async () => {
  await S.addComment(project, client, { para: 13, quote: '99 euros', text: 'Pricing is now 119 euros a month.' });
  await S.addComment(project, client, { para: null, text: 'Please remove the part about sync delays.' });
  const { count } = await S.clientSubmit(project, client);
  assert.equal(count, 2);
  await assert.rejects(S.clientApprove(project, client), /comments we have not answered/);
  const [c1, c2] = (await S.getScript(project.id)).comments;
  const v2 = (await S.getScript(project.id)).versions[1].text;
  const v3 = v2.replace('99 euros', '119 euros');
  let sent;
  ai.reply = (prompt) => {
    sent = prompt;
    return `===SCRIPT START===\n${v3}\n===SCRIPT END===\n===DECISIONS START===\n${JSON.stringify([
      { id: c1.id, category: 'A', change: 'Updated the price.', reply: 'Updated to 119 euros a month.' },
      { id: c2.id, category: 'B', recommendation: 'Keep it: reviewers raise it repeatedly.', proposed_reply: 'We kept this because it reflects verified reviews.' },
    ])}\n===DECISIONS END===`;
  };
  const r = await S.implementRevisions(project);
  assert.ok(sent.startsWith(PROMPTS.revisions), 'the client revisions prompt leads');
  assert.match(sent, /\[P14\] Pricing starts at 99 euros a month\./);
  assert.match(sent, /"highlighted_text": "99 euros"/);
  assert.deepEqual([r.implemented, r.held, r.changed], [1, 1, true]);
  assert.equal(r.script.versions.length, 3);
  assert.equal(r.script.comments[0].status, 'drafted');
  assert.equal(r.script.comments[1].status, 'needs-decision');

  // The client still sees the old version, with no reply and no hint of our notes.
  let seen = S.forClient(r.script);
  assert.equal(seen.version, 2);
  assert.doesNotMatch(seen.text, /119 euros/);
  assert.deepEqual(seen.comments.map((c) => [c.status, c.reply]), [['open', null], ['open', null]]);
  const leaked = JSON.stringify(seen);
  assert.equal(/119 euros a month\.|reviewers raise it|Updated the price/.test(leaked.replace('Pricing is now 119 euros a month.', '')), false);
  await assert.rejects(S.clientApprove(project, client), /comments we have not answered/);

  // The admin rewords the drafted reply, then approves: script and reply go out together.
  await S.editDraftReply(project, c1.id, 'Done: the price now reads 119 euros a month.');
  const shared = await S.share(project, admin);
  assert.equal(shared.released, 1);
  seen = S.forClient(shared.script);
  assert.equal(seen.version, 3);
  assert.match(seen.text, /119 euros/);
  assert.deepEqual([seen.comments[0].status, seen.comments[0].reply], ['implemented', 'Done: the price now reads 119 euros a month.']);
  assert.deepEqual([seen.comments[1].status, seen.comments[1].reply], ['open', null], 'the held request still reads as waiting');
  await assert.rejects(S.editDraftReply(project, c1.id, 'too late'), /already been sent/);

  const s = await S.replyToComment(project, admin, c2.id, 'We kept this because it reflects verified reviews.');
  assert.equal(S.forClient(s).comments[1].status, 'declined');
  assert.equal(S.forClient(s).comments[1].reply, 'We kept this because it reflects verified reviews.');
  assert.equal(s.versions.length, 3, 'replying does not change the script');

  const done = await S.clientApprove(project, client);
  assert.equal(S.forClient(done).approvedAt !== null, true);
  await assert.rejects(S.addComment(project, client, { para: 0, text: 'late' }), /already approved/);
  ai.reply = null;
});

test('an unreadable AI answer changes nothing', async () => {
  const p3 = { ...project, id: 'p3p3p3p3' };
  await S.startScript(p3, { who: admin });
  for (let i = 0; i < 12; i++) await S.runNextStep(p3);
  await S.share(p3, admin);
  await S.addComment(p3, client, { para: 0, text: 'Change the title.' });
  ai.reply = () => 'Sure, done!';
  await assert.rejects(S.implementRevisions(p3), /expected form/);
  const s = await S.getScript(p3.id);
  assert.equal(s.versions.length, 1);
  assert.equal(s.comments[0].status, 'open');
  assert.equal(s.running, null);
  ai.reply = null;
});
