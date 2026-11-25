// The editing guide: matching the script to the demo recording, with every time checked against the transcript.
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

process.env.APP_SECRET = 'x'.repeat(32);
process.env.OPENAI_API_KEY = 'sk-test';
const blobs = new Map();
mock.module('@vercel/blob', {
  namedExports: {
    get: async (p) => (blobs.has(p) ? { statusCode: 200, stream: new Response(blobs.get(p)).body } : null),
    put: async (p, body) => { blobs.set(p, body); return { pathname: p }; },
    del: async (p) => { blobs.delete(p); }, list: async () => ({ blobs: [], hasMore: false }),
    head: async () => null, issueSignedToken: async () => ({}), presignUrl: async () => ({}),
  },
});
const G = await import('../lib/guide-shared.js');
const { buildGuide, editorScript, getGuide, guideStats, readiness, staleReason } = await import('../lib/guide.js');
const S = await import('../lib/script.js');
const P = await import('../lib/projects.js');
const { saveCompanies, saveJob, writeJSON, transcriptPath } = await import('../lib/store.js');

// A transcript with one word every half second: "w0 w1 ..." with a few real phrases dropped in.
function transcript(phrases, seconds = 600) {
  const words = [];
  for (let i = 0; i < seconds * 2; i++) words.push([i * 500, i * 500 + 400, `w${i}`, 0]);
  for (const [atSec, text] of phrases) text.split(' ').forEach((w, k) => { words[atSec * 2 + k][2] = w; });
  const turns = [];
  for (let s = 0; s < seconds; s += 60) {
    const slice = words.filter((w) => w[0] >= s * 1000 && w[0] < (s + 60) * 1000);
    turns.push({ s: 'A', start: slice[0][0], end: slice.at(-1)[1], text: `${slice.map((w) => w[2]).join(' ')}.` });
  }
  return { duration: seconds, speakers: ['A'], words, turns };
}

test('parseClock reads clock times and rejects anything else', () => {
  assert.equal(G.parseClock('00:06:12'), 372000);
  assert.equal(G.parseClock('6:12'), 372000);
  assert.equal(G.parseClock('1:02:03'), 3723000);
  assert.equal(G.parseClock(90), 90000);
  assert.equal(G.parseClock('around six minutes'), null);
  assert.equal(G.parseClock(''), null);
});

test('locateQuote returns the real time of the words, ignoring case and punctuation', () => {
  const t = transcript([[100, 'This is the Chatlin dashboard here'], [300, 'this is the chatlin dashboard again']]);
  assert.equal(G.locateQuote(t.words, 'this is the chatlin dashboard here'), 100000);
  assert.equal(G.locateQuote(t.words, '“This is the Chatlin dashboard,”', 290000), 300000, 'closest match to the hint wins');
  assert.equal(G.locateQuote(t.words, 'This is the Chatlin dashboard and something else never said'), 100000, 'falls back to the first words');
  assert.equal(G.locateQuote(t.words, 'words that were never spoken at all'), null);
  assert.equal(G.locateQuote(t.words, 'too short'), null);
});

const paragraphs = ['[INTRO]', 'Imagine a guest messages your hotel.', 'Hi, I am Ariana.', '[FEATURE WALKTHROUGH]', 'Inside the shared inbox, employees can take over AI conversations.', 'Pricing is per room.'];
const parts = [
  { label: 'Inbox and AI', filename: '1.mp4', duration: 600, words: transcript([[372, 'let us directly jump into our conversations tab']]).words },
  { label: '', filename: '2.mp4', duration: 300, words: transcript([[60, 'our complete guest contact base']], 300).words },
];

test('normalizeGuide builds features from clips that exist in the transcript and never invents a time', () => {
  const g = G.normalizeGuide({
    summary: 'A messaging tool for hotels.',
    glossary: [{ term: 'PMS', meaning: 'The hotel’s booking system.' }, { term: '', meaning: 'dropped' }],
    chapters: [{ part: 2, start: '00:01:00', title: 'Guest list' }, { part: 1, start: '00:00:00', title: 'Welcome', about: 'Intro' }, { part: 1, start: '00:59:00', title: 'Past the end' }, { part: 9, start: '00:00:10', title: 'No such part' }],
    features: [
      { id: 'F1', name: 'Shared inbox', about: 'One screen for all guest messages.', clips: [
        { part: 1, start: '00:06:00', end: '00:06:50', quote: 'Let us directly jump into our conversations tab', show: 'The inbox list on the left.' },
        { part: 1, start: '00:02:00', end: '00:02:30', quote: 'something nobody said in the demo', show: 'Approximate one.' },
        { part: 1, start: '00:45:00', quote: 'also never said', show: 'Past the end of the file: dropped.' },
      ] },
      { id: 'F2', name: 'Pricing page', clips: [{ part: 3, start: '00:00:10', quote: 'no such part here' }] },
      { id: 'F3', name: 'Guest list', about: 'Never used by the script.', clips: [{ part: 2, start: '00:01:00', quote: 'our complete guest contact base' }] },
      { id: 'F4', name: '', clips: [{ part: 1, start: '00:00:10', quote: 'w20 w21 w22' }] },
    ],
    script: [
      { paragraph: 1, kind: 'demo', features: ['F1'] },
      { paragraph: 2, kind: 'host', features: [] },
      { paragraph: 5, kind: 'demo', features: ['F1', 'F1', 'F9'] },
      { paragraph: 6, kind: 'demo', features: ['F2'], note: 'Not in the demo.' },
      { paragraph: 99, kind: 'demo', features: ['F1'] },
    ],
  }, { paragraphs, parts });
  assert.equal(g.format, G.GUIDE_FORMAT);
  assert.deepEqual(g.features.map((f) => [f.id, f.name, f.paragraphs]), [['f1', 'Shared inbox', [5]]], 'only features with a real clip that the script uses');
  const [inbox] = g.features;
  assert.equal(inbox.clips.length, 2);
  assert.deepEqual({ ...inbox.clips[0], show: undefined }, { part: 0, start: 372000, end: 410000, exact: true, show: undefined, quote: 'Let us directly jump into our conversations tab' });
  assert.equal(inbox.clips[1].exact, false);
  assert.equal(inbox.clips[1].start, 120000);
  assert.equal(inbox.clips[1].quote, '', 'an unfound quote is not shown as something they say');
  assert.deepEqual(g.script.map((r) => [r.paragraph, r.kind, r.features]), [[2, 'host', []], [3, 'other', []], [5, 'demo', ['f1']], [6, 'other', []]], 'one row per spoken paragraph, none for headings');
  assert.equal(g.script[1].missing, true, 'a paragraph the model skipped is shown as unmatched');
  assert.equal(g.script[3].note, 'Not in the demo.', 'a feature with no usable clip leaves its line without footage');
  assert.deepEqual(g.chapters.map((c) => c.title), ['Welcome', 'Guest list']);
  assert.equal(g.glossary.length, 1);
});

test('a quote from the middle of a paragraph puts the time on that sentence, not on the paragraph start', () => {
  const g = G.normalizeGuide({
    features: [{ id: 'A', name: 'Reporting dashboard', clips: [{ part: 1, start: '00:06:00', end: '00:06:40', quote: 'last but not least we have our report section', show: 'Reports.' }] }],
    script: [{ paragraph: 5, kind: 'demo', features: ['A'] }],
  }, { paragraphs, parts: [{ label: '', filename: '1.mp4', duration: 600, words: transcript([[381, 'last but not least we have our report section']]).words }] });
  assert.equal(g.features[0].clips[0].start, 381000, '06:21, where the words are, not the 06:00 the model gave');
});

test('transcript marks land on the paragraph that contains the clip, and the cue sheet reads as find-it / put-it', () => {
  const t = transcript([[372, 'let us directly jump into our conversations tab']]);
  const g = { format: 2, scriptVersion: 1, summary: 'A messaging tool.', glossary: [{ term: 'PMS', meaning: 'Booking system.' }], chapters: [{ part: 0, start: 360000, title: 'Conversations', about: '' }],
    features: [{ id: 'f1', name: 'Shared inbox', about: 'All messages in one place.', paragraphs: [5], clips: [{ part: 0, start: 372000, end: 410000, exact: true, show: 'The inbox list.', quote: 'let us directly jump' }] }],
    script: [{ paragraph: 5, kind: 'demo', features: ['f1'], note: '' }, { paragraph: 6, kind: 'other', features: [], note: 'Use on-screen text.' }] };
  const m = G.marksForPart(g, 0, t);
  assert.equal(m.clips.size, 1);
  const [key, list] = [...m.clips.entries()][0];
  assert.deepEqual([list[0].id, list[0].feature, list[0].name], ['clip-f1-0', 'f1', 'Shared inbox']);
  assert.equal(key.split('-')[0], '6', 'the seventh one-minute turn (06:00 to 07:00)');
  assert.equal(G.marksForPart(g, 1, t).clips.size, 0);
  assert.equal(m.chapters.size, 1);
  assert.equal(G.sectionOf(paragraphs).get(5), 'FEATURE WALKTHROUGH');
  const txt = G.guideToTxt(g, { paragraphs, parts, company: 'Chatlyn' });
  assert.match(txt, /SHARED INBOX\n {2}What it is: All messages in one place\./);
  assert.match(txt, /Find it in the demo: Part 1: Inbox and AI, at 00:06:12 \(to 00:06:50\)\. The inbox list\. They say: "let us directly jump"/);
  assert.match(txt, /Put it in the script: FEATURE WALKTHROUGH, line 5, "Inside the shared inbox, employees can take over AI conversations\."/);
  assert.match(txt, /- Line 6, "Pricing is per room\." Use on-screen text\./);
  assert.match(txt, /- PMS: Booking system\./);
});

test('building a guide: one AI call, times checked, stored, and flagged when the script or videos change', async () => {
  await saveCompanies([{ slug: 'chatlyn', name: 'Chatlyn', token: 't'.repeat(24), keyterms: [] }]);
  const admin = { role: 'admin', email: 'jordan@hoteltechreport.com', name: 'jordan' };
  let p = await P.createProject('chatlyn', null, admin);
  assert.match(await readiness(p), /no script yet/);
  await S.importScript(p, `${paragraphs.join('\n\n')}\n\n${'More closing words for the camera. '.repeat(10)}`, admin);
  assert.match(await readiness(p), /has not been uploaded/);
  const ids = ['a'.repeat(24), 'b'.repeat(24)];
  for (const [i, id] of ids.entries()) {
    p = (await P.applyAction(p, admin, { type: 'video.set', item: 'video', jobId: id, filename: `${2 - i}.mp4`, add: true })).project;
    await saveJob({ id, filename: `${2 - i}.mp4`, status: i ? 'done' : 'processing', createdAt: '2026-11-24T00:00:00Z', speakerNames: {} });
    await writeJSON(transcriptPath(id), i ? transcript([[372, 'let us directly jump into our conversations tab']]) : transcript([[60, 'our complete guest contact base']], 300));
  }
  assert.match(await readiness(p), /still being transcribed/);
  await saveJob({ id: ids[0], filename: '2.mp4', status: 'done', createdAt: '2026-11-24T00:00:00Z', speakerNames: {} });

  // The client uploaded part 2 first: put them in order and label them.
  assert.equal(P.unlabeledParts(p), 2);
  p = (await P.applyAction(p, admin, { type: 'video.update', item: 'video', jobId: ids[1], move: 'up', label: '  Inbox and AI  ' })).project;
  assert.deepEqual(P.videoParts(p).map((x) => [x.filename, x.label]), [['1.mp4', 'Inbox and AI'], ['2.mp4', '']]);
  assert.equal(p.items.video.jobId, ids[1]);
  assert.equal(P.unlabeledParts(p), 1);
  p = (await P.applyAction(p, admin, { type: 'approve', item: 'video' })).project;
  await assert.rejects(P.applyAction(p, { role: 'client' }, { type: 'video.update', item: 'video', jobId: ids[0], label: 'x' }), /Already approved/);
  p = (await P.applyAction(p, admin, { type: 'video.update', item: 'video', jobId: ids[0], label: 'Guest profiles' })).project;
  assert.equal(P.unlabeledParts(p), 0);
  assert.equal(await readiness(p), null);

  const calls = [];
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body); calls.push(body);
    const answer = { summary: 'Messaging for hotels.', glossary: [], chapters: [],
      features: [{ id: 'F1', name: 'Shared inbox', about: 'All messages.', clips: [{ part: 1, start: '00:06:05', end: '00:06:40', quote: 'let us directly jump into our conversations tab', show: 'The inbox.' }] }],
      script: [{ paragraph: 2, kind: 'host' }, { paragraph: 5, kind: 'demo', features: ['F1'] }] };
    return new Response(JSON.stringify({ choices: [{ message: { content: `Here you go:\n${JSON.stringify(answer)}` }, finish_reason: 'stop' }] }), { status: 200 });
  };
  const g = await buildGuide(p, admin);
  assert.equal(calls.length, 1);
  const sent = calls[0].messages[0].content;
  assert.ok(sent.includes('[S5] Inside the shared inbox'), 'script paragraphs are numbered for the model');
  assert.ok(sent.indexOf('PART 1 of 2: Inbox and AI') < sent.indexOf('PART 2 of 2: Guest profiles'), 'parts are sent in project order with their labels');
  assert.ok(sent.includes('[00:06:00]'), 'the demo transcript carries its timestamps');
  assert.equal(g.features[0].clips[0].start, 372000, 'placed on the real word time, not the model’s 06:05');
  assert.deepEqual(g.script.find((r) => r.paragraph === 5).features, ['f1']);
  assert.deepEqual({ ...guideStats(g), builtAt: 0 }, { builtAt: 0, scriptVersion: 1, features: 1, demo: 1, host: 1, other: 3, clips: 1, approximate: 0 });
  assert.equal((await getGuide(p.id)).scriptVersion, 1);
  assert.equal(staleReason(g, await S.getScript(p.id), p), null);
  assert.match(staleReason({ ...g, format: 1 }, await S.getScript(p.id), p), /layout has changed/, 'guides in the old layout ask to be rebuilt');

  const s2 = await S.saveEdit(p, `${(await S.getScript(p.id)).versions[0].text}\n\nOne more line.`, admin);
  assert.match(staleReason(g, s2, p), /now version 2/);
  assert.equal(editorScript(s2).n, 2);
  p = (await P.applyAction(p, admin, { type: 'video.update', item: 'video', jobId: ids[0], move: 'up' })).project;
  assert.match(staleReason({ ...g, scriptVersion: 2 }, s2, p), /demo videos changed/);

  // A guide with nothing matched is refused instead of stored.
  globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"features":[],"script":[]}' }, finish_reason: 'stop' }] }), { status: 200 });
  await assert.rejects(buildGuide(p, admin), /could not match any part/);
});

test('YouTube channel addresses are recognised and the feed is read without an API key', async () => {
  const Y = await import('../lib/youtube.js');
  assert.equal(Y.channelUrl('@chatlyn'), 'https://www.youtube.com/@chatlyn');
  assert.equal(Y.channelUrl('youtube.com/@chatlyn/videos?view=0'), 'https://www.youtube.com/@chatlyn');
  assert.equal(Y.channelUrl('https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv'), 'https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv');
  assert.equal(Y.channelUrl('https://m.youtube.com/c/Chatlyn'), 'https://www.youtube.com/c/Chatlyn');
  assert.equal(Y.channelUrl('https://www.youtube.com/watch?v=abc12345678'), null, 'a video is not a channel');
  assert.equal(Y.channelUrl('https://vimeo.com/chatlyn'), null);
  assert.equal(Y.channelUrl(''), null);

  assert.equal(await Y.resolveChannelId('https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv'), 'UCabcdefghijklmnopqrstuv');
  globalThis.fetch = async () => new Response('<html><link rel="alternate" type="application/rss+xml" href="https://www.youtube.com/feeds/videos.xml?channel_id=UC1234567890abcdefghijkl"></html>', { status: 200 });
  assert.equal(await Y.resolveChannelId('https://www.youtube.com/@chatlyn'), 'UC1234567890abcdefghijkl');
  globalThis.fetch = async () => new Response('<html>nothing here</html>', { status: 200 });
  await assert.rejects(Y.resolveChannelId('https://www.youtube.com/@nobody'), /Could not find a channel/);

  const xml = `<?xml version="1.0"?><feed><title>chatlyn</title>
    <entry><yt:videoId>abc12345678</yt:videoId><title>Phone AI &amp; guest journeys</title><published>2026-11-20T10:00:00+00:00</published><media:group><media:description>A quick   tour.</media:description></media:group></entry>
    <entry><yt:videoId>bad id!</yt:videoId><title>Dropped</title></entry>
    <entry><yt:videoId>xyz98765432</yt:videoId><title>Web chat demo</title><published>2026-10-01T10:00:00+00:00</published></entry></feed>`;
  const feed = Y.parseFeed(xml);
  assert.equal(feed.title, 'chatlyn');
  assert.deepEqual(feed.videos.map((v) => [v.id, v.title]), [['abc12345678', 'Phone AI & guest journeys'], ['xyz98765432', 'Web chat demo']]);
  assert.equal(feed.videos[0].url, 'https://www.youtube.com/watch?v=abc12345678');
  assert.equal(feed.videos[0].description, 'A quick tour.');
  globalThis.fetch = async () => new Response(xml, { status: 200 });
  assert.equal((await Y.channelFeed('UC1234567890abcdefghijkl')).videos.length, 2);
  globalThis.fetch = async () => { throw new Error('offline'); };
  assert.equal(await Y.channelFeed('UC1234567890abcdefghijkl'), null, 'a failed fetch never breaks the editor page');
  assert.equal(await Y.channelFeed('not-an-id'), null);
});
