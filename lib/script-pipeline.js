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
//   V4 (this file) consolidates the shared rules into one place, sets an explicit priority order for
//       conflicts, treats timestamps as source references, separates spoken narration from production
//       notes, and feeds the app's own checks to the evaluator.
//
// Rules that apply to more than one step live in the blocks below (PRIORITIES, EVIDENCE_ORDER, NARRATION,
// WALKTHROUGH_RULES, HOOK_RULES, VERDICT_RULES, CAVEATS, PROTECTED). Change them there, not in a step.
import { ARIANA_LINE, CLOSING_CTA, MIN_WORKFLOW_WORDS, RUBRIC, SECTIONS, WALKTHROUGH_WORKFLOWS, WORDS_PER_MINUTE, budgets } from './script-config.js';
import PROMPTS from './script-prompts.js';

export { ARIANA_LINE, CLOSING_CTA };
export const PIPELINE = 4;
export const START = '===SCRIPT START===';
export const END = '===SCRIPT END===';
export const NOTES_START = '===EDITOR NOTES START===';
export const NOTES_END = '===EDITOR NOTES END===';

const [W_MIN, W_MAX] = WALKTHROUGH_WORKFLOWS;

// ---------- shared rules ----------

// The one sentence of the Google Doc standards that the process replaces: it pushed every script toward
// covering everything. The replacement is the reusable evidence-prioritization rule.
const OLD_RULE = 'Do not sacrifice useful information simply to make the script shorter.';
const EVIDENCE_ORDER = 'Prioritize proprietary HotelTechReport research when selecting evidence. Retain findings that materially help hotel operators evaluate the product, especially verified review data, recurring limitations and differentiated expert insight. A script that explains a few things well is more useful than one that mentions everything. When compressing, remove in this order: repetition, then generic product description and commodity features, then secondary workflow detail. Cut substantive independent research, material limitations and quantified customer outcomes last, and never cut an item on the plan\'s MUST KEEP list. Do not recite every available rating; keep the ones that change a buying decision.';
if (!PROMPTS.pre.includes(OLD_RULE)) throw new Error('The pre-prompt no longer contains the sentence the process replaces. Update lib/script-pipeline.js.');
export const STANDARDS = PROMPTS.pre.replace(OLD_RULE, EVIDENCE_ORDER);

const PRIORITIES = `PRIORITY ORDER. When two instructions pull in different directions, follow the higher one.
1. Factual accuracy and grounding in the research materials.
2. Protected brand language and HotelTechReport conversion rules.
3. Editorial independence and meaningful buying intelligence (the MUST KEEP evidence, limitations, a two-sided verdict).
4. A cohesive narrative that stays relevant to the buyer.
5. Natural spoken delivery.
6. Section word budgets.
7. Secondary feature coverage.
How the known conflicts resolve:
- Demo timestamps are source references for the editor, never the structure of the narration.
- Describing a demonstration never means narrating someone in the third person.
- Word budgets never justify cutting MUST KEEP evidence; more evidence never justifies covering more features.
- Each customer result gets one attribution caveat; skepticism is not repeated.`;

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
  - Three to five moments of expert interpretation across the script, each tied to a specific fact or demo moment (for example "This is an important distinction for hotel groups" or "This is something I'd ask the vendor to demonstrate"). Write your own, use any phrasing once, and never claim hands-on testing.
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

const WALKTHROUGH_RULES = `WALKTHROUGH. Organize it into ${W_MIN} to ${W_MAX} cohesive, buyer-relevant operational workflows. Each workflow demonstrates a complete hotel management task or decision: the situation, what we see in the product, what the team can do, and why it matters. Several source-demo timestamps may support one workflow, and related actions stay together even if they come from different parts of the recording. Do not create a separate spoken passage because timestamps differ: timestamps are editing references, not the narrative structure. Each workflow is one passage that opens with a single 🕒 [mm:ss] marker (the moment it starts in the demo) and runs about ${Math.round(budgets().walkthrough[0] / W_MAX)} to ${Math.round(budgets().walkthrough[1] / W_MIN)} words. Prefer buyer usefulness to feature coverage, but do not make the examples superficial.`;

const HOOK_RULES = `HOOK. Within the first 15 seconds (about 35 words), establish a problem, tension or surprising finding a hotelier recognizes, then why it matters, then the finding or customer outcome, then a natural connection to the product. A quantified customer outcome is valuable only when framed so the viewer cares about it; a statistic alone is not a hook. The first sentence is about the hotelier's situation, not about a company, a case study or a press announcement ("X reports that..." and "Its case study shows..." are not openings). No formulas ("Most hotels don't have a ___ problem"), no exaggeration, and never overstate what the software caused. Not every product has a case study: a problem or a surprising review finding can carry the hook. Keep it concise and credible.`;

const VERDICT_RULES = `VERDICT. An evidence-based purchasing recommendation that names: which buyers should shortlist the product (hotel types or operational situations); the most important differentiator; which buyers may prefer another or narrower solution, and why; and what to verify before purchasing. Avoid absolute recommendations ("buy it only if") unless the evidence justifies them; hotels differ in staffing, budget and organization.`;

const CAVEATS = `CAVEATS. State the attribution caveat for a customer result once, in one sentence, where the result appears. Delete qualifiers that do not change what a buyer would conclude (that staff still had to do the work; that a correlation in a dashboard is not proof of cause). Keep every material limitation and factual qualification.`;

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
Mark vendor claims as claims. Include pricing exactly as stated, or "pricing not provided". Note any capability limited to certain packages or add-ons.
Then a line "MUST KEEP:" followed by 6 to 10 items, one per line starting with "- ", that the finished script must contain because they materially change a purchasing decision. Draw them mostly from P1 to P3, copy every number exactly, include every quantified result of the chosen case study, and leave out statistics that exist but would not change a decision.

2. BUYER AND ANGLE
Who this is for (hotel types and operating situations), the central value proposition in one sentence, and the strongest angle the evidence supports.

3. HOOK
${HOOK_RULES}
Write three candidates in one line each, each with a different structure and its source: (a) an operational problem or tension, (b) a surprising finding from the reviews, data or demo, (c) a customer outcome framed by the problem it solved (skip (c) if there is no reliable case study). Choose one on relevance, credibility and its ability to hold attention, then write it out in its four beats: problem, why it matters, finding or outcome, connection to the product. State the payoff: which later section resolves it.
Rule: a customer story may open the script only if it is the same customer told in the case study section.

4. CASE STUDY
Choose one, if the materials have one. It must show the problem, how the product fit into the work, what changed, how credible the evidence is, and what another hotelier can learn. List the facts, numbers and quote to use, and what must not be claimed.

5. WALKTHROUGH
${WALKTHROUGH_RULES}
Rank what the demo shows by importance to hotel operations and the buying decision, differentiation, strength of the demo evidence and relevance to the target buyer. Name each selected workflow as a job a hotel team does, not as a feature. For each: the anchor timestamp where it starts, every supporting source timestamp, the features folded into it, the one on-screen moment worth showing, and the operational payoff. Finish with "Left out:" and what you are deliberately not covering.

6. FEEDBACK
The three or four findings from verified reviews and expert opinion that matter most to a buyer, with the numbers, then the one or two limitations that matter most. Each limitation is stated once in the script, where it is most useful.

7. FIT, PRICING AND VERDICT
${VERDICT_RULES}
Answer each part in one line, then the pricing facts and the verdict in one sentence.

8. WORD BUDGET
Default budgets:
${budgetTable()}
Give the budget for each section. Change a default only with a reason tied to buyer value or thin evidence. A section under its minimum while a MUST KEEP item is missing is a failure, not an efficiency.

These rules apply to every section you write from here on:
${NARRATION}

${CAVEATS}

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

Tell it as a short story for peers: the hotel and its scale, the problem, how the product fit into the team's work, what changed, and the measured results. Name the capability that made the difference. Include the hotelier's quote if there is one, and every outcome on the MUST KEEP list for this customer. If the hook opened with this customer, this is where the story is completed. End on what another operator should take from it, said directly to the viewer.

${only('caseStudy')}`,
  },
  {
    key: 's5', section: 'feedback', title: 'Real-world feedback', max: 1500,
    prompt: (s) => `Write the REAL-WORLD FEEDBACK section.

- Step back from one hotel's story to what verified users say across many hotels${s.reviewCount ? `: Hotel Tech Report analyzed ${s.reviewCount} verified reviews of ${spoken(s.product)}` : ''}, alongside industry expert opinion. Say where the reviews come from (how many hotels, what kinds) if the materials give it.
- In one sentence, say that Hotel Tech Report's evaluation looks at ease of use, core functionality, value for money, integrations and support, based on surveys of verified users and industry experts.
- Then the findings chosen in the plan as one flowing account, not a list of categories: the ratings that matter, recurring strengths, and a reviewer quote where it illustrates a finding. Every HotelTechReport item on the MUST KEEP list goes here.
- Say what each finding means for a hotel team deciding whether to buy.
- State the limitations chosen in the plan, once each, specifically, and say who they matter to. Do not soften them.

${only('feedback')}`,
  },
  {
    key: 's6', section: 'fit', title: 'Fit and pricing', max: 1200,
    prompt: (s) => `Write FIT AND PRICING.

- Move from what reviewers say to whether it is right for the viewer: which hotels and situations it suits, in terms of the workflows and outcomes they would prioritize, and what to verify in a demo before committing.
- Give the pricing and package facts from the materials only. If pricing is not provided, say so in one sentence. Do not imply a capability is in every package unless the materials say so.
- Then, consultatively and without selling: viewers can request a price quote for ${spoken(s.product)} on HotelTechReport.

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

${CAVEATS}

Watchability:
- Vary how passages begin: some with the hotel's problem, some with what we see in the demo, some with a reviewer's experience.
- Where one idea can lead into the next by cause and effect or by a buyer's question, use that instead of a transition phrase.
- Replace generic praise and abstract observations with the specific operational consequence.
- Read it as someone who watched five other HotelTechReport reviews just before this one; rewrite anything that sounds like a template.

${PROTECTED(spoken(s.product))}

Preserve every fact, number, quote, price, limitation, MUST KEEP item and buying recommendation; the headings and their order; one 🕒 marker per workflow (never add or split).
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
- A MUST KEEP item (listed below) missing or with a changed number. [must-fix]; name the section it belongs in.
Brand and conversion
- The introduction not word for word: ${ARIANA_LINE}
- A buyer sent to the vendor for pricing, reviews or comparisons; a closing call to action that is not: ${CLOSING_CTA}
Structure
- A walkthrough with more than ${W_MAX} separately narrated passages, a passage under about ${MIN_WORKFLOW_WORDS} words, or source timestamps used as narrative sections. Combining related actions from different parts of the demo into one workflow is correct; never ask for more timestamps or for modules to be separated.
- Narration that misdescribes what the demo shows.
- A hook that opens on a company, a case study or a statistic without the hotelier's problem and why it matters; a hook not paid off later.
- A verdict missing any of: who should shortlist it, the differentiator, who may prefer another solution, what to verify; or an absolute recommendation.
Delivery
- Third-person narration of the demo or of the presenter ("the presenter opens", "the user clicks"). A factual note such as "the demo doesn't show this running" is fine.
- Abstract, research-summary or generic phrasing a hotel professional would not say on camera; repetitive transitions; no expert interpretation, or interpretation that is unsupported or implies hands-on testing.
- The same caveat twice, or a qualifier that changes nothing a buyer would conclude.
- Grammar errors, and names a presenter may stumble on.

The app has already run these checks on the script. Each one listed is confirmed; report it as [must-fix]:
${ctx.checks || 'none failed'}

MUST KEEP items from the editorial plan:
${ctx.mustKeep || 'none listed'}

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
- Add no fact, number, quote, feature, integration or price that is not in the research. Keep vendor claims labeled as claims and each limitation stated once.
- Keep the seven heading lines and their order. No em dashes.

${NARRATION}

${CAVEATS}

${PROTECTED(spoken(s.product))}

Before you answer, check silently: every claim is grounded; every MUST KEEP item is present with its exact number; the protected lines are word for word; no third-person narration; ${W_MIN} to ${W_MAX} walkthrough workflows; the verdict names who should shortlist it and who may prefer something else.

Word counts of the script as it stands (budgets in brackets):
${ctx.counts}

Reply in exactly this form:

${START}
<the full revised script>
${END}

${NOTES_START}
<Editor directions, never spoken. One block per walkthrough workflow, plus any other moment where the picture matters:
🕒 [mm:ss] <workflow> | Source timestamps: <every demo timestamp this workflow draws on, from the plan> | Show: <the screen recording sequence> | Highlight: <the one interface element to zoom into> | Why: <the takeaway for the viewer>
Third person and screen actions belong here, not in the narration. Do not describe any screen or action the demo and dossiers do not show. Then one line "Title card:" and one line "Diagram prompt:" carried over from the drafting below.>
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
