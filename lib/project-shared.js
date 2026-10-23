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
  { key: 'hoteliersSay', label: 'Hoteliers say' },
  { key: 'expertsSay', label: 'Experts say' },
  { key: 'aiFunctionality', label: 'Functionality', group: 'AI summaries' },
  { key: 'aiUserInterface', label: 'User interface', group: 'AI summaries' },
  { key: 'aiIntegrations', label: 'Integrations', group: 'AI summaries' },
  { key: 'aiSupport', label: 'Support', group: 'AI summaries' },
  { key: 'aiAutomation', label: 'Automation', group: 'AI summaries' },
  { key: 'aiValue', label: 'Value', group: 'AI summaries' },
  { key: 'hotelTypes', label: 'Types of hotels' },
  { key: 'ratings', label: 'Ratings' },
  { key: 'caseStudies', label: 'Case studies' },
];

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
