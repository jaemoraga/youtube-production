// Discount codes HTR creates in /admin/orders. One small JSON file: config/discounts.json.
//   { code, kind: 'percent' | 'amount', value (percent, or US cents), expiresOn 'YYYY-MM-DD' | null,
//     maxUses | null, uses, active, note, createdAt, createdBy }
import { codeProblem, normCode } from './pricing.js';
import { readJSON, writeJSON } from './store.js';

const FILE = 'config/discounts.json';
const err = (message, status = 400) => Object.assign(new Error(message), { status });

export const listDiscounts = async () => (await readJSON(FILE).catch(() => null)) || [];
const save = (list) => writeJSON(FILE, list);

export async function createDiscount({ code, kind, value, expiresOn, maxUses, note }, by = null) {
  const c = normCode(code);
  if (c.length < 3) throw err('A code needs at least 3 letters or numbers.');
  const k = kind === 'amount' ? 'amount' : 'percent';
  const v = k === 'percent' ? Math.round(Number(value)) : Math.round(Number(value) * 100);
  if (!Number.isFinite(v) || v <= 0) throw err('Enter how much the code takes off.');
  if (k === 'percent' && v > 100) throw err('A percentage code cannot be more than 100.');
  const exp = String(expiresOn || '').trim();
  if (exp && (!/^\d{4}-\d{2}-\d{2}$/.test(exp) || Number.isNaN(Date.parse(exp)))) throw err('The expiry date is not a valid date.');
  const max = Math.floor(Number(maxUses)) > 0 ? Math.floor(Number(maxUses)) : null;
  const list = await listDiscounts();
  if (list.some((d) => d.code === c)) throw err(`The code ${c} already exists.`, 409);
  const d = { code: c, kind: k, value: v, expiresOn: exp || null, maxUses: max, uses: 0, active: true, note: String(note || '').trim().slice(0, 200), createdAt: new Date().toISOString(), createdBy: by };
  await save([d, ...list]);
  return d;
}

export async function setDiscountActive(code, active) {
  const list = await listDiscounts();
  const d = list.find((x) => x.code === normCode(code));
  if (!d) throw err('Code not found.', 404);
  d.active = !!active;
  await save(list);
  return d;
}

export async function removeDiscount(code) {
  const list = await listDiscounts();
  const d = list.find((x) => x.code === normCode(code));
  if (!d) throw err('Code not found.', 404);
  if (d.uses) throw err('This code has been used on an order, so it can only be switched off.', 409);
  await save(list.filter((x) => x !== d));
}

// Looks a typed code up. Returns { discount } or { problem }. An empty code is neither.
export async function findDiscount(code, now = Date.now()) {
  const c = normCode(code);
  if (!c) return {};
  const d = (await listDiscounts()).find((x) => x.code === c);
  const problem = codeProblem(d, now);
  return problem ? { problem } : { discount: d };
}

export async function countUse(code) {
  const list = await listDiscounts();
  const d = list.find((x) => x.code === code);
  if (!d) return;
  d.uses = (d.uses || 0) + 1;
  await save(list);
}
