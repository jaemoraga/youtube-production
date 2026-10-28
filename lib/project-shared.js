// Shared by server and browser code (no server-only imports here).
export const ITEMS = ['dossier', 'assets', 'video'];
export const ITEM_LABEL = { dossier: 'Sponsor dossier', assets: 'Brand materials', video: 'Video' };
export const STATUS_TEXT = {
  todo: 'To do', submitted: 'Submitted', changes: 'Update requested', approved: 'Approved',
  waiting: 'Waiting on client', review: 'Ready for review',
  internal: 'Internal dossier needed', scripting: 'Ready for scripting',
};

// HTR-only internal dossier: free text copied from the vendor's HTR profile. Never sent to clients.
export const INTERNAL_FIELDS = [
  { key: 'ratings', label: 'Ratings & HT Score' },
  { key: 'starEase', label: 'Ease of use', group: 'Star ratings', short: true },
  { key: 'starSupport', label: 'Support', group: 'Star ratings', short: true },
  { key: 'starRoi', label: 'ROI', group: 'Star ratings', short: true },
  { key: 'starOnboarding', label: 'Onboarding', group: 'Star ratings', short: true },
  { key: 'starUx', label: 'UX', group: 'Star ratings', short: true },
  { key: 'hoteliersSay', label: 'Hoteliers say' },
  { key: 'expertsSay', label: 'Experts say' },
  { key: 'aiFunctionality', label: 'Functionality', group: 'AI summaries' },
  { key: 'aiUserInterface', label: 'User interface', group: 'AI summaries' },
  { key: 'aiIntegrations', label: 'Integrations', group: 'AI summaries' },
  { key: 'aiSupport', label: 'Support', group: 'AI summaries' },
  { key: 'aiAutomation', label: 'Automation', group: 'AI summaries' },
  { key: 'aiValue', label: 'Value', group: 'AI summaries' },
  { key: 'hotelTypes', label: 'Types of hotels', group: 'Who uses it' },
  { key: 'caseStudies', label: 'Case studies', group: 'Who uses it' },
  { key: 'hotelierQuotes', label: 'Hotelier quotes', group: 'Who uses it' },
  { key: 'integrations', label: 'Verified integrations', group: 'Product' },
  { key: 'features', label: 'Features', group: 'Product' },
  { key: 'vendorPositioning', label: "In the vendor's words", group: 'Product' },
];

// Shown under a group heading when the HTR data feed can't fill it.
export const GROUP_HINT = { 'Star ratings': 'Average out of 5 from the profile. Support fills automatically; copy the rest by hand.' };

// All three client items approved.
export const clientDone = (p) => ITEMS.every((i) => p.items[i].status === 'approved');

// One word for the whole project.
export function projectStatus(p) {
  const s = ITEMS.map((i) => p.items[i].status);
  if (s.every((x) => x === 'approved')) {
    // Client views never carry the internal dossier, so they simply see 'approved'.
    if (p.internal === undefined) return 'approved';
    return p.internal.completedAt ? 'scripting' : 'internal';
  }
  if (s.some((x) => x === 'todo' || x === 'changes')) return 'waiting';     // client's court
  return 'review';                                                           // HTR's court
}

// Project timeline, newest first. Uses the activity log; projects from before the log existed
// get their early events rebuilt from the dates already on the project. job = video summary or null.
export function timeline(p, job = null) {
  const L = ITEM_LABEL;
  const label = (e) => {
    const it = L[e.item] || '';
    switch (e.type) {
      case 'created': return e.by?.role === 'client' ? 'Project created when the client signed up' : 'Project created';
      case 'submitted': return `${it} submitted${e.text ? ` (${e.text})` : ''}`;
      case 'approved': return `${it} approved`;
      case 'changes': return `Update requested on ${it.toLowerCase()}${e.text ? `: "${e.text}"` : ''}`;
      case 'reopened': return `${it} approval undone`;
      case 'comment': return `Message on ${it.toLowerCase()}${e.text ? `: "${e.text}"` : ''}`;
      case 'internal.started': return 'Internal dossier started';
      case 'internal.pulled': return `HTR profile data pulled${e.text ? ` (${e.text})` : ''}`;
      case 'internal.complete': return 'Internal dossier marked complete';
      case 'internal.reopened': return 'Internal dossier reopened';
      case 'transcribed': return `Transcript ready${e.text ? ` (${e.text})` : ''}`;
      case 'transcribe-failed': return `Transcription failed${e.text ? `: ${e.text}` : ''}`;
      case 'trashed': return 'Moved to trash';
      case 'restored': return 'Restored from trash';
      default: return e.type;
    }
  };
  const log = p.log || [];
  const firstLogged = log.length ? Math.min(...log.map((e) => Date.parse(e.at))) : Infinity;
  const old = [];
  if (!log.some((e) => e.type === 'created') && p.createdAt) old.push({ at: p.createdAt, type: 'created' });
  for (const i of ITEMS) {
    const it = p.items[i];
    if (it.submittedAt) old.push({ at: it.submittedAt, type: 'submitted', item: i, by: it.submittedBy || null });
    if (it.approvedAt) old.push({ at: it.approvedAt, type: 'approved', item: i });
  }
  for (const c of p.comments || []) old.push({ at: c.at, type: c.kind === 'changes' ? 'changes' : 'comment', item: c.item, text: String(c.text || '').slice(0, 300), by: { name: c.name, email: c.email, role: c.by } });
  const events = [...log, ...old.filter((e) => e.type === 'created' || Date.parse(e.at) < firstLogged)];
  if (job?.completedAt && job.status === 'done') events.push({ at: job.completedAt, type: 'transcribed', text: job.durationText || '' });
  if (job?.status === 'error') events.push({ at: job.updatedAt || job.createdAt, type: 'transcribe-failed', text: job.error || '' });
  return events
    .filter((e) => e.at)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .map((e) => ({ at: e.at, text: label(e), by: e.by || null, client: e.by?.role === 'client' }));
}
