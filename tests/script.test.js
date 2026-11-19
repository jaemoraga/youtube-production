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
const SCRIPT_V1 = ['Title line for the review.', 'Hi, I\'m Ariana from HotelTechReport.com.', '🕒 [01:45] The inbox pulls every review into one place.', 'Pricing starts at 99 euros a month.'].join('\n\n') + '\n\n' + 'Closing thought. '.repeat(20).trim();
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
    const text = ai.reply ? ai.reply(prompt) : /Entertainment edit|Final Assembly/.test(prompt.slice(0, 80))
      ? `Title card: X\n===SCRIPT START===\n${SCRIPT_V1}\n===SCRIPT END===\nGrade: A`
      : `answer ${ai.calls.length}`;
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

test('the prompt document is carried word for word', () => {
  assert.equal(PROMPTS.steps.length, 9);
  assert.match(PROMPTS.pre, /^# \*\*Hotel Tech Report YouTube Script: Editorial & Writing Standards\*\*/);
  assert.match(PROMPTS.steps[0].prompt, /Hi, I’m Ariana from HotelTechReport\.com, where we help hoteliers like you future-proof/);
  assert.match(PROMPTS.steps[8].prompt, /Then add a short section called “Entertainment edits made”/);
  assert.match(PROMPTS.revisions, /\*\*A\. IMPLEMENT — Straightforward improvements\*\*/);
});

test('refuses to start before the internal dossier is complete', async () => {
  await assert.rejects(S.startScript({ ...project, internal: { fields: {} } }), /internal dossier complete/);
});

test('writes the script one step at a time in a single growing conversation', async () => {
  const s0 = await S.startScript(project, { who: admin });
  assert.equal(s0.website, 'https://www.trustyou.com', 'website guessed from the dossier, skipping video links');
  assert.equal(s0.reviewCount, '623');
  assert.equal(s0.steps.length, 10);
  let s = s0;
  for (let i = 0; i < 10; i++) s = await S.runNextStep(project);
  assert.equal(s.status, 'done');
  assert.equal(ai.calls.length, 10, 'one request per step, never one shot');

  const first = textOf(ai.calls[0].messages[0]);
  assert.ok(first.startsWith(`${PROMPTS.opening}\n\n${PROMPTS.pre}`), 'opens with the pre-prompt');
  assert.match(first, /Vendor dossier[\s\S]*TrustYou vendor application/);
  assert.match(first, /HTR internal dossier[\s\S]*623 verified reviews from 293 hotels/);
  assert.match(first, /Demo video transcript[\s\S]*This is the unified inbox\./);
  assert.match(first, /Use exactly this number everywhere/);
  assert.equal(ai.calls[0].messages.length, 1);

  // Each later request repeats the whole conversation so far, then adds the next prompt.
  ai.calls.forEach((c, i) => {
    assert.equal(c.messages.length, i === 0 ? 1 : 2 * i + 1);
    assert.equal(textOf(c.messages[0]), first);
    if (i > 1 && i < 9) assert.equal(c.messages[2 * i - 1].content, `answer ${i}`, `step ${i}'s answer is carried forward`);
  });
  const p1 = textOf(ai.calls[1].messages.at(-1));
  assert.match(p1, /^Step 1: Intro Script \(Hook \+ Setup\)/);
  assert.match(p1, /everything you need to know about TrustYou Customer Experience Platform \(CXP\) to help/);
  assert.match(p1, /surveying 623\+ users/);
  const p2 = textOf(ai.calls[2].messages.at(-1));
  assert.match(p2, /Visit and analyze the SaaS company website: https:\/\/www\.trustyou\.com/);
  assert.match(p2, /Reviews, surveys and AI replies in one inbox\./, 'website text handed over');
  assert.doesNotMatch(p2, /x\{\}/, 'styles stripped');
  assert.match(textOf(ai.calls[4].messages.at(-1)), /Use the case studies in the HTR internal dossier/);
  assert.match(textOf(ai.calls[8].messages.at(-1)), /^Step 8:/);
  assert.match(textOf(ai.calls[9].messages.at(-1)), /^Step 9 \(Experimental\): Entertainment edit/);

  assert.equal(s.versions.length, 1);
  assert.equal(s.versions[0].text, SCRIPT_V1, 'only the script itself is kept, without grades or title card');
  assert.equal(S.forAdmin(s).materials, undefined);
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
  await S.addComment(project, client, { para: 3, quote: '99 euros', text: 'Pricing is now 119 euros a month.' });
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
  assert.match(sent, /\[P4\] Pricing starts at 99 euros a month\./);
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
  for (let i = 0; i < 10; i++) await S.runNextStep(p3);
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
