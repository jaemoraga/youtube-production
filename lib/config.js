// Server-side settings. Everything secret comes from Vercel environment variables.

export const ASSEMBLYAI_API_KEY = process.env.ASSEMBLYAI_API_KEY || '';
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
export const APP_SECRET = process.env.APP_SECRET || '';

// Email sign-in codes (Resend). Until RESEND_API_KEY is set, admins sign in with ADMIN_PASSWORD.
export const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
export const EMAIL_FROM = process.env.EMAIL_FROM || 'Hotel Tech Report <video@hoteltechreport.com>';
export const EMAIL_ENABLED = !!RESEND_API_KEY;
// Only addresses on this domain can sign in as admin.
export const ADMIN_DOMAIN = (process.env.ADMIN_DOMAIN || 'hoteltechreport.com').toLowerCase();
// Who gets an email when a client submits something (comma separated). Defaults to nobody.
export const NOTIFY_EMAILS = (process.env.NOTIFY_EMAILS || '').split(',').map((s) => s.trim()).filter(Boolean);
// One shared password for the editor view.
export const EDITOR_PASSWORD = process.env.EDITOR_PASSWORD || '';
// The Google Doc clients duplicate for their sponsor dossier.
// The sponsor dossier Google Doc clients copy. The /copy form makes Google show a "Make a copy" prompt.
const DOSSIER_DOC = process.env.DOSSIER_TEMPLATE_URL || 'https://docs.google.com/document/d/1AzbKUilDU8d7qE1vk4eSwiTGHiSjEaIc_tikpPc4rrA/edit';
export const DOSSIER_TEMPLATE_URL = DOSSIER_DOC.replace(/^(https:\/\/docs\.google\.com\/document\/d\/[\w-]+).*$/, '$1/copy');
export const SESSION_DAYS = 7;

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
  if (!EMAIL_ENABLED && ADMIN_PASSWORD.length < 12) p.push('RESEND_API_KEY (or, until then, ADMIN_PASSWORD of 12+ characters) must be set');
  if (APP_SECRET.length < 24) p.push('APP_SECRET must be set and at least 24 characters');
  return p;
}
