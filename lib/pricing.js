// What a YouTube video costs. Pure (no storage), so the order page and the server share it.
// Prices mirror the Help Center article "Video Content Studio + Youtube". All amounts are US cents.
//   Long form review video   $15,000 Basic / $10,000 Premium
//   Short form video         $2,500 Basic / $2,000 Premium, minimum 4, 20% off 8 or more
//   Social clip add-on       $500 each, only with a long form video
export const PRODUCTS = {
  long: { label: 'Long form review video', unit: { basic: 1500000, premium: 1000000 }, max: 5, note: '4 to 6 minutes, scripted, filmed in studio and edited by Hotel Tech Report.' },
  short: { label: 'Short form video', unit: { basic: 250000, premium: 200000 }, min: 4, max: 40, note: 'About 2 minutes each. Minimum order of 4.' },
  clips: { label: 'Social clip add-on', unit: { basic: 50000, premium: 50000 }, max: 20, note: 'Up to 90 seconds, cut from your long form script for TikTok and Instagram.' },
};
export const SHORT_VOLUME = { qty: 8, percent: 20 };
export const TIERS = ['basic', 'premium'];

export const usd = (cents) => `${cents < 0 ? '-' : ''}$${(Math.abs(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

const int = (n) => { const v = Math.floor(Number(n)); return Number.isFinite(v) && v > 0 ? v : 0; };
export const cleanItems = (raw) => ({ long: int(raw?.long), short: int(raw?.short), clips: int(raw?.clips) });

// Why an order can't be placed as entered, or null.
export function itemsProblem(raw) {
  const it = cleanItems(raw);
  if (!it.long && !it.short && !it.clips) return 'Choose at least one video.';
  if (it.short && it.short < PRODUCTS.short.min) return `Short form videos have a minimum order of ${PRODUCTS.short.min}.`;
  if (it.clips && !it.long) return 'Social clips are an add-on to a long form video. Add a long form video to order them.';
  for (const k of Object.keys(PRODUCTS)) if (it[k] > PRODUCTS[k].max) return `For more than ${PRODUCTS[k].max} of "${PRODUCTS[k].label}", contact us for a custom quote.`;
  return null;
}

// Normalises what someone types as a code.
export const normCode = (c) => String(c || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 32);

// A code is good through the end of its expiry date, Pacific time (08:00 UTC the next morning).
export const codeExpiry = (date) => (date ? Date.parse(`${date}T00:00:00Z`) + 32 * 3600e3 : null);

// Why a code can't be used right now, or null. d is the stored code record.
export function codeProblem(d, now = Date.now()) {
  if (!d || !d.active) return 'That code is not valid.';
  if (d.expiresOn && now >= codeExpiry(d.expiresOn)) return 'That code has expired.';
  if (d.maxUses && (d.uses || 0) >= d.maxUses) return 'That code has already been used.';
  return null;
}

// items {long, short, clips}; tier 'basic' | 'premium'; discount = a valid code record or null.
// Returns the lines that go on the invoice (discounts are negative lines) and the total.
export function priceOrder(rawItems, tier, discount = null) {
  const t = tier === 'premium' ? 'premium' : 'basic';
  const items = cleanItems(rawItems);
  const lines = [];
  for (const key of Object.keys(PRODUCTS)) {
    const qty = items[key];
    if (!qty) continue;
    const unit = PRODUCTS[key].unit[t];
    lines.push({ key, label: PRODUCTS[key].label, qty, unit, amount: qty * unit });
  }
  const short = lines.find((l) => l.key === 'short');
  if (short && short.qty >= SHORT_VOLUME.qty) {
    lines.push({ key: 'volume', label: `Volume discount: ${SHORT_VOLUME.percent}% off ${SHORT_VOLUME.qty}+ short form videos`, amount: -Math.round(short.amount * SHORT_VOLUME.percent / 100) });
  }
  const subtotal = lines.reduce((s, l) => s + l.amount, 0);
  let off = 0;
  if (discount && subtotal > 0) {
    off = discount.kind === 'percent' ? Math.round(subtotal * Math.min(100, discount.value) / 100) : Math.min(subtotal, discount.value);
    if (off > 0) lines.push({ key: 'code', label: `Discount code ${discount.code}${discount.kind === 'percent' ? ` (${discount.value}% off)` : ''}`, amount: -off });
  }
  return { tier: t, items, lines, subtotal, discount: off, total: subtotal - off };
}

// One line of invoice text per order line, e.g. "8 x Short form video ($2,000 each)".
export const lineText = (l) => (l.qty ? `${l.qty} x ${l.label} (${usd(l.unit)} each)` : l.label);
