// Tunable settings for script writing. Change numbers here; no prompt needs editing.
// SCRIPT_BUDGETS in Vercel can override the budgets, e.g. {"walkthrough":[280,330]}.

export const WORDS_PER_MINUTE = 140;

// Spoken-word budget per section [min, max]. Starting ranges, not quotas: never pad to reach a minimum.
const DEFAULT_BUDGETS = {
  intro: [100, 140],
  overview: [80, 110],
  walkthrough: [300, 350],
  caseStudy: [60, 180], // the plan sets the length from how much evidence exists: thin 60-90, moderate 100-140, rich 130-180
  feedback: [180, 230],
  fit: [120, 160],
  verdict: [60, 90],
};

export function budgets() {
  try { return { ...DEFAULT_BUDGETS, ...JSON.parse(process.env.SCRIPT_BUDGETS || '{}') }; } catch { return DEFAULT_BUDGETS; }
}

// The seven sections, in order. `heading` is the exact line the script uses; `match` recognises older spellings.
export const SECTIONS = [
  { id: 'intro', heading: '[HOOK AND INTRO]', label: 'Hook and intro', match: /INTRO|HOOK/ },
  { id: 'overview', heading: '[PLATFORM OVERVIEW]', label: 'Platform overview', match: /OVERVIEW/ },
  { id: 'walkthrough', heading: '[FEATURE WALKTHROUGH]', label: 'Feature walkthrough', match: /WALK/ },
  { id: 'caseStudy', heading: '[CASE STUDY]', label: 'Case study', match: /CASE/ },
  { id: 'feedback', heading: '[REAL-WORLD FEEDBACK]', label: 'Real-world feedback', match: /FEEDBACK|REVIEWS/ },
  { id: 'fit', heading: '[FIT AND PRICING]', label: 'Fit and pricing', match: /FIT|PRICING/ },
  { id: 'verdict', heading: '[VERDICT AND CTA]', label: 'Verdict and CTA', match: /VERDICT|CTA|CLOSE/ },
];

// A section this far over its maximum is flagged on the script page.
export const OVER_BUDGET_TOLERANCE = 1.15;

// Workflows shown in the walkthrough.
export const WALKTHROUGH_WORKFLOWS = [3, 5];

// Independent scoring rubric: weights add up to 100.
export const RUBRIC = [
  ['Hook and intro', 10], ['Platform overview', 10], ['Feature walkthrough', 25], ['Case study', 10],
  ['Verified reviews and independent analysis', 15], ['Fit and pricing', 15], ['Final verdict and CTA', 10], ['Overall editorial quality', 5],
];

// Phrases that should never reach a finished script. Checked by the app, not left to the model.
export const BANNED_PHRASES = [
  'deep dive', 'everything you need to know', "let's dive in", 'let’s dive in', 'fast-paced hospitality landscape', "let's take a look", 'let’s take a look',
  'game changer', 'game-changer', "here's the thing", 'here’s the thing', 'at the end of the day', 'stay tuned', "but that's not all", 'but that’s not all',
  'robust feature set', 'powerful solution', 'in this video we’ll be', "in this video we'll be",
];

// ---------- protected brand language ----------
// These lines are HotelTechReport's, not the model's. The prompts require them word for word, and the app
// restores them itself if an editing pass shortens or drops them.
export const ARIANA_LINE = 'Hi, I’m Ariana from HotelTechReport.com, where we help hoteliers like you future-proof your operations by finding the best tech tools to run and grow your businesses.';
export const CLOSING_CTA = 'On HotelTechReport, you can read verified reviews, check integrations, compare alternatives and request pricing.';
// Buyer actions that always point to HotelTechReport, never to the vendor.
export const HTR_ACTIONS = ['read verified reviews', 'check integrations', 'compare alternatives', 'request pricing'];

// A walkthrough passage shorter than this is a fragment, not a workflow.
export const MIN_WORKFLOW_WORDS = 45;
