// The audit trail for one project: every email the app sent the client, what Resend reported about it
// (delivered, opened, clicked, bounced), and every time someone from the client signed in or opened a
// page. Kept in notifications/<projectId>.json. Used when a client says they never heard from us.
//
// Opens come from a tracking pixel and are only a hint: mail apps that pre-load images (Apple Mail)
// register an open nobody made, and ones that block images register none. Clicks are better but
// security scanners follow links too. Sign-ins and page views are recorded by this app itself and are
// the evidence that holds up.
import { notify } from './email.js';
import { readJSON, writeJSON } from './store.js';

const path = (projectId) => `notifications/${projectId}.json`;
const now = () => new Date().toISOString();

export const getLog = async (projectId) => (await readJSON(path(projectId)).catch(() => null)) || { projectId, emails: [], visits: [] };
const save = (log) => writeJSON(path(log.projectId), { ...log, updatedAt: now() });

// Send an email to the client and record it. kind names the message ('script.release', 'v1.reminder.3', ...).
export async function sendTracked(project, { to, subject, text, kind, window = null }) {
  const list = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (!list.length) return null;
  const id = await notify({ to: list, subject, text, tags: [{ name: 'project', value: project.id }, { name: 'kind', value: kind.replace(/[^a-zA-Z0-9_-]/g, '_') }] });
  const log = await getLog(project.id);
  log.emails.push({ id, at: now(), to: list, subject, kind, window, events: [] });
  if (log.emails.length > 400) log.emails = log.emails.slice(-400);
  await save(log);
  return id;
}

// A Resend webhook event for one message: delivered | opened | clicked | bounced | complained | delivery_delayed.
export async function recordEmailEvent(projectId, emailId, type, { at = now(), link = null } = {}) {
  const log = await getLog(projectId);
  const e = log.emails.find((x) => x.id === emailId);
  if (!e) return false;
  // One row per open or click is enough to make the point; keep the first few of each with their times.
  const same = e.events.filter((x) => x.type === type);
  if (same.length >= 5) return true;
  e.events.push({ type, at, ...(link ? { link: String(link).slice(0, 300) } : {}) });
  await save(log);
  return true;
}

// The client signed in, or opened a page of this project. Same person and page within ten minutes
// counts once.
export async function recordVisit(projectId, { email, page }) {
  const log = await getLog(projectId);
  const last = [...log.visits].reverse().find((v) => v.email === email && v.page === page);
  if (last && Date.now() - Date.parse(last.at) < 10 * 60e3) return;
  log.visits.push({ at: now(), email: email || null, page });
  if (log.visits.length > 1000) log.visits = log.visits.slice(-1000);
  await save(log);
}

// For the admin's Notifications panel: emails newest first, each with a one-line status.
export function summarize(log) {
  const status = (e) => {
    const has = (t) => e.events.some((x) => x.type === t);
    if (has('bounced')) return 'bounced';
    if (has('clicked')) return 'clicked';
    if (has('opened')) return 'opened';
    if (has('delivered')) return 'delivered';
    if (has('complained')) return 'marked as spam';
    return e.id ? 'sent' : 'not sent (email is off)';
  };
  return {
    emails: [...log.emails].reverse().map((e) => ({ ...e, status: status(e) })),
    visits: [...log.visits].reverse().slice(0, 200),
  };
}
