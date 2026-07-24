// Thin, stateless CORS-adding proxy for GitHub Release assets.
//
// Why this exists: GitHub Release assets (the dictionary packs published by
// SumatoraIndex) have no Access-Control-Allow-Origin header anywhere in
// their redirect chain (verified live, 2026-07-24 — see
// ui-parity-and-remote-search-plan.md), so a browser fetch() from this PWA's
// own origin is CORS-blocked. This forwards GET/HEAD requests (Range header
// included, for Phase E's HTTP-Range VFS) to the real asset and adds CORS
// headers to the response. It has no SQL/dictionary awareness — it only
// forwards bytes.
//
// Deployment is NOT done by Claude — see README.md in this directory. This
// file is source only, checked in for review; it is not live anywhere until
// you (the repo owner) run `wrangler deploy` yourself.

// Only ever proxy to hosts that actually serve dictionary packs. An open
// proxy (fetch-any-url) would be an SSRF/abuse vector; this allowlist is
// the one piece of security logic that matters here.
const ALLOWED_HOSTS = new Set([
  'github.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com',
  'raw.githubusercontent.com',
]);

// Set this to your deployed PWA's real origin before deploying, e.g.
// 'https://sumatora.example.com'. '*' works too (the proxied data is public,
// non-sensitive dictionary content) but a specific origin is tighter.
const ALLOWED_ORIGIN = '*';

function corsHeaders(extra) {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Range',
    'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges, ETag',
    ...extra,
  };
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405, headers: corsHeaders() });
    }

    const requestUrl = new URL(request.url);
    const target = requestUrl.searchParams.get('url');
    if (!target) {
      return new Response('Missing ?url= parameter', { status: 400, headers: corsHeaders() });
    }

    let targetUrl;
    try {
      targetUrl = new URL(target);
    } catch {
      return new Response('Invalid target URL', { status: 400, headers: corsHeaders() });
    }
    if (targetUrl.protocol !== 'https:' || !ALLOWED_HOSTS.has(targetUrl.hostname)) {
      return new Response(`Host not allowed: ${targetUrl.hostname}`, { status: 403, headers: corsHeaders() });
    }

    const upstreamHeaders = new Headers();
    const range = request.headers.get('Range');
    if (range) upstreamHeaders.set('Range', range);

    const upstream = await fetch(targetUrl.toString(), {
      method: request.method,
      headers: upstreamHeaders,
      redirect: 'follow', // github.com/.../releases/download/... 302s to the real asset host
    });

    const headers = new Headers(upstream.headers);
    for (const [k, v] of Object.entries(corsHeaders())) headers.set(k, v);

    return new Response(upstream.body, { status: upstream.status, headers });
  },
};
