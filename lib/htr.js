// Minimal client for the HTR data server (MCP over streamable HTTP).
// Two ways in, both sent as "Authorization: Bearer <token>":
//   1. Sign-in (default): an admin clicks "Connect Hotel Tech Report" once. See lib/htr-oauth.js.
//   2. HTR_MCP_KEY: a fixed admin API key in Vercel. Takes priority when set.
import { HTR_URL, accessToken, connection } from './htr-oauth.js';

const URL_ = HTR_URL;
const KEY = () => process.env.HTR_MCP_KEY || '';

// { connected, mode: 'key' | 'signin', by, at, broken }
export async function htrStatus() {
  if (KEY()) return { connected: true, mode: 'key' };
  const c = await connection().catch(() => ({ connected: false }));
  return { ...c, mode: 'signin' };
}

let nextId = 1;

async function rpc(body, sessionId, token) {
  const res = await fetch(URL_(), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      authorization: `Bearer ${token}`,
      ...(sessionId ? { 'mcp-session-id': sessionId } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45000),
  });
  if (res.status === 401) throw Object.assign(new Error('The HTR data server refused the sign-in.'), { status: 502, unauthorized: true });
  if (res.status === 403) throw Object.assign(new Error('The HTR data server says this account is not allowed to read that. Connect with an HTR admin account.'), { status: 502 });
  if (!res.ok && res.status !== 202) throw Object.assign(new Error(`HTR data server error (${res.status}).`), { status: 502 });
  const session = res.headers.get('mcp-session-id') || sessionId;
  if (body.id === undefined) return { session };
  const type = res.headers.get('content-type') || '';
  const text = await res.text();
  let msg = null;
  if (type.includes('text/event-stream')) {
    // Take the JSON-RPC message that answers our request id.
    for (const line of text.split('\n')) {
      if (!line.startsWith('data:')) continue;
      try { const m = JSON.parse(line.slice(5).trim()); if (m.id === body.id) msg = m; } catch { /* keep looking */ }
    }
  } else {
    msg = JSON.parse(text);
  }
  if (!msg) throw Object.assign(new Error('Empty answer from the HTR data server.'), { status: 502 });
  if (msg.error) throw Object.assign(new Error(msg.error.message || 'HTR data server error.'), { status: 502 });
  return { session, result: msg.result };
}

// One session per pull: initialize once, then call tools (in parallel is fine).
export async function htrSession() {
  const fixed = KEY();
  let token = fixed || await accessToken();
  // With sign-in, a refused token is renewed once and the request repeated.
  const send = async (body, session) => {
    try { return await rpc(body, session, token); } catch (e) {
      if (!e.unauthorized || fixed) throw e;
      token = await accessToken({ force: true });
      return rpc(body, session, token);
    }
  };
  const { session } = await send({
    jsonrpc: '2.0', id: nextId++, method: 'initialize',
    params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'youtube-production', version: '1' } },
  });
  await send({ jsonrpc: '2.0', method: 'notifications/initialized' }, session);
  return async function call(name, args = {}) {
    const { result } = await send({ jsonrpc: '2.0', id: nextId++, method: 'tools/call', params: { name, arguments: args } }, session);
    const text = (result?.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
    if (result?.isError) throw Object.assign(new Error(text || `${name} failed`), { status: 502 });
    try { return JSON.parse(text); } catch { return { message: text }; }
  };
}
