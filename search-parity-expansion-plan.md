# Search Parity Expansion Plan

## Current status

The PWA now orders its existing forward and gloss search results using the
same tier, rank, and deterministic tie-break rules as the Android app.

- PWA commit: `5ec24d9` (`Match search result ordering with the Android app`)
- Production: <https://dictionary.sumatora.workers.dev>
- Cloudflare version: `dae766b0-3030-436c-981a-e185546f41a4`
- SumatoraIndex compact-index commits:
  - `7491a21` (`Match web search ordering with the Android app`)
  - `e3d3bd0` (`Refresh the v18 compact web search index`)

The v18 compact web index includes the Android ordering keys, and the release
workflow validates those keys against the source database.

The remaining Android search categories are substring matches, deinflection,
and proper names.

## Target ordering

The completed implementation must merge and deduplicate results in Android's
order:

1. Exact priority writing
2. Exact priority kana
3. Exact non-priority writing
4. Exact non-priority kana
5. Prefix priority writing
6. Prefix priority kana
7. Prefix non-priority writing
8. Prefix non-priority kana
9. Substring priority writing
10. Substring priority kana
11. Substring non-priority writing
12. Substring non-priority kana
13. Exact gloss
14. Prefix gloss
15. Deinflection
16. Exact proper name
17. Prefix proper name

Within word tiers, results are ranked by `Entry.score DESC, entry_id`.
Gloss results are ranked by the first matching sense and then `entry_id`.
An entry found in an earlier tier must not reappear in a later tier.

## Result model

Extend the PWA search-result model with optional match metadata:

- `matchKind`: `exact`, `prefix`, `substring`, `gloss`, `deinflection`, or
  `name`
- `dictionaryForm`: the generated base form for a deinflection match
- `deinflectionLabel`: the Android-compatible rule label
- matched form or form ID where needed to render the appropriate headword
- an explicit name-entry marker

Ordinary entries should remain compatible with cached bookmarks and existing
rendering. Deinflection metadata should be displayed on both the result card
and detail view, matching Android.

## Substring search

Do not add the full suffix index to the initial online search path. The
published suffix pack is large, and accessing it for every query would
compromise first-result performance.

Instead:

1. Create a separate, range-request-friendly web substring pack in
   SumatoraIndex.
2. Store direct sequence mappings and the same ordering keys used by the
   compact forward index.
3. Attach or query it lazily only when exact and prefix tiers leave room in
   the requested result page.
4. Keep local installed-dictionary searches against the existing
   `SearchSuffix` data.
5. Append the four substring tiers before gloss refinement.

This preserves the current fast first-result path while allowing complete
refinement in the background.

## Deinflection

Port Android's client-side deinflector from `Deinflector.kt` to TypeScript,
with shared fixture data to prevent rule drift.

The implementation should:

1. Normalize the input to hiragana as Android does.
2. Generate candidate dictionary forms with rule codes and labels.
3. Search writing and kana forms for each candidate.
4. Verify every candidate against the matched form's `FormRule`; generated
   guesses must never be accepted without this check.
5. Deduplicate against all earlier tiers.
6. Rank accepted results as Android tier 16 using
   `Entry.score DESC, entry_id`.
7. Carry the dictionary form and label into rendering.

For online mode, extend the compact index with `form_id` and add a compact
form-rule mapping. This avoids range queries against the full core database.
The additional data should be measured before release and split into a lazy
pack if it materially increases initial index transfer cost.

## Proper names

Do not remotely query the current full names pack, which is hundreds of
megabytes.

Add two purpose-built artifacts:

1. A compact JMnedict search index containing exact/prefix search terms,
   ordering keys, and a stable name-entry key.
2. Lightweight pre-rendered name summaries, either as sharded static JSON or
   compact records suitable for direct lookup.

Name summaries must include:

- primary writing and reading
- furigana where available
- name-type tags
- translations

Run exact and prefix proper-name searches only after word, gloss, and
deinflection tiers. Load name rendering data only for results that will
actually be displayed.

## Performance requirements

Preserve the current progressive search behavior:

- Show exact/prefix word results first.
- Run substring, gloss, deinflection, and name work as refinement.
- Do not query a later tier after the requested page is full.
- Keep every SQL query bounded by the remaining result count.
- Retain memory and IndexedDB result caches, keyed by dictionary release and
  search limit.
- Keep remote rendering limited to displayed entries.

Record cold- and warm-cache measurements for:

- time to first results
- total refinement time
- HTTP request count
- transferred bytes
- SQLite pages fetched
- compact-pack sizes

The feature should not ship if the initial exact/prefix path regresses
materially.

## Validation

Create shared cross-platform fixtures that compare the PWA with Android for:

- exact writing and kana queries
- romaji input
- prefix queries
- Japanese substring matches
- exact and prefix gloss matches
- backup-language gloss matches
- common verb and adjective conjugations
- invalid deinflection guesses
- exact and prefix proper names
- entries reachable through multiple tiers

For every fixture, compare:

- ordered sequence or stable entry IDs
- match kind
- selected display form
- dictionary form and deinflection label
- absence of duplicate entries

SumatoraIndex workflow validation should also assert the generated compact
records match source `SearchTerm`, `Entry`, `FormRule`, suffix, and JMnedict
data.

## Delivery sequence

1. Extend the PWA result model and rendering metadata.
2. Add shared ordering and deduplication helpers with fixture tests.
3. Implement local substring search.
4. Port and test deinflection locally.
5. Implement local proper-name search and rendering.
6. Add compact online substring, form-rule, and name artifacts in
   SumatoraIndex.
7. Add generation and workflow validation for every new artifact.
8. Implement lazy online refinement in the PWA.
9. Run parity and performance tests against real release data.
10. Publish a coordinated SumatoraIndex release.
11. Commit, deploy, and verify the PWA against that release.

