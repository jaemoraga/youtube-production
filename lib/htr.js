// Minimal client for the HTR data server (MCP over streamable HTTP).
// Configure with HTR_MCP_URL and HTR_MCP_KEY (sent as "Authorization: Bearer <key>").
const URL_ = () => process.env.HTR_MCP_URL || '';
const KEY = () => process.env.HTR_MCP_KEY || '';
export const HTR_ENABLED = () => !!(URL_() && KEY());

let nextId = 1;

async function rpc(body, sessionId) {
  const res = await fetch(URL_(), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      authorization: `Bearer ${KEY()}`,
      ...(sessionId ? { 'mcp-session-id': sessionId } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45000),
  });
  if (res.status === 401 || res.status === 403) throw Object.assign(new Error('The HTR data key was refused.'), { status: 502 });
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
  if (!HTR_ENABLED()) throw Object.assign(new Error('The HTR data feed is not connected yet.'), { status: 503 });
  const { session } = await rpc({
    jsonrpc: '2.0', id: nextId++, method: 'initialize',
    params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'youtube-production', version: '1' } },
  });
  await rpc({ jsonrpc: '2.0', method: 'notifications/initialized' }, session);
  return async function call(name, args = {}) {
    const { result } = await rpc({ jsonrpc: '2.0', id: nextId++, method: 'tools/call', params: { name, arguments: args } }, session);
    const text = (result?.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
    if (result?.isError) throw Object.assign(new Error(text || `${name} failed`), { status: 502 });
    try { return JSON.parse(text); } catch { return { message: text }; }
  };
}
