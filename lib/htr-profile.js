// Turns a product's Hotel Tech Report profile data into the internal dossier's text fields.
// pullProfile(call, productId) fetches; formatProfile(data) is pure (and tested).

const QUOTE_TOPICS = [
  { key: 'ease', topic: 'ease of use', label: 'Ease of use' },
  { key: 'results', topic: 'time saved and results', label: 'Results' },
  { key: 'support', topic: 'customer support and onboarding', label: 'Support & onboarding' },
  { key: 'drawbacks', topic: 'drawbacks and missing features', label: 'Watch-outs' },
];
const MAX_CASE_STUDIES = 3;

const plain = (s) => String(s ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').replace(/\s+([.,;:!?])/g, '$1').trim();
const pct = (n) => `${Math.round(Number(n))}%`;
const settle = (p) => p.then((v) => v, () => null);

export async function pullProfile(call, productId) {
  const id = Number(productId);
  const product = (await call('htr_get_product', { product_id: id }))?.product;
  if (!product) throw Object.assign(new Error('That product was not found on Hotel Tech Report.'), { status: 404 });

  const [summary, stats, segments, studies, integrations, features, rankings, enriched, ...quotes] = await Promise.all([
    settle(call('htr_get_product_ai_summary', { product_id: id })),
    settle(call('htr_get_product_stats', { product_id: id })),
    settle(call('htr_get_segment_fit', { product_id: id })),
    settle(call('htr_get_case_studies', { product_id: id })),
    settle(call('htr_list_integrations', { product_id: id })),
    settle(call('htr_get_product_features', { product_id: id })),
    product.category_id ? settle(call('htr_get_rankings', { category_id: product.category_id })) : null,
    product.company_id ? settle(call('htr_search_products', { company_id: product.company_id, enriched: true, per_page: 50 })) : null,
    ...QUOTE_TOPICS.map((q) => settle(call('htr_get_review_sentiment', { product_id: id, topic: q.topic }))),
  ]);

  const shown = (studies?.case_studies || []).filter((s) => s.shown_on_profile !== false);
  const ids = [...shown].sort((a, b) => b.case_study_id - a.case_study_id).slice(0, MAX_CASE_STUDIES).map((s) => s.case_study_id);
  const studyDetails = (await Promise.all(ids.map(async (cid) => {
    const s = await settle(call('htr_get_case_study', { case_study_id: cid }));
    return s && !s.message ? { ...s, case_study_id: cid } : null;
  }))).filter(Boolean);

  return formatProfile({
    product, summary, stats, segments, studies: shown, studyDetails, integrations, features, rankings,
    enrichedRow: (enriched?.products || []).find((p) => p.id === id) || null,
    quotes: Object.fromEntries(QUOTE_TOPICS.map((q, i) => [q.key, quotes[i]])),
  });
}

export function formatProfile(d) {
  const f = {};
  const { product, summary, stats, segments, rankings, enrichedRow } = d;

  // Ratings & HT Score
  const r = [];
  const rankRow = (rankings?.rankings || []).find((x) => x.product_id === product.id);
  const scored = (rankings?.rankings || []).filter((x) => Number(x.ht_score) > 0);
  const score = enrichedRow?.ht_score ?? rankRow?.ht_score;
  if (score !== undefined && score !== null) {
    let line = `HT Score: ${score}`;
    if (rankRow && Number(rankRow.ht_score) > 0) line += ` · #${rankRow.position} of ${scored.length} ranked in ${rankings.category_name || product.category_name}`;
    if (rankings?.period?.start_date) line += ` (${period(rankings.period)})`;
    r.push(line);
  }
  const vol = [];
  if (stats?.total_reviews != null) vol.push(`${stats.total_reviews} verified reviews`);
  if (enrichedRow?.unique_hotels_count) vol.push(`from ${enrichedRow.unique_hotels_count} hotels`);
  if (vol.length) r.push(vol.join(' '));
  if (stats?.recommendation_pct != null) r.push(`${pct(stats.recommendation_pct)} of reviewers would recommend it`);
  if (stats?.pricing_tier) r.push(`Pricing tier: ${stats.pricing_tier}`);
  const others = scored.filter((x) => x.product_id !== product.id).slice(0, 4);
  if (others.length) r.push(`Others ranked in the category: ${others.map((x) => `${x.product_name} (${x.ht_score})`).join(', ')}`);
  const awardYears = (product.tags || []).map((t) => /^(\d{4})-awards$/.exec(t)?.[1]).filter(Boolean).sort();
  if (awardYears.length) r.push(`HotelTechAwards on profile: ${awardYears.join(', ')}${(product.tags || []).includes('winner') ? ' (winner tag)' : ''}`);
  if (r.length) f.ratings = r.join('\n');
  if (stats?.support_rating != null) f.starSupport = Number(stats.support_rating).toFixed(2);

  // What hoteliers and experts say, and the six AI summaries
  if (summary?.hoteliers_say) f.hoteliersSay = plain(summary.hoteliers_say);
  if (summary?.partners_say) f.expertsSay = plain(summary.partners_say);
  const cats = summary?.categories || {};
  for (const [k, field] of [['functionality', 'aiFunctionality'], ['user_interface', 'aiUserInterface'], ['integrations', 'aiIntegrations'],
    ['support', 'aiSupport'], ['automation', 'aiAutomation'], ['value', 'aiValue']]) {
    const c = cats[k];
    if (c?.summary) f[field] = `${c.label ? `${c.label}. ` : ''}${plain(c.summary)}`;
  }

  // Who uses it
  const types = (segments?.by_hotel_type || []).filter((t) => t.reviews_count > 0).slice(0, 6);
  const bands = (segments?.by_adr_band || []).filter((b) => b.reviews_count > 0);
  const seg = [];
  if (types.length) seg.push(`By hotel type (share of reviews): ${types.map((t) => `${t.label} ${pct(t.percentage)}`).join(', ')}`);
  if (bands.length) seg.push(`By price tier (ADR): ${bands.map((b) => `${b.label} ${pct(b.percentage)}`).join(', ')}`);
  if (seg.length) f.hotelTypes = seg.join('\n');

  const studies = [];
  for (const s of d.studyDetails || []) {
    const lines = [`• ${plain(s.title).split(' ').slice(0, 30).join(' ')}${s.client_name ? ` (${s.client_name})` : ''}`];
    if (s.objectives?.summary) lines.push(`  Challenge: ${plain(s.objectives.summary)}`);
    const res = (s.results?.items || []).map(plain).filter(Boolean);
    if (s.results?.summary || res.length) lines.push(`  Results: ${[plain(s.results?.summary), ...res].filter(Boolean).join('; ')}`);
    if (s.quote?.detail) lines.push(`  Quote: ${plain(s.quote.detail)}`);
    studies.push(lines.join('\n'));
  }
  const detailed = new Set((d.studyDetails || []).map((s) => s.case_study_id));
  const rest = (d.studies || []).filter((s) => !detailed.has(s.case_study_id));
  if (rest.length) studies.push(`+ ${rest.length} more on the profile: ${rest.map((s) => plain(s.title).split(' ').slice(0, 14).join(' ')).join(' | ')}`);
  if (studies.length) f.caseStudies = studies.join('\n\n');

  const q = [];
  for (const [key, label] of [['ease', 'Ease of use'], ['results', 'Results'], ['support', 'Support & onboarding'], ['drawbacks', 'Watch-outs']]) {
    let snips = (d.quotes?.[key]?.snippets || []);
    snips = key === 'drawbacks' ? snips.filter((s) => s.sentiment !== 'positive') : snips.filter((s) => s.sentiment !== 'negative');
    const seen = new Set();
    const picked = snips.sort((a, b) => b.similarity_score - a.similarity_score)
      .filter((s) => { const t = plain(s.snippet).toLowerCase(); if (seen.has(t)) return false; seen.add(t); return true; })
      .slice(0, 3);
    if (picked.length) q.push(`${label}: ${picked.map((s) => `"${plain(s.snippet)}" (review #${s.review_id})`).join('; ')}`);
  }
  if (q.length) f.hotelierQuotes = q.join('\n');

  // Product
  const partners = (d.integrations?.integrations || []).map((i) => i.partner_company_name).filter(Boolean);
  if (partners.length) f.integrations = `${partners.length} verified: ${partners.join(', ')}`;

  const groups = (d.features?.groups || []).filter((g) => !g.is_other)
    .map((g) => [g.name, (g.features || []).filter((x) => x.selected).map((x) => x.name)]).filter(([, xs]) => xs.length);
  if (groups.length) f.features = groups.map(([g, xs]) => `${g}: ${[...new Set(xs)].join(', ')}`).join('\n');

  const pos = [];
  if (product.tagline) pos.push(`Tagline: ${plain(product.tagline)}`);
  if (product.description) pos.push(`Overview: ${plain(product.description)}`);
  if (product.differentiation) pos.push(`Differentiation: ${String(product.differentiation).replace(/<[^>]+>/g, ' ').trim()}`);
  if (product.implementation) pos.push(`Implementation: ${plain(product.implementation)}`);
  if (pos.length) f.vendorPositioning = pos.join('\n\n');

  return {
    fields: f,
    source: { productId: product.id, name: product.name, company: product.company_name, category: product.category_name, pulledAt: new Date().toISOString() },
  };
}

function period(p) {
  const m = (iso) => new Date(iso).toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  return `${m(p.start_date)} to ${m(p.end_date)}`;
}
