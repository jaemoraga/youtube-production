// The ladder, the shot clocks and the clock's reminders, run against an in-memory store.
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

process.env.APP_SECRET = 'x'.repeat(32);
process.env.RESEND_API_KEY = 're_test';
process.env.NOTIFY_EMAILS = 'htr@example.com';
process.env.EDITOR_EMAILS = 'editor@example.com';

const blobs = new Map();
mock.module('@vercel/blob', {
  namedExports: {
    get: async (p) => (blobs.has(p) ? { statusCode: 200, stream: new Response(blobs.get(p)).body } : null),
    put: async (p, body) => { blobs.set(p, body); return { pathname: p }; },
    del: async (p) => { blobs.delete(p); },
    list: async ({ prefix }) => ({ blobs: [...blobs.keys()].filter((k) => k.startsWith(prefix)).map((pathname) => ({ pathname })), hasMore: false }),
    head: async () => null, issueSignedToken: async () => ({}), presignUrl: async () => ({}),
  },
});
const sent = [];
globalThis.fetch = async (url, init = {}) => {
  if (String(url) === 'https://api.resend.com/emails') { const b = JSON.parse(init.body); sent.push(b); return new Response(JSON.stringify({ id: `em_${sent.length}` }), { status: 200 }); }
  throw new Error(`unexpected request ${url}`);
};

const { DAY, WINDOWS, dueReminder, extendWindow, markReminder, openWindow, stageOf, windowOpen } = await import('../lib/stages.js');
const { applyAction, createProject, forRole, getProject } = await import('../lib/projects.js');
const { tick } = await import('../lib/production.js');
const { getLog, recordEmailEvent, summarize } = await import('../lib/notifications.js');
const { saveCompanies } = await import('../lib/store.js');

const admin = { role: 'admin', email: 'j@hoteltechreport.com', name: 'Jordan' };
const client = { role: 'client', email: 'c@acme.com', name: 'Cleo' };
const editor = { role: 'editor', email: null, name: 'Video editor' };
const T0 = Date.parse('2026-12-01T17:00:00Z');

test('reminders: due at each threshold once, skipped ones are folded in, extension re-arms the later ones', () => {
  const w = openWindow('script', new Date(T0));
  assert.equal(w.deadline, new Date(T0 + 7 * DAY).toISOString());
  assert.equal(dueReminder('script', w, T0 + DAY), null);                 // 6 days left: nothing
  assert.equal(dueReminder('script', w, T0 + 2.5 * DAY), 5);              // 4.5 left: the 5-day reminder
  let w2 = markReminder('script', w, 5, 'x');
  assert.equal(dueReminder('script', w2, T0 + 2.5 * DAY), null);
  assert.equal(dueReminder('script', w2, T0 + 6.5 * DAY), 1);             // cron missed day 3: only the 1-day goes out
  w2 = markReminder('script', w2, 1, 'y');
  assert.deepEqual(Object.keys(w2.reminders).sort(), ['1', '3', '5', '7']);
  assert.equal(windowOpen(w2, T0 + 8 * DAY), false);
  const w3 = extendWindow('script', w2, 4, 'j@hoteltechreport.com', 'asked nicely');
  assert.ok(Date.parse(w3.deadline) > Date.now() + 3.9 * DAY);
  assert.equal(w3.reminders['7'], w.reminders['7']);                        // the release email never repeats
  assert.equal(w3.reminders['3'], undefined);                               // 3 and 1 are armed again
  assert.equal(w3.extensions.length, 1);
  const v2 = openWindow('v2', new Date(T0));
  assert.equal(dueReminder('v2', v2, T0 + 2.6 * DAY), 0.5);
  assert.deepEqual(WINDOWS.v2.reminders, [3, 1, 0.5]);
});

test('the ladder from materials to complete, with the client never seeing the footage or the extensions', async () => {
  await saveCompanies([{ slug: 'acme', name: 'Acme', token: 't'.repeat(24), contacts: [{ email: 'c@acme.com', first: 'Cleo', last: 'A' }] }]);
  let p = await createProject('acme', null, client);
  assert.equal(stageOf(p), 'waiting');
  for (const item of ['dossier', 'assets', 'video']) ({ project: p } = await applyAction(p, admin, { type: 'external', item, note: 'by email' }));
  assert.equal(stageOf(p), 'submitted');
  ({ project: p } = await applyAction(p, admin, { type: 'script.stamp', event: 'draft', text: '1,900 words' }));
  assert.equal(stageOf(p), 'script-internal');
  assert.equal(stageOf(forRole(p, 'client')), 'script-internal');
  ({ project: p } = await applyAction(p, admin, { type: 'script.stamp', event: 'released' }));
  assert.equal(stageOf(p), 'script-client');
  assert.ok(p.script.window.deadline);
  // Too early for footage or a cut.
  await assert.rejects(applyAction(p, admin, { type: 'footage.set', url: 'https://drive.google.com/x' }), /script/i);
  const r = await applyAction(p, client, { type: 'script.stamp', event: 'requests', text: '3 comments' });
  p = r.project;
  assert.equal(r.wasStage, 'script-client'); assert.equal(r.stage, 'script-revisions');
  assert.equal(p.script.window.closedBy, 'client');
  await assert.rejects(applyAction(p, client, { type: 'script.stamp', event: 'requests' }), /closed/);
  ({ project: p } = await applyAction(p, admin, { type: 'script.stamp', event: 'locked' }));
  assert.equal(stageOf(p), 'shooting');
  ({ project: p } = await applyAction(p, editor, { type: 'footage.set', url: 'https://drive.google.com/folder' }));
  assert.equal(stageOf(p), 'editing');
  assert.equal(forRole(p, 'client').footage, undefined);
  assert.equal(forRole(p, 'editor').footage.url, 'https://drive.google.com/folder');
  await assert.rejects(applyAction(p, client, { type: 'footage.set', url: 'https://x.y' }), /allowed/);
  await assert.rejects(applyAction(p, editor, { type: 'cut.set', round: 'v2', url: 'https://f.io/a' }), /first-cut/);
  ({ project: p } = await applyAction(p, editor, { type: 'cut.set', round: 'v1', url: 'https://f.io/v1' }));
  assert.equal(stageOf(p), 'v1-client');
  assert.equal(p.v1.window.days, 7);
  ({ project: p } = await applyAction(p, admin, { type: 'window.extend', window: 'v1', days: 2, note: 'holiday' }));
  assert.equal(p.v1.window.extensions.length, 1);
  assert.equal(forRole(p, 'client').v1.window.extensions, undefined);
  assert.ok(forRole(p, 'client').v1.window.deadline);
  ({ project: p } = await applyAction(p, client, { type: 'cut.done', round: 'v1' }));
  assert.equal(stageOf(p), 'v1-revisions');
  await assert.rejects(applyAction(p, admin, { type: 'window.extend', window: 'v1', days: 2 }), /already finished/);
  ({ project: p } = await applyAction(p, admin, { type: 'cut.set', round: 'v2', url: 'https://f.io/v2' }));
  assert.equal(stageOf(p), 'v2-client');
  assert.equal(p.v2.window.days, 3);
  await assert.rejects(applyAction(p, editor, { type: 'complete' }), /allowed|final/i);
  ({ project: p } = await applyAction(p, admin, { type: 'window.close', window: 'v2' }));
  assert.equal(stageOf(p), 'final-revisions');
  ({ project: p } = await applyAction(p, editor, { type: 'complete', url: 'https://youtube.com/watch?v=1' }));
  assert.equal(stageOf(p), 'complete');
  ({ project: p } = await applyAction(p, admin, { type: 'stage.reopen', what: 'complete' }));
  assert.equal(stageOf(p), 'final-revisions');
  const types = p.log.map((e) => e.type);
  for (const t of ['script.draft', 'script.released', 'script.requests', 'script.locked', 'footage.set', 'v1.set', 'window.extended', 'v1.done', 'v2.set', 'window.closed', 'completed']) assert.ok(types.includes(t), t);
});

test('the clock sends reminders, closes expired windows, and the audit trail records it all', async () => {
  sent.length = 0;
  for (const k of [...blobs.keys()]) if (k.startsWith('projects/')) blobs.delete(k);
  let p = await createProject('acme', 'Clock test', admin);
  for (const item of ['dossier', 'assets', 'video']) ({ project: p } = await applyAction(p, admin, { type: 'external', item }));
  ({ project: p } = await applyAction(p, admin, { type: 'script.stamp', event: 'draft' }));
  ({ project: p } = await applyAction(p, admin, { type: 'script.stamp', event: 'released' }));
  const opened = Date.parse(p.script.window.openedAt);
  let r = await tick(opened + DAY);
  assert.deepEqual([r.reminders, r.closed], [0, 0]);
  r = await tick(opened + 2.5 * DAY);
  assert.equal(r.reminders, 1);
  assert.match(sent.at(-1).subject, /5 days left/);
  assert.deepEqual(sent.at(-1).tags.map((t) => t.name), ['project', 'kind']);
  r = await tick(opened + 2.6 * DAY);
  assert.equal(r.reminders, 0);                                            // not twice
  r = await tick(opened + 6.2 * DAY);
  assert.equal(r.reminders, 1);
  assert.match(sent.at(-1).subject, /Last call: 1 day left/);
  r = await tick(opened + 7.1 * DAY);
  assert.equal(r.closed, 1);
  p = await getProject(p.id);
  assert.equal(p.script.window.closedBy, 'clock');
  assert.equal(stageOf(p), 'script-revisions');
  assert.ok(sent.some((m) => /Script review closed/.test(m.subject) && m.to.includes('c@acme.com')));
  assert.ok(sent.some((m) => /Script window closed/.test(m.subject) && m.to.includes('htr@example.com')));
  r = await tick(opened + 8 * DAY);
  assert.deepEqual([r.reminders, r.closed], [0, 0]);                        // closed stays closed
  // The trail.
  const log = await getLog(p.id);
  assert.equal(log.emails.length, 3);
  assert.equal(await recordEmailEvent(p.id, log.emails[0].id, 'opened', { at: 'x' }), true);
  assert.equal(await recordEmailEvent(p.id, 'em_nope', 'opened'), false);
  const s = summarize(await getLog(p.id));
  assert.equal(s.emails.at(-1).status, 'opened');
  assert.equal(s.emails[0].status, 'sent');
});
