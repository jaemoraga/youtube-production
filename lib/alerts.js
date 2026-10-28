// Emails to HTR (NOTIFY_EMAILS, default jordan@hoteltechreport.com) when something happens that
// needs eyes: client sign-ups and sign-ins, transcripts finishing or failing, HTR data pulls failing.
// Client submissions and "ready for scripting" go through lib/notify.js, which uses the same address.
import { NOTIFY_EMAILS } from './config.js';
import { notify } from './email.js';

export function siteUrl() {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, '');
  if (process.env.VERCEL_ENV === 'production') return 'https://sponsorships.hoteltechinsider.com';
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return '';
}

export const adminAlert = ({ subject, text }) => notify({ to: NOTIFY_EMAILS, subject, text });

const dur = (s) => { s = Math.round(s || 0); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}h ${m}m` : `${m}m ${s % 60}s`; };

// Called once when a transcription finishes, fails, or can't be started.
export async function transcriptAlert(job, words = null) {
  const where = job.projectId ? `${siteUrl()}/projects/${job.projectId}` : `${siteUrl()}/jobs/${job.id}`;
  if (job.status === 'done') {
    const wpm = job.duration && words != null ? words / (job.duration / 60) : null;
    const thin = wpm != null && wpm < 40;
    await adminAlert({
      subject: `${thin ? 'Check transcript' : 'Transcript ready'}: ${job.companyName} (${dur(job.duration)})`,
      text: `The transcript for ${job.companyName} is ready.\n\nVideo: ${job.title || job.filename}\nLength: ${dur(job.duration)}${words != null ? `\nWords: ${words.toLocaleString('en-US')}` : ''}`
        + (thin ? `\n\nOnly about ${Math.round(wpm)} words a minute; normal speech is 120 to 160. The audio may be silent or broken, so check it before scripting.` : '')
        + `\n\n${where}`,
    });
  } else if (job.status === 'error') {
    await adminAlert({
      subject: `Transcription FAILED: ${job.companyName}`,
      text: `Transcribing ${job.title || job.filename} for ${job.companyName} failed.\n\nReason: ${job.error || 'unknown'}\n\nYou can retry from the transcript page, or ask the client to upload again.\n\n${where}`,
    });
  }
}
