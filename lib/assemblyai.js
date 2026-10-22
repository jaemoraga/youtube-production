import { ASSEMBLYAI_API_KEY, DISFLUENCIES, SPEECH_MODELS } from './config.js';

const API = 'https://api.assemblyai.com/v2';

async function call(path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { authorization: ASSEMBLYAI_API_KEY, 'content-type': 'application/json', ...(init.headers || {}) },
    cache: 'no-store',
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || `Transcription service returned HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return body;
}

// AssemblyAI rules: up to 6 words per term; Universal-2 (the fallback model) takes at most 200 terms.
export function cleanKeyterms(terms) {
  const seen = new Set();
  const out = [];
  for (const raw of terms) {
    const t = String(raw).replace(/\s+/g, ' ').trim();
    if (!t || t.split(' ').length > 6 || t.length > 100 || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
    if (out.length === 200) break;
  }
  return out;
}

export function transcriptRequest({ audioUrl, keyterms, webhookUrl, webhookSecret }) {
  const body = {
    audio_url: audioUrl,
    speech_models: SPEECH_MODELS,
    speaker_labels: true,
    punctuate: true,
    format_text: true,
    disfluencies: DISFLUENCIES,
  };
  if (keyterms.length) body.keyterms_prompt = keyterms;
  if (webhookUrl) {
    body.webhook_url = webhookUrl;
    body.webhook_auth_header_name = 'x-htr-webhook';
    body.webhook_auth_header_value = webhookSecret;
  }
  return body;
}

export const submitTranscript = (args) =>
  call('/transcript', { method: 'POST', body: JSON.stringify(transcriptRequest(args)) });

export const getTranscript = (id) => call(`/transcript/${encodeURIComponent(id)}`);

export async function deleteTranscript(id) {
  try { await call(`/transcript/${encodeURIComponent(id)}`, { method: 'DELETE' }); } catch { /* best effort */ }
}

// Keep only what the app needs: words with real timings and speakers, plus speaker turns.
export function compactTranscript(t) {
  const speakers = [];
  const idx = (s) => { const k = s || '?'; if (!speakers.includes(k)) speakers.push(k); return speakers.indexOf(k); };
  return {
    duration: t.audio_duration || 0,
    language: t.language_code || null,
    model: t.speech_model_used || t.speech_model || null,
    text: t.text || '',
    turns: (t.utterances || []).map((u) => ({ s: u.speaker, start: u.start, end: u.end, text: u.text })),
    speakers,
    words: (t.words || []).map((w) => [w.start, w.end, w.text, idx(w.speaker)]),
  };
}
