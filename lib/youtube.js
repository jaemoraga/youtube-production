// The vendor's own YouTube channel, shown to the editor as a place to look for extra footage.
// No API key: a channel's public RSS feed lists its most recent uploads (YouTube gives 15).
const UA = { 'user-agent': 'Mozilla/5.0 (compatible; HotelTechReport/1.0)', 'accept-language': 'en-US,en;q=0.9' };
const CHANNEL_ID = /UC[\w-]{22}/;

// "@chatlyn", "youtube.com/@chatlyn", "youtube.com/channel/UC…", "youtube.com/c/name" -> a clean channel URL, or null.
export function channelUrl(input) {
  let v = String(input || '').trim();
  if (!v) return null;
  if (/^@[\w.-]{2,}$/.test(v)) return `https://www.youtube.com/${v}`;
  if (/^UC[\w-]{22}$/.test(v)) return `https://www.youtube.com/channel/${v}`;
  if (!/^https?:\/\//i.test(v)) v = `https://${v}`;
  let u; try { u = new URL(v); } catch { return null; }
  if (!/(^|\.)youtube\.com$/i.test(u.hostname)) return null;
  const m = /^\/(@[\w.-]+|channel\/UC[\w-]{22}|c\/[^/]+|user\/[^/]+)/.exec(decodeURIComponent(u.pathname));
  return m ? `https://www.youtube.com/${m[1]}` : null;
}

// The channel id behind a channel URL. Read from the URL when it is there, otherwise from the channel page.
export async function resolveChannelId(url) {
  const direct = /\/channel\/(UC[\w-]{22})/.exec(url);
  if (direct) return direct[1];
  const res = await fetch(url, { headers: UA, redirect: 'follow', signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`YouTube answered ${res.status} for that address.`);
  const html = await res.text();
  const m = /feeds\/videos\.xml\?channel_id=(UC[\w-]{22})/.exec(html) || /"(?:channelId|externalId|browseId)":"(UC[\w-]{22})"/.exec(html) || /youtube\.com\/channel\/(UC[\w-]{22})/.exec(html);
  if (!m || !CHANNEL_ID.test(m[1])) throw new Error('Could not find a channel at that address. Paste the address of the channel page itself.');
  return m[1];
}

const unescape = (s) => String(s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");

// Reads a channel feed into { title, videos: [{ id, title, published, url, thumb, description }] }.
export function parseFeed(xml) {
  const tag = (block, name) => unescape((new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`).exec(block) || [])[1] || '').trim();
  const head = xml.split('<entry>')[0] || '';
  const videos = xml.split('<entry>').slice(1).map((e) => {
    const id = tag(e, 'yt:videoId');
    return {
      id, title: tag(e, 'title'), published: tag(e, 'published') || null,
      url: `https://www.youtube.com/watch?v=${id}`, thumb: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
      description: tag(e, 'media:description').replace(/\s+/g, ' ').slice(0, 200),
    };
  }).filter((v) => /^[\w-]{6,20}$/.test(v.id) && v.title);
  return { title: tag(head, 'title'), videos };
}

// Recent uploads for the editor page. Cached for an hour; any failure returns null so the page still loads.
export async function channelFeed(channelId) {
  if (!CHANNEL_ID.test(channelId || '')) return null;
  try {
    const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`, { headers: UA, next: { revalidate: 3600 }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return parseFeed(await res.text());
  } catch { return null; }
}
