// A project = one video engagement with a client. It has three checklist items the client completes:
//   dossier  (link to their copy of the sponsor dossier Google Doc)
//   assets   (logo, screenshots, anything else)
//   video    (the raw recording; transcribed automatically)
// Each item: todo -> submitted -> approved, or -> changes (admin asked for an update) -> submitted ...
import { randomBytes } from 'node:crypto';
import { head } from '@vercel/blob';
import { getCompanies, listPaths, readJSON, writeJSON } from './store.js';

import { ITEMS } from './project-shared.js';

export { ITEMS, ITEM_LABEL, STATUS_TEXT, projectStatus } from './project-shared.js';
export const projectPath = (id) => `projects/${id}.json`;

export async function getProject(id) {
  if (!/^[a-z0-9]{8,32}$/.test(String(id))) return null;
  return readJSON(projectPath(id));
}

export const saveProject = (p) => writeJSON(projectPath(p.id), { ...p, updatedAt: new Date().toISOString() });

export async function listProjects({ company } = {}) {
  const all = await Promise.all((await listPaths('projects/')).map((p) => readJSON(p).catch(() => null)));
  return all.filter((p) => p && (!company || p.company === company))
    .sort((a, b) => (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt));
}

export async function createProject(companySlug, name) {
  const company = (await getCompanies()).find((c) => c.slug === companySlug);
  if (!company) throw Object.assign(new Error('Company not found'), { status: 404 });
  const p = {
    id: randomBytes(8).toString('hex'), company: company.slug, companyName: company.name,
    name: String(name || '').trim().slice(0, 120) || `Video project ${new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })}`,
    createdAt: new Date().toISOString(),
    items: { dossier: { status: 'todo' }, assets: { status: 'todo', files: [] }, video: { status: 'todo' } },
    comments: [],
  };
  await saveProject(p);
  return p;
}

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

  switch (a.type) {
    case 'dossier.save': {
      if (!client && who.role !== 'admin') throw err('Not allowed', 403);
      if (!editable('dossier')) throw err('Already approved.');
      const url = String(a.url || '').trim();
      if (!isGoogleDoc(url)) throw err('Please paste the link to your Google Doc (it starts with https://docs.google.com/document/).');
      Object.assign(p.items.dossier, { url, status: 'submitted', submittedAt: now });
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
      Object.assign(p.items.assets, { status: 'submitted', submittedAt: now });
      event = { kind: 'submitted', item: 'assets' };
      break;
    }
    case 'video.set': {
      if (!editable('video')) throw err('Already approved.');
      Object.assign(p.items.video, { jobId: a.jobId, filename: a.filename, status: 'submitted', submittedAt: now });
      event = { kind: 'submitted', item: 'video' };
      break;
    }
    case 'approve': {
      if (client) throw err('Not allowed', 403);
      if (!it) throw err('Unknown item.');
      if (it.status === 'todo') throw err('Nothing has been submitted yet.');
      Object.assign(it, { status: 'approved', approvedAt: now });
      event = { kind: 'approved', item };
      break;
    }
    case 'changes': {
      if (client) throw err('Not allowed', 403);
      if (!it) throw err('Unknown item.');
      const text = String(a.text || '').trim();
      if (!text) throw err('Say what needs to change so the client knows what to do.');
      it.status = 'changes';
      p.comments.push({ item, by: 'admin', name: who.name, email: who.email, text: text.slice(0, 4000), at: now, kind: 'changes' });
      event = { kind: 'changes', item, text };
      break;
    }
    case 'reopen': {
      if (client) throw err('Not allowed', 403);
      if (!it) throw err('Unknown item.');
      it.status = it.submittedAt ? 'submitted' : 'todo';
      break;
    }
    case 'comment': {
      if (!it) throw err('Unknown item.');
      const text = String(a.text || '').trim();
      if (!text) throw err('Write a message first.');
      p.comments.push({ item, by: who.role, name: who.name, email: who.email, text: text.slice(0, 4000), at: now });
      event = { kind: 'comment', item, text };
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
  await saveProject(p);
  return { project: p, event };
}
