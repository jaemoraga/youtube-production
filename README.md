# Transcribe

Upload a video, get a transcript with speaker names and timestamps. Clients can upload too,
each through their own private link.

- **You** sign in at the site's address, see every transcript, upload your own videos, rename
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
under Settings → Domains). Sign in with your `ADMIN_PASSWORD`. Bookmark it.

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
- The dashboard, transcripts and all admin actions require your password cookie (30 days).
- Upload links are 24-character random tokens, one per company, and only allow uploads to that
  company's folder. Uploads are limited to audio/video files up to 5 GB.
- Webhook calls from AssemblyAI must carry a secret header derived from `APP_SECRET`.
- After a transcript is saved: the video is deleted from storage and the transcript is deleted
  from AssemblyAI. Transcripts stay in your storage until you delete them.

## Changing it later

Ask Claude to change the code, then upload the changed files to the GitHub repo; Vercel
redeploys automatically within a minute or two.

For developers: Next.js 16 (App Router), `@vercel/blob` private storage, AssemblyAI REST API,
no database. `npm install && npm test` runs the formatting tests and a pipeline test that mocks
Blob and AssemblyAI. Data layout is described at the top of `lib/store.js`.
