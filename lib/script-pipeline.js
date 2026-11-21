// The script-writing process, version 2.
//
// Why it changed: version 1 ran the nine prompts from the Google Doc as written. Its scripts were well
// researched but read like a buyer's guide: every feature got its own segment, the hook was written
// before the case study was chosen, nothing limited length, each step graded its own work, and no pass
// was responsible for how the script sounds out loud.
//
// What version 2 does, in order:
//   plan      one editorial plan before any drafting: evidence, hook (three candidates, one chosen),
//             case study, the 3 to 5 workflows worth showing, the caveats that matter, word budgets
//   s1..s7    the seven sections, each written to the plan and to a word budget
//   assemble  one script, trimmed to budget
//   edit      spoken-delivery and watchability edit
//   evaluate  an independent score in a separate conversation that never saw the drafting
//   revise    targeted fixes from that evaluation, final validation, and the editor-direction notes
//
// The editorial standards (the pre-prompt) are still the ones in the Google Doc, with one sentence
// replaced: "Do not sacrifice useful information simply to make the script shorter" pushed every script
// toward covering everything.
//
// Version 3 keeps the same twelve steps and changes what they ask for, after the V2 TrustYou script
// scored 91/100. V2 compressed too hard: it cut the approved Ariana line, pointed the price quote at the
// vendor, dropped review scores the plan had chosen, and came in 2 minutes under budget. V3:
//   - protects approved lines and routes every buyer action to HotelTechReport (and the app repairs the
//     Ariana line and flags vendor-directed CTAs itself)
//   - ranks evidence in the plan and names a MUST KEEP list; the evaluator and the app both check that
//     list survived; compression removes repetition and commodity features first
//   - gives the presenter an analyst's voice: a few earned interpretive moments, no fake testing claims
//   - builds the hook as problem, stakes, result, why it matters
//   - requires a two-sided verdict: who should shortlist it, who is better served elsewhere
//   - states the causation caveat once and drops caveats that change nothing
import { RUBRIC, SECTIONS, WALKTHROUGH_WORKFLOWS, WORDS_PER_MINUTE, budgets } from './script-config.js';
import PROMPTS from './script-prompts.js';

export const PIPELINE = 3;
export const START = '===SCRIPT START===';
export const END = '===SCRIPT END===';
export const NOTES_START = '===EDITOR NOTES START===';
export const NOTES_END = '===EDITOR NOTES END===';

const OLD_RULE = 'Do not sacrifice useful information simply to make the script shorter.';
const NEW_RULE = 'Prioritize. A script that explains a few things well is more useful than one that mentions everything. Merge or cut lower-value material to stay inside the section word budgets. When cutting, remove in this order: repetition, then commodity features and generic product description, then secondary workflow detail. Cut quantified customer outcomes, material limitations and proprietary HotelTechReport review findings last, and never cut an item on the plan\'s MUST KEEP list.';
if (!PROMPTS.pre.includes(OLD_RULE)) throw new Error('The pre-prompt no longer contains the sentence the process replaces. Update lib/script-pipeline.js.');
export const STANDARDS = PROMPTS.pre.replace(OLD_RULE, NEW_RULE);

const range = (id) => { const [a, b] = budgets()[id]; return `${a} to ${b}`; };
const budgetTable = () => SECTIONS.map((s) => `- ${s.label}: ${range(s.id)} spoken words`).join('\n');
const only = (id) => `Length: ${range(id)} spoken words. This is a firm default; go over only if buyer value clearly justifies it, and never pad to reach the minimum.
Follow the editorial plan above. Write only what will be spoken${id === 'walkthrough' ? ', plus the timestamps' : ''}. No headings, grades, critique or notes.`;

const SPOKEN_TEST = `Spoken-language test for every sentence: would a knowledgeable hotel industry professional naturally say this out loud? If not, rewrite it.
- Turn formal or abstract constructions into plain speech with a concrete example.
  Written: "A decline across several channels warrants a different investigation from a decline concentrated in one."
  Spoken: "If scores are dropping everywhere, you may have a real service problem. But if it's just one review site, that's a different issue to investigate."
  Written: "It's useful evidence for a positioning discussion."
  Spoken: "This helps you figure out whether guests think your hotel offers good value compared with nearby competitors."
- Keep precise technical terms where they matter. Keep the presenter polished and authoritative: no hype, no forced casualness, and not every sentence short.`;

// Ariana is an experienced hotel technology analyst who has studied the product, not a narrator reading research.
const VOICE = `Presenter voice: an experienced hospitality technology analyst who has studied this product and formed an evidence-based view. Across the whole script, include three to five short moments of interpretation, each earned by a specific fact or demo moment, for example:
  "Here's where this gets interesting." / "This is an important distinction for hotel groups." / "What I particularly like about this workflow is..." / "If you're running an independent hotel, this might matter less to you." / "This is something I'd definitely ask the vendor to demonstrate."
Write your own; use any single phrasing at most once. Never claim hands-on testing ("when I tested it", "in my experience using it"): the presenter has studied the demo, the reviews and the data. No artificial enthusiasm. More engaging, never more promotional.`;

// Lines and actions the edit passes may not change. The app also repairs the Ariana line itself.
export const ARIANA_LINE = 'Hi, I’m Ariana from HotelTechReport.com, where we help hoteliers like you future-proof your operations by finding the best tech tools to run and grow your businesses.';
const PROTECTED = (product = 'the product') => `Protected, copy exactly and never shorten:
- The presenter introduction, word for word: ${ARIANA_LINE}
- Every buyer action points to HotelTechReport, never to the vendor: request a price quote for ${product} on HotelTechReport; read verified reviews, check integrations and compare alternatives on HotelTechReport. (Advice on what to ask the vendor to demonstrate is fine; sending viewers to the vendor for pricing, reviews or comparisons is not.)
- The closing call to action names all four: read verified reviews, check integrations, compare alternatives, request pricing, on HotelTechReport.`;

const CAVEATS = `Caveats: state the attribution and causation caveat for a customer result once, in one sentence. Delete any caveat that does not change what a buyer would conclude (for example, that staff still had to do the work). Keep every material limitation and factual qualification.`;

export const STEPS = [
  {
    key: 'plan', title: 'Editorial plan', max: 3500, effort: 'high',
    prompt: (s) => `EDITORIAL PLAN. Do not write any script yet.

Read the research materials as a hotel technology analyst and decide what this video will and will not cover. A good plan leaves most of the dossier out. Use these exact headings and keep the whole plan under 750 words.

1. EVIDENCE
The 12 to 20 facts this script is most likely to use. Tag each with its source: [vendor dossier], [HTR data], [demo mm:ss], [case study] or [website], and with its priority:
  P1 HotelTechReport verified review findings (scores, recommend rate, recurring praise and complaints)
  P2 material limitations and buying considerations, including who may be better served by a narrower or different product
  P3 quantified customer outcomes (with how they were reported)
  P4 differentiated workflows
  P5 commodity features and generic description
Mark vendor claims as claims. Include pricing exactly as stated, or "pricing not provided". Note any capability that is limited to certain packages or add-ons.
Then a line "MUST KEEP:" followed by 6 to 10 items, one per line starting with "- ", that the finished script must contain because they materially change a purchasing decision. Draw them mostly from P1 to P3, copy every number exactly, and do not include a statistic just because it exists.

2. BUYER AND ANGLE
Who this is for (hotel types and operating situations), the central value proposition in one sentence, and the strongest angle the evidence supports.

3. HOOK
Write three candidates in one line each, with the source: (a) a quantified customer outcome, (b) a relatable operational problem, (c) a surprising or differentiated capability. Choose one on specificity, relevance, credibility and its ability to hold attention. Then shape the chosen hook as four beats: the operational challenge a hotelier recognizes, what is at stake, the surprising insight or measured result, and why it matters to the viewer. A statistic alone is not a hook; give the viewer a reason to care about it. It must not read like a press release (do not open on "X reports that..."). Then state the payoff: which later section resolves the hook, and how.
Rule: a customer story may open the script only if it is the same customer told in the case study section.

4. CASE STUDY
Choose one. It must show what problem the hotel faced, how the product fit into the work, what changed, how credible the evidence is, and what another hotelier can learn. List the facts and numbers to use, the quote if there is one, and what must not be claimed (for example, revenue the vendor reports but nobody has verified as caused by the product).

5. WALKTHROUGH
Rank what the demo shows by: importance to hotel operations and the buying decision, differentiation, strength of the demo evidence, how well it makes a use case, and relevance to the target buyer. Select ${WALKTHROUGH_WORKFLOWS[0]} to ${WALKTHROUGH_WORKFLOWS[1]} workflows, each named as a job a hotel team does, not as a feature. For each: the secondary features folded into it, the demo timestamp(s) from the transcript, the one on-screen moment worth showing, and the operational payoff. Finish with "Left out:" and the features you are deliberately not covering.

6. FEEDBACK
The three or four findings from verified reviews and expert opinion that matter most to a buyer, with the numbers. Then the one or two limitations that matter most. Each limitation will be stated once in the script, in the section where it is most useful.

7. FIT, PRICING AND VERDICT
Four answers, one line each: who should shortlist it; who may be better served by a narrower or different solution, and why; the most important differentiator; the most important thing to validate before buying. Then the pricing facts and the verdict in one sentence. Avoid absolutes that assume every hotel has the same staffing, budget or organization.

8. WORD BUDGET
Default budgets:
${budgetTable()}
Give the budget you will use for each section. Change a default only with a stated reason tied to buyer value or to thin evidence. A section that comes in under its minimum while a MUST KEEP item is missing is a failure, not an efficiency.`,
  },
  {
    key: 's1', section: 'intro', title: 'Hook and intro', max: 1200,
    prompt: (s) => `Write the HOOK AND INTRO.

- Open with the hook chosen in the plan, in its four beats: the challenge, the stakes, the result or insight, and why it matters to the viewer. Within about 15 seconds (roughly 35 words) the viewer should care. Lead with the hotelier's situation, not with a company announcing a result; attribute the result in the same or the next sentence. Do not imply anything the evidence does not support.
- Do not open with "Most hotels don't have a ___ problem" or any other formula. The hook should belong to this product only.
- Then say exactly this: Hi, I’m Ariana from HotelTechReport.com, where we help hoteliers like you future-proof your operations by finding the best tech tools to run and grow your businesses.
- In one or two sentences, say what ${s.product} is, who uses it and where it fits in hotel operations.
- Tell the viewer what they will get, in natural speech and in no more than two sentences: the product shown in use, what ${s.reviewCount ? `${s.reviewCount} verified reviews` : 'verified hotelier reviews'} and industry experts say, the case study named in the plan, and a verdict on fit. No bulleted preview.
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

- Start with one natural sentence that moves from the overview into the live product.
- Cover the workflows selected in the plan and nothing else. One passage per workflow. Fold the secondary features into the workflow they belong to; do not give them their own passage and do not list feature names.
- Begin each workflow with its demo timestamp in this exact form: 🕒 [mm:ss]. Use timestamps that appear in the demo transcript.
- Build each passage around what the viewer sees at that timestamp: the screen, the action, the comparison or the result. Then say what a hotel team gets from it, with a concrete example. Do not describe any screen, button or behavior the demo and dossiers do not show.
- Speak as an operator using the system. No narrator transitions such as "Next, let's look at".
- Use at most two forward references to later sections (the case study, the review findings, pricing), and only where they are real and specific.

${only('walkthrough')}`,
  },
  {
    key: 's4', section: 'caseStudy', title: 'Case study', max: 1200,
    prompt: () => `Write the CASE STUDY, using the customer chosen in the plan.

Tell it as a short story for peers: the hotel and its scale, the problem, how the product fit into the team's work, what changed, and the measured result. Name the specific capability that made the difference. Include the hotelier's quote if the materials contain one. If the hook opened with this customer, this is where the story is completed.
Say plainly what is the vendor's or customer's own account. Do not present a correlation as proof the product caused a result. Include every outcome on the MUST KEEP list for this customer (for example revenue as well as scores), each with its attribution.
${CAVEATS}

${only('caseStudy')}`,
  },
  {
    key: 's5', section: 'feedback', title: 'Real-world feedback', max: 1500,
    prompt: (s) => `Write the REAL-WORLD FEEDBACK section.

- Open by stepping back from one hotel's story to what verified users say across many hotels${s.reviewCount ? `: Hotel Tech Report analyzed ${s.reviewCount} verified reviews of ${s.product}` : ''}, alongside industry expert opinion.
- Say in one sentence that Hotel Tech Report's evaluation looks at ease of use, core functionality, value for money, integrations and support, based on surveys of verified users and industry experts.
- Then cover the findings chosen in the plan as one flowing account, not a list of five categories. Use the actual numbers and quote or paraphrase reviewers where it helps. Every HotelTechReport score or finding on the MUST KEEP list goes here.
- Interpret, don't just report: say what a score or pattern means for a hotel team deciding whether to buy.
- State the limitations chosen in the plan here, once, specifically, and say who they matter to. Do not soften them and do not add generic disclaimers.

${only('feedback')}`,
  },
  {
    key: 's6', section: 'fit', title: 'Fit and pricing', max: 1200,
    prompt: (s) => `Write FIT AND PRICING.

- Move from what reviewers say to whether it is right for the viewer.
- Say which hotels and situations it suits best, in terms of the workflows and outcomes they would prioritize, and what a buyer should verify in a demo before committing.
- Give the pricing facts from the materials only. If pricing is not provided, say so in one sentence. Do not imply that a capability is included in every package unless the materials say so.
- Mention, consultatively and without selling, that viewers can request a price quote for ${s.product} on HotelTechReport. Never tell viewers to get pricing from the vendor directly.

${only('fit')}`,
  },
  {
    key: 's7', section: 'verdict', title: 'Verdict and CTA', max: 900,
    prompt: () => `Write the VERDICT AND CTA.

- Return in one sentence to the problem or outcome the hook opened with.
- Give a decisive, two-sided verdict from the evidence: who should shortlist it, who may be better served by a narrower or different solution, the most important differentiator, and the one thing to validate before buying. A clear recommendation is worth more than a reflective one, but do not phrase it as an absolute ("buy it only if") that assumes every hotel is organized the same way.
- Then a brief, natural call to action: on HotelTechReport viewers can read verified reviews, check integrations, compare alternatives and request pricing. Name all four. This is commercially important; keep it.
- End on the verdict or the call to action. Do not end on a rhetorical question unless it gives the viewer a concrete test to apply to their own hotel.
- No summary of the video, no "hopefully you now have a clear picture", nothing already said in Fit and Pricing.

${only('verdict')}`,
  },
  {
    key: 'assemble', title: 'Assemble', max: 5000,
    prompt: () => `Assemble the seven sections into one teleprompter-ready script.

- Use exactly these heading lines, in this order, each on its own line: ${SECTIONS.map((x) => x.heading).join('  ')}
- Under each heading put only what will be spoken. Keep every 🕒 [mm:ss] timestamp at the start of its walkthrough passage.
- Make it one continuous explanation: fix transitions so each section follows from the last, and remove anything said twice.
- Bring every section inside its budget from the plan. If a section is over, cut in the order the standards set (repetition first, buyer intelligence last). Do not trim by turning passages into lists of feature names. Do not cut a section below its minimum.
- Every MUST KEEP item from the plan must be in the assembled script.
${PROTECTED()}
- Check: the hook is paid off later; each limitation appears once; the review count is the same everywhere; nothing contradicts the pricing or package facts.
- Do not add new facts.

Put the script, and nothing else, between a line that reads exactly ${START} and a line that reads exactly ${END}. Above the first marker, give one title card suggestion.`,
  },
  {
    key: 'edit', title: 'Spoken delivery edit', max: 5000,
    prompt: () => `Edit the assembled script for how it sounds and how well it holds attention. This pass changes wording, order within a section and rhythm. It does not change the analysis.

${SPOKEN_TEST}

Watchability:
- Vary how passages begin. If several follow "feature, explanation, benefit", open one with the operational problem, one with what the demo shows, one with a reviewer's experience.
- Where one idea can lead into the next by cause and effect or by a buyer's question, use that instead of a mechanical transition.
- Let the presenter make observations the evidence supports: why something stood out, what a buyer should scrutinize, what looks minor but matters operationally.
- Replace generic praise with the specific operational consequence.
- Read it as someone who watched five other HotelTechReport reviews just before this one. Rewrite anything that sounds like a template.
- Every 30 to 60 seconds the viewer should learn something, have a question answered, or have their attention reset.

${VOICE}

${CAVEATS}

${PROTECTED()}

Preserve: every fact, number, quote, timestamp, price, limitation, MUST KEEP item and buying recommendation; the section headings and their order.
Limits: no section may go over its budget maximum or fall below its minimum, and the script as a whole should not get longer than about 10%. No em dashes. No hype, rhetorical-question strings, one-line dramatic paragraphs or clickbait.

Return the full script between ${START} and ${END}. Below it, list the five most meaningful edits in one line each.`,
  },
  {
    key: 'evaluate', title: 'Independent score', max: 3000, effort: 'high', fresh: true,
    prompt: (s, ctx) => `You are an independent editorial evaluator for Hotel Tech Report's YouTube product reviews. You did not write this script. Score it. Do not rewrite it.

Anchor every judgment to something observable in the script or the research materials. Do not reward polish, confidence or length. A deduction needs a quoted passage, the reason it underperforms, and a concrete fix.

Score each section on: buyer usefulness, specificity, factual grounding in the research, editorial independence, narrative efficiency, and natural spoken delivery.

Rubric (points available):
${RUBRIC.map(([n, w]) => `- ${n}: ${w}`).join('\n')}

Also check these gates and report every failure as an issue:
- A claim, number, quote, price, integration or feature the research materials do not support.
- A package or pricing statement that contradicts another, or implies a capability is in every package without evidence.
- A hook that is not paid off later in the script.
- The same caveat or warning stated more than once.
- A walkthrough that lists features instead of showing ${WALKTHROUGH_WORKFLOWS[0]} to ${WALKTHROUGH_WORKFLOWS[1]} workflows, or narration that does not match what the demo shows at its timestamp.
- A sentence a hotel professional would not naturally say out loud.
- A weak or missing buyer recommendation, or an ending that reflects instead of concluding.
- A correlation presented as proof the product caused a result.
- Grammar errors, and words or names a presenter may stumble on.
- A MUST KEEP item (listed below) missing from the script, or its number changed. Each is [must-fix]; say which section it belongs in.
- The presenter introduction not word for word: ${ARIANA_LINE}
- A buyer sent to the vendor for pricing, reviews or comparisons instead of HotelTechReport, or a closing call to action missing any of: verified reviews, integrations, alternatives, pricing.
- A verdict that names only who should buy, without who may be better served elsewhere, the key differentiator and the thing to validate; or an absolute recommendation.
- A hook that is a statistic or press-release sentence without the challenge and why it matters.
- A script that reads like a research document aloud: no moments where the presenter interprets what the evidence means; or interpretations that are unsupported, repetitive or imply hands-on testing.
- A caveat that changes nothing a buyer would conclude ([should-fix]: delete it).
- A section under its minimum budget while evidence was dropped.

MUST KEEP items from the editorial plan:
${ctx.mustKeep || 'none listed'}

The app has already counted the words. Use these figures; do not count yourself:
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
    prompt: (s, ctx) => `You are the senior editor finishing a Hotel Tech Report YouTube review script. An independent evaluator has scored it. Make targeted fixes. Do not rewrite what works.

Rules:
- Fix every [must-fix] issue, and every [should-fix] issue unless the fix would remove supported evidence.
- Leave the passages under KEEP, and every sentence no issue touches, word for word.
- Bring any section over its budget back inside it by cutting repetition and commodity description first. Restore every missing MUST KEEP item in the section the evaluator names, using room under the budget maximum; that is not padding.
- ${PROTECTED(s.product)}
- ${CAVEATS}
- Keep the presenter's interpretive moments where the evaluator did not flag them. ${VOICE.split('\n')[0]}
- Add no fact, number, quote, feature, integration or price that is not in the research materials. Keep vendor claims labeled as claims. Keep each limitation, stated once.
- Keep the seven heading lines and their order, and every 🕒 [mm:ss] timestamp.
- ${SPOKEN_TEST.split('\n')[0]}
- No em dashes.

Before you answer, check silently: every claim is grounded; every MUST KEEP item is present with its exact number; the Ariana line is word for word; every buyer action points to HotelTechReport; the hook is paid off; the review count is identical everywhere; the verdict says who should shortlist it and who may not; nothing banned by the standards remains.

Word counts of the script as it stands (budgets in brackets):
${ctx.counts}

Reply in exactly this form:

${START}
<the full revised script>
${END}

${NOTES_START}
<Editor directions, never spoken. One block for each walkthrough workflow and for any other moment where the picture matters:
🕒 [mm:ss] <workflow> | Show: <the screen recording sequence, taken from the demo> | Highlight: <the one interface element to zoom into> | Why: <the takeaway the viewer should get>
Only moments that help the viewer understand the product. Do not describe any screen, element or action the demo and dossiers do not show. Then one line "Title card:" and one line "Diagram prompt:" carried over from the drafting below.>
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
