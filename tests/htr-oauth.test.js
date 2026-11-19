// The Hotel Tech Report sign-in connection, run against an in-memory store and a fake sign-in service.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mock, test } from 'node:test';

process.env.APP_SECRET = 'x'.repeat(32);
delete process.env.HTR_MCP_KEY;
delete process.env.HTR_MCP_URL;

const blobs = new Map();
mock.module('@vercel/blob', {
  namedExports: {
    get: async (p) => (blobs.has(p) ? { statusCode: 200, stream: new Response(blobs.get(p)).body } : null),
    put: async (p, body) => { blobs.set(p, body); return { pathname: p }; },
    del: async (p) => { blobs.delete(p); }, list: async () => ({ blobs: [], hasMore: false }),
    head: async () => null, issueSignedToken: async () => ({}), presignUrl: async () => ({}),
  },
});

const MCP = 'https://admin-mcp.hoteltechreport.com/mcp/htr';
const seen = { register: [], token: [], mcp: [] };
const srv = { access: 'at-1', refuseRefresh: false, expires_in: 3600 };
const json = (o, status = 200, headers = {}) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', ...headers } });
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  if (url === 'https://admin-mcp.hoteltechreport.com/.well-known/oauth-protected-resource/mcp/htr') {
    return json({ resource: MCP, authorization_servers: ['https://hoteltechreport.com'], scopes_supported: ['mcp:admin', 'mcp:tools:lookup'] });
  }
  if (url === 'https://hoteltechreport.com/.well-known/oauth-authorization-server') {
    return json({ authorization_endpoint: 'https://hoteltechreport.com/oauth/authorize', token_endpoint: 'https://hoteltechreport.com/oauth/token', registration_endpoint: 'https://hoteltechreport.com/oauth/register' });
  }
  if (url === 'https://hoteltechreport.com/oauth/register') { seen.register.push(JSON.parse(init.body)); return json({ client_id: 'client-abc' }, 201); }
  if (url === 'https://hoteltechreport.com/oauth/token') {
    const b = Object.fromEntries(new URLSearchParams(init.body));
    seen.token.push(b);
    if (b.grant_type === 'refresh_token' && srv.refuseRefresh) return json({ error: 'invalid_grant' }, 400);
    return json({ access_token: srv.access, refresh_token: `rt-${seen.token.length}`, expires_in: srv.expires_in });
  }
  if (url === MCP) {
    const auth = init.headers.authorization;
    const body = JSON.parse(init.body);
    if (!auth) return json({}, 401, { 'www-authenticate': 'Bearer resource_metadata="x"' });
    seen.mcp.push([auth, body.method]);
    if (auth !== `Bearer ${srv.access}`) return json({}, 401);
    if (body.id === undefined) return new Response(null, { status: 202 });
    if (body.method === 'initialize') return json({ jsonrpc: '2.0', id: body.id, result: {} }, 200, { 'mcp-session-id': 's1' });
    return json({ jsonrpc: '2.0', id: body.id, result: { content: [{ type: 'text', text: JSON.stringify({ products: [{ id: 533 }] }) }] } });
  }
  throw new Error(`unexpected request ${url}`);
};

const oauth = await import('../lib/htr-oauth.js');
const { htrSession, htrStatus } = await import('../lib/htr.js');
const BASE = 'https://youtube-studio.hoteltechinsider.com';

test('not connected until an admin signs in', async () => {
  assert.deepEqual(await htrStatus(), { connected: false, by: null, at: null, broken: false, mode: 'signin' });
  await assert.rejects(htrSession(), /not connected/);
});

test('connect: registers, sends the admin to HTR with PKCE, then stores encrypted tokens', async () => {
  const url = new URL(await oauth.beginConnect({ base: BASE, back: '/admin/projects/p1', email: 'jordan@hoteltechreport.com' }));
  assert.equal(url.origin + url.pathname, 'https://hoteltechreport.com/oauth/authorize');
  const q = Object.fromEntries(url.searchParams);
  assert.equal(q.client_id, 'client-abc');
  assert.equal(q.redirect_uri, `${BASE}/api/htr/oauth/callback`);
  assert.equal(q.resource, MCP);
  assert.equal(q.scope, 'mcp:admin mcp:tools:lookup');
  assert.equal(q.code_challenge_method, 'S256');
  assert.deepEqual(seen.register[0].redirect_uris, [`${BASE}/api/htr/oauth/callback`]);
  assert.equal(seen.register[0].token_endpoint_auth_method, 'none');

  await assert.rejects(oauth.finishConnect({ id: 'nope', code: 'c' }), /expired/);
  await assert.rejects(oauth.finishConnect({ id: q.state, code: 'c', email: 'someone@hoteltechreport.com' }), /different admin/);
  const back = await oauth.finishConnect({ id: q.state, code: 'code-1', email: 'jordan@hoteltechreport.com' });
  assert.equal(back, '/admin/projects/p1');
  const sent = seen.token[0];
  assert.equal(sent.grant_type, 'authorization_code');
  assert.equal(sent.code, 'code-1');
  assert.equal(createHash('sha256').update(sent.code_verifier).digest('base64url'), q.code_challenge, 'verifier matches the challenge');
  const stored = blobs.get('config/htr-oauth.json');
  assert.ok(!stored.includes('at-1') && !stored.includes('rt-1') && !stored.includes(sent.code_verifier), 'nothing secret is stored in the clear');
  const st = await htrStatus();
  assert.equal(st.connected, true);
  assert.equal(st.by, 'jordan@hoteltechreport.com');
  await oauth.beginConnect({ base: BASE, back: '/admin', email: 'jordan@hoteltechreport.com' });
  assert.equal(seen.register.length, 1, 'the app registers itself only once');
});

test('calls the data server with the signed-in token, renewing it once when refused', async () => {
  const call = await htrSession();
  assert.deepEqual(await call('htr_search_products', { name: 'trustyou' }), { products: [{ id: 533 }] });
  assert.ok(seen.mcp.every(([a]) => a === 'Bearer at-1'));

  srv.access = 'at-2'; // the old token stops working
  const again = await htrSession();
  assert.deepEqual(await again('htr_search_products', {}), { products: [{ id: 533 }] });
  const refresh = seen.token.at(-1);
  assert.equal(refresh.grant_type, 'refresh_token');
  assert.equal(refresh.refresh_token, 'rt-1');
  assert.equal(await oauth.accessToken(), 'at-2');
});

test('a refused renewal marks the connection expired so the page offers Connect again', async () => {
  srv.access = 'at-3'; srv.refuseRefresh = true;
  await assert.rejects(htrSession(), /expired/);
  const st = await htrStatus();
  assert.equal(st.connected, false);
  assert.equal(st.broken, true);
});

test('HTR_MCP_KEY, when set, is used instead of the sign-in', async () => {
  process.env.HTR_MCP_KEY = 'at-3';
  assert.deepEqual(await htrStatus(), { connected: true, mode: 'key' });
  const call = await htrSession();
  assert.deepEqual(await call('htr_search_products', {}), { products: [{ id: 533 }] });
  delete process.env.HTR_MCP_KEY;
});
