// A project = one video engagement with a client. It has three checklist items the client completes:
//   dossier  (link to their copy of the sponsor dossier Google Doc)
//   assets   (logo, screenshots, anything else)
//   video    (the raw recording; transcribed automatically)
// Each item: todo -> submitted -> approved, or -> changes (admin asked for an update) -> submitted ...
import { randomBytes } from 'node:crypto';
import { head } from '@vercel/blob';
import { getCompanies, getJob, jobPath, listPaths, readJSON, remove, transcriptPath, writeJSON } from './store.js';

import { INTERNAL_FIELDS, ITEMS, materialsStage, videoParts } from './project-shared.js';
import { WINDOW_LABEL, closeWindow, extendWindow, openWindow, stageOf, windowOpen } from './stages.js';

export { ITEMS, ITEM_LABEL, STATUS_TEXT, INTERNAL_FIELDS, clientDone, clientTookPart, materialsStage, projectStatus, unlabeledParts, videoParts } from './project-shared.js';
export const projectPath = (id) => `projects/${id}.json`;

// "Acme Analytics YouTube video". Projects made before this naming read the same way.
const defaultName = (companyName) => `${companyName} YouTube video`;
const withName = (p) => (p && /^Video project /.test(p.name || '') ? { ...p, name: defaultName(p.companyName) } : p);

// Trashed projects are hidden everywhere and deleted for good after TRASH_DAYS.
export const TRASH_DAYS = 30;
const DAY = 86400000;
export const trashExpiry = (p) => new Date(new Date(p.deletedAt).getTime() + TRASH_DAYS * DAY);

export async function getProject(id, { includeDeleted = false } = {}) {
  if (!/^[a-z0-9]{8,32}$/.test(String(id))) return null;
  const p = withName(await readJSON(projectPath(id)));
  return p && p.deletedAt && !includeDeleted ? null : p;
}

// What each role may see. Only admins get the internal dossier (always present for them, even if empty).
export function forRole(p, role) {
  if (!p) return p;
  const { internal, log, ...rest } = p;
  if (role === 'admin') return { ...rest, internal: internal || {}, log: log || [] };
  // HTR's note on where outside material lives is for HTR only.
  const items = Object.fromEntries(Object.entries(rest.items || {}).map(([k, { externalNote, ...it }]) => [k, it]));
  if (role === 'editor') return { ...rest, items };
  // Clients never see the raw footage link, and never learn that a window was extended.
  const { footage, ...client } = rest;
  const hide = (x) => (x?.window ? { ...x, window: { ...x.window, extensions: undefined, reminders: undefined } } : x);
  return { ...client, items, script: hide(client.script), v1: hide(client.v1), v2: hide(client.v2) };
}

export const saveProject = (p) => writeJSON(projectPath(p.id), { ...p, updatedAt: new Date().toISOString() });

export async function listProjects({ company, trash = false } = {}) {
  const all = await Promise.all((await listPaths('projects/')).map((p) => readJSON(p).catch(() => null)));
  const expired = all.filter((p) => p?.deletedAt && trashExpiry(p) < new Date());
  if (expired.length) await Promise.all(expired.map((p) => purgeProject(p).catch(() => null)));
  return all.map(withName).filter((p) => p && !expired.includes(p) && !!p.deletedAt === trash && (!company || p.company === company))
    .sort((a, b) => (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt));
}

export async function restoreProject(id, who = null) {
  const p = await getProject(id, { includeDeleted: true });
  if (!p?.deletedAt) throw err('That project is not in the trash.', 404);
  delete p.deletedAt; delete p.deletedBy;
  (p.log ||= []).push({ at: new Date().toISOString(), type: 'restored', by: by(who) });
  await saveProject(p);
  return p;
}

// Permanent: the project, its brand files, and its video + transcript.
export async function purgeProject(p) {
  const assets = await listPaths(`assets/${p.company}/${p.id}/`).catch(() => []);
  const jobs = (await Promise.all(videoParts(p).map((x) => getJob(x.jobId).catch(() => null)))).filter(Boolean);
  await Promise.all([
    ...assets.map(remove),
    ...jobs.flatMap((job) => [remove(job.pathname), remove(transcriptPath(job.id)), job.shareToken ? remove(`shares/${job.shareToken}.json`) : null, remove(jobPath(job.id))]),
  ]);
  await remove(`scripts/${p.id}.json`);
  await remove(projectPath(p.id));
}

export async function createProject(companySlug, name, who = null) {
  const company = (await getCompanies()).find((c) => c.slug === companySlug);
  if (!company) throw Object.assign(new Error('Company not found'), { status: 404 });
  const p = {
    id: randomBytes(8).toString('hex'), company: company.slug, companyName: company.name,
    name: String(name || '').trim().slice(0, 120) || defaultName(company.name),
    createdAt: new Date().toISOString(),
    items: { dossier: { status: 'todo' }, assets: { status: 'todo', files: [] }, video: { status: 'todo' } },
    comments: [],
    log: [{ at: new Date().toISOString(), type: 'created', by: by(who) }],
  };
  await saveProject(p);
  return p;
}

const by = (who) => (who ? { name: who.name || null, email: who.email || null, role: who.role || null } : null);
const clip = (t) => String(t || '').slice(0, 300);

const err = (msg, status = 400) => Object.assign(new Error(msg), { status });
const isGoogleDoc = (u) => /^https:\/\/docs\.google\.com\/document\/d\/[\w-]{20,}/.test(u);
const httpsUrl = (u) => { const t = String(u || '').trim(); try { return new URL(t).protocol === 'https:' && t.length < 2000 ? t : null; } catch { return null; } };

// Applies one change. who = { role: 'client'|'admin', email, name }.
// Returns { project, event } where event (if any) describes something worth emailing about.
export async function applyAction(p, who, a) {
  const item = a.item;
  const it = ITEMS.includes(item) ? p.items[item] : null;
  const now = new Date().toISOString();
  const client = who.role === 'client';
  const editable = (i) => p.items[i].status !== 'approved';
  let event = null;
  let entry = null;   // timeline entry for this change
  const wasScripting = materialsStage(forRole(p, 'admin')) === 'scripting';
  const wasStage = stageOf(p);
  const staff = who.role === 'admin' || who.role === 'editor';   // HTR and the video editor

  switch (a.type) {
    case 'dossier.save': {
      if (!client && who.role !== 'admin') throw err('Not allowed', 403);
      if (!editable('dossier')) throw err('Already approved.');
      const url = String(a.url || '').trim();
      if (!isGoogleDoc(url)) throw err('Please paste the link to your Google Doc (it starts with https://docs.google.com/document/).');
      Object.assign(p.items.dossier, { url, status: 'submitted', submittedAt: now, submittedBy: by(who) });
      entry = { type: 'submitted', item: 'dossier' };
      event = { kind: 'submitted', item: 'dossier' };
      break;
    }
    case 'assets.add': {
      if (!editable('assets')) throw err('Already approved.');
      const prefix = `assets/${p.company}/${p.id}/`;
      const pathname = String(a.pathname || '');
      if (!pathname.startsWith(prefix) || pathname.slice(prefix.length).includes('/')) throw err('Bad file.');
      const blob = await head(pathname).catch(() => null);
      if (!blob) throw err('Upload not found.');
      const files = p.items.assets.files.filter((f) => f.pathname !== pathname);
      files.push({ pathname, name: String(a.name || pathname.split('/').pop()).slice(0, 200), size: blob.size, type: blob.contentType, addedAt: now });
      p.items.assets.files = files;
      break;
    }
    case 'assets.remove': {
      if (!editable('assets')) throw err('Already approved.');
      p.items.assets.files = p.items.assets.files.filter((f) => f.pathname !== a.pathname);
      break;
    }
    case 'assets.submit': {
      if (!editable('assets')) throw err('Already approved.');
      if (!p.items.assets.files.length) throw err('Add at least one file first.');
      Object.assign(p.items.assets, { status: 'submitted', submittedAt: now, submittedBy: by(who) });
      entry = { type: 'submitted', item: 'assets', text: `${p.items.assets.files.length} file${p.items.assets.files.length === 1 ? '' : 's'}` };
      event = { kind: 'submitted', item: 'assets' };
      break;
    }
    case 'video.set': {
      if (!editable('video')) throw err('Already approved.');
      // a.add keeps the parts already there (a demo recorded in two files); otherwise this replaces the video.
      const part = { jobId: a.jobId, filename: a.filename, label: '', addedAt: now };
      const parts = a.add ? [...videoParts(p).filter((x) => x.jobId !== a.jobId), part] : [part];
      Object.assign(p.items.video, { parts, jobId: parts[0].jobId, filename: parts[0].filename, status: 'submitted', submittedAt: now, submittedBy: by(who) });
      delete p.items.video.external; delete p.items.video.externalNote;
      entry = { type: 'submitted', item: 'video', text: a.filename };
      event = { kind: 'submitted', item: 'video' };
      break;
    }
    case 'video.remove': {
      if (!editable('video')) throw err('Already approved.');
      const gone = videoParts(p).find((x) => x.jobId === a.jobId);
      if (!gone) throw err('That video is not on this project.');
      const parts = videoParts(p).filter((x) => x.jobId !== a.jobId);
      Object.assign(p.items.video, { parts, jobId: parts[0]?.jobId || null, filename: parts[0]?.filename || null });
      if (!parts.length) Object.assign(p.items.video, { status: 'todo', submittedAt: null, submittedBy: null });
      entry = { type: 'video.removed', text: gone.filename };
      break;
    }
    // Name a video file or change the order of the parts. Allowed after approval too: the editor relies on
    // these labels, so they can always be fixed. Clients may do it until the video is approved.
    case 'video.update': {
      if (client && !editable('video')) throw err('Already approved.');
      const parts = videoParts(p).map((x) => ({ ...x }));
      const i = parts.findIndex((x) => x.jobId === a.jobId);
      if (i < 0) throw err('That video is not on this project.');
      if (a.label !== undefined) parts[i].label = String(a.label || '').replace(/\s+/g, ' ').trim().slice(0, 120);
      const j = a.move === 'up' ? i - 1 : a.move === 'down' ? i + 1 : i;
      if (j !== i && j >= 0 && j < parts.length) [parts[i], parts[j]] = [parts[j], parts[i]];
      Object.assign(p.items.video, { parts, jobId: parts[0].jobId, filename: parts[0].filename });
      break;
    }
    // HTR already has this step from somewhere else (email, a shared drive). Closes it without the client.
    case 'external': {
      if (who.role !== 'admin') throw err('Not allowed', 403);
      if (!it) throw err('Unknown item.');
      Object.assign(it, { status: 'approved', approvedAt: now, external: true, externalNote: String(a.note || '').trim().slice(0, 1000) });
      entry = { type: 'external', item, text: clip(a.note) };
      break;
    }
    case 'approve': {
      if (client) throw err('Not allowed', 403);
      if (!it) throw err('Unknown item.');
      if (it.status === 'todo') throw err('Nothing has been submitted yet.');
      Object.assign(it, { status: 'approved', approvedAt: now });
      entry = { type: 'approved', item };
      event = { kind: 'approved', item };
      break;
    }
    case 'changes': {
      if (client) throw err('Not allowed', 403);
      if (!it) throw err('Unknown item.');
      const text = String(a.text || '').trim();
      if (!text) throw err('Say what needs to change so the client knows what to do.');
      it.status = 'changes';
      entry = { type: 'changes', item, text: clip(text) };
      p.comments.push({ item, by: 'admin', name: who.name, email: who.email, text: text.slice(0, 4000), at: now, kind: 'changes' });
      event = { kind: 'changes', item, text };
      break;
    }
    case 'reopen': {
      if (client) throw err('Not allowed', 403);
      if (!it) throw err('Unknown item.');
      it.status = it.submittedAt ? 'submitted' : 'todo';
      delete it.external; delete it.externalNote;
      entry = { type: 'reopened', item };
      break;
    }
    case 'comment': {
      if (!it) throw err('Unknown item.');
      const text = String(a.text || '').trim();
      if (!text) throw err('Write a message first.');
      p.comments.push({ item, by: who.role, name: who.name, email: who.email, text: text.slice(0, 4000), at: now });
      entry = { type: 'comment', item, text: clip(text) };
      event = { kind: 'comment', item, text };
      break;
    }
    case 'internal.save': {
      if (who.role !== 'admin') throw err('Not allowed', 403);
      const prev = p.internal || {};
      const fields = {};
      for (const f of INTERNAL_FIELDS) {
        const v = String(a.fields?.[f.key] ?? '').trim();
        if (v) fields[f.key] = v.slice(0, 20000);
      }
      const complete = a.complete === undefined ? !!prev.completedAt : !!a.complete;
      const pulled = a.htr?.pulledAt && a.htr.pulledAt !== prev.htr?.pulledAt ? a.htr : null;
      p.internal = {
        fields, updatedAt: now, updatedBy: who.email || null,
        completedAt: complete ? prev.completedAt || now : null,
        completedBy: complete ? prev.completedBy || who.email || null : null,
        htr: a.htr && Number(a.htr.productId) > 0
          ? { productId: Number(a.htr.productId), name: String(a.htr.name || '').slice(0, 200), category: String(a.htr.category || '').slice(0, 200), pulledAt: String(a.htr.pulledAt || now).slice(0, 40) }
          : prev.htr || null,
      };
      const notes = [];
      if (!prev.updatedAt) notes.push({ type: 'internal.started' });
      if (pulled) notes.push({ type: 'internal.pulled', text: String(pulled.name || '').slice(0, 200) });
      if (complete && !prev.completedAt) notes.push({ type: 'internal.complete' });
      if (!complete && prev.completedAt) notes.push({ type: 'internal.reopened' });
      for (const n of notes) (p.log ||= []).push({ at: now, by: by(who), ...n });
      break;
    }
    // ---------- after the checklist: script stamps, footage, the two Frame.io rounds, the clocks ----------
    // The script lives in scripts/<id>.json; the project only keeps the dates the ladder needs.
    case 'script.stamp': {
      if (who.role !== 'admin' && who.role !== 'client') throw err('Not allowed', 403);
      const sc = { ...(p.script || {}) };
      switch (a.event) {
        case 'draft': if (who.role !== 'admin') throw err('Not allowed', 403); if (!sc.draftAt) { sc.draftAt = now; entry = { type: 'script.draft', text: clip(a.text) }; } break;
        case 'released':
          if (who.role !== 'admin') throw err('Not allowed', 403);
          if (!sc.releasedAt) { sc.releasedAt = now; sc.window = openWindow('script'); entry = { type: 'script.released' }; }
          break;
        case 'hidden':
          if (who.role !== 'admin') throw err('Not allowed', 403);
          if (sc.releasedAt && !sc.lockedAt) { delete sc.releasedAt; delete sc.window; delete sc.requestsAt; entry = { type: 'script.hidden' }; }
          break;
        case 'requests':
          if (!sc.releasedAt) throw err('The script has not been released.');
          if (!windowOpen(sc.window)) throw err('The review window for this script has closed.');
          sc.requestsAt = now; sc.window = closeWindow(sc.window, 'client');
          entry = { type: 'script.requests', text: clip(a.text) };
          break;
        case 'locked':
          if (!sc.lockedAt) { sc.lockedAt = now; sc.lockedBy = who.role === 'client' ? 'client' : who.email || 'htr'; if (sc.window) sc.window = closeWindow(sc.window, who.role === 'client' ? 'client' : 'htr'); entry = { type: 'script.locked', text: who.role === 'client' ? 'approved by the client' : 'revisions implemented' }; }
          break;
        case 'cleared': if (who.role !== 'admin') throw err('Not allowed', 403); if (!sc.releasedAt) { delete sc.draftAt; } break;
        default: throw err('Unknown script event.');
      }
      p.script = sc;
      break;
    }
    case 'footage.set': {
      if (!staff) throw err('Not allowed', 403);
      const url = httpsUrl(a.url);
      if (!url) throw err('Paste the link to the raw footage (a Google Drive folder, usually).');
      if (!p.script?.lockedAt) throw err('Lock the script for filming first.');
      p.footage = { url, addedAt: p.footage?.addedAt || now, updatedAt: now, by: by(who), note: String(a.note || '').trim().slice(0, 500) };
      entry = { type: 'footage.set' };
      break;
    }
    case 'cut.set': {   // a.round = 'v1' | 'v2': the Frame.io link the client reviews; opens that round's window
      if (!staff) throw err('Not allowed', 403);
      const round = a.round === 'v2' ? 'v2' : 'v1';
      const url = httpsUrl(a.url);
      if (!url) throw err('Paste the Frame.io link.');
      if (round === 'v1' && !p.footage?.url) throw err('Attach the raw footage first.');
      if (round === 'v2' && !(p.v1?.doneAt || (p.v1?.window && !windowOpen(p.v1.window)))) throw err('The client is still in their first-cut window. Wait for their feedback, or close the window from the project page.');
      const cur = p[round] || {};
      p[round] = { ...cur, url, addedAt: cur.addedAt || now, updatedAt: now, by: by(who), window: cur.window || openWindow(round) };
      if (!cur.url) entry = { type: `${round}.set` };
      break;
    }
    case 'cut.done': {   // the client says all their Frame.io feedback is in
      if (!client) throw err('Not allowed', 403);
      const round = a.round === 'v2' ? 'v2' : 'v1';
      const cur = p[round];
      if (!cur?.url) throw err('There is nothing to review yet.');
      if (cur.doneAt) break;
      if (!windowOpen(cur.window)) throw err('This feedback window has closed.');
      p[round] = { ...cur, doneAt: now, doneBy: by(who), window: closeWindow(cur.window, 'client') };
      entry = { type: `${round}.done` };
      break;
    }
    case 'window.close': {   // HTR ends a window early (the client said they are done by email, say)
      if (who.role !== 'admin') throw err('Not allowed', 403);
      const key = ['script', 'v1', 'v2'].includes(a.window) ? a.window : null;
      const cur = key && p[key];
      if (!cur?.window || !windowOpen(cur.window)) throw err('That window is not open.');
      p[key] = { ...cur, window: closeWindow(cur.window, 'htr'), ...(key === 'script' ? { requestsAt: cur.requestsAt || now } : { doneAt: cur.doneAt || now }) };
      entry = { type: 'window.closed', text: `${WINDOW_LABEL[key]} window closed by Hotel Tech Report` };
      break;
    }
    case 'window.extend': {   // the boost: more days, logged for HTR only
      if (who.role !== 'admin') throw err('Not allowed', 403);
      const key = ['script', 'v1', 'v2'].includes(a.window) ? a.window : null;
      const cur = key && p[key];
      if (!cur?.window?.deadline) throw err('That window has not opened.');
      if (cur.window.closedAt && cur.window.closedBy !== 'clock') throw err('The client already finished this round.');
      if (key === 'script' && p.script.lockedAt) throw err('The script is locked.');
      if (key === 'v1' && p.v2?.url) throw err('The second cut is already out.');
      if (p.completedAt) throw err('The project is complete.');
      const days = Number(a.days);
      if (!(days > 0)) throw err('How many days?');
      const w = extendWindow(key, cur.window, days, who.email || null, a.note);
      p[key] = { ...cur, window: w, ...(key === 'script' ? { requestsAt: w.closedAt ? cur.requestsAt : undefined } : { doneAt: w.closedAt ? cur.doneAt : undefined }) };
      entry = { type: 'window.extended', text: `${WINDOW_LABEL[key]} window extended by ${days} day${days === 1 ? '' : 's'}${a.note ? `: ${clip(a.note)}` : ''}` };
      break;
    }
    case 'complete': {
      if (!staff) throw err('Not allowed', 403);
      if (!p.v2?.url) throw err('Send the final cut first.');
      if (!(p.v2.doneAt || !windowOpen(p.v2.window))) throw err('The client is still in their final feedback window.');
      if (!p.completedAt) { p.completedAt = now; p.completedBy = by(who); p.finalUrl = httpsUrl(a.url) || p.finalUrl || null; entry = { type: 'completed' }; }
      break;
    }
    // Undo the last production step (a link pasted on the wrong project). HTR only.
    case 'stage.reopen': {
      if (who.role !== 'admin') throw err('Not allowed', 403);
      const what = String(a.what || '');
      if (what === 'complete') { delete p.completedAt; delete p.completedBy; }
      else if (what === 'v2') delete p.v2;
      else if (what === 'v1') { if (p.v2?.url) throw err('Remove the second cut first.'); delete p.v1; }
      else if (what === 'footage') { if (p.v1?.url) throw err('Remove the first cut first.'); delete p.footage; }
      else if (what === 'lock') { if (p.footage?.url) throw err('Remove the raw footage first.'); if (p.script?.lockedBy === 'client') throw err('The client approved this script; it stays locked.'); delete p.script.lockedAt; delete p.script.lockedBy; }
      else throw err('Unknown stage.');
      entry = { type: 'reopened-stage', text: what };
      break;
    }
    case 'trash': {
      if (who.role !== 'admin') throw err('Not allowed', 403);
      p.deletedAt = now;
      p.deletedBy = who.email || null;
      entry = { type: 'trashed' };
      break;
    }
    // A plain timeline note for things that happen outside the checklist (contact added, script imported).
    case 'note': {
      if (who.role !== 'admin') throw err('Not allowed', 403);
      if (!['contact.added', 'script.imported'].includes(a.kind)) throw err('Unknown note.');
      entry = { type: a.kind, text: clip(a.text) };
      break;
    }
    case 'rename': {
      if (client) throw err('Not allowed', 403);
      p.name = String(a.name || '').trim().slice(0, 120) || p.name;
      break;
    }
    default:
      throw err('Unknown action.');
  }
  if (entry) (p.log ||= []).push({ at: now, by: by(who), ...entry });
  await saveProject(p);
  const scripting = !wasScripting && materialsStage(forRole(p, 'admin')) === 'scripting';
  return { project: p, event, scripting, stage: stageOf(p), wasStage };
}
