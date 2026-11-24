// Importing a script that was written outside the app.
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

process.env.APP_SECRET = 'x'.repeat(32);
const blobs = new Map();
mock.module('@vercel/blob', {
  namedExports: {
    get: async (p) => (blobs.has(p) ? { statusCode: 200, stream: new Response(blobs.get(p)).body } : null),
    put: async (p, body) => { blobs.set(p, body); return { pathname: p }; },
    del: async (p) => { blobs.delete(p); }, list: async () => ({ blobs: [], hasMore: false }),
    head: async () => null, issueSignedToken: async () => ({}), presignUrl: async () => ({}),
  },
});
const S = await import('../lib/script.js');

const md = `# **Chatlyn Review — Final YouTube Script**

## **1\\. Intro**

Imagine a guest messages your hotel on WhatsApp. ${'It keeps going with more words. '.repeat(12)}

## **3\\. Feature Walkthrough**

### **Unified Inbox & Action Levels**

Inside the shared inbox, **employees** can take over AI conversations.

## **5\\. Fit & Pricing**

Chatlyn reports pricing of approximately €2.50 to €8 per room per month.`;

test('tidyImported turns document headings into script headings and keeps the words', () => {
  const t = S.tidyImported(md);
  assert.ok(!t.includes('Final YouTube Script'), 'title line dropped');
  assert.ok(!/[#*\\]/.test(t), 'no markdown left');
  assert.deepEqual(t.match(/^\[.+\]$/gm), ['[INTRO]', '[FEATURE WALKTHROUGH]', '[UNIFIED INBOX & ACTION LEVELS]', '[FIT & PRICING]']);
  assert.ok(t.includes('Inside the shared inbox, employees can take over AI conversations.'));
  assert.ok(t.includes('€2.50 to €8 per room per month.'));
  assert.equal(S.tidyImported(t), t, 'running it twice changes nothing');
});

test('an imported script is version 1, hidden from the client, and follows the normal review flow', async () => {
  const project = { id: 'abcdef1234567890', companyName: 'Chatlyn', items: { dossier: { status: 'todo' }, assets: { status: 'todo', files: [] }, video: { status: 'todo' } } };
  const who = { email: 'jordan@hoteltechreport.com' };
  await assert.rejects(S.importScript(project, 'too short', who), /too short/);
  const s = await S.importScript(project, md, who);
  assert.equal(s.versions.length, 1);
  assert.equal(s.versions[0].source, 'imported');
  assert.equal(s.shared, null);
  assert.equal(S.forClient(s), null, 'the client sees nothing until it is approved');
  const view = S.forAdmin(s);
  assert.deepEqual(view.checks, []);
  assert.ok(view.analysis.words > 80);
  assert.equal(view.analysis.sections.length, 4);
  await assert.rejects(S.importScript(project, md, who), /already has a script/);

  // Regenerate must refuse before it removes anything when the project cannot generate a script.
  await assert.rejects(S.regenerateScript(project, { who }), /cannot write this script yet/);
  assert.equal((await S.getScript(project.id)).versions.length, 1, 'the imported script is still there');

  const edited = await S.saveEdit(project, `${s.versions[0].text}\n\nOne more closing line for the camera.`, who);
  assert.equal(edited.versions.length, 2);
  const { script, first } = await S.share(project, who);
  assert.equal(first, true);
  assert.equal(S.forClient(script).version, 2);
});

test('HTR can fill a checklist for the client: video parts, outside steps, a contact, and no thank-you email', async () => {
  const sent = [];
  globalThis.fetch = async (url, init) => { sent.push(JSON.parse(init.body)); return new Response('{}', { status: 200 }); };
  process.env.RESEND_API_KEY = 're_test'; process.env.EMAIL_FROM = 'HTR <studio@hoteltechreport.com>';
  const { saveCompanies } = await import('../lib/store.js');
  const P = await import('../lib/projects.js');
  const { notifyEvent } = await import('../lib/notify.js');
  const U = await import('../lib/users.js');
  await saveCompanies([{ slug: 'chatlyn', name: 'Chatlyn', token: 't'.repeat(24), keyterms: [] }, { slug: 'other', name: 'Other', token: 'u'.repeat(24), keyterms: [], domains: ['other.com'] }]);
  const admin = { role: 'admin', email: 'jordan@hoteltechreport.com', name: 'jordan (Hotel Tech Report)' };
  let p = await P.createProject('chatlyn', null, admin);

  // A person added by hand: no email, and their domain now routes to this company.
  await U.addClientContact('chatlyn', { email: 'av@chatlyn.com', first: 'A', last: 'V' });
  assert.deepEqual(await U.companyContacts('chatlyn'), ['av@chatlyn.com']);
  assert.equal((await U.getMember('av@chatlyn.com')).company, 'chatlyn');
  const joined = await U.registerUser({ email: 'colleague@chatlyn.com', first: 'C', last: 'D', companyName: 'chatlyn GmbH' });
  assert.equal(joined.company, 'chatlyn', 'a colleague signing up joins the same company');
  await assert.rejects(U.addClientContact('chatlyn', { email: 'x@other.com' }), /already sign in to Other/);
  await U.addClientContact('chatlyn', { email: 'typo@chatlyn.com', first: '', last: '' });
  await U.removeClientContact('chatlyn', 'typo@chatlyn.com');
  assert.equal(await U.getUser('typo@chatlyn.com'), null);
  assert.equal(sent.length, 0);

  const step = async (a) => { const r = await P.applyAction(p, admin, a); p = r.project; await notifyEvent(p, admin, r.event, { scripting: r.scripting }); return r; };
  await step({ type: 'video.set', item: 'video', jobId: 'a'.repeat(24), filename: '1.mp4', add: true });
  await step({ type: 'video.set', item: 'video', jobId: 'b'.repeat(24), filename: '2.mp4', add: true });
  assert.deepEqual(P.videoParts(p).map((x) => x.filename), ['1.mp4', '2.mp4']);
  assert.equal(p.items.video.jobId, 'a'.repeat(24));
  await step({ type: 'video.remove', item: 'video', jobId: 'a'.repeat(24) });
  assert.deepEqual(P.videoParts(p).map((x) => x.filename), ['2.mp4']);
  assert.equal(p.items.video.jobId, 'b'.repeat(24));
  await step({ type: 'video.set', item: 'video', jobId: 'c'.repeat(24), filename: 'whole.mp4' });
  assert.deepEqual(P.videoParts(p).map((x) => x.filename), ['whole.mp4'], 'without add, the video is replaced');

  await assert.rejects(P.applyAction(p, { role: 'client' }, { type: 'external', item: 'dossier' }), /Not allowed/);
  await step({ type: 'external', item: 'dossier', note: 'Script was written before the app; materials are in Drive.' });
  await step({ type: 'external', item: 'assets', note: 'Drive folder' });
  await step({ type: 'approve', item: 'video' });
  assert.equal(P.clientDone(p), true);
  assert.equal(sent.length, 0, 'no "You\'re all set" email when HTR supplied every step');
  assert.equal(P.forRole(p, 'client').items.dossier.externalNote, undefined, 'the note is for HTR only');
  assert.equal(P.forRole(p, 'admin').items.dossier.externalNote.startsWith('Script was written'), true);

  // Undoing an outside step puts it back in the client's court.
  await step({ type: 'reopen', item: 'dossier' });
  assert.equal(p.items.dossier.status, 'todo');
  assert.equal(p.items.dossier.external, undefined);

  // From here the normal process applies: a message to the client does email the contact.
  await step({ type: 'comment', item: 'dossier', text: 'Could you send the dossier?' });
  assert.equal(sent.length, 1);
  assert.deepEqual([sent[0].to].flat().sort(), ['av@chatlyn.com', 'colleague@chatlyn.com']);
});
