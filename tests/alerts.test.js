import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.RESEND_API_KEY = 're_test';
process.env.NOTIFY_EMAILS = 'jordan@hoteltechreport.com';
process.env.PUBLIC_URL = 'https://studio.example';
const sent = [];
globalThis.fetch = async (url, init) => { sent.push({ url, body: JSON.parse(init.body) }); return new Response('{}', { status: 200 }); };
const { transcriptAlert } = await import('../lib/alerts.js');

const job = { id: 'j1', projectId: 'p1', companyName: 'Acme', filename: 'demo.mp4', duration: 1264 };

test('transcript ready email', async () => {
  sent.length = 0;
  await transcriptAlert({ ...job, status: 'done' }, 3000);
  const m = sent[0].body;
  assert.deepEqual(m.to, ['jordan@hoteltechreport.com']);
  assert.equal(m.subject, 'Transcript ready: Acme (21m 4s)');
  assert.match(m.text, /Words: 3,000/);
  assert.match(m.text, /https:\/\/studio\.example\/projects\/p1/);
  assert.doesNotMatch(m.text, /silent or broken/);
});

test('suspiciously short transcript says to check it', async () => {
  sent.length = 0;
  await transcriptAlert({ ...job, status: 'done' }, 200);
  assert.equal(sent[0].body.subject, 'Check transcript: Acme (21m 4s)');
  assert.match(sent[0].body.text, /about 9 words a minute.*silent or broken/s);
});

test('failed transcription email', async () => {
  sent.length = 0;
  await transcriptAlert({ ...job, status: 'error', error: 'File has no audio' });
  assert.equal(sent[0].body.subject, 'Transcription FAILED: Acme');
  assert.match(sent[0].body.text, /Reason: File has no audio/);
});

test('no email while still processing', async () => {
  sent.length = 0;
  await transcriptAlert({ ...job, status: 'processing' });
  assert.equal(sent.length, 0);
});
