// Loading a project for a client who sent materials before the app existed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { clientTookPart, projectStatus, timeline, videoParts } from '../lib/project-shared.js';

const project = (items) => ({ items: { dossier: { status: 'todo' }, assets: { status: 'todo', files: [] }, video: { status: 'todo' }, ...items } });

test('videoParts reads old single-video projects and new multi-part ones', () => {
  assert.deepEqual(videoParts(project({})), []);
  assert.deepEqual(videoParts(project({ video: { status: 'submitted', jobId: 'a', filename: 'demo.mp4' } })), [{ jobId: 'a', filename: 'demo.mp4' }]);
  const parts = [{ jobId: 'a', filename: '1.mp4' }, { jobId: 'b', filename: '2.mp4' }];
  assert.deepEqual(videoParts(project({ video: { status: 'submitted', jobId: 'a', filename: '1.mp4', parts } })), parts);
});

test('clientTookPart is false only when HTR supplied every step', () => {
  const at = '2026-11-24T00:00:00Z';
  assert.equal(clientTookPart(project({})), false);
  assert.equal(clientTookPart(project({ dossier: { status: 'approved', external: true }, assets: { status: 'approved', files: [], submittedAt: at, submittedBy: { role: 'admin' } } })), false);
  assert.equal(clientTookPart(project({ video: { status: 'approved', submittedAt: at, submittedBy: { role: 'client' } } })), true);
  // Projects from before submitters were recorded were always client submissions.
  assert.equal(clientTookPart(project({ video: { status: 'approved', submittedAt: at } })), true);
});

test('steps received outside the app count as approved', () => {
  const p = project({ dossier: { status: 'approved', external: true }, assets: { status: 'approved', files: [] }, video: { status: 'approved', external: true } });
  assert.equal(projectStatus({ ...p, internal: {} }), 'internal');
  assert.equal(projectStatus({ ...p, internal: { completedAt: 'x' } }), 'scripting');
});

test('timeline lists every video part and words admin additions honestly', () => {
  const p = { ...project({}), comments: [], log: [
    { at: '2026-11-24T01:00:00Z', type: 'submitted', item: 'video', text: '1.mp4', by: { role: 'admin', name: 'jordan' } },
    { at: '2026-11-24T02:00:00Z', type: 'external', item: 'dossier', text: 'sent by email' },
  ] };
  const jobs = [{ filename: '1.mp4', status: 'done', completedAt: '2026-11-24T03:00:00Z', durationText: '20m 1s' }, { filename: '2.mp4', status: 'error', createdAt: '2026-11-24T04:00:00Z', error: 'bad audio' }];
  const text = timeline(p, jobs).map((e) => e.text);
  assert.ok(text.includes('Video added by Hotel Tech Report (1.mp4)'));
  assert.ok(text.includes('Sponsor dossier marked as received outside the app: "sent by email"'));
  assert.ok(text.includes('Transcript ready (1.mp4, 20m 1s)'));
  assert.ok(text.includes('Transcription failed: 2.mp4, bad audio'));
  assert.equal(timeline(p, null).length, 2);
});
