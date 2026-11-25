// The project ladder, from sign-up to a finished video, and the review windows ("shot clocks") in it.
// Shared by server and browser code: no server-only imports here.
//
// A project moves through these stages in order. Each one names who has the ball:
//   waiting            client   materials still to submit (or an update was requested)
//   submitted          HTR      materials in; HTR approves them and completes the internal dossier
//   script-internal    HTR      script written; only HTR can see it
//   script-client      client   script released; the client has a window to send edit requests
//   script-revisions   HTR      requests in (or the window closed); HTR implements them
//   shooting           HTR      script locked; filming
//   editing            editor   raw footage attached (admin and editor only)
//   v1-client          client   first cut on Frame.io; the client has a window to leave feedback there
//   v1-revisions       editor   feedback in (or the window closed); editor cuts V2
//   v2-client          client   second cut on Frame.io; a shorter window, the last round
//   final-revisions    editor   final feedback in (or the window closed)
//   complete           done
export const STAGES = [
  ['waiting', 'Waiting for client materials', 'client'],
  ['submitted', 'Materials submitted', 'htr'],
  ['script-internal', 'Script draft, internal', 'htr'],
  ['script-client', 'Script review, client', 'client'],
  ['script-revisions', 'Script revisions', 'htr'],
  ['shooting', 'Shooting', 'htr'],
  ['editing', 'Editing', 'editor'],
  ['v1-client', 'V1 review, client', 'client'],
  ['v1-revisions', 'V1 revisions', 'editor'],
  ['v2-client', 'V2 review, client', 'client'],
  ['final-revisions', 'Final revisions', 'editor'],
  ['complete', 'Complete', 'done'],
].map(([key, label, court], order) => ({ key, label, court, order }));
export const STAGE = Object.fromEntries(STAGES.map((s) => [s.key, s]));

// What the client reads for each stage (they never see HTR's internal wording).
export const CLIENT_STAGE_TEXT = {
  waiting: 'Waiting on you', submitted: 'Materials submitted', 'script-internal': 'Script in progress',
  'script-client': 'Script ready for your review', 'script-revisions': 'Script revisions in progress', shooting: 'Filming',
  editing: 'Editing', 'v1-client': 'First cut ready for your feedback', 'v1-revisions': 'Working on your feedback',
  'v2-client': 'Final cut ready for your feedback', 'final-revisions': 'Final changes in progress', complete: 'Complete',
};

// ---------- review windows ----------
// A window: { openedAt, days, deadline, closedAt, closedBy: 'client'|'clock'|'htr', extensions: [], reminders: {} }
// deadline is an ISO time. reminders maps a threshold (days remaining, as a string) to when that reminder went out.
export const DAY = 86400000;
export const WINDOWS = {
  script: { days: 7, reminders: [7, 5, 3, 1] },
  v1: { days: 7, reminders: [7, 5, 3, 1] },
  v2: { days: 3, reminders: [3, 1, 0.5] },
};

export function openWindow(key, at = new Date()) {
  const def = WINDOWS[key];
  const t = at instanceof Date ? at : new Date(at);
  return { openedAt: t.toISOString(), days: def.days, deadline: new Date(t.getTime() + def.days * DAY).toISOString(), closedAt: null, closedBy: null, extensions: [], reminders: { [String(def.reminders[0])]: t.toISOString() } };
}

export const windowExpired = (w, now = Date.now()) => !!w?.deadline && Date.parse(w.deadline) <= now;
// Closed by the client, by HTR, or by the clock (even before the cron has stamped it).
export const windowClosed = (w, now = Date.now()) => !!w && (!!w.closedAt || windowExpired(w, now));
export const windowOpen = (w, now = Date.now()) => !!w?.deadline && !windowClosed(w, now);
export const daysLeft = (w, now = Date.now()) => (w?.deadline ? (Date.parse(w.deadline) - now) / DAY : null);

// Which reminder is due now, if any: the largest threshold the clock has passed that has not gone out.
// A threshold is "passed" once fewer than that many days remain. Earlier, larger thresholds that were
// skipped (the cron did not run) are marked sent along with it, so a late cron never sends a burst.
export function dueReminder(key, w, now = Date.now()) {
  if (!windowOpen(w, now)) return null;
  const left = daysLeft(w, now);
  const passed = WINDOWS[key].reminders.filter((t) => left <= t && !w.reminders?.[String(t)]);
  return passed.length ? Math.min(...passed) : null;
}
export function markReminder(key, w, threshold, at = new Date().toISOString()) {
  const reminders = { ...(w.reminders || {}) };
  for (const t of WINDOWS[key].reminders) if (t >= threshold && !reminders[String(t)]) reminders[String(t)] = at;
  return { ...w, reminders };
}

// More time, decided by HTR. The deadline moves; reminders that now lie ahead again are re-armed, so a
// client who gets four more days hears from us again at three days and at one. If the clock had closed
// the window, it reopens. Nothing here tells the client it was an extension.
export function extendWindow(key, w, days, by = null, note = '') {
  const extra = Math.max(0.5, Math.min(30, Number(days) || 0));
  const now = new Date();
  const base = Math.max(Date.parse(w.deadline), now.getTime());
  const deadline = new Date(base + extra * DAY).toISOString();
  const left = (Date.parse(deadline) - now.getTime()) / DAY;
  // The first threshold is the release email itself; it is never sent twice.
  const first = WINDOWS[key].reminders[0];
  const reminders = Object.fromEntries(Object.entries(w.reminders || {}).filter(([t]) => Number(t) >= left || Number(t) === first));
  const reopened = !!w.closedAt && w.closedBy === 'clock';
  return {
    ...w, deadline, reminders,
    closedAt: reopened ? null : w.closedAt, closedBy: reopened ? null : w.closedBy,
    extensions: [...(w.extensions || []), { at: now.toISOString(), by, days: extra, from: w.deadline, to: deadline, note: String(note || '').slice(0, 300), reopened }],
  };
}

export const closeWindow = (w, closedBy, at = new Date().toISOString()) => ({ ...w, closedAt: w.closedAt || at, closedBy: w.closedBy || closedBy });

// Where a project stands. Works on the admin view (which carries the internal dossier) and the client view.
export function stageOf(p, now = Date.now()) {
  if (!p) return 'waiting';
  if (p.completedAt) return 'complete';
  const v2 = p.v2 || {}; const v1 = p.v1 || {}; const sc = p.script || {};
  if (v2.url) return v2.doneAt || windowClosed(v2.window, now) ? 'final-revisions' : 'v2-client';
  if (v1.url) return v1.doneAt || windowClosed(v1.window, now) ? 'v1-revisions' : 'v1-client';
  if (p.footage?.url) return 'editing';
  if (sc.lockedAt) return 'shooting';
  if (sc.releasedAt) return sc.requestsAt || windowClosed(sc.window, now) ? 'script-revisions' : 'script-client';
  if (sc.draftAt) return 'script-internal';
  const s = ['dossier', 'assets', 'video'].map((i) => p.items?.[i]?.status);
  if (s.some((x) => x === 'todo' || x === 'changes')) return 'waiting';
  return 'submitted';
}

// The window the client is in right now, if any: { key, window }.
export function activeWindow(p, now = Date.now()) {
  const st = stageOf(p, now);
  if (st === 'script-client') return { key: 'script', window: p.script.window };
  if (st === 'v1-client') return { key: 'v1', window: p.v1.window };
  if (st === 'v2-client') return { key: 'v2', window: p.v2.window };
  return null;
}

// A deadline as the client should read it: date and time, in their own time zone (format in the browser).
export const WINDOW_LABEL = { script: 'script review', v1: 'first-cut feedback', v2: 'final-cut feedback' };
