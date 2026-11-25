// What happens around the ladder after the checklist: the emails each stage change sends, and the clock
// that runs the review windows (reminders, closing on expiry). Every client email goes through
// sendTracked so it lands in the project's audit trail.
import { adminAlert, siteUrl } from './alerts.js';
import { EDITOR_EMAILS } from './config.js';
import { notify } from './email.js';
import { getLog, sendTracked } from './notifications.js';
import { applyAction, getProject, listProjects, saveProject } from './projects.js';
import { WINDOWS, WINDOW_LABEL, activeWindow, closeWindow, dueReminder, markReminder, stageOf, windowExpired } from './stages.js';
import { companyContacts } from './users.js';

const clientUrl = (p) => `${siteUrl()}/client-submission/youtube/p/${p.id}`;
const adminUrl = (p) => `${siteUrl()}/admin/projects/${p.id}`;
const editorUrl = (p) => `${siteUrl()}/editor/p/${p.id}`;
const sign = (text) => `Hi,\n\n${text}\n\nHotel Tech Report`;

// "Tuesday, December 1 at 5:00 PM Pacific". Deadlines are set in Los Angeles time in the emails; the
// page shows the same moment in the reader's own time zone.
export const whenText = (iso) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' Pacific';

const dayWord = (n) => (n === 0.5 ? '12 hours' : n === 1 ? '1 day' : `${n} days`);

// Tell the editor (and HTR) something is theirs to do.
export const editorAlert = ({ subject, text }) => notify({ to: [...new Set([...EDITOR_EMAILS, ...(process.env.NOTIFY_EMAILS || 'jordan@hoteltechreport.com').split(',').map((s) => s.trim()).filter(Boolean)])], subject, text });

const toClient = async (p, kind, subject, text, window = null) => sendTracked(p, { to: await companyContacts(p.company), subject, text: sign(text), kind, window });

// The release email for a window (also the first "reminder" of its schedule).
export async function announceWindow(p, key) {
  const w = p[key].window;
  const closes = whenText(w.deadline);
  if (key === 'script') {
    await toClient(p, 'script.release', `Your script is ready to review: ${p.name}`,
      `The script for ${p.name} is ready for your review.\n\nYou have until ${closes} to read it and send us your edit requests. Open it, click Comment under any paragraph you want changed, then click Send feedback. If it is good as it is, approve it.\n\nAfter ${closes} the review closes and we move to filming with the script as it stands, so please get your comments in before then.\n\n${clientUrl(p)}/script`, 'script');
  } else if (key === 'v1') {
    await toClient(p, 'v1.release', `Your first cut is ready: ${p.name}`,
      `The first cut of ${p.name} is ready for your feedback.\n\nWatch it and leave every comment directly on the video (the link is on your project page). When all your feedback is in, click "My feedback is complete" on your project page.\n\nThe feedback window closes ${closes}. After that we move to the next cut with the feedback we have.\n\n${clientUrl(p)}`, 'v1');
  } else if (key === 'v2') {
    await toClient(p, 'v2.release', `Your final cut is ready: ${p.name}`,
      `The updated cut of ${p.name} is ready. This is the final round of feedback.\n\nWatch it and leave any last comments on the video, then click "My feedback is complete" on your project page.\n\nThis window is shorter: it closes ${closes}. After that the video is finalized.\n\n${clientUrl(p)}`, 'v2');
  }
}

async function sendReminder(p, key, threshold) {
  const w = p[key].window;
  const closes = whenText(w.deadline);
  const what = key === 'script' ? 'send your script edit requests' : key === 'v1' ? 'leave your feedback on the first cut' : 'leave your final feedback';
  const where = key === 'script' ? `${clientUrl(p)}/script` : clientUrl(p);
  const last = threshold <= 1;
  await toClient(p, `${key}.reminder.${threshold}`, `${last ? 'Last call' : 'Reminder'}: ${dayWord(threshold)} left to ${what}: ${p.name}`,
    `${last ? 'This is the last reminder. ' : ''}You have ${dayWord(threshold)} left to ${what} for ${p.name}. The window closes ${closes}.\n\n${key === 'script' ? 'If we do not hear from you by then, we film the script as it stands.' : key === 'v1' ? 'If we do not hear from you by then, we cut the next version with the feedback we have.' : 'If we do not hear from you by then, the video is finalized as it is.'}\n\n${where}`, key);
}

async function announceClosed(p, key) {
  const label = WINDOW_LABEL[key];
  if (key === 'script') {
    await toClient(p, 'script.closed', `Script review closed: ${p.name}`, `The script review window for ${p.name} has closed. We are moving ahead to filming with the script as it stands.\n\n${clientUrl(p)}`, key);
    await adminAlert({ subject: `Script window closed: ${p.companyName}`, text: `The client's ${label} window on ${p.name} closed without a response. The project is now in Script revisions; lock the script to move to Shooting.\n\n${adminUrl(p)}` });
  } else {
    await toClient(p, `${key}.closed`, `Feedback window closed: ${p.name}`, `The ${label} window for ${p.name} has closed. ${key === 'v1' ? 'We are cutting the next version with the feedback we have.' : 'We are finalizing the video.'}\n\n${clientUrl(p)}`, key);
    await editorAlert({ subject: `${key === 'v1' ? 'V1' : 'Final'} feedback window closed: ${p.companyName}`, text: `The client's ${label} window on ${p.name} closed. ${key === 'v1' ? 'Whatever feedback is on the video is all there will be; cut V2 and attach its link.' : 'Implement any final feedback on the video and mark the project complete.'}\n\n${editorUrl(p)}` });
  }
}

// Emails for a stage change made through the API. before/after are stage keys; a is the action.
export async function announce(p, who, before, after, a) {
  if (before === after && !['window.extend', 'footage.set', 'cut.set'].includes(a.type)) return;
  switch (a.type) {
    case 'script.stamp':
      if (a.event === 'released' && after === 'script-client') await announceWindow(p, 'script');
      if (a.event === 'requests') await adminAlert({ subject: `${p.companyName}: script edit requests are in`, text: `${who.name} at ${p.companyName} sent their edit requests on the script for ${p.name}. The review window is closed.\n\nOpen the script and click Implement revisions:\n${adminUrl(p)}/script` });
      if (a.event === 'locked' && who.role !== 'client') await toClient(p, 'script.locked', `Script locked for filming: ${p.name}`, `Your edit requests on the script for ${p.name} have been worked in and the script is now locked for filming. We will let you know when the first cut is ready.\n\n${clientUrl(p)}`);
      break;
    case 'footage.set':
      if (before !== 'editing') await editorAlert({ subject: `Raw footage ready to edit: ${p.companyName}`, text: `The raw footage for ${p.name} is attached. The script, brand materials and editing guide are on the editor page.\n\nFootage: ${p.footage.url}\n\nWhen the first cut is up, paste its Frame.io link on the editor page to send it to the client.\n\n${editorUrl(p)}` });
      break;
    case 'cut.set':
      if (after === `${a.round}-client` && before !== after) await announceWindow(p, a.round);
      break;
    case 'cut.done':
      await editorAlert({ subject: `${a.round === 'v2' ? 'Final' : 'V1'} feedback is in: ${p.companyName}`, text: `${who.name} at ${p.companyName} says all their feedback on the ${a.round === 'v2' ? 'final' : 'first'} cut of ${p.name} is on the video.\n\n${p[a.round].url}\n\n${a.round === 'v1' ? 'Cut V2 and paste its link on the editor page.' : 'Implement the final feedback and mark the project complete.'}\n\n${editorUrl(p)}` });
      break;
    case 'window.close':
      await announceClosed(p, a.window);
      break;
    case 'window.extend':
      // Nothing goes out unless HTR asks for a fresh reminder with the new date.
      if (a.notifyClient) {
        const key = a.window;
        const what = key === 'script' ? 'send your script edit requests' : key === 'v1' ? 'leave your feedback on the first cut' : 'leave your final feedback';
        await toClient(p, `${key}.reminder.manual`, `Reminder: ${what} by ${whenText(p[key].window.deadline)}: ${p.name}`, `A quick reminder that the window to ${what} for ${p.name} closes ${whenText(p[key].window.deadline)}.\n\n${key === 'script' ? `${clientUrl(p)}/script` : clientUrl(p)}`, key);
      }
      break;
    case 'complete':
      await toClient(p, 'complete', `Your video is complete: ${p.name}`, `${p.name} is complete. Thank you for working with us on it.${p.finalUrl ? `\n\n${p.finalUrl}` : ''}\n\n${clientUrl(p)}`);
      await adminAlert({ subject: `Project complete: ${p.companyName}`, text: `${p.name} was marked complete${who.role === 'editor' ? ' by the editor' : ''}.\n\n${adminUrl(p)}` });
      break;
    default: break;
  }
}

// The clock. Called by the cron route; safe to run as often as you like.
// For every live project with an open window: send the reminder that is due, or close the window if the
// deadline has passed and tell everyone who needs to know.
export async function tick(now = Date.now()) {
  const out = { reminders: 0, closed: 0, errors: 0 };
  for (const p of await listProjects()) {
    try {
      const act = activeWindow(p, now);
      // The clock reads the window straight off the project, not the stage, so a closed-but-unstamped
      // window still gets stamped and announced.
      for (const key of ['script', 'v1', 'v2']) {
        const w = p[key]?.window;
        if (!w?.deadline || w.closedAt) continue;
        if (windowExpired(w, now)) {
          const stamp = key === 'script' ? { requestsAt: p.script.requestsAt || null } : { };
          p[key] = { ...p[key], ...stamp, window: closeWindow(w, 'clock', new Date(now).toISOString()) };
          (p.log ||= []).push({ at: new Date(now).toISOString(), type: 'window.closed', text: `${WINDOW_LABEL[key]} window closed by the clock` });
          await saveProject(p);
          await announceClosed(p, key);
          out.closed++;
          continue;
        }
        if (act?.key !== key) continue;
        const due = dueReminder(key, w, now);
        if (due === null) continue;
        p[key] = { ...p[key], window: markReminder(key, w, due, new Date(now).toISOString()) };
        (p.log ||= []).push({ at: new Date(now).toISOString(), type: 'reminder', text: `${dayWord(due)} left in the ${WINDOW_LABEL[key]} window` });
        await saveProject(p);
        await sendReminder(p, key, due);
        out.reminders++;
      }
    } catch (e) { console.error('tick failed', p.id, e); out.errors++; }
  }
  return out;
}

// Projects that existed before the ladder: bring the script dates over from scripts/<id>.json once.
export async function syncScriptStamps(p, script, who) {
  if (!script || p.script?.lockedAt) return p;
  let cur = p;
  const stamp = async (event, text = '') => { const r = await applyAction(cur, who, { type: 'script.stamp', event, text }); cur = r.project; };
  if (script.versions?.length && !cur.script?.draftAt) await stamp('draft');
  // A script shared before the ladder existed gets a window from today (no release email; the reminders still run).
  if (script.shared && !cur.script?.releasedAt) await stamp('released');
  if (script.client?.submittedAt && !cur.script?.requestsAt && cur.script?.window && !cur.script.window.closedAt) { cur.script = { ...cur.script, requestsAt: script.client.submittedAt, window: closeWindow(cur.script.window, 'client', script.client.submittedAt) }; await saveProject(cur); }
  if (script.client?.approvedAt && !cur.script?.lockedAt) await stamp('locked');
  return cur;
}

export { WINDOWS, getLog, getProject, stageOf };
