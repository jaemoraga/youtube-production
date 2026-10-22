import assert from 'node:assert/strict';
import test from 'node:test';
import { blocks, clock, paragraphs, srtTime, toPlain, toSrt, toTxt } from '../lib/format.js';
import { cleanKeyterms, compactTranscript, transcriptRequest } from '../lib/assemblyai.js';
import { mediaType, safeName } from '../lib/media.js';

// Shaped like AssemblyAI's completed transcript response (times in ms).
const raw = {
  audio_duration: 3725, language_code: 'en', speech_model_used: 'universal-3-5-pro',
  text: 'Welcome to the show. Thanks for having me. We use Duetto and Cloudbeds.',
  utterances: [
    { speaker: 'A', start: 1000, end: 2600, text: 'Welcome to the show.' },
    { speaker: 'B', start: 3000, end: 9800, text: 'Thanks for having me. We use Duetto and Cloudbeds.' },
  ],
  words: [
    { text: 'Welcome', start: 1000, end: 1400, speaker: 'A' }, { text: 'to', start: 1400, end: 1500, speaker: 'A' },
    { text: 'the', start: 1500, end: 1600, speaker: 'A' }, { text: 'show.', start: 1600, end: 2600, speaker: 'A' },
    { text: 'Thanks', start: 3000, end: 3300, speaker: 'B' }, { text: 'for', start: 3300, end: 3400, speaker: 'B' },
    { text: 'having', start: 3400, end: 3700, speaker: 'B' }, { text: 'me.', start: 3700, end: 3900, speaker: 'B' },
    { text: 'We', start: 6000, end: 6100, speaker: 'B' }, { text: 'use', start: 6100, end: 6300, speaker: 'B' },
    { text: 'Duetto', start: 6300, end: 6800, speaker: 'B' }, { text: 'and', start: 6800, end: 6900, speaker: 'B' },
    { text: 'Cloudbeds.', start: 6900, end: 9800, speaker: 'B' },
  ],
};
const t = compactTranscript(raw);

test('compact transcript keeps every word with its real timing and speaker', () => {
  assert.equal(t.words.length, raw.words.length);
  assert.deepEqual(t.words[4], [3000, 3300, 'Thanks', 1]);
  assert.deepEqual(t.speakers, ['A', 'B']);
  assert.equal(t.model, 'universal-3-5-pro');
});

test('words are never changed by formatting', () => {
  const plain = toPlain(t);
  const words = (s) => s.replace(/Speaker [AB]:/g, '').split(/\s+/).filter(Boolean);
  assert.deepEqual(words(plain), raw.text.split(' '));
});

test('speaker renames flow into every format', () => {
  const names = { A: 'Jordan Hollander' };
  assert.match(toTxt(t, { filename: 'x.mp4', companyName: 'Acme' }, names), /\[00:00:01\] Jordan Hollander: Welcome/);
  assert.match(toSrt(t, names), /Jordan Hollander: Welcome/);
  assert.equal(blocks(t, names)[1].speaker, 'Speaker B');
});

test('SRT cues use real word times, split at speaker change and long pauses', () => {
  const srt = toSrt(t);
  const cues = srt.trim().split('\n\n');
  assert.equal(cues.length, 3); // A; B before the 2.1 s pause; B after it
  assert.match(cues[0], /00:00:01,000 --> 00:00:02,600/);
  assert.match(cues[1], /00:00:03,000 --> 00:00:03,900\nSpeaker B: Thanks/);
  assert.match(cues[2], /00:00:06,000 --> 00:00:09,800\nWe use Duetto/); // same speaker: no repeated label
});

test('time formats', () => {
  assert.equal(clock(3725000), '01:02:05');
  assert.equal(srtTime(3725123), '01:02:05,123');
});

test('paragraphs split only between sentences', () => {
  const text = Array.from({ length: 12 }, (_, i) => `Sentence number ${i} is here.`).join(' ');
  const ps = paragraphs(text);
  assert.ok(ps.length > 1);
  assert.equal(ps.join(' '), text);
});

test('keyterms obey AssemblyAI limits', () => {
  const terms = cleanKeyterms(['Duetto', 'duetto', '  Oracle   OPERA Cloud ', 'one two three four five six seven', '', ...Array(300).fill(0).map((_, i) => `T${i}`)]);
  assert.equal(terms[0], 'Duetto');
  assert.equal(terms[1], 'Oracle OPERA Cloud');
  assert.ok(!terms.includes('duetto') && !terms.some((x) => x.split(' ').length > 6));
  assert.equal(terms.length, 200);
});

test('transcription request asks for the accurate model, speakers and the webhook secret', () => {
  const body = transcriptRequest({ audioUrl: 'https://x/y', keyterms: ['Duetto'], webhookUrl: 'https://app/api/webhook?job=1', webhookSecret: 's' });
  assert.deepEqual(body.speech_models, ['universal-3-5-pro', 'universal-2']);
  assert.equal(body.speaker_labels, true);
  assert.equal(body.punctuate, true);
  assert.deepEqual(body.keyterms_prompt, ['Duetto']);
  assert.equal(body.webhook_auth_header_name, 'x-htr-webhook');
  const noHook = transcriptRequest({ audioUrl: 'u', keyterms: [], webhookUrl: null });
  assert.ok(!('webhook_url' in noHook) && !('keyterms_prompt' in noHook));
});

test('file types and storage names', () => {
  assert.equal(mediaType('Interview.MOV'), 'video/quicktime');
  assert.equal(mediaType('notes.pdf'), null);
  assert.equal(safeName('../../etc/passwd'), '....etcpasswd');
  assert.equal(safeName('Café Interview (final).mp4'), 'Cafe-Interview-final.mp4');
});
