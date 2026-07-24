# Dictionary pack CORS proxy

A minimal, stateless Cloudflare Worker that adds CORS headers to GitHub
Release asset responses (which have none — verified live, see
`../ui-parity-and-remote-search-plan.md`), so the PWA can `fetch()` dictionary
packs directly. It forwards `GET`/`HEAD` (with `Range`) to an allowlisted set
of GitHub asset hosts and streams the response back unmodified except for the
added CORS headers. It has no SQL or dictionary-specific logic.

**Not deployed.** This is source only, for you to review and deploy under
your own Cloudflare account — nothing here has been run or published.

## Deploy

1. Install Wrangler if you don't have it: `npm install -g wrangler`
2. `cd cors-proxy && wrangler login` (opens a browser to authorize against
   your Cloudflare account)
3. Optionally edit `worker.js`'s `ALLOWED_ORIGIN` constant to your deployed
   PWA's real origin instead of `'*'` (tighter, but `'*'` is fine too since
   every proxied response is public, non-sensitive dictionary data).
4. `wrangler deploy`
5. Wrangler prints the deployed URL (`https://sumatora-pack-proxy.<your-subdomain>.workers.dev`).
   Set that as `VITE_PACK_CORS_PROXY` in the PWA's production build
   environment (see `src/db/catalogue.ts`'s `PACK_CORS_PROXY` — it's a no-op
   until this env var is set).

## Cost

Cloudflare Workers' free tier is 100,000 requests/day, which is almost
certainly more than enough for this — every request just forwards bytes, no
compute-heavy work happens here. Worth checking your own account's current
pricing before relying on this for real traffic, though.

## Testing after deploy

```sh
curl -I "https://sumatora-pack-proxy.<your-subdomain>.workers.dev/?url=https://github.com/HappyPeng2x/SumatoraIndex/releases/download/dictionaries-v14/sumatora_kanji.db.gz"
```

Should return `200`/`206` with `access-control-allow-origin` present, matching
the live-verified behavior recorded in `../ui-parity-and-remote-search-plan.md`.
