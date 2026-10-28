import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { pullProfile } from '../lib/htr-profile.js';
import { INTERNAL_FIELDS } from '../lib/project-shared.js';

const fx = JSON.parse(readFileSync(new URL('./fixtures/htr-event-temple.json', import.meta.url)));
const fake = (overrides = {}) => async (name, args = {}) => {
  if (name in overrides) { const v = overrides[name]; if (v instanceof Error) throw v; return v; }
  const v = structuredClone(fx[name]);
  if (name === 'htr_get_case_study') v.title = `Study ${args.case_study_id}: ${v.title}`;
  return v;
};

test('pulls a full HTR profile into dossier fields', async () => {
  const calls = [];
  const call = async (name, args) => { calls.push([name, args]); return fake()(name, args); };
  const { fields: f, source, failed } = await pullProfile(call, 334);
  assert.deepEqual(failed, []);
  assert.equal(source.name, 'Event Temple');
  assert.ok(Object.keys(f).every((k) => INTERNAL_FIELDS.some((x) => x.key === k)), 'only known fields');
  assert.match(f.ratings, /^HT Score: 100 · #1 of 3 ranked in Event Management Software \(Jul 2026 to Sep 2026\)/);
  assert.match(f.ratings, /452 verified reviews from 179 hotels/);
  assert.match(f.ratings, /99% of reviewers would recommend it/);
  assert.equal(f.starSupport, '4.88');
  assert.doesNotMatch(f.ratings, /Support rating/);
  assert.match(f.ratings, /Tripleseat \(95\), Thynk Event Management \(86\)/);
  assert.doesNotMatch(f.ratings, /Cendyn/, 'unscored products are not listed');
  assert.match(f.ratings, /HotelTechAwards on profile: 2024, 2025, 2026 \(winner tag\)/);
  assert.match(f.hoteliersSay, /biggest gaps are reporting depth/);
  assert.equal(f.expertsSay, undefined, 'no partner summary means empty, not invented');
  assert.equal(f.aiFunctionality, 'Innovative. Hoteliers often highlight the functionality as robust.');
  assert.equal(f.aiAutomation, undefined, 'hidden category stays empty');
  assert.match(f.hotelTypes, /Boutique Hotels 17%, Branded Hotels 14%/);
  assert.match(f.hotelTypes, /By price tier \(ADR\): Upscale 48%, Mid-Scale 30%$/m);
  assert.match(f.caseStudies, /PEG Hospitality/);
  assert.match(f.caseStudies, /Results: Efficiency gains immediately\.; Consistent approaches/);
  assert.match(f.caseStudies, /^• Study 3186: /, 'newest study first');
  assert.match(f.caseStudies, /\+ 1 more on the profile: Mastering Hotel Sales/);
  assert.match(f.hotelierQuotes, /Results: "helping save time and improve efficiency" \(review #91267\)/);
  assert.match(f.hotelierQuotes, /Watch-outs: "reporting could be deeper"/);
  assert.equal(f.integrations, '3 verified: Cloudbeds, Mews, Oracle Hospitality');
  assert.equal(f.features, 'Proposal Management: eSignatures, Customizable BEO, Proposal and Contract Documents');
  assert.match(f.vendorPositioning, /^Tagline: Hotel and Venue CRM/);
  assert.match(f.vendorPositioning, /• Send e-proposals/);
  assert.equal(calls.filter(([n]) => n === 'htr_get_case_study').length, 3, 'full text for the 3 newest case studies');
});

test('one failing source does not sink the pull', async () => {
  const { fields, failed } = await pullProfile(fake({ htr_get_segment_fit: new Error('boom'), htr_get_rankings: new Error('boom') }), 334);
  assert.deepEqual(failed.sort(), ['htr_get_rankings: boom', 'htr_get_segment_fit: boom'], 'failed sources are reported for the alert email');
  assert.equal(fields.hotelTypes, undefined);
  assert.match(fields.ratings, /^HT Score: 100\n452 verified reviews/);
  assert.ok(fields.hoteliersSay);
});

test('unknown product is a clear error', async () => {
  await assert.rejects(pullProfile(fake({ htr_get_product: { message: 'not found' } }), 1), /not found on Hotel Tech Report/);
});
