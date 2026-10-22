// Shared by server and browser code (no server-only imports here).
export const ITEMS = ['dossier', 'assets', 'video'];
export const ITEM_LABEL = { dossier: 'Sponsor dossier', assets: 'Brand materials', video: 'Video' };
export const STATUS_TEXT = {
  todo: 'To do', submitted: 'Submitted', changes: 'Update requested', approved: 'Approved',
  waiting: 'Waiting on client', review: 'Ready for review',
};

// One word for the whole project.
export function projectStatus(p) {
  const s = ITEMS.map((i) => p.items[i].status);
  if (s.every((x) => x === 'approved')) return 'approved';
  if (s.some((x) => x === 'todo' || x === 'changes')) return 'waiting';     // client's court
  return 'review';                                                           // HTR's court
}
