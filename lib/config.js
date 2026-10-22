// Server-side settings. Everything secret comes from Vercel environment variables.

export const ASSEMBLYAI_API_KEY = process.env.ASSEMBLYAI_API_KEY || '';
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
export const APP_SECRET = process.env.APP_SECRET || '';

// Terms sent as spelling hints on every transcript, comma separated (company terms are added per company).
export const DEFAULT_KEYTERMS = (process.env.DEFAULT_KEYTERMS || 'Hotel Tech Report, HotelTechAwards')
  .split(',').map((s) => s.trim()).filter(Boolean);

// true = keep "um", "uh" etc. Default false = clean transcript.
export const DISFLUENCIES = process.env.DISFLUENCIES === 'true';

// Most accurate model first; AssemblyAI falls back to the second if the first can't handle the language.
export const SPEECH_MODELS = ['universal-3-5-pro', 'universal-2'];

// AssemblyAI list prices (Oct 2026), per hour of audio. Used only for the on-screen estimate.
export const PRICE_PER_HOUR = { model: 0.21, speakers: 0.02, keyterms: 0.05 };

export const MAX_UPLOAD_BYTES = 5 * 1024 ** 3; // AssemblyAI accepts files up to 5 GB by URL

export function problems() {
  const p = [];
  if (!ASSEMBLYAI_API_KEY) p.push('ASSEMBLYAI_API_KEY is not set');
  if (ADMIN_PASSWORD.length < 12) p.push('ADMIN_PASSWORD must be set and at least 12 characters');
  if (APP_SECRET.length < 24) p.push('APP_SECRET must be set and at least 24 characters');
  return p;
}
