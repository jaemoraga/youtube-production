// Runs the real job pipeline (lib/jobs.js, lib/store.js, lib/assemblyai.js) against an in-memory
// stand-in for Vercel Blob and a fake AssemblyAI API, checking every request the app makes.
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

process.env.ASSEMBLYAI_API_KEY = 'aai-test-key';
process.env.ADMIN_PASSWORD = 'correct horse battery';
process.env.APP_SECRET = 'x'.repeat(32);
process.env.VERCEL_ENV = 'production';
process.env.VERCEL_PROJECT_PRODUCTION_URL = 'transcribe.example.com';

const blobs = new Map();
const deleted = [];
mock.module('@vercel/blob', {
  namedExports: {
    head: async (p) => (blobs.has(p) ? { size: blobs.get(p).length, pathname: p } : null),
    issueSignedToken: async (o) => ({ delegationToken: 'd', clientSigningToken: 'c', ...o }),
    presignUrl: async (tok, o) => {
      assert.equal(o.operation, 'get'); assert.equal(o.access, 'private');
      assert.ok(o.validUntil - Date.now() > 11 * 3600e3, 'link lasts at least ~12h');
      return { presignedUrl: `https://store.private.blob.vercel-storage.com/${o.pathname}?sig=1` };
    },
    get: async (p, o) => {
      assert.equal(o.access, 'private');
      return blobs.has(p) ? { statusCode: 200, stream: new Response(blobs.get(p)).body } : null;
    },
    put: async (p, body, o) => { assert.equal(o.access, 'private'); blobs.set(p, body); return { pathname: p }; },
    del: async (p) => { deleted.push(p); blobs.delete(p); },
    list: async ({ prefix }) => ({ blobs: [...blobs.keys()].filter((k) => k.startsWith(prefix)).map((pathname) => ({ pathname })), hasMore: false }),
  },
});

const aai = { submitted: [], deleted: [], status: 'processing', failSubmit: false };
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  assert.ok(url.startsWith('https://api.assemblyai.com/v2/'), url);
  assert.equal(init.headers.authorization, 'aai-test-key');
  const json = (o, status = 200) => new Response(JSON.stringify(o), { status });
  if (url.endsWith('/transcript') && init.method === 'POST') {
    if (aai.failSubmit) return json({ error: 'Invalid audio_url' }, 400);
    aai.submitted.push(JSON.parse(init.body));
    return json({ id: `tr_${aai.submitted.length}`, status: 'queued' });
  }
  const id = url.split('/').pop();
  if (init.method === 'DELETE') { aai.deleted.push(id); return json({ id }); }
  if (aai.status === 'completed') {
    return json({ id, status: 'completed', audio_duration: 5400, language_code: 'en', text: 'Hi there.',
      utterances: [{ speaker: 'A', start: 0, end: 900, text: 'Hi there.' }],
      words: [{ text: 'Hi', start: 0, end: 300, speaker: 'A' }, { text: 'there.', start: 300, end: 900, speaker: 'A' }] });
  }
  if (aai.status === 'error') return json({ id, status: 'error', error: 'Audio file could not be decoded' });
  return json({ id, status: aai.status });
};

const { createJob, syncJob, retryJob, jobIdFor } = await import('../lib/jobs.js');
const { getJob, readJSON, listJobs } = await import('../lib/store.js');
const request = new Request('https://transcribe.example.com/api/jobs', { method: 'POST' });
const company = { slug: 'acme', name: 'Acme Hotels', keyterms: ['Acme PMS', 'duetto'] };

test('happy path: upload -> submit -> complete -> video kept, remote copy deleted', async () => {
  const pathname = 'uploads/acme/interview-abc123.mp4';
  blobs.set(pathname, 'video-bytes');
  const job = await createJob({ request, company, pathname, filename: 'Interview.mp4', source: 'client', extraTerms: ['Duetto'] });

  assert.equal(job.status, 'processing');
  assert.equal(job.id, jobIdFor(pathname));
  const sent = aai.submitted[0];
  assert.match(sent.audio_url, /^https:\/\/store\.private\.blob\.vercel-storage\.com\/uploads\/acme\/interview-abc123\.mp4\?sig=1$/);
  assert.deepEqual(sent.keyterms_prompt, ['Hotel Tech Report', 'HotelTechAwards', 'Acme PMS', 'duetto']); // 'Duetto' de-duplicated
  assert.equal(sent.webhook_url, `https://transcribe.example.com/api/webhook?job=${job.id}`);
  assert.equal(sent.webhook_auth_header_name, 'x-htr-webhook');
  assert.equal(sent.speaker_labels, true);

  const again = await createJob({ request, company, pathname, filename: 'Interview.mp4', source: 'client' });
  assert.equal(aai.submitted.length, 1, 'same upload submitted twice is not re-transcribed');
  assert.equal(again.id, job.id);

  await syncJob(job);
  assert.equal((await getJob(job.id)).status, 'processing', 'still processing: nothing changes');

  aai.status = 'completed';
  const done = await syncJob(await getJob(job.id));
  assert.equal(done.status, 'done');
  assert.equal(done.duration, 5400);
  assert.equal(done.costEstimate, 0.42); // 1.5 h x (0.21 + 0.02 + 0.05)
  const saved = await readJSON(`transcripts/${job.id}.json`);
  assert.deepEqual(saved.words, [[0, 300, 'Hi', 0], [300, 900, 'there.', 0]]);
  assert.ok(blobs.has(pathname) && !deleted.includes(pathname), 'video kept for the editor link');
  assert.deepEqual(aai.deleted, ['tr_1'], 'remote transcript deleted after our copy was saved');

  await syncJob(done); // a late webhook after completion does nothing
  assert.deepEqual(aai.deleted, ['tr_1']);
  assert.equal((await listJobs()).length, 1);
});

test('failed transcription keeps the video so Retry works', async () => {
  aai.status = 'error';
  const pathname = 'uploads/acme/bad-xyz.mov';
  blobs.set(pathname, 'v');
  let job = await createJob({ request, company, pathname, filename: 'bad.mov', source: 'admin' });
  job = await syncJob(job);
  assert.equal(job.status, 'error');
  assert.match(job.error, /could not be decoded/);
  assert.ok(blobs.has(pathname), 'video kept for retry');

  aai.status = 'processing';
  job = await retryJob(job, request);
  assert.equal(job.status, 'processing');
  assert.equal(aai.submitted.length, 3);
});

test('a rejected submit is recorded as an error, not lost', async () => {
  aai.failSubmit = true;
  const pathname = 'uploads/acme/x-1.mp3';
  blobs.set(pathname, 'v');
  const job = await createJob({ request, company, pathname, filename: 'x.mp3', source: 'admin' });
  assert.equal(job.status, 'error');
  assert.match(job.error, /Invalid audio_url/);
  aai.failSubmit = false;
});

test('missing upload is refused', async () => {
  await assert.rejects(createJob({ request, company, pathname: 'uploads/acme/nope.mp4', filename: 'nope.mp4', source: 'client' }), /Upload not found/);
});

test('editor link redirects to a fresh signed video URL and rejects unknown tokens', async () => {
  const { GET } = await import('../app/v/[token]/route.js');
  const pathname = 'uploads/acme/editor-1.mp4';
  blobs.set(pathname, 'v');
  aai.status = 'processing';
  const job = await createJob({ request, company, pathname, filename: 'editor.mp4', source: 'admin' });
  job.shareToken = 'TOKEN_abcdefghijklmnopqrstu';
  const { saveJob, writeJSON } = await import('../lib/store.js');
  await saveJob(job);
  await writeJSON(`shares/${job.shareToken}.json`, { id: job.id });
  const ok = await GET(new Request('https://x/v/t'), { params: Promise.resolve({ token: job.shareToken }) });
  assert.equal(ok.status, 302);
  assert.match(ok.headers.get('location'), /editor-1\.mp4\?sig=1$/);
  const bad = await GET(new Request('https://x/v/t'), { params: Promise.resolve({ token: 'nope_nope_nope_nope_nope_1' }) });
  assert.equal(bad.status, 404);
});
