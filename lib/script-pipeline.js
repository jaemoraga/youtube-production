// The script-writing process.
//
// Twelve steps, one model call each:
//   plan      one editorial plan before any drafting: ranked evidence and a MUST KEEP list, hook,
//             case study, the 3 to 5 workflows worth showing, the verdict, word budgets
//   s1..s7    the seven sections, each written to the plan and to a word budget
//   assemble  one script, inside budget
//   edit      spoken-delivery edit
//   evaluate  an independent score in a separate conversation that never saw the drafting
//   revise    fixes to the sections the evaluation names, and the editor-direction notes
//
// History, so the next change does not undo the last one:
//   V1 (80/100) ran the Google Doc prompts as written: every feature got a segment, no length limit.
//   V2 (91) added the plan, budgets, independent score and targeted revision. It compressed too hard.
//   V3 (93) protected brand lines and evidence. Its walkthrough fragmented into eight timestamped
//       passages and leaked "the presenter opens..." into the narration, because the walkthrough prompt
//       built passages "around what the viewer sees at that timestamp" and the evaluator rewarded
//       splitting modules apart.
//   V4 (95) consolidated the shared rules into one place, set an explicit priority order for conflicts,
//       treated timestamps as source references, separated spoken narration from production notes, and
//       fed the app's own checks to the evaluator. It still narrated the source document ("The published
//       story reports..."), because three prompts asked for claims to be "labeled" and every customer
//       result to carry an "attribution caveat"; it dropped every HotelTechReport rating except the
//       recommend rate, because the plan was told to leave out statistics and never asked for ratings;
//       and it left Survey Manager out entirely, because the plan only chose workflows.
//   V5 (96 on TrustYou, 87 on Chorum PMS, the first other category) separates traceability (plan tags, editor notes) from spoken attribution (the actor,
//       never the document), asks the plan for the decision-relevant ratings and for essential
//       capabilities that must be covered somewhere, and adds hook criteria beyond the size of a number.
//   V6 (this file), from the Chorum run: the plan now separates defensible differentiators from table
//       stakes; case study length follows how much evidence exists (Chorum's thin case study was padded
//       with buyer advice to fill a fixed 130-word minimum); the hook names who reported a result instead
//       of interrupting itself with "a result we haven't verified"; product-level and company-wide evidence
//       are tagged and labeled; and pricing separates confirmed facts from questions to ask.
//
// Rules that apply to more than one step live in the blocks below (PRIORITIES, EVIDENCE_ORDER, NARRATION,
// ATTRIBUTION, WALKTHROUGH_RULES, HOOK_RULES, VERDICT_RULES, PROTECTED). Change them there, not in a step.
import { ARIANA_LINE, CLOSING_CTA, MIN_WORKFLOW_WORDS, RUBRIC, SECTIONS, WALKTHROUGH_WORKFLOWS, WORDS_PER_MINUTE, budgets } from './script-config.js';
import PROMPTS from './script-prompts.js';

export { ARIANA_LINE, CLOSING_CTA };
export const PIPELINE = 6;
export const START = '===SCRIPT START===';
export const END = '===SCRIPT END===';
export const NOTES_START = '===EDITOR NOTES START===';
export const NOTES_END = '===EDITOR NOTES END===';

const [W_MIN, W_MAX] = WALKTHROUGH_WORKFLOWS;

// ---------- shared rules ----------

// The one sentence of the Google Doc standards that the process replaces: it pushed every script toward
// covering everything. The replacement is the reusable evidence-prioritization rule.
const OLD_RULE = 'Do not sacrifice useful information simply to make the script shorter.';
const EVIDENCE_ORDER = 'Prioritize proprietary HotelTechReport research when selecting evidence. Retain findings that materially help hotel operators evaluate the product, especially verified review data, recurring limitations and differentiated expert insight. A script that explains a few things well is more useful than one that mentions everything. When compressing, remove in this order: repetition, then redundant product description and commodity features, then secondary workflow detail. Cut independent buyer intelligence (verified review findings, recurring strengths and weaknesses, quantified outcomes, expert insight, integration facts) last, and never cut an item on the plan\'s MUST KEEP list. Keep the few ratings that matter most to the buying decision: not every rating, and not none.';
if (!PROMPTS.pre.includes(OLD_RULE)) throw new Error('The pre-prompt no longer contains the sentence the process replaces. Update lib/script-pipeline.js.');
export const STANDARDS = PROMPTS.pre.replace(OLD_RULE, EVIDENCE_ORDER);

const PRIORITIES = `PRIORITY ORDER. When two instructions pull in different directions, follow the higher one.
1. Factual accuracy and evidence grounding.
2. Editorial independence.
3. Protected brand language and HotelTechReport conversion rules.
4. Buyer-relevant independent research (the MUST KEEP evidence, limitations, essential capabilities).
5. Cohesive storytelling.
6. Natural spoken delivery.
7. Section word budgets.
8. Secondary feature coverage.
How the known conflicts resolve:
- Grounding is kept by traceability (the plan's source tags and the editor notes), not by naming source documents in the narration. Narration attributes a claim to whoever made it, briefly; it never describes the document.
- Demo timestamps are source references for the editor, never the structure of the narration.
- Describing a demonstration never means narrating someone in the third person.
- Compression removes redundant product description before independent research; word budgets never justify cutting MUST KEEP evidence, and more evidence never justifies covering more features.
- An essential capability can be covered in one sentence inside a workflow or in Fit and Pricing; it does not need its own segment.
- A material qualification is said once; skepticism is not repeated.
- Word budgets are ceilings for thin evidence, not targets: a shorter accurate section beats a padded one.`;

const PROTECTED = (product = 'the product') => `PROTECTED. Copy exactly; editing and compression never remove or reword these:
- The presenter introduction, word for word: ${ARIANA_LINE}
- Buyer actions point to HotelTechReport, never to the vendor: request a price quote for ${product} on HotelTechReport; read verified reviews, check integrations and compare alternatives on HotelTechReport. Advice on what to ask the vendor to demonstrate is fine.
- The closing call to action, word for word: ${CLOSING_CTA}
- No promotional claims about HotelTechReport beyond these lines.`;

// Spoken narration versus production notes, and what natural on-camera delivery looks like.
const NARRATION = `NARRATION. Everything between the headings is spoken by Ariana, HotelTechReport's presenter, directly to hotel operators.
- When describing the demo, speak to the viewer: "Here we can see...", "Let's look at...", "You can filter...", "If you open...". Never "the presenter opens", "the presenter switches", "the user clicks" or any third-person description of whoever ran the demo. Never refer to Ariana as "the presenter". A factual qualification about the demo is fine ("the demo doesn't show that integration running").
- Screen actions, zoom-ins and shot directions belong in the editor notes, not in the narration.
- Sound like a hospitality technology analyst explaining a product on camera:
  - Plain, concrete language over abstract business or research-summary phrasing. Name the hotel situation, the person and the consequence.
  - Say why a capability matters to a hotel manager, with an operational example.
  - Vary sentence length; mostly short and medium sentences, never a string of one-line fragments.
  - Active voice: people and hotels do things.
  - Three to five moments of expert interpretation across the script, each tied to a specific fact or demo moment, often as Ariana's own judgment or recommendation in the first person ("I'd check whether guests think breakfast is overpriced before changing the menu", "This is an important distinction for hotel groups"). Write your own and use any phrasing once. Never imply Ariana tested a capability herself, and never describe something the demo did not show as if she had seen it.
  - Authoritative without sounding academic or like a consultant's report.
  - No filler transitions ("Next, let's look at", "Moving on"), no exaggerated enthusiasm, no generic commentary.
- Research-summary phrasing and its spoken alternative (the pattern, not lines to reuse):
  Written: "The buying case is strongest when managers will use that saved time to investigate service issues."
  Spoken: "This pays off if your managers actually spend the time it saves digging into what guests are unhappy about."
  Written: "The lesson for another operator is practical: review feedback regularly."
  Spoken: say the lesson itself, to the viewer: "If you run several hotels, look across all of them before peak season, not after."
  Written: "Department-level competitor comparisons add context."
  Spoken: "You can also see how your breakfast scores compare with the hotels down the street."
  Written: "A decline across several channels warrants a different investigation from a decline concentrated in one."
  Spoken: "If scores are dropping everywhere, you may have a real service problem. If it's just one review site, that's a different issue."
- Keep precise technical terms where they matter. Polished and authoritative, never forced-casual.`;

const WALKTHROUGH_RULES = `WALKTHROUGH. The goal is to explain the most important capabilities through compelling workflows, not to maximize the number of features mentioned. Organize it into ${W_MIN} to ${W_MAX} cohesive, buyer-relevant operational workflows. Each workflow demonstrates a complete hotel management task or decision: the situation, what we see in the product, what the team can do, and why it matters. Several source-demo timestamps may support one workflow, and related actions stay together even if they come from different parts of the recording. Do not create a separate spoken passage because timestamps differ: timestamps are editing references, not the narrative structure. Each workflow is one passage that opens with a single 🕒 [mm:ss] marker (the moment it starts in the demo) and runs about ${Math.round(budgets().walkthrough[0] / W_MAX)} to ${Math.round(budgets().walkthrough[1] / W_MIN)} words. Prefer buyer usefulness to feature coverage, but do not make the examples superficial. Every ESSENTIAL capability from the plan is covered somewhere: briefly inside the related workflow, or in the overview or Fit and Pricing, never as an extra segment of its own. The budget can stretch slightly when the product's complexity and buyer value justify it.`;

const HOOK_RULES = `HOOK. Choose the opening that makes a hotelier think "That's an interesting problem; I'd like to know how they approached it." Judge candidates on relevance to a hotel's operational challenges, specificity, financial or operational stakes, curiosity and narrative tension, credibility of the evidence, and whether the script can pay it off later. A surprising operational decision (for example, using guest feedback to decide a capital investment) is often more engaging than a large score improvement; never pick a story just because its number is biggest. Within the first 15 seconds (about 35 words), establish a problem, tension or surprising finding a hotelier recognizes, then why it matters, then the finding or customer outcome, then a natural connection to the product. A quantified customer outcome is valuable only when framed so the viewer cares about it; a statistic alone is not a hook. The first sentence is about the hotelier's situation, not about a company, a case study or a press announcement ("X reports that..." and "Its case study shows..." are not openings). No formulas ("Most hotels don't have a ___ problem"), no press-release or generic openings, no artificial YouTube excitement, no exaggeration, and never overstate what the software caused. Not every product has a case study: a problem or a surprising review finding can carry the hook. Keep it concise and credible.`;

const VERDICT_RULES = `VERDICT. An evidence-based purchasing recommendation that names: which buyers should shortlist the product (hotel types or operational situations); the most defensible differentiator from the plan (or, if the plan found none, the strongest supported use case, without claiming superiority); which buyers may prefer another or narrower solution, and why; and what to verify before purchasing. Then the most important buying consideration and the HotelTechReport next step. Fit describes where the product is strongest, not who is excluded: a product especially valuable to multi-property groups may still suit an independent hotel, and the verdict says so when the evidence allows. Avoid absolute or overly narrow recommendations ("buy it only if") unless the evidence justifies them; hotels differ in staffing, budget and organization.`;

// Where a fact came from is recorded in the plan and the editor notes. What Ariana says is who did or
// claimed it, in a few words. This block replaces the earlier rules that asked for claims to be
// "labeled" and results to carry an "attribution caveat", which produced document-narration.
const ATTRIBUTION = `ATTRIBUTION AND QUALIFICATIONS. Source traceability lives in the plan's source tags and the editor notes, not in the narration.
- State well-supported facts directly. HotelTechReport's data is ours to state: "Hotels rate support 4.5 out of 5", not "HTR reviewers report".
- Tell customer stories with the hotel as the subject, in active voice: its challenge, what it did, the outcome. Attribute a customer-reported result to the hotel once and naturally ("YHA reported...", or simply "YHA's score rose from 84 to 86"). Attribute a vendor claim to the vendor ("TrustYou says...").
- Naming who reported a result already tells the viewer it is their account. In the hook, attribution is that name and nothing more ("Best Western River North says it added about $27,000"); never interrupt a hook with "a result we haven't independently verified" or similar. If the result needs a qualification (no measurement period, no breakdown, a vendor-published figure), give it once, in the case study, in plain words ("they didn't say over what period").
- Keep scope exact. Say which evidence is about the product and which is about the company: "52 verified reviews of Chorum", but "across Jonas Hospitality's products" for anything company-wide. Never present parent-company or portfolio figures as the product's.
- Never describe the source document: no "the published case study reports", "the customer story describes", "according to the published account", "the case study indicates", "as the published story explains".
    Instead of: "YHA Australia's published customer story describes using years of TrustYou feedback to inform a property-level HVAC investment."
    Write: "YHA Australia used years of guest feedback to help guide an HVAC investment at one of its properties."
    Instead of: "The published story reports that the group's TrustYou Score increased from 84 to 86 year on year."
    Write: "YHA Australia's TrustYou Score increased from 84 to 86 year over year."
- Keep material qualifications, once, naturally, next to the claim, and never weaken them: a customer-reported result that is not independently verified; a correlation that does not establish cause; a capability that was not demonstrated; an integration that may not support every workflow; uncertain pricing or package availability. Never present a vendor claim as verified or imply the software caused a result the evidence doesn't support.
- Remove unnecessary ones: repeated mentions of the source, the same causation caveat twice, reminders that staff still have to act on recommendations, generic warnings that don't affect a buying decision.`;

const range = (id) => { const [a, b] = budgets()[id]; return `${a} to ${b}`; };
const budgetTable = () => SECTIONS.map((s) => `- ${s.label}: ${range(s.id)} spoken words`).join('\n');
const only = (id) => `Length: ${range(id)} spoken words. A firm default: go over only if buyer value clearly justifies it, and never pad to reach the minimum.
Follow the editorial plan above. Write only what will be spoken${id === 'walkthrough' ? ', plus one 🕒 marker per workflow' : ''}. No headings, grades, critique or notes.`;
// How the product is named when spoken: no parenthetical abbreviations.
const spoken = (name) => String(name || 'the product').replace(/\s*\([^)]*\)\s*/g, ' ').trim();

// ---------- the steps ----------
export const STEPS = [
  {
    key: 'plan', title: 'Editorial plan', max: 3500, effort: 'high',
    prompt: (s) => `${PRIORITIES}

EDITORIAL PLAN. Do not write any script yet.

Read the research materials as a hotel technology analyst and decide what this video will and will not cover. A good plan leaves most of the dossier out. Use these exact headings and keep the whole plan under 800 words.

1. EVIDENCE
The 12 to 20 facts this script is most likely to use. Tag each with its source ([vendor dossier], [HTR data], [demo mm:ss], [case study] or [website]) and its priority:
  P1 proprietary HotelTechReport research: verified review volume and source breadth (hotels, property types), ratings that matter to the decision, recurring strengths, recurring weaknesses, reviewer quotes that illustrate a buyer finding, specific integration information, independent expert analysis
  P2 material limitations and buying considerations, including who may be better served by a narrower or different product
  P3 quantified customer outcomes, with how they were reported
  P4 differentiated workflows
  P5 commodity features and generic description
Tag vendor claims [vendor claim], and tag scope: [product] for evidence about the product reviewed, [company-wide] for evidence about the vendor as a whole or its other products (review counts, ratings, integration and customer counts, awards). When the scope of a figure is unclear, treat it as [company-wide] or leave it out. The tags are for traceability and stay out of the narration. Include pricing exactly as stated, or "pricing not provided". Note any capability limited to certain packages or add-ons.
Then a line "MUST KEEP:" followed by 6 to 12 items, one per line starting with "- ", that the finished script must contain because they materially change a purchasing decision. Draw them mostly from P1 to P3 and copy every number exactly. Include:
  - the two to four HotelTechReport ratings most relevant to this product's buying risks, with their scores (judge which: support matters for complex rollouts, ROI for premium-priced products, ease of use for frontline tools, onboarding for multi-property deployments), each as its own item;
  - every quantified result of the chosen case study.
Leave out statistics that would not change a decision.

2. DIFFERENTIATION, BUYER AND ANGLE
Why would a hotelier shortlist this product instead of another in its category? List two to four candidate differentiators. For each: the evidence (demo moment, verified review pattern, HotelTechReport ranking or category comparison, or other supported competitive context in the materials), and a verdict: DEFENSIBLE (the evidence shows it is uncommon or stronger than typical for the category) or TABLE STAKES (most products in this category do it; useful to explain, not a reason to choose it). Vendor claims of uniqueness are not evidence on their own. Then one line "DIFFERENTIATOR:" with the most defensible one; if none is defensible, write "DIFFERENTIATOR: none established" and name the strongest supported use case instead. The script must never claim superiority the evidence does not support.
Then who this is for (hotel types and operating situations), the central value proposition in one sentence, and the strongest angle. The angle, hook, walkthrough emphasis and verdict should all serve the DIFFERENTIATOR line.

3. HOOK
${HOOK_RULES}
Write three candidates in one line each, each with a different structure and its source: (a) an operational problem or tension, (b) a surprising finding from the reviews, data or demo, (c) a customer outcome framed by the problem it solved (skip (c) if there is no reliable case study). Score each from 1 to 5 on the hook criteria above and choose the highest total, then write it out in its four beats: problem, why it matters, finding or outcome, connection to the product. State the payoff: which later section resolves it.
Rule: a customer story may open the script only if it is the same customer told in the case study section.

4. CASE STUDY
Choose one, if the materials have one. List what the source actually gives, yes or no for each: the problem, implementation detail (what was set up or changed), measured outcomes, a measurement period, a baseline or breakdown, a quote. Then rate its DEPTH: THIN (an outcome with little else), MODERATE, or RICH, and set the case study's length from it: THIN 60 to 90 words, MODERATE 100 to 140, RICH 130 to 180. List the facts, numbers and quote to use, the one material gap worth naming (for example no measurement period), and what must not be claimed. Never invent implementation details or causal explanations to fill a thin case study, and never pad it with buying advice; that belongs in Fit and Pricing.

5. WALKTHROUGH
${WALKTHROUGH_RULES}
Rank what the demo shows by importance to hotel operations and the buying decision, differentiation, strength of the demo evidence and relevance to the target buyer. Name each selected workflow as a job a hotel team does, not as a feature. For each: the anchor timestamp where it starts, every supporting source timestamp, the features folded into it, the one on-screen moment worth showing, and the operational payoff. Then the ESSENTIAL capabilities: anything a buyer must understand before purchasing because it affects product fit or package choice (for example a module that separates pricing tiers, or a core capability none of the workflows shows). One per line, as "ESSENTIAL: <capability name as the product calls it> | covered in: <workflow name, Platform overview, or Fit and pricing> | point: <what the buyer needs to know>". Usually one to three. Finish with "Left out:" and what you are deliberately not covering.

6. FEEDBACK
The three or four findings from verified reviews and expert opinion that matter most to a buyer, with the numbers, then the one or two limitations that matter most. Each limitation is stated once in the script, where it is most useful.

7. FIT, PRICING AND VERDICT
${VERDICT_RULES}
Answer each part in one line, then the pricing facts and the verdict in one sentence.

8. WORD BUDGET
Default budgets:
${budgetTable()}
The case study's budget is the one its DEPTH set. Give the budget for each section. Change a default only with a reason tied to buyer value or thin evidence. A section under its minimum while a MUST KEEP item is missing is a failure, not an efficiency.

These rules apply to every section you write from here on:
${NARRATION}

${ATTRIBUTION}

${PROTECTED(spoken(s.product))}`,
  },
  {
    key: 's1', section: 'intro', title: 'Hook and intro', max: 1200,
    prompt: (s) => `Write the HOOK AND INTRO.

- Open with the hook from the plan, following the HOOK rule: the hotelier's problem first, the result framed so it matters, at most three sentences before the introduction. Attribute any customer result without leading with it.
- Then the protected introduction, word for word: ${ARIANA_LINE}
- In one or two sentences, say what ${spoken(s.product)} is, who uses it and where it fits in hotel operations.
- In no more than two natural sentences, tell the viewer what they will get: the product in use, what ${s.reviewCount ? `${s.reviewCount} verified reviews` : 'verified hotelier reviews'} and industry experts say, the case study if there is one, and a verdict on fit. No bulleted preview.
- Matter of fact. No hyperbole, nothing promotional.

${only('intro')}`,
  },
  {
    key: 's2', section: 'overview', title: 'Platform overview', max: 1500,
    prompt: (s) => `Write the PLATFORM OVERVIEW.

Explain how the pieces of the product fit together, the way you would explain it to a hotel operations manager: start from what the team does with it, then name the parts that make that possible. Use only modules the materials support.${s.websiteText ? `\n\n[The text of ${s.website} was fetched for you and is below. Use it together with the dossiers.]\n\n${s.websiteText}` : '\n\n[The vendor website could not be fetched. Work from the dossiers and the demo transcript, and do not describe modules they do not support.]'}

${only('overview')}

After the narration, on a new line write DIAGRAM PROMPT (not spoken): and give a two or three sentence prompt for an image generator to draw the product's architecture as a modern connected-system diagram, in the style of https://www.cloudbeds.com/wp-content/uploads/2023/05/systems_ENG.svg.`,
  },
  {
    key: 's3', section: 'walkthrough', title: 'Feature walkthrough', max: 2200,
    prompt: () => `Write the FEATURE WALKTHROUGH.

${WALKTHROUGH_RULES}

- Start with one natural sentence that moves from the overview into the live product.
- Write exactly the workflows selected in the plan, one passage each, each opening with its anchor 🕒 [mm:ss] marker. Supporting timestamps are not written into the narration; the editor gets them later.
- In each passage, describe what we see on screen to the viewer ("Here we can see...", "You can..."), then what a hotel team does with it and why it matters, with a concrete example. Do not describe any screen, button or behavior the demo and dossiers do not show.
- At most two forward references to later sections, and only where they are real and specific.

${only('walkthrough')}`,
  },
  {
    key: 's4', section: 'caseStudy', title: 'Case study', max: 1200,
    prompt: () => `Write the CASE STUDY, using the customer chosen in the plan.

Write it to the DEPTH and length the plan set. Use each number once. Tell it as a story led by the hotel, in active voice: the hotel and its scale, its challenge, what it did and how the product fit into the team's work, and the outcome. Name the capability that made the difference. Include the hotelier's quote if there is one, and every outcome on the MUST KEEP list for this customer, attributed to the hotel once as the ATTRIBUTION rule describes. If the hook opened with this customer, this is where the story pays off. If the plan named a material gap, say it once, plainly. End on what another operator should take from it, in one sentence, said directly to the viewer. A short case study is correct when the evidence is thin; do not fill it with buying advice.

Length: the words the plan's DEPTH set (thin 60 to 90, moderate 100 to 140, rich 130 to 180). Write only what will be spoken. No headings, grades, critique or notes.`,
  },
  {
    key: 's5', section: 'feedback', title: 'Real-world feedback', max: 1500,
    prompt: (s) => `Write the REAL-WORLD FEEDBACK section.

- Step back from one hotel's story to what verified users say across many hotels${s.reviewCount ? `: Hotel Tech Report analyzed ${s.reviewCount} verified reviews of ${spoken(s.product)}` : ''}, alongside industry expert opinion. Say where the reviews come from (how many hotels, what kinds) if the materials give it.
- In one sentence, say that Hotel Tech Report's evaluation looks at ease of use, core functionality, value for money, integrations and support, based on surveys of verified users and industry experts.
- Then the findings chosen in the plan as one flowing account, not a list of categories: the ratings that matter (state them directly as HotelTechReport's data), recurring strengths, and a reviewer quote where it illustrates a finding. Every HotelTechReport rating and finding on the MUST KEEP list goes here, with its number.
- Say what each finding means for a hotel team deciding whether to buy.
- State the limitations chosen in the plan, once each, specifically, and say who they matter to. Do not soften them.

${only('feedback')}`,
  },
  {
    key: 's6', section: 'fit', title: 'Fit and pricing', max: 1200,
    prompt: (s) => `Write FIT AND PRICING.

- Move from what reviewers say to whether it is right for the viewer: which hotels and situations it suits, in terms of the workflows and outcomes they would prioritize, and what to verify in a demo before committing.
- Cover any ESSENTIAL capability the plan assigned here, in a sentence each, tied to package choice where relevant.
- PRICING, in this order: (1) the pricing structure only as the materials confirm it (model, tiers, what each includes); do not imply a capability is in every package unless the materials say so. (2) If prices are not provided, say so once. (3) The additional costs a buyer should verify, phrased as questions to ask, not as facts about this vendor: the cost items typical for this category (for example implementation, data migration, training, interfaces and integrations, payment processing, hardware, per-module or per-user fees), choosing the ones that matter here. Never describe how this vendor's quotes vary, what discounts it offers or which fees it charges unless the materials say so. (4) Consultatively and without selling: viewers can request a price quote for ${spoken(s.product)} on HotelTechReport.

${only('fit')}`,
  },
  {
    key: 's7', section: 'verdict', title: 'Verdict and CTA', max: 900,
    prompt: () => `Write the VERDICT AND CTA.

- Return in one sentence to the problem the hook opened with.
- ${VERDICT_RULES} Do not repeat what Fit and Pricing already said.
- End with the protected closing call to action, word for word: ${CLOSING_CTA}
- No summary of the video, no "hopefully you now have a clear picture", no rhetorical question.

${only('verdict')}`,
  },
  {
    key: 'assemble', title: 'Assemble', max: 5000,
    prompt: (s) => `Assemble the seven sections into one teleprompter-ready script.

- Use exactly these heading lines, in this order, each on its own line: ${SECTIONS.map((x) => x.heading).join('  ')}
- Under each heading put only what will be spoken. In the walkthrough, keep one 🕒 marker at the start of each workflow passage; never add or split one.
- Make it one continuous explanation: fix transitions so each section follows from the last, and remove anything said twice.
- Bring each section inside its budget, cutting in the order the standards set. Do not trim by turning passages into lists of feature names, and do not cut a section below its minimum.
- Every MUST KEEP item must be present. Check: the hook is paid off; each limitation appears once; the review count is the same everywhere; nothing contradicts the pricing or package facts. Add no new facts.

${PROTECTED(spoken(s.product))}

Put the script, and nothing else, between a line that reads exactly ${START} and a line that reads exactly ${END}. Above the first marker, give one title card suggestion.`,
  },
  {
    key: 'edit', title: 'Spoken delivery edit', max: 5000,
    prompt: (s) => `Edit the assembled script for how it sounds on camera and how well it holds attention. Change wording, order within a section and rhythm; do not change the analysis.

${NARRATION}

${ATTRIBUTION}

Watchability:
- Vary how passages begin: some with the hotel's problem, some with what we see in the demo, some with a reviewer's experience.
- Where one idea can lead into the next by cause and effect or by a buyer's question, use that instead of a transition phrase.
- Replace generic praise and abstract observations with the specific operational consequence.
- Read it as someone who watched five other HotelTechReport reviews just before this one; rewrite anything that sounds like a template.

${PROTECTED(spoken(s.product))}

Preserve every fact, number, quote, price, material qualification, MUST KEEP item, ESSENTIAL capability and buying recommendation; the headings and their order; one 🕒 marker per workflow (never add or split).
Limits: no section above its budget maximum or below its minimum; the whole script no more than about 10% longer. No em dashes, hype, strings of rhetorical questions, one-line dramatic paragraphs or clickbait.

Return the full script between ${START} and ${END}. Below it, list the five most meaningful edits in one line each.`,
  },
  {
    key: 'evaluate', title: 'Independent score', max: 3000, effort: 'high', fresh: true,
    prompt: (s, ctx) => `You are an independent editorial evaluator for Hotel Tech Report's YouTube product reviews. You did not write this script. Score it and report findings. Do not rewrite it.

Anchor every judgment to something observable in the script or the research materials. Do not reward polish, confidence or length. A deduction needs a quoted passage, why it underperforms, and a concrete fix limited to that section.

${PRIORITIES}

Rubric (points available):
${RUBRIC.map(([n, w]) => `- ${n}: ${w}`).join('\n')}

Report every failure of these checks as an issue:
Accuracy and independence
- A claim, number, quote, price, integration or feature the research does not support; a package statement that contradicts another or implies a capability is in every package.
- A correlation presented as proof the product caused a result.
- Company-wide or portfolio evidence presented as the product's (review counts, ratings, integration or customer counts), or a figure whose scope is ambiguous.
- Pricing assumptions presented as this vendor's policy (how its quotes vary, its fees or discounts) without support in the materials.
- No clear reason to shortlist the product over others in its category, a table-stakes capability presented as a differentiator, or superiority the evidence does not support.
- A MUST KEEP item (listed below) missing or with a changed number, including the chosen HotelTechReport ratings. [must-fix]; name the section it belongs in.
- An ESSENTIAL capability (listed below) not covered anywhere. [must-fix]; a sentence in the section the plan assigned is enough.
- A material qualification missing (unverified customer result, correlation as cause, capability not demonstrated, integration limits, uncertain pricing).
Brand and conversion
- The introduction not word for word: ${ARIANA_LINE}
- A buyer sent to the vendor for pricing, reviews or comparisons; a closing call to action that is not: ${CLOSING_CTA}
Structure
- A walkthrough with more than ${W_MAX} separately narrated passages, a passage under about ${MIN_WORKFLOW_WORDS} words, or source timestamps used as narrative sections. Combining related actions from different parts of the demo into one workflow is correct; never ask for more timestamps or for modules to be separated.
- Narration that misdescribes what the demo shows.
- A hook that opens on a company, a case study or a statistic without the hotelier's problem and why it matters; a hook not paid off later.
- A verdict missing any of: who should shortlist it, the differentiator, who may prefer another solution, the main buying consideration, the HotelTechReport next step; or one that is absolute or narrower than the evidence (for example excluding independents when the evidence supports them).
- A hook with no payoff later in the script, or one chosen for the size of a number over a more interesting problem in the evidence.
Delivery
- Third-person narration of the demo or of the presenter ("the presenter opens", "the user clicks"). A factual note such as "the demo doesn't show this running" is fine.
- Abstract, research-summary or generic phrasing a hotel professional would not say on camera; repetitive transitions; no expert interpretation, or interpretation that is unsupported or implies hands-on testing.
- Source-document narration ("the published case study reports", "the customer story describes", "according to the published account", "HTR reviewers report"), or a customer story not led by the hotel in active voice.
- The same caveat twice, or a qualifier that changes nothing a buyer would conclude; a hook interrupted by a verification disclaimer.
- A case study padded beyond its evidence (repeated figures, generic buying advice, invented implementation detail or causes).
- Grammar errors, and names a presenter may stumble on.

The app has already run these checks on the script. Each one listed is confirmed; report it as [must-fix]:
${ctx.checks || 'none failed'}

MUST KEEP items from the editorial plan:
${ctx.mustKeep || 'none listed'}

ESSENTIAL capabilities from the editorial plan:
${ctx.essentials || 'none listed'}

Word counts, computed by the app; do not count yourself:
${ctx.counts}

Reply in exactly this form:

SCORES
<one line per rubric item: name: points/available, with a five to twelve word reason>
TOTAL: <sum>/100

ISSUES
<numbered. Each: [must-fix] or [should-fix], the section, the quoted passage, why it underperforms, the fix. Most important first. No more than twelve.>

KEEP
<three to six short quoted passages that are working and must not be changed>

# EDITORIAL STANDARDS THE SCRIPT WAS WRITTEN TO

${STANDARDS}

${s.materials}

# SCRIPT TO EVALUATE

${ctx.script}`,
  },
  {
    key: 'revise', title: 'Targeted revision and editor notes', max: 6000, effort: 'high', fresh: true,
    prompt: (s, ctx) => `You are the senior editor finishing a Hotel Tech Report YouTube review script. An independent evaluator has reported findings. Fix only the sections those findings name; copy every other section word for word.

${PRIORITIES}

Rules:
- Fix every [must-fix] issue, and every [should-fix] issue unless the fix would remove supported evidence. Leave the passages under KEEP unchanged.
- Restore a missing MUST KEEP item in the section the evaluator names, using room under that section's budget maximum; that is not padding. Bring an over-budget section back by cutting repetition and generic description first.
- If the walkthrough has more than ${W_MAX} passages or fragments, merge related passages into ${W_MIN} to ${W_MAX} complete workflows, each keeping the earliest relevant 🕒 marker. Never add a marker or split a passage.
- Add no fact, number, quote, feature, integration or price that is not in the research. Keep vendor claims attributed to the vendor, customer results to the customer, and each material qualification stated once.
- Cover a missing ESSENTIAL capability in a sentence in the section the plan assigned, not as a new segment.
- Keep the seven heading lines and their order. No em dashes.

${NARRATION}

${ATTRIBUTION}

${PROTECTED(spoken(s.product))}

Before you answer, check silently: every claim is grounded; every MUST KEEP item is present with its exact number; every ESSENTIAL capability is covered; no source-document narration; the protected lines are word for word; no third-person narration; ${W_MIN} to ${W_MAX} walkthrough workflows; the verdict names who should shortlist it and who may prefer something else.

Word counts of the script as it stands (budgets in brackets):
${ctx.counts}

Reply in exactly this form:

${START}
<the full revised script>
${END}

${NOTES_START}
<Editor directions, never spoken. One block per walkthrough workflow, plus any other moment where the picture matters:
🕒 [mm:ss] <workflow> | Source timestamps: <every demo timestamp this workflow draws on, from the plan> | Show: <the screen recording sequence> | Highlight: <the one interface element to zoom into> | Why: <the takeaway for the viewer>
Third person and screen actions belong here, not in the narration. Do not describe any screen or action the demo and dossiers do not show. Then "Sources:" with one line per section naming where its key facts come from (HotelTechReport data, vendor dossier, the case study by name, demo mm:ss, website), so every spoken claim stays traceable. Then one line "Title card:" and one line "Diagram prompt:" carried over from the drafting below.>
${NOTES_END}

CHANGES
<up to eight lines: what you changed and which issue it answers>

# EDITORIAL STANDARDS

${STANDARDS}

${s.materials}

# EDITORIAL PLAN THE SCRIPT WAS WRITTEN TO

${ctx.plan}

# TITLE CARD AND DIAGRAM PROMPT FROM DRAFTING

${ctx.extras}

# INDEPENDENT EVALUATION

${ctx.evaluation}

# SCRIPT TO REVISE

${ctx.script}`,
  },
];

export const RUNTIME = (words) => { const sec = Math.round((words / WORDS_PER_MINUTE) * 60); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; };
