# Search query flow

This document describes every SQL query that executes when a user types into
the search box, from the React `useSearch` hook down to the SQLite WASM worker.
It covers both **local mode** (packs installed via OPFS) and **remote mode**
(packs queried live over HTTP Range requests through the custom "http" VFS).
For the pack-building side, see the companion
[Database.md](https://github.com/HappyPeng2x/SumatoraIndex/blob/master/Database.md)
in the SumatoraIndex repository.

## Architecture

```
┌─ Main thread ─────────────────┐    postMessage    ┌─ Web Worker ────────────┐
│  useSearch (React hook)       │ ────────────────→ │  sqlite.worker.ts       │
│  DbService (singleton proxy)  │ ←──────────────── │  @sqlite.org/sqlite-wasm│
│                                │                   │  httpVfs (remote only) │
└────────────────────────────────┘                   └─────────────────────────┘
```

The worker opens one or more SQLite databases. In **local mode** these are
OPFS files on disk. In **remote mode** (Phase E, pre-install) they are served
from a CDN and paged in on demand through the custom HTTP VFS: each SQLite
page read becomes a synchronous `XMLHttpRequest` with a `Range` header. The
results are cached in an in-memory LRU (configured to 16 MB by default) so
subsequent reads of the same pages are served locally.

## Debounce and two-phase search

`useSearch` applies a **275 ms debounce**. When the timer fires:

1. **Forward search** (`scope='forward'`) — dispatched first. Returns up to
   `ONLINE_PAGE_SIZE` (12) results from the forward/word index only. Results
   are displayed immediately so the user sees something as soon as possible.

2. **Complete search** (`scope='all'`) — dispatched after forward results
   arrive, but **only** when the input is Latin-script and the forward page
   is not already full (fewer than `limit` results). This adds the slower
   reverse-gloss tier. Results replace the forward-only list.

Japanese input (kanji, hiragana, katakana) skips the reverse-gloss tier
entirely — gloss text is Latin-script, so a Japanese query cannot produce a
useful reverse match.

In **local mode** both phases are collapsed into one `scope='all'` call
because local queries are fast enough that the two-phase split provides no
perceived benefit.

## Pack attachment

The worker can have several packs attached simultaneously:

| Schema alias | Pack file | Required | Contents |
|---|---|---|---|
| `main` | `sumatora_core.db` | Yes | Entry, EntryForm, Sense, tags, furigana, forward FTS |
| `{lang}` | `sumatora_gloss_{lang}.db` | For gloss | SenseGloss translations, reverse-gloss FTS |
| `websearch` | `sumatora_web_search.db` | Remote only | Forward FTS + pre-ranked prefix tables |
| `webgloss` | `sumatora_web_gloss_{lang}.db` | Remote only | Pre-ranked gloss prefix/exact tables + full FTS fallback (v2) |
| `webglossBackup` | (backup language) | Remote only | Same as webgloss, for the backup gloss language |

The web-search and web-gloss packs exist only when both the core and the
active gloss language are remote (the `useGitenderPath()` precondition).
They are small, purpose-built databases whose schemas are designed to
minimise HTTP round-trips.

## Forward search (all modes)

Forward search matches the user's input against Japanese writing, kana, and
romaji forms. It runs in two sub-tiers, both of which need to produce
results in Android's four-band ranking order:

| Band | Android tier | Script | Priority |
|---|---|---|---|
| 0 | Exact/prefix writing | writing (`漢字`) | priority (`news1`, `ichi1`, etc.) |
| 1 | Exact/prefix kana | kana (`カンジ`) | priority |
| 2 | Exact/prefix writing | writing | non-priority |
| 3 | Exact/prefix kana | kana | non-priority |

The exact and prefix tiers handle these four bands differently:

- **Prefix tier** — splits into four separate queries, one per band. Each
  query has a simple `WHERE script_order = ? AND priority ? 0` filter and
  is naturally bounded to a single band. A covering table
  (`WebSearchPrefixTop`) pre-materialises the busiest `(script_order,
  prefix, priority_class)` groups so they resolve in a single indexed seek
  instead of a live FTS scan.

- **Exact tier** — combines all four bands into a single query with a CTE,
  `UNION ALL`, and `CASE` expressions. This is because the exact tier has
  no covering table: exact matches are inherently small (homograph counts
  are in the single digits per form — a given writing like `日本` matches
  only a handful of entries), so the live query is always cheap. The four
  bands are ranked inline rather than split across calls to keep the
  deduplication (`GROUP BY source_key`, `MIN(tier)`) in one place.

The prefix tier is split because broad prefixes can match thousands of
entries, making the covering table worth the complexity of per-band calls.
The exact tier is combined because the per-band overhead isn't justified
when each band returns only a few rows.

### Remote mode (web-search pack path)

When `currentHasWebSearch && useGitenderPath()`, the dedicated 24 MB
`sumatora_web_search.db` is used. This pack carries only the data needed to
match a normalized term to a JMdict sequence number — no display data.

**Exact tier** — single query covering all four ranking bands. The CTE
unions two script queries (writing + kana), each using a `CASE` to inline
the priority/non-priority tier number, then groups by `source_key` to
deduplicate entries that matched both scripts:

```sql
WITH candidates AS (
  SELECT wr.source_key, wr.entry_id, wr.entry_score,
         CASE WHEN wr.priority > 0 THEN 0 ELSE 2 END AS tier
  FROM websearch.WebSearchResult wr
  WHERE wr.script_order = 0 AND wr.search_id IN (
    SELECT rowid FROM websearch.WebSearchFts WHERE normalized MATCH '"日本"'
  )
  UNION ALL
  SELECT wr.source_key, wr.entry_id, wr.entry_score,
         CASE WHEN wr.priority > 0 THEN 1 ELSE 3 END AS tier
  FROM websearch.WebSearchResult wr
  WHERE wr.script_order = 1 AND wr.search_id IN (
    SELECT rowid FROM websearch.WebSearchFts WHERE normalized MATCH '"ニホン"'
  )
)
SELECT source_key, MIN(tier) AS tier,
       MAX(entry_score) AS entry_score, MIN(entry_id) AS entry_id
FROM candidates
GROUP BY source_key
ORDER BY tier, entry_score DESC, entry_id
LIMIT ?
```

**Prefix tier** — split into four per-band calls. Each call first probes
`WebSearchPrefixTop`, a covering table that materialises pre-ranked results
for any `(script_order, prefix, priority_class)` group with more than 50
raw candidates. If the probe hits, the query is a single indexed seek
(no CTE, no JOIN):

```sql
SELECT source_key
FROM websearch.WebSearchPrefixTop
WHERE script_order = ? AND prefix = ? AND priority_class = ?
ORDER BY entry_score DESC, entry_id
LIMIT ?
```

If the prefix is too narrow to have been materialised (≤ 50 candidates),
a per-band live FTS query runs — simpler than the exact tier because the
`script_order` and `priority` filters already isolate one band:

```sql
SELECT wr.source_key AS source_key,
       MAX(wr.entry_score) AS entry_score, MIN(wr.entry_id) AS entry_id
FROM websearch.WebSearchResult wr
WHERE wr.script_order = ? AND wr.priority ? 0
  AND wr.search_id IN (
    SELECT rowid FROM websearch.WebSearchFts WHERE normalized MATCH '"日本"*'
  )
GROUP BY wr.source_key
ORDER BY entry_score DESC, entry_id
LIMIT ?
```

The four calls run in Android band order: priority-writing, priority-kana,
non-priority-writing, non-priority-kana. Earlier bands push results into
`seen`/`order` first; later bands skip already-matched entries.

**Timing**: typ. 3–15 HTTP Range requests, 150–800 ms. The web-search pack
is 24 MB; its hot FTS pages fit comfortably in the VFS page cache.

### Remote mode (core-pack fallback)

When the dedicated web-search pack is not available (e.g. core and gloss are
remote but the manifest predates the web-search pack), forward search falls
back to `main.SearchTermFts` in the 200+ MB core pack:

```sql
WITH candidates AS (
  SELECT st.entry_id,
         CASE WHEN st.priority > 0 THEN 0 ELSE 2 END AS tier
  FROM main.SearchTerm st
  WHERE st.script = 'writing' AND st.search_id IN (
    SELECT rowid FROM main.SearchTermFts WHERE normalized MATCH '"日本"'
  )
  UNION ALL
  SELECT st.entry_id,
         CASE WHEN st.priority > 0 THEN 1 ELSE 3 END AS tier
  FROM main.SearchTerm st
  WHERE st.script = 'kana' AND st.search_id IN (
    SELECT rowid FROM main.SearchTermFts WHERE normalized MATCH '"ニホン"'
  )
)
SELECT c.entry_id, MIN(c.tier) AS tier, e.score AS entry_score
FROM candidates c
JOIN main.Entry e ON e.entry_id = c.entry_id
GROUP BY c.entry_id
ORDER BY tier, entry_score DESC, c.entry_id
LIMIT ?
```

**Timing**: typ. 10–40 HTTP Range requests, 400–2000 ms. The core pack's
FTS index pages are spread across a larger file; fewer fit in the VFS cache.

### Local mode (OPFS, all packs installed)

Same query as the core-pack fallback above, but all files are on disk.
**Timing**: < 5 ms — OPFS reads are synchronous and fast.

## Reverse-gloss search (remote mode, Latin-script input only)

When the forward search returns fewer than `limit` results and the input is
Latin-script (no kanji/hiragana/katakana), the reverse-gloss tier runs. It
matches the user's input against English (or other language) gloss text,
using a three-tier fallback strategy within the web-gloss pack.

Two sub-tiers run:
- **Gloss exact** — exact word match (`'"therefore"'`)
- **Gloss prefix** — prefix match (`'"therefore"*'`)

Both tiers merge results per-language into a single query via `UNION ALL`,
grouped by `entry_id` with `MIN(sense_ord)` for ordering:

```sql
WITH matches AS (
  -- Per-language fragment (see below): one UNION ALL branch per language
  ...
)
SELECT entry_id, source_key, MIN(sense_ord) AS sense_ord
FROM matches
GROUP BY entry_id
ORDER BY sense_ord, entry_id
LIMIT ?
```

Each language contributes one SQL fragment, chosen by a three-tier probe:

### Tier 1 — covering table hit (WebGlossExactTop / WebGlossPrefixTop)

A single `LIMIT 1` probe checks whether this exact term or prefix was
materialised at build time (common enough, > 50 candidate entries):

```sql
SELECT 1 FROM "webgloss".WebGlossExactTop WHERE term = 'therefore' LIMIT 1
```

If a row exists, the fragment is a simple indexed seek returning pre-ranked,
pre-joined results — no JOINs at all:

```sql
SELECT entry_id, source_key, sense_ord
FROM "webgloss".WebGlossExactTop
WHERE term = 'therefore'
```

**Timing**: 1 HTTP Range request (single index seek), < 50 ms.

### Tier 2 — full FTS5 fallback (GlossAllFts, v2+ packs)

When the covering table probe misses (the term is too specific to have been
materialised), v2 web-gloss packs carry a self-contained FTS5 fallback that
avoids touching either the gloss pack or the core pack:

```sql
SELECT ga.entry_id, ga.source_key, ga.sense_ord
FROM "webgloss".GlossAll ga
WHERE ga.rowid IN (
  SELECT rowid FROM "webgloss".GlossAllFts WHERE GlossAllFts MATCH '"therefore"*'
)
```

`GlossAll` is pre-joined at build time — every `SenseGloss` rowid maps
directly to `(entry_id, source_key, sense_ord)`. The FTS5 index uses
`detail=none` (no column-level storage, saving ~40% space) and requires
table-level `MATCH` syntax. Everything stays within the small web-gloss
pack.

**Timing**: typ. 5–30 HTTP Range requests, 200–800 ms. FTS5 postings for a
single term are stored contiguously in the index, so the HTTP VFS's
super-page merging coalesces sequential reads efficiently.

### Tier 3 — cross-pack live-FTS fallback (pre-v2 or no web-gloss pack)

When no web-gloss pack is attached, or the pack is pre-v2 (no GlossAllFts),
the fallback queries the gloss pack's live FTS5 index and JOINs across to
the core pack for entry data:

```sql
SELECT s.entry_id AS entry_id, e.source_key AS source_key, s.ord AS sense_ord
FROM "eng".SenseGloss sg
JOIN main.Sense s ON s.sense_id = sg.sense_id
JOIN main.Entry e ON e.entry_id = s.entry_id
WHERE sg.rowid IN (
  SELECT rowid FROM "eng".GlossSearchFts WHERE text MATCH '"therefore"*'
)
```

The `GlossSearchFts` index lives in the gloss pack (53 MB for English). The
`Sense` and `Entry` tables live in the core pack (200+ MB). For each
matching gloss row, SQLite performs random-access lookups into the core pack
— and with the core pack far larger than the VFS page cache, most result in
a fresh HTTP Range request.

**Timing**: typ. 30–100+ HTTP Range requests, 1500–5000 ms. This is the
slow path that v2 web-gloss packs were created to eliminate. Observed live:
"therefore" took 97 Range requests and 3,989 ms; "sycophant" took 69 and
3,242 ms.

### Local mode (OPFS)

The same reverse-gloss query runs against on-disk packs. **Timing**:
< 10 ms — the cross-pack JOIN is fast when both files are on local storage.

## Result rendering

Once the SQL queries return a list of JMdict sequence numbers (or
`entry_id` values in local mode), results are rendered:

- **Remote mode**: `fetchEntrySummaryFromGitender()` fetches pre-rendered
  JSON from the gitender CDN for each sequence number. These are small
  (< 1 KB each), fetched in parallel via `Promise.all`. If a gitender fetch
  fails (e.g. release gap), `assembleEntryBySeq()` falls back to assembling
  the entry from SQL — one `assembleEntry()` call per entry.

- **Local mode**: `assembleEntry()` runs for each `entry_id`, building the
  full `EntrySummary` structure from the schema-v2 tables (forms, furigana,
  sense groups, glosses, tags). This is ~15–30 SQL queries per entry but
  all on local storage, so it is fast.

## HTTP request budget by scenario

Measured on the live deployment against a warm VFS page cache. Cold-cache
numbers are higher (add ~5–10 requests for schema/index initialisation).

### Japanese input (kanji/kana/romaji) — forward only

| Mode | Forward search | Rendering | Total requests | Typical time |
|---|---|---|---|---|
| Remote (web-search pack) | 3–15 | gitender: 0–12 | **3–27** | **150–800 ms** |
| Remote (core fallback) | 10–40 | gitender: 0–12 | **10–52** | **400–2000 ms** |
| Local (OPFS) | 0 | 0 | **0** | **< 5 ms** |

### Latin-script input — forward + reverse gloss

| Mode | Forward | Gloss tier | Rendering | Total requests | Typical time |
|---|---|---|---|---|---|
| Remote (v2 web-gloss, covering hit) | 2–5 | 1 | gitender: 0–12 | **3–18** | **100–400 ms** |
| Remote (v2 web-gloss, FTS fallback) | 2–5 | 5–30 | gitender: 0–12 | **7–47** | **200–1000 ms** |
| Remote (v1 web-gloss, cross-pack) | 2–5 | 30–100+ | gitender: 0–12 | **32–117** | **1500–5000 ms** |
| Local (OPFS) | 0 | 0 | 0 | **0** | **< 15 ms** |

### Rendering requests (remote mode only)

Each gitender fetch (`fetchEntrySummaryFromGitender`) is a single HTTP
request returning a pre-rendered JSON blob for one JMdict entry. These are
not SQLite Range requests — they are regular `fetch()` calls to the
gitender CDN, issued in parallel via `Promise.all`. An entry that is
missing from gitender falls back to an SQL assembly path (~15–30 local
queries in local mode, or ~15–30 additional HTTP Range requests in remote
mode), but this is rare in practice.

## Cache layers

Three independent caches affect search performance:

| Cache | Location | Scope | Typical hit rate |
|---|---|---|---|
| `searchResultCache` (worker) | In-memory Map, max 32 entries | Exact `(lang, scope, limit, term)` | High for backspacing / re-querying |
| HTTP VFS page cache (worker) | In-memory LRU, 16 MB default | SQLite pages by `(URL, page#)` | High for schema/hot index pages, low for random core-pack access |
| Persistent search cache (main) | IndexedDB via `DictionaryStore` | Exact `(version, lang, limit, term)` | Hit on page reload for recent searches |

The persistent cache (`getCachedSearch` / `saveCachedSearch`) stores
complete `EntrySummary[]` results in IndexedDB keyed by release version,
language, limit, and term. On page reload, a previously-searched term
returns instantly without touching the worker at all.

## Deployed pack sizes (English, remote mode)

| Pack | Size | Purpose |
|---|---|---|
| `sumatora_web_search.db` | 24 MB | Forward FTS + prefix covering table |
| `sumatora_web_gloss_eng.db` (v2) | 41 MB | Gloss covering tables + full FTS5 fallback |
| `sumatora_core.db` | 240 MB | Full entry data (NOT downloaded — queried via HTTP Range) |
| `sumatora_gloss_eng.db` | 53 MB | Full gloss data (NOT downloaded — queried via HTTP Range) |

The web-search and web-gloss packs together are 65 MB. These are the only
packs that receive frequent random access during search. The core and gloss
packs are large but accessed only when a term misses all acceleration
structures — in v2, the gloss pack is never touched for search at all, and
the core pack is touched only for the rare gitender-fallback entry assembly
path.

## Key source files

| File | Role |
|---|---|
| `src/hooks/useSearch.ts` | Debounce, two-phase dispatch, persistent cache |
| `src/db/DbService.ts` | Worker lifecycle, search queue, worker restart on new input |
| `src/db/sqlite.worker.ts` | All SQL query logic, pack attachment, VFS setup |
| `src/db/httpVfs.ts` | Custom synchronous HTTP Range Request VFS |
| `src/db/gitender.ts` | Fetch pre-rendered JSON entries from gitender CDN |
| `src/db/types.ts` | TypeScript types for messages, packs, results |
