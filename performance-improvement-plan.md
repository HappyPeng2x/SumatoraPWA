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

The existing core/gloss search remains as a compatibility fallback when the
manifest predates the web-search pack or that pack cannot be opened. Local
installed-dictionary search is otherwise unchanged.

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

Persistent page caching is a larger change because it needs release-aware
invalidation, storage limits, and eviction behavior. It should follow the
compact-pack work rather than replace it.

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
