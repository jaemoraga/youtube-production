// All persistent data lives in the project's PRIVATE Vercel Blob store as small JSON files:
//   config/companies.json        companies and their private upload links
//   jobs/<id>.json               one record per uploaded video
//   transcripts/<id>.json        the finished transcript (words, speakers, timings)
//   uploads/<company>/<file>     the video itself, deleted once transcribed
import { del, get, list, put } from '@vercel/blob';

export async function readJSON(pathname) {
  const res = await get(pathname, { access: 'private', useCache: false });
  if (!res || res.statusCode !== 200) return null;
  return JSON.parse(await new Response(res.stream).text());
}

export async function writeJSON(pathname, data) {
  await put(pathname, JSON.stringify(data), {
    access: 'private', contentType: 'application/json', addRandomSuffix: false,
    allowOverwrite: true, cacheControlMaxAge: 60,
  });
}

export async function remove(pathname) {
  try { await del(pathname); } catch { /* already gone */ }
}

export async function listPaths(prefix) {
  const out = [];
  let cursor;
  do {
    const page = await list({ prefix, cursor, limit: 1000 });
    out.push(...page.blobs.map((b) => b.pathname));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return out;
}

// ---------- companies ----------
const COMPANIES = 'config/companies.json';

export async function getCompanies() {
  return (await readJSON(COMPANIES)) || [];
}

export async function saveCompanies(list) {
  await writeJSON(COMPANIES, list);
}

export async function companyByToken(token) {
  if (!token || token.length < 20) return null;
  return (await getCompanies()).find((c) => c.token === token) || null;
}

// ---------- jobs ----------
export const jobPath = (id) => `jobs/${id}.json`;
export const transcriptPath = (id) => `transcripts/${id}.json`;

export async function getJob(id) {
  if (!/^[a-f0-9]{16,64}$/.test(id)) return null;
  return readJSON(jobPath(id));
}

export async function saveJob(job) {
  await writeJSON(jobPath(job.id), job);
}

export async function listJobs() {
  const paths = await listPaths('jobs/');
  const jobs = await Promise.all(paths.map((p) => readJSON(p).catch(() => null)));
  return jobs.filter(Boolean).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
