// A project = one video engagement with a client. It has three checklist items the client completes:
//   dossier  (link to their copy of the sponsor dossier Google Doc)
//   assets   (logo, screenshots, anything else)
//   video    (the raw recording; transcribed automatically)
// Each item: todo -> submitted -> approved, or -> changes (admin asked for an update) -> submitted ...
import { randomBytes } from 'node:crypto';
import { head } from '@vercel/blob';
import { getCompanies, getJob, jobPath, listPaths, readJSON, remove, transcriptPath, writeJSON } from './store.js';

import { INTERNAL_FIELDS, ITEMS, projectStatus } from './project-shared.js';

export { ITEMS, ITEM_LABEL, STATUS_TEXT, INTERNAL_FIELDS, clientDone, projectStatus } from './project-shared.js';
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
  return role === 'admin' ? { ...rest, internal: internal || {}, log: log || [] } : rest;
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
  const job = p.items?.video?.jobId ? await getJob(p.items.video.jobId).catch(() => null) : null;
  await Promise.all([
    ...assets.map(remove),
    ...(job ? [remove(job.pathname), remove(transcriptPath(job.id)), job.shareToken ? remove(`shares/${job.shareToken}.json`) : null, remove(jobPath(job.id))] : []),
  ]);
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
  const wasScripting = projectStatus(forRole(p, 'admin')) === 'scripting';

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
      Object.assign(p.items.video, { jobId: a.jobId, filename: a.filename, status: 'submitted', submittedAt: now, submittedBy: by(who) });
      entry = { type: 'submitted', item: 'video', text: a.filename };
      event = { kind: 'submitted', item: 'video' };
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
    case 'trash': {
      if (who.role !== 'admin') throw err('Not allowed', 403);
      p.deletedAt = now;
      p.deletedBy = who.email || null;
      entry = { type: 'trashed' };
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
  const scripting = !wasScripting && projectStatus(forRole(p, 'admin')) === 'scripting';
  return { project: p, event, scripting };
}
