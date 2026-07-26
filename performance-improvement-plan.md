# Online Prefix Search Performance Improvement Plan

## Implementation Status

Implemented on 2026-07-26:

- SumatoraIndex now builds `sumatora_web_search.db`, a contentless 16 KiB-page
  FTS5 database with one-to-four-character prefix indexes and direct
  search-row-to-JMdict-sequence mappings.
- The release workflow publishes both plain and gzipped copies and advertises
  the pack as `type="web-search"` in `dictionaries.xml`.
- Fully online forward search queries the web-search pack and sends its
  sequence numbers directly to gitender. It no longer touches the remote core
  pack for ordinary Japanese exact or prefix matching.
- Original and katakana-normalized expressions are deduplicated.
- Japanese input skips translation-pack reverse search.
- The main-thread database service keeps at most one queued search while a
  synchronous HTTP-VFS query is active.
- UI search results use request generations, preventing obsolete completions
  from replacing newer results.
- A small result LRU makes repeated queries and backspacing immediate.
- HTTP-VFS handles now share URL metadata and page caches, eliminating
  duplicate access/open HEAD requests and preserving hot pages across handles.
- The HTTP page cache was increased from 4 MiB to 16 MiB per remote URL.
- VFS cache and read-ahead sizes adapt to reported device memory and network
  class.
- The first online page is capped at 18 results, with explicit 18-result
  expansion up to 54.
- Latin/romaji searches display forward matches before the slower reverse
  translation tier completes.
- Final rendered online results are cached in IndexedDB by dictionary release,
  language, query, and limit, with release-safe invalidation and bounded LRU
  eviction.
- Search timing is emitted through `sumatora:search-performance`; worker logs
  include range-request count, transferred bytes, VFS hits/misses, selected
  path, duration, and result count.

The existing core/gloss search remains as a compatibility fallback when the
manifest predates the web-search pack or that pack cannot be opened. Local
installed-dictionary search is otherwise unchanged.

### Measured browser results

End-to-end validation used the real generated web-search artifact, existing
core and English gloss packs, a correct HTTP `206` range server, the SQLite
WASM HTTP VFS, and headless Chrome:

| Scenario | Measured time |
|---|---:|
| Uncached Japanese online prefix search | approximately 403 ms |
| Same query from persistent rendered-result cache | approximately 0.7 ms |
| Latin/romaji forward-search stage | approximately 32 ms |
| Completed English reverse-gloss search | approximately 488 ms |

The UI-level timings exclude the 100 ms debounce where noted by the emitted
worker/main-thread metrics. A separate end-to-end observation, including
debounce, rendering, and polling granularity, displayed uncached Japanese
results in approximately 600–850 ms.

The production build passes. Lint passes for the changed code; the only lint
output is three pre-existing unused-parameter warnings in the vendored
`public/sqlite3-opfs-async-proxy.js`.

### Published release validation

The SumatoraIndex release workflow completed successfully on 2026-07-26
(run `30183504418`) and published `dictionaries-v18`:

- The live manifest reports repository version 18 and includes the
  `web-search` dictionary with both compressed and plain URLs and SHA-256
  hashes.
- The published plain `sumatora_web_search.db` is 24,100,864 bytes.
- The release host advertises `Accept-Ranges: bytes`.
- A live `Range: bytes=16-17` request returned HTTP `206`, exactly two bytes,
  and `Content-Range: bytes 16-17/24100864`. Those bytes were `64 0`, the
  expected SQLite page-size field for a 16 KiB page.

This validates that the production artifact and its HTTP delivery are suitable
for SQLite HTTP-VFS access.

The stateless proxy and production PWA were subsequently deployed:

- Proxy: `https://sumatora-pack-proxy.sumatora.workers.dev`
- PWA: `https://dictionary.sumatora.workers.dev`
- The production build sets `VITE_PACK_CORS_PROXY` in `.env.production`.
- A live proxied two-byte read returned HTTP `206`,
  `Content-Range: bytes 16-17/24100864`, `Access-Control-Allow-Origin: *`,
  and the required exposed range headers.
- A clean headless-Chrome session against the deployed PWA returned 18
  results for `食べ` from the published v18 artifact. The emitted cold
  remote-search time was approximately 3.65 seconds; the repeat query used
  the persistent cache in approximately 0.53 ms.
- A deployed English `swim` query emitted its forward stage after
  approximately 362 ms and completed reverse-gloss search in approximately
  6.36 seconds.

## Completed and Remaining Work

### Completed

- Compact, release-coupled forward-search database.
- One-to-four-character FTS prefix indexes.
- Direct search-row-to-JMdict-sequence resolution.
- Gitender rendering without core-pack lookups for normal Japanese searches.
- Latest-search-wins queue coalescing.
- Generation-based stale-result rejection in React.
- Original/katakana expression deduplication.
- Japanese reverse-gloss skipping.
- Early termination when the requested result limit is full.
- 18-result initial online page and explicit loading up to 54 results.
- Progressive forward-first display for Latin and romaji input.
- In-memory search-result LRU.
- Release/language/query/limit-keyed persistent rendered-result cache.
- Bounded persistent-cache eviction.
- Shared HTTP metadata and page caches across VFS handles.
- Adaptive VFS memory and read-ahead sizing.
- Reduced 100 ms debounce.
- Main-thread and worker performance metrics.
- Compatibility fallback for older manifests and unavailable web-search packs.
- Production TypeScript/Vite build validation.
- End-to-end browser validation through actual SQLite HTTP range reads.
- Successful SumatoraIndex v18 workflow and release publication.
- Live manifest discovery of the published `web-search` pack.
- Live release-asset size, byte-range support, and SQLite page-size validation.
- Production CORS proxy deployment and proxied range/CORS validation.
- Production PWA configuration and deployment.
- End-to-end production browser validation for cold, persistent-cache, and
  progressive reverse-gloss searches.

### Remaining validation and research

The following items are not required for the optimized forward-search path to
operate, but remain useful follow-up work:

1. Run the complete benchmark query set under:
   - Low-latency broadband.
   - Moderately throttled mobile networking.
   - High-latency networking.
   - Cold browser/application state.
   - Warm in-memory state.
   - Persistent rendered-result-cache hits.
2. Record a formal before/after baseline for:
   - Time to first result.
   - Total completion time.
   - Range-request count.
   - Range bytes transferred.
   - VFS cache hit/miss rate.
   - Stale searches skipped.
3. Consider compact, per-language reverse-gloss search artifacts. Forward
   Japanese/romaji matching uses the compact web-search pack, but an English
   translation search can still access the remote gloss and core packs.

### Superseded or intentionally omitted

- **Raw SQLite-page persistence:** not implemented because SQLite's
  synchronous VFS `xRead` cannot wait for asynchronous Cache Storage or
  IndexedDB. Persisting complete rendered search results is safe,
  release-aware, and faster for repeat searches because it bypasses both
  SQLite and gitender.
- **Physical core repacking:** no longer useful for the primary forward-prefix
  path because that path does not query the remote core pack. It would only
  improve the compatibility fallback or reverse-gloss path.
- **A stateful hosted search backend:** remains unnecessary. The optimized
  design continues to use static release artifacts, HTTP ranges, the
  stateless CORS proxy, and gitender.

## Problem

Online prefix search is extremely slow because it runs FTS5 queries against
the remote core SQLite database through synchronous HTTP range reads.

Prefix traversal can touch many scattered SQLite pages. In online mode, each
cache miss becomes a network round trip through the HTTP VFS and CORS proxy,
so network latency dominates the actual SQLite query time.

The current search path may execute:

1. An exact query for the entered term.
2. An exact query for its katakana-normalized form.
3. A prefix query for the entered term.
4. A prefix query for its katakana-normalized form.
5. Exact and prefix queries against the active translation database.
6. Exact and prefix queries against the backup translation database, when
   configured and the result limit has not been reached.

Before this plan was implemented, gitender avoided reconstructing entries
through remote SQL joins, but initial FTS matching still queried the large
remote core pack. That matching step was the primary bottleneck.

## Recommended Approach

Implement the first two items together:

1. Publish a compact, search-only SQLite pack.
2. Coalesce stale searches so only the newest term continues through the
   complete search pipeline.

This retains the current static architecture:

- Dictionary artifacts published as static release assets.
- SQLite queried through the existing HTTP range VFS.
- The stateless CORS proxy forwarding range requests.
- Gitender providing pre-rendered result content.
- No new stateful search service or hosted database.

## 1. Compact Remote-Search Pack

Publish a SQLite database intended specifically for online search. It should
contain only the data required to resolve a search term to ranked JMdict
sequence numbers:

- Normalized search terms.
- The FTS index.
- Script/type information.
- Priority and score fields.
- Entry identifiers.
- JMdict sequence numbers.

Online mode would query this pack instead of the full core database. The
resulting sequence numbers would continue through the existing gitender
rendering path.

The pack should be generated from the same SumatoraIndex release as the core
and gitender artifacts. This avoids cross-version identifier mismatches.

### Expected impact

This is likely to provide the largest cold-search improvement because:

- The remote file and its B-trees would be much smaller.
- Search-related pages would be packed more densely.
- Fewer unrelated pages would compete for the VFS cache.
- Mapping search matches to gitender sequence numbers would require no access
  to the full `Entry` table.

### Design considerations

- Keep forward word search separate from the existing optional suffix-search
  database unless measurements show that combining them is advantageous.
- Include the ranking data needed to preserve current result ordering.
- Use an appropriate SQLite page size for HTTP range access.
- Run `VACUUM` after building the final table and index layout.
- Publish an uncompressed copy and describe it in `dictionaries.xml`, as with
  the existing remotely queried packs.
- Treat the pack as release-coupled to gitender and the normal dictionary
  packs.

## 2. Stale-Search Coalescing

Previously, the UI waited 250 ms before dispatching a search, and cleanup only
prevented an obsolete result from being displayed. It did not cancel work
already queued at the database worker. The implemented path uses a 100 ms
debounce plus latest-search-wins coalescing.

Because HTTP VFS reads use synchronous XHR inside the worker, an obsolete
search can continue consuming range requests while newer searches wait. This
is especially costly during ordinary incremental input such as:

`食` → `食べ` → `食べる`

Add latest-search-wins behavior at the worker/service boundary:

- Assign a generation or request sequence to searches.
- Keep only the newest queued search term.
- Check whether a request is stale between search tiers.
- Stop before exact, prefix, gloss, sequence-resolution, or gitender work that
  is no longer needed.
- Do not attempt to interrupt an individual synchronous XHR already in
  progress; prevent subsequent work for that stale request instead.

### Expected impact

This primarily improves perceived responsiveness while typing. It also avoids
wasting network requests and cache capacity on results the UI will never use.

## 3. Reduce Duplicate and Unnecessary Queries

Optimize the existing tiered search path without changing result semantics:

- Do not query both the original and katakana-normalized form when they are
  identical.
- Deduplicate normalized match expressions before executing them.
- Skip translation/gloss search when the input is clearly Japanese and a
  reverse-language lookup would not be useful.
- Stop later tiers as soon as the result limit is satisfied.
- Consider a smaller initial online result limit, with an explicit way to
  request more results.
- Consider returning forward-search results first and augmenting them with
  slower reverse-gloss results afterward.

The last two items alter user-visible behavior and should be evaluated
separately from query deduplication.

## 4. Improve HTTP Page Caching

The HTTP VFS originally maintained a 4 MB in-memory LRU per open file. It now
uses a shared 16 MiB cache per remote URL while keeping SQLite's duplicate
page cache disabled.

Measure the effect of:

- Increasing the VFS cache size on devices with sufficient memory.
- Choosing cache size from available device memory.
- Adjusting the maximum merged range-read size.
- Retaining hot FTS pages more aggressively than sequentially fetched pages.
- Allowing a small SQLite page cache if it does not duplicate too much memory.
- Persisting fetched pages in Cache Storage or IndexedDB for reuse across
  sessions.

Raw persistent page caching is not implemented: synchronous SQLite `xRead`
cannot safely wait on asynchronous Cache Storage/IndexedDB. Instead, complete
rendered search responses are persisted at the main-thread layer with
release-aware keys, a 100-query bound, and oldest-first eviction. This skips
both SQLite and gitender on a repeat query and is faster than restoring pages.

### Expected impact

Caching should improve repeated searches and incremental prefixes, but cannot
eliminate the cold-search cost of traversing a large, scattered remote index.

## 5. Repack the Existing Core Database

If a separate search pack is not immediately feasible, optimize the core
database for range access:

- Cluster `SearchTerm`, `SearchTermFts`, and entry-to-sequence mappings.
- Remove avoidable fragmentation with `VACUUM`.
- Test larger SQLite page sizes.
- Ensure common search paths touch nearby pages.
- Inspect FTS configuration and prefix-index options using representative
  Japanese, romaji, and English queries.

This may reduce range-request count, but the full core file will remain less
cache-efficient than a purpose-built remote-search artifact.

## Measurement Plan

Before implementation, instrument online search to capture:

- Time to first displayed result.
- Total search completion time.
- Number of HTTP range requests per pack.
- Total transferred bytes.
- VFS cache hit rate.
- Pages evicted during a search.
- Time spent in each search tier.
- Number of stale searches started, skipped, and completed.
- Cold-cache and warm-cache results separately.

Use a representative query set:

- Short Japanese prefixes.
- Longer Japanese prefixes.
- Hiragana and katakana equivalents.
- Romaji input.
- Exact headword matches.
- Common English reverse searches.
- Prefixes with very large match sets.
- No-result queries.

Test at least:

- Low-latency broadband.
- Moderately throttled mobile networking.
- High-latency networking.
- A warm in-memory cache.
- A completely cold cache and fresh application session.

## Success Criteria

Define exact targets after collecting a baseline. Suggested initial goals:

- A substantial reduction in cold-cache range-request count for prefix
  matching.
- No obsolete search completing its later tiers after a newer term is queued.
- Warm incremental-prefix searches feeling effectively immediate.
- No change to result ordering for the same query and result limit.
- No regression in local/offline search.
- No requirement for a stateful backend service.

## Proposed Delivery Order

1. Add measurement and establish a reproducible baseline.
2. Add stale-search coalescing.
3. Deduplicate identical normalized queries and skip clearly irrelevant tiers.
4. Build and publish the compact remote-search pack.
5. Route fully online forward search through the compact pack and gitender.
6. Tune the VFS cache using the new measurements.
7. Evaluate persistent page caching only if cold or repeat performance remains
   insufficient.

## Conclusion

Cache tuning alone is unlikely to make cold online prefix search consistently
fast. The best fit for the current architecture is a compact, release-coupled
remote-search SQLite pack, with gitender continuing to render results.

Combining that pack with latest-search-wins coalescing addresses both major
sources of delay: scattered range reads against an oversized database and
wasted work from obsolete incremental searches.
