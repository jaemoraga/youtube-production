// Sign-in connection to the HTR data server (OAuth 2.1 with PKCE, the same flow Claude uses).
// An admin clicks "Connect Hotel Tech Report" once and signs in on hoteltechreport.com; the app
// keeps the resulting tokens (encrypted) in the private store and renews them on its own.
// No API key is involved. HTR_MCP_KEY, if set, still works and takes priority (see lib/htr.js).
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { APP_SECRET } from './config.js';
import { readJSON, writeJSON } from './store.js';

export const HTR_URL = () => process.env.HTR_MCP_URL || 'https://admin-mcp.hoteltechreport.com/mcp/htr';
const FILE = 'config/htr-oauth.json';
const PENDING_MS = 10 * 60e3;
const CLIENT_NAME = 'HTR YouTube Studio';

const err = (message, status = 502) => Object.assign(new Error(message), { status });
const b64 = (buf) => Buffer.from(buf).toString('base64url');

// ---------- encrypted token storage ----------
const key = () => createHash('sha256').update(`${APP_SECRET}|htr-oauth`).digest();

export function seal(obj) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), body].map(b64).join('.');
}

export function unseal(text) {
  try {
    const [iv, tag, body] = String(text || '').split('.').map((p) => Buffer.from(p, 'base64url'));
    const d = createDecipheriv('aes-256-gcm', key(), iv);
    d.setAuthTag(tag);
    return JSON.parse(Buffer.concat([d.update(body), d.final()]).toString('utf8'));
  } catch { return null; }
}

const load = async () => (await readJSON(FILE).catch(() => null)) || {};
const save = (state) => writeJSON(FILE, state);

// ---------- discovery ----------
const httpsOnly = (u, what) => {
  const url = new URL(u);
  if (url.protocol !== 'https:') throw err(`The HTR sign-in service gave an insecure ${what} address.`);
  return url.toString();
};

async function getJSON(url) {
  const res = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(15000), cache: 'no-store' });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

// Finds the sign-in service for the data server and its endpoints.
export async function discover() {
  const resource = new URL(HTR_URL());
  const path = resource.pathname.replace(/\/$/, '');
  const pr = (await getJSON(`${resource.origin}/.well-known/oauth-protected-resource${path}`))
    || (await getJSON(`${resource.origin}/.well-known/oauth-protected-resource`));
  const issuer = (pr?.authorization_servers?.[0] || resource.origin).replace(/\/$/, '');
  const as = (await getJSON(`${issuer}/.well-known/oauth-authorization-server`))
    || (await getJSON(`${issuer}/.well-known/openid-configuration`));
  if (!as?.authorization_endpoint || !as?.token_endpoint) throw err('Could not find the Hotel Tech Report sign-in service.');
  return {
    resource: pr?.resource || resource.toString(),
    scope: await challengeScope() || (pr?.scopes_supported || []).join(' ') || null,
    authorize: httpsOnly(as.authorization_endpoint, 'sign-in'),
    token: httpsOnly(as.token_endpoint, 'token'),
    register: as.registration_endpoint ? httpsOnly(as.registration_endpoint, 'registration') : null,
  };
}

// The data server says which permissions it wants in its "sign in first" answer; use those when present.
async function challengeScope() {
  try {
    const res = await fetch(HTR_URL(), {
      method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'ping' }), signal: AbortSignal.timeout(15000), cache: 'no-store',
    });
    return /scope="([^"]+)"/.exec(res.headers.get('www-authenticate') || '')?.[1] || null;
  } catch { return null; }
}

// ---------- connect ----------
async function ensureClient(state, meta, redirectUri) {
  if (process.env.HTR_OAUTH_CLIENT_ID) return { client_id: process.env.HTR_OAUTH_CLIENT_ID, redirect_uri: redirectUri };
  if (state.client?.client_id && state.client.redirect_uri === redirectUri) return state.client;
  if (!meta.register) throw err('The HTR sign-in service does not let this app register itself.');
  // Sign-in services differ in which optional fields they accept, so start with the full request
  // and fall back to the bare minimum. The service's own reason is passed on if every form is refused.
  const full = {
    client_name: CLIENT_NAME, redirect_uris: [redirectUri], grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'], token_endpoint_auth_method: 'none',
  };
  const forms = [
    meta.scope ? { ...full, scope: meta.scope } : null,
    full,
    { client_name: CLIENT_NAME, redirect_uris: [redirectUri] },
  ].filter(Boolean);
  let data = {}; let status = 0; let reason = '';
  for (const body of forms) {
    const res = await fetch(meta.register, {
      method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
    });
    status = res.status;
    const text = await res.text();
    try { data = JSON.parse(text); } catch { data = {}; }
    if (res.ok && data.client_id) break;
    reason = String(data.error_description || data.message || data.error || text || '').replace(/\s+/g, ' ').slice(0, 300)
      + (data.errors ? ` ${JSON.stringify(data.errors).slice(0, 300)}` : '');
    data = {};
    if (status !== 400 && status !== 422) break;
  }
  if (!data.client_id) throw err(`The HTR sign-in service refused to register this app (${status})${reason ? `: ${reason}` : '.'}`);
  return { client_id: data.client_id, redirect_uri: redirectUri, registeredAt: new Date().toISOString() };
}

// Step 1: returns the hoteltechreport.com address to send the admin to.
export async function beginConnect({ base, back, email }) {
  const redirectUri = `${base}/api/htr/oauth/callback`;
  const meta = await discover();
  const state = await load();
  state.client = await ensureClient(state, meta, redirectUri);
  const verifier = b64(randomBytes(32));
  const id = b64(randomBytes(18));
  const now = Date.now();
  state.pending = Object.fromEntries(Object.entries(state.pending || {}).filter(([, v]) => now - v.at < PENDING_MS));
  state.pending[id] = { verifier: seal(verifier), back, email: email || null, at: now, meta };
  await save(state);
  const url = new URL(meta.authorize);
  const q = {
    response_type: 'code', client_id: state.client.client_id, redirect_uri: redirectUri, state: id,
    code_challenge: b64(createHash('sha256').update(verifier).digest()), code_challenge_method: 'S256', resource: meta.resource,
  };
  if (meta.scope) q.scope = meta.scope;
  for (const [k, v] of Object.entries(q)) url.searchParams.set(k, v);
  return url.toString();
}

async function tokenRequest(endpoint, params) {
  const res = await fetch(endpoint, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams(params).toString(), signal: AbortSignal.timeout(20000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw Object.assign(err(data.error_description || data.error || `Token request failed (${res.status}).`), { refused: res.status >= 400 && res.status < 500 });
  }
  return data;
}

const pack = (data, previous = {}) => ({
  access: data.access_token,
  refresh: data.refresh_token || previous.refresh || null,
  expiresAt: data.expires_in ? Date.now() + Number(data.expires_in) * 1000 : null,
});

// Step 2: hoteltechreport.com sends the admin back with a one-time code; swap it for tokens.
export async function finishConnect({ id, code, email }) {
  const state = await load();
  const p = state.pending?.[id];
  if (!p || Date.now() - p.at > PENDING_MS) throw err('That sign-in attempt expired. Click Connect again.', 400);
  if (p.email && email && p.email !== email) throw err('That sign-in was started by a different admin. Click Connect again.', 400);
  const data = await tokenRequest(p.meta.token, {
    grant_type: 'authorization_code', code, redirect_uri: state.client.redirect_uri, client_id: state.client.client_id,
    code_verifier: unseal(p.verifier), resource: p.meta.resource,
  });
  delete state.pending[id];
  Object.assign(state, {
    tokens: seal(pack(data)), endpoints: { token: p.meta.token, resource: p.meta.resource },
    connectedAt: new Date().toISOString(), connectedBy: email || p.email || null, brokenAt: null,
  });
  await save(state);
  return p.back;
}

export async function disconnect() {
  const state = await load();
  await save({ client: state.client || null });
}

// ---------- use ----------
export async function connection() {
  const state = await load();
  return { connected: !!state.tokens && !state.brokenAt, by: state.connectedBy || null, at: state.connectedAt || null, broken: !!state.brokenAt };
}

let refreshing = null;

// A valid access token, renewed first when it is about to run out (or when force is set after a refusal).
export async function accessToken({ force = false } = {}) {
  const state = await load();
  const t = unseal(state.tokens);
  if (!t?.access || state.brokenAt) throw err('Hotel Tech Report is not connected. Click "Connect Hotel Tech Report" on the project page.', 503);
  const stale = force || (t.expiresAt && t.expiresAt - Date.now() < 60e3);
  if (!stale) return t.access;
  if (!t.refresh) return markBroken(state);
  refreshing ||= (async () => {
    try {
      const data = await tokenRequest(state.endpoints.token, {
        grant_type: 'refresh_token', refresh_token: t.refresh, client_id: state.client.client_id, resource: state.endpoints.resource,
      });
      const next = pack(data, t);
      await save({ ...(await load()), tokens: seal(next) });
      return next.access;
    } catch (e) {
      if (e.refused) return markBroken(state);
      throw e;
    } finally { refreshing = null; }
  })();
  return refreshing;
}

async function markBroken(state) {
  await save({ ...state, brokenAt: new Date().toISOString() });
  throw err('The Hotel Tech Report sign-in has expired. Reload this page and click "Connect Hotel Tech Report" again.', 503);
}
