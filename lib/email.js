// Sends email through Resend (https://resend.com). Plain, short, no tracking.
import { EMAIL_FROM, RESEND_API_KEY } from './config.js';

export async function sendEmail({ to, subject, text, html }) {
  if (!RESEND_API_KEY) throw new Error('Email is not set up yet.');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: EMAIL_FROM, to: Array.isArray(to) ? to : [to], subject, text, html: html || textToHtml(text) }),
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`Email failed: ${body.message || res.status}`);
  }
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function textToHtml(text) {
  const body = esc(text).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>').replace(/\n/g, '<br>');
  return `<div style="font-family:-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.6;color:#1f2023">${body}</div>`;
}

// Best effort: a failed notification never blocks the action that triggered it.
export async function notify(args) {
  try { if (RESEND_API_KEY && args.to && args.to.length) await sendEmail(args); }
  catch (e) { console.error('notify failed', e.message); }
}
