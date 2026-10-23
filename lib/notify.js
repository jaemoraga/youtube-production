// Emails sent when something on a project changes hands.
//   client submits or comments  -> HTR (NOTIFY_EMAILS)
//   HTR requests changes/comments -> everyone at the client company
//   everything approved          -> everyone at the client company
//   ready for scripting           -> HTR (client checklist approved + internal dossier complete)
import { NOTIFY_EMAILS } from './config.js';
import { notify } from './email.js';
import { ITEM_LABEL, clientDone } from './projects.js';
import { companyContacts, getUser } from './users.js';

export function siteUrl() {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, '');
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return '';
}

export async function whoFromSession(s) {
  if (!s) return { role: 'client', email: null, name: 'Client' };
  if (s.r === 'admin') return { role: 'admin', email: s.e, name: s.e ? `${s.e.split('@')[0]} (Hotel Tech Report)` : 'Hotel Tech Report' };
  const u = s.e ? await getUser(s.e) : null;
  return { role: s.r, email: s.e, name: u ? `${u.first} ${u.last}` : s.e || 'Client' };
}

export async function notifyEvent(project, who, event, { scripting = false } = {}) {
  if (scripting) {
    await notify({
      to: NOTIFY_EMAILS,
      subject: `Ready for scripting: ${project.companyName}`,
      text: `${project.name} is ready for scripting: the client checklist is approved and the internal dossier is complete.\n\n${siteUrl()}/projects/${project.id}`,
    });
  }
  if (!event) return;
  const label = ITEM_LABEL[event.item] || 'Project';
  const adminUrl = `${siteUrl()}/projects/${project.id}`;
  const portalUrl = `${siteUrl()}/portal/p/${project.id}`;

  if (who.role === 'client') {
    const what = event.kind === 'comment' ? `left a comment on ${label}:\n\n"${event.text}"` : `submitted: ${label}.`;
    await notify({
      to: NOTIFY_EMAILS,
      subject: `${project.companyName}: ${event.kind === 'comment' ? 'new comment' : `${label} submitted`}`,
      text: `${who.name} at ${project.companyName} ${what}\n\nProject: ${project.name}\nReview it: ${adminUrl}`,
    });
    return;
  }

  const to = await companyContacts(project.company);
  if (event.kind === 'changes' || event.kind === 'comment') {
    const ask = event.kind === 'changes' ? `We need an update on your ${label.toLowerCase()}:` : `New message about your ${label.toLowerCase()}:`;
    await notify({
      to,
      subject: event.kind === 'changes' ? `Update needed: ${label}` : `Message from Hotel Tech Report: ${label}`,
      text: `Hi,\n\n${ask}\n\n"${event.text}"\n\nOpen your portal to respond: ${portalUrl}\n\nHotel Tech Report`,
    });
  } else if (event.kind === 'approved' && clientDone(project)) {
    await notify({
      to,
      subject: `You're all set: ${project.name}`,
      text: `Hi,\n\nWe've approved everything for ${project.name}. Thank you! We'll take it from here.\n\n${portalUrl}\n\nHotel Tech Report`,
    });
  }
}
