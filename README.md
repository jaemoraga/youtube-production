# Transcribe

Upload a video, get a transcript with speaker names and timestamps. Clients can upload too,
each through their own private link.

- **You** sign in at `/admin`, see every transcript, upload your own videos, rename
  speakers, and download TXT, Word (DOCX) or subtitles (SRT).
- **A client** gets a link like `https://your-site/u/Zk3p9…`. It shows only their company name
  and an upload box. They can't see transcripts or any other client.

How it works: the browser sends the video straight into private Vercel Blob storage (no size
problems, resumable in pieces automatically). AssemblyAI downloads it from a link that expires
after 24 hours, transcribes the whole file in one go, and calls the site back when it's done.
The site saves the transcript, then deletes the video and AssemblyAI's copy.

Cost: about **$0.28 per hour of video** at AssemblyAI list prices (Universal-3.5 Pro $0.21/hr,
speaker labels $0.02/hr, spelling hints $0.05/hr). New AssemblyAI accounts get $50 free credit.

---

## Set up (about 15 minutes, once)

### 1. AssemblyAI key
Sign up at https://www.assemblyai.com, open the dashboard, copy your API key.

### 2. Put the code on GitHub
Create a new **private** repository at https://github.com/new. On the empty repo page click
*uploading an existing file* and drag in everything in this folder except `node_modules` and
`.next` if you have them. Commit.

### 3. Create the Vercel project
At https://vercel.com/new, import the GitHub repository. Leave every build setting as it is.
Before clicking Deploy, open **Environment Variables** and add:

| Name | Value |
|---|---|
| `ASSEMBLYAI_API_KEY` | the key from step 1 |
| `ADMIN_PASSWORD` | your sign-in password, 12+ characters |
| `APP_SECRET` | any long random string, 24+ characters (e.g. mash the keyboard) |

Click **Deploy**.

### 4. Add private storage
In the Vercel project: **Storage → Create → Blob**, choose **Private**, name it `transcribe`,
and connect it to this project (Production and Preview). Then **Deployments → ⋯ → Redeploy**
so the site picks up the storage keys.

### 5. Sign in
Open the project's address (shown on the Vercel project page, e.g.
`htr-transcribe.vercel.app`; you can add a custom domain like `transcribe.hoteltechreport.com`
under Settings → Domains). Go to `/admin` and sign in. Bookmark it.

---

## Client portal, review and editor view

Three roles share one site:

| Who | Where | Signs in with |
|---|---|---|
| Anyone (public home) | `youtube-studio.hoteltechinsider.com` | what we make, examples, one email box. A new email creates an account and lands on the order page; existing sponsors sign in here too. |
| Client (sponsor) | `youtube-studio.hoteltechinsider.com/client-submission/youtube` | work email → 6-digit code. First visit asks name and company. With no project yet they land on the order page. |
| HTR admin | `/admin` | `@hoteltechreport.com` email → code. Stays signed in 7 days. |
| Editor | `/editor` | the one shared `EDITOR_PASSWORD` |

Each client project has three steps: sponsor dossier (a Google Doc link), brand materials
(files) and the raw video (transcribed automatically). Admins approve each step or request an
update with a comment; the client is emailed and the step goes back to them. When all three are
approved the client gets an "all set" email. People from the same email domain join the same
company; personal addresses (gmail etc.) get their own.

### Ordering, discount codes and Stripe
Signing in never creates a project. A project opens when an order is paid, or when HTR creates one in the admin.

Someone with no project lands on `/client-submission/youtube/order`:

- **Products and prices** are in `lib/pricing.js` and mirror the Help Center article: long form $15,000 Basic /
  $10,000 Premium; short form $2,500 / $2,000 (minimum 4, 20% off 8 or more); social clip add-on $500 with a long
  form video. Change a price there and in the Help Center together.
- **Which price.** The app looks the buyer's verified email up on Hotel Tech Report (same connection as the
  internal dossier): the HTR user with that email, or a vendor colleague on the same email domain, then that
  company's membership plan. Paid plan = Premium price. No match = Basic price. Remembered per company for a day.
- **Pay now** sends them to Stripe's hosted invoice page. **Request an invoice** also has Stripe email it. Both are
  the same Stripe invoice, payable by whatever is switched on in Stripe under *Settings → Billing → Invoices →
  Default payment methods* (card, ACH debit, bank transfer). Due in 30 days (`INVOICE_DAYS_UNTIL_DUE`). Nothing is
  ever charged automatically, and the app also emails the buyer the invoice link itself.
- **Paid.** Stripe calls `/api/webhook/stripe`; the app marks the order paid, opens one project per long form
  video, emails the buyer their portal link and alerts HTR. Short form videos and social clips have no production
  workflow in the app yet, so the paid alert says to kick those off by hand.
- **Orders that wait for HTR** (no invoice goes out until you click *Send invoice* in `/admin/orders`): the HTR
  membership lookup was unavailable; the company is on Market Leader and ordered a long form video (one is
  included in their plan); Stripe is not connected or refused. You get an email each time.
- **`/admin/orders`** lists every order with its invoice link, *Mark paid* (wire or cheque outside Stripe; closes
  the Stripe invoice and opens the project) and *Cancel* (voids the invoice).
- **Discount codes** are created on the same page: percent or dollars off, an optional expiry date (good through
  the end of that day, Pacific), an optional maximum number of uses, and a note only HTR sees. A code comes off
  after the short form volume discount. Codes can be switched off; a used code cannot be deleted. A 100% code
  books the video with nothing to pay.
- The app creates its own Stripe customers (marked `app: youtube-studio`), separate from the ones the Hotel Tech
  Report platform bills. To put video invoices on a member's existing HTR customer instead, set
  `STRIPE_REUSE_HTR_CUSTOMER=true`, but only once the platform's own Stripe webhook is known to ignore them.

Setting it up (two environment variables, then redeploy):

| Name | Value |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe → Developers → API keys. A restricted key is enough: write access to Customers and Invoices. Use a `sk_test_…` key first; `/admin/orders` shows a test-mode banner |
| `STRIPE_WEBHOOK_SECRET` | Stripe → Developers → Webhooks → Add endpoint, URL `https://youtube-studio.hoteltechinsider.com/api/webhook/stripe`, events `invoice.paid`, `invoice.payment_failed`, `invoice.voided`, `invoice.marked_uncollectible`; copy the signing secret (`whsec_…`) |

Until `STRIPE_SECRET_KEY` is set, orders are still collected and wait in `/admin/orders`.

### Loading a project for a client yourself
For a client who sent their materials another way (email, a shared drive) or before the portal existed,
an admin can fill the checklist from the project page. None of this emails the client.

- **Add for the client.** Paste the dossier link, drop in brand files, or upload the video on each step.
- **Received outside the app.** Closes a step with a note saying where the material is (HTR only sees the note).
- **Video in several files.** Add each part; every part gets its own transcript and editor link, and script
  generation reads them all in order.
- **Add a person.** Under *People at the client*, add a name and work email. No email is sent. They can sign in
  with that address and land in the project, and colleagues on the same email domain join the same company.
- **Import a script.** On the Script page, paste a script written elsewhere. It is saved as version 1, hidden
  from the client until you approve it, and then follows the usual comments and revisions flow.

When HTR supplied every step itself, approving the checklist does not send the "You're all set" email.
After a person is added, messages, update requests and script shares email them as usual.

### The editor view
`/editor` is what the video editor works from. It assumes no knowledge of hotels or of the product.

- **Raw demo videos** to download, one per file the client uploaded, in order, each with the client's label.
  With more than one file, the client is asked to label each and told why; HTR can label or reorder them too.
- **Brand materials** (or HTR's note on where they are kept).
- **Editing guide.** Built from the admin project page (*Build editing guide*) once there is a script and the
  demo transcripts are done. One AI call reads the script and the timestamped demo transcripts and returns the
  product's features. The main view has one card per feature: the time to go to in the demo to find it (and
  what is on screen there), and the script lines to put it over. Other views: the script in order, the lines
  with no demo footage (with what to use instead), and a plain-language glossary. Each time is anchored on the
  sentence where the presenter names the feature and checked against the transcript: it is placed on the exact
  second those words are spoken, marked "about" when only the clock time fits, and dropped when neither does.
  The time is when the feature is talked about; the app cannot see the screen. Rebuild when the script or the
  videos change; the page says when the guide is out of date.
- **The vendor's YouTube channel.** Set the channel address on the admin project page. The editor page lists
  the channel's 15 most recent videos (YouTube's public feed, no API key) with links to watch them. They cannot
  be downloaded from the app; the editor reports which video and time, and HTR asks the client for the file.
- **Demo transcript**, labelled as the client's recording and not the script, with the moments the script uses
  highlighted and linked back to the script line.

### The ladder, the shot clocks and the audit trail
Every project is at one of twelve stages, each naming who has the ball. The dashboard sorts by whose turn it is
(*My turn*, *With the client*, *With the editor*).

| Stage | Court | Enters when |
|---|---|---|
| Waiting for client materials | client | sign-up, or an update was requested |
| Materials submitted | HTR | everything is in (HTR approves the steps and completes the internal dossier) |
| Script draft, internal | HTR | the script is written or imported; the client cannot see it |
| Script review, client | client | HTR approves the script for the client. **7-day window**, reminders at 5, 3 and 1 days |
| Script revisions | HTR | the client sends edit requests, or the window closes |
| Shooting | HTR | HTR clicks *Revisions implemented: lock the script* (or the client approved it) |
| Editing | editor | the raw footage link is attached (HTR and editor only; the client never sees it) |
| V1 review, client | client | a Frame.io link is pasted. **7-day window**, reminders at 5, 3 and 1 days |
| V1 revisions | editor | the client clicks *My feedback is complete*, or the window closes |
| V2 review, client | client | the V2 Frame.io link is pasted. **3-day window**, reminders at 1 day and 12 hours |
| Final revisions | editor | the client marks their final feedback complete, or the window closes |
| Complete | done | the editor or HTR marks it complete |

- A window that closes on the clock moves the project along with whatever feedback came in, and emails the
  client and whoever is next. The client's comment and feedback buttons stop working once it has closed.
- **More time.** On the project page, *Give them more time* moves a deadline by any number of days. The client's
  shot clock shows the new date and nothing else; no "we extended" email goes out unless you tick the box, and
  then it reads like an ordinary reminder. Extensions are logged in the timeline for HTR only.
- **Close the window now** ends a round early when the client has told you by email that they are done.
- **Audit trail.** *Notifications and visits* on each project page lists every email the app sent the client
  with what Resend reported (delivered, opened, clicked, bounced), and every client sign-in and page view the
  app recorded. Sign-ins and page views are the firm evidence; opens and clicks can be triggered by mail apps
  and security scanners.

Setting it up (three more environment variables, then redeploy):

| Name | Value |
|---|---|
| `CRON_SECRET` | any long random string. Vercel sends it with each cron call. The clock runs hourly (`vercel.json`); on the Hobby plan Vercel only runs crons daily, so the 12-hour warning becomes a same-day one |
| `RESEND_WEBHOOK_SECRET` | in Resend: **Webhooks → Add endpoint**, URL `https://youtube-studio.hoteltechinsider.com/api/webhook/resend`, events `email.delivered`, `email.opened`, `email.clicked`, `email.bounced`, `email.complained`; copy the signing secret (`whsec_…`) |
| `EDITOR_EMAILS` | who is emailed when footage, feedback or a closed window is waiting on the editor, comma-separated (HTR is always copied) |

Also in Resend: **Domains → your domain → turn on Open tracking and Click tracking**. Without them the trail
shows delivered only. An admin can run the clock by hand by opening `/api/cron/clock` while signed in.

### Setting it up
1. **Email (Resend).** Create an account at https://resend.com, add the domain you send from
   (e.g. `hoteltechreport.com` or `mail.hoteltechreport.com`), add the DNS records it shows, and
   wait for "Verified". Create an API key (Sending access).
2. **Vercel → Settings → Environment Variables**, add:

| Name | Value |
|---|---|
| `RESEND_API_KEY` | the key from step 1 |
| `EMAIL_FROM` | e.g. `Hotel Tech Report <video@hoteltechreport.com>` (must be on the verified domain) |
| `NOTIFY_EMAILS` | who hears about client submissions, comma-separated |
| `EDITOR_PASSWORD` | 8+ characters; give it to your editor |
| `DOSSIER_TEMPLATE_URL` | optional: the Google Doc clients copy (defaults to the current Video Vendor Application doc) |

3. **HTR profile data.** Nothing to set. On any project's Internal dossier, click
   **Connect Hotel Tech Report** once and sign in with an HTR admin account (the same sign-in
   Claude uses). The app keeps the connection, encrypted, and renews it on its own. Optional
   overrides: `HTR_MCP_URL` (defaults to `https://admin-mcp.hoteltechreport.com/mcp/htr`) and
   `HTR_MCP_KEY` (a fixed admin API key, used instead of the sign-in when set).
   **Script writing.** Add `OPENAI_API_KEY` (an OpenAI API key) to turn on **Generate script**.
   Optional: `SCRIPT_MODEL` (defaults to `gpt-6.1-sol`) and `SCRIPT_REASONING` (reasoning effort).
   `ANTHROPIC_API_KEY` is used instead only when no OpenAI key is set.
   How scripts are written lives in two files: `lib/script-pipeline.js` (the steps and their prompts:
   plan, seven sections, assemble, spoken edit, independent score, targeted revision) and
   `lib/script-config.js` (word budgets, scoring weights, ruled-out phrases; `SCRIPT_BUDGETS` overrides
   budgets). The editorial standards and the client revisions prompt still come from
   `prompts/youtube-review-prompts.md`; after replacing that file run `node scripts/build-prompts.mjs`.
4. **Redeploy.** Everyone is signed out once (new session cookie). From then on admins use email
   codes and `ADMIN_PASSWORD` stops working.

---

## Test before a long video

1. Click **Upload**, choose a 1–2 minute phone recording where two people talk and say a few
   company names. Put those names in "Names and terms". You land on the transcript page; it
   should be ready within a minute or two (the page refreshes itself).
2. Rename the speakers, then try **Copy**, **TXT**, **DOCX** and **SRT**.
3. Add a test company under *Client upload links*, open its link in a private browser window,
   and upload a short file as if you were the client. It should appear on your dashboard.
4. Then a full 60–90 minute video.

---

## Day to day

- **New client**: type the company name under *Client upload links* → **Add company** →
  **Copy link** → send it to them. Under **Edit** you can add spelling hints for that company
  (their product names, executives' names) that apply to every video they send.
- **A link got forwarded around**: **Edit → New link**. The old one stops working instantly.
- **Failed transcript**: open it and click **Retry**. The video is kept until a transcript
  succeeds.
- **Delete**: on a transcript page, removes the transcript and any stored video.

## Accuracy notes

- Uses AssemblyAI's most accurate model (Universal-3.5 Pro), falling back to Universal-2 only
  for languages the first doesn't support.
- "Names and terms" and company terms are spelling hints (up to 6 words each). Only list what
  is actually said; a hint can occasionally appear where it wasn't spoken.
- Words are never rewritten by the app. Paragraph breaks are added between existing sentences;
  every timestamp and subtitle time is a real word time from AssemblyAI.
- Clean transcript by default ("um", "uh" removed by AssemblyAI). Set `DISFLUENCIES=true` in
  Vercel to keep them.
- Speaker labels (A, B, C…) are AssemblyAI's guess at who is talking. On cross-talk or similar
  voices they can be wrong; rename them per transcript and every download uses your names.

## Security and privacy

- Your AssemblyAI key and all storage keys live only in Vercel's environment variables.
- Everything is stored in a **private** Blob store; nothing is reachable by URL without
  signing in. AssemblyAI only gets a 24-hour link to the one video it is transcribing.
- Admins sign in with an emailed code, only for @hoteltechreport.com addresses (7-day session).
  Clients sign in with an emailed code and only ever see their own company. Editors share one
  password and can view, never change. The admin password only works until email is set up.
- Upload links are 24-character random tokens, one per company, and only allow uploads to that
  company's folder. Uploads are limited to audio/video files up to 5 GB.
- Webhook calls from AssemblyAI must carry a secret header derived from `APP_SECRET`.
- After a transcript is saved, the copy at AssemblyAI is deleted; the video stays in your storage
  for the editor. Transcripts stay in your storage until you delete them.

## Changing it later

Ask Claude to change the code, then upload the changed files to the GitHub repo; Vercel
redeploys automatically within a minute or two.

For developers: Next.js 16 (App Router), `@vercel/blob` private storage, AssemblyAI REST API,
no database. `npm install && npm test` runs the formatting tests and a pipeline test that mocks
Blob and AssemblyAI. Data layout is described at the top of `lib/store.js`.
