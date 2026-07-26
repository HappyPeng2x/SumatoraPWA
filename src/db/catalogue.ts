import type { DictMeta, PackType } from './types'

// The canonical manifest lives on SumatoraIndex (the repo that produces every
// pack for every client — Android, desktop, and this PWA), not on this repo
// or on the Android app's repo. See ui-parity-and-remote-search-plan.md.
//
// raw.githubusercontent.com serves small repo files (like this manifest)
// with `Access-Control-Allow-Origin: *` — no proxy needed for the manifest
// itself. The actual pack bytes are GitHub Release assets, which have no
// CORS headers at all (verified live) and need PACK_CORS_PROXY below once
// deployed.
const REMOTE_MANIFEST_URL =
  'https://raw.githubusercontent.com/HappyPeng2x/SumatoraIndex/master/dictionaries.xml'

// In dev, use a local manifest + local pack files served by a plain http
// server and proxied same-origin by Vite (see vite.config.ts) — this avoids
// depending on network access to GitHub, and same-origin means no CORS
// question at all while developing.
const DEV_MANIFEST_URL = '/dictionaries/dictionaries.xml'

// Rewrites a pack's release-asset URL through a CORS-adding proxy in
// production. The production value is in .env.production; leaving it unset
// intentionally falls back to direct asset URLs for local/custom builds.
const PACK_CORS_PROXY = import.meta.env.VITE_PACK_CORS_PROXY as string | undefined

function proxyUrl(uri: string): string {
  if (!PACK_CORS_PROXY) return uri
  return `${PACK_CORS_PROXY}?url=${encodeURIComponent(uri)}`
}

function filenameFor(uri: string): string {
  // 'https://.../sumatora_core.db.gz' -> 'sumatora_core.db'
  const base = uri.split('/').pop() ?? uri
  return base.endsWith('.gz') ? base.slice(0, -3) : base
}

function parseManifest(xml: string): DictMeta[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const parseError = doc.querySelector('parsererror')
  if (parseError) throw new Error(`Failed to parse dictionaries.xml: ${parseError.textContent}`)

  const repo = doc.querySelector('repository')
  const version = Number(repo?.getAttribute('version') ?? 0)
  const date = Number(repo?.getAttribute('date') ?? 0)

  return Array.from(doc.querySelectorAll('dictionary')).map((el) => {
    const uri = el.getAttribute('uri') ?? ''
    // plain_uri (uncompressed, for HTTP Range-request queries ahead of local
    // install — Phase E) is absent from manifests published before that
    // pipeline change; null means "no remote-search fallback for this pack".
    const plainUriRaw = el.getAttribute('plain_uri')
    return {
      type: (el.getAttribute('type') ?? '') as PackType,
      lang: el.getAttribute('lang') ?? '',
      description: el.getAttribute('description') ?? '',
      uri: import.meta.env.DEV ? uri : proxyUrl(uri),
      plainUri: plainUriRaw ? (import.meta.env.DEV ? plainUriRaw : proxyUrl(plainUriRaw)) : null,
      filename: filenameFor(uri),
      sha256: el.getAttribute('sha256') ?? '',
      version,
      date,
    }
  })
}

let cached: Promise<DictMeta[]> | null = null

/** Fetches and parses the dictionary release manifest. Cached for the page's lifetime. */
export function fetchCatalogue(): Promise<DictMeta[]> {
  if (!cached) {
    const url = import.meta.env.DEV ? DEV_MANIFEST_URL : REMOTE_MANIFEST_URL
    cached = fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`)
        return res.text()
      })
      .then(parseManifest)
      .catch((err) => {
        cached = null // allow retrying on next call
        throw err
      })
  }
  return cached
}
