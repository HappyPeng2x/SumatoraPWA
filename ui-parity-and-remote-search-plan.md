# UI Parity & Remote-Search Plan

All five phases (A-E) shipped 2026-07-24, each verified end-to-end in a real
browser against the real v14 packs. Written up after auditing the gap
between this app and `~/StudioProjects/SumatoraDictionary`, and after
confirming a few infrastructure facts live against the real hosting.

**Order of work:** Phase A (schema v2 data layer + CORS proxy) → Phase B (rich
search list) → Phase C (entry detail) → Phase D (kanji detail) → Phase E
(search before local install).

## Motivation

The user asked for the PWA to reach UI parity with the Android app — richer
search-result rows, a full entry-detail view, kanji lookups — and for a way to
search before the (large) dictionaries are installed locally.

Investigating turned up a bigger gap than "missing frontend components": this
PWA's `src/db/sqlite.worker.ts` still queries a legacy flat schema
(`DictionaryEntry`/`DictionaryIndex`/`DictionaryTranslation`, space-separated
and JSON-blob fields). The Android app and `~/Code/SumatoraIndex` (the data
pipeline that builds every dictionary pack for every client) have already
moved to a richer **schema v2** — sense groups, cross-references, notes,
furigana segments, pitch accent, kanji details are all first-class tables now,
not something a client parses out of blobs. `SumatoraIndex/release-pipeline.md`
explicitly names `sumatora-pwa` as a planned consumer of this same release
feed. So real parity requires migrating the data layer first — Phase B/C/D
can't render data this app doesn't yet fetch.

## Decisions made

**Target schema: v2, as implemented in `sumatora_schema.py`/`split-sumatora-packs.py`**
(not just the `schema-v2.md` design doc — verified the two agree). Packs are
released weekly as GitHub Releases on `SumatoraIndex` (currently v14,
2026-07-22) with sha256 checksums in `dictionaries.xml`.

**Pre-install search: range-request lazy SQLite VFS (E2)**, not a new hosted
query backend. This project has no live backend anywhere today (Android,
desktop, and the PWA are all static-file releases + local SQLite); a
page-level lazy-loading VFS (e.g. `sql.js-httpvfs`) fetching only the SQLite
pages a query touches, via HTTP Range requests against a plain (uncompressed)
`.db` copy of each pack, preserves that model. Verified live: GitHub Release
assets are Azure Blob-backed and honor Range requests correctly (`HTTP/2 206`,
`accept-ranges: bytes`, exact byte-range returned on a real v14 asset).

**CORS: a thin stateless edge proxy**, not a mirror-to-a-second-bucket and not
"defer it." Verified live: GitHub Release asset responses carry **no
`Access-Control-Allow-Origin` header** anywhere in the redirect chain (checked
both a plain GET and an OPTIONS preflight), so a browser `fetch()` from the
PWA's real origin is CORS-blocked — this affects ordinary whole-file pack
downloads too, not just the Phase E VFS. `raw.githubusercontent.com` (small
repo files like `dictionaries.xml` itself) already sends
`access-control-allow-origin: *` and needs no proxy. Only the actual pack
bytes (release assets) need one. The proxy forwards GET/HEAD/Range requests to
the GitHub asset URL and adds CORS headers — no SQL awareness, no state,
effectively zero ongoing maintenance.

## Pack composition (from `split-sumatora-packs.py`, v14 real sizes)

| Pack | Tables kept | Size (gz) |
|---|---|---:|
| `sumatora_core.db` | `Entry`(`word`), `EntryForm`, `FormTag`, `FormFuriganaSegment`, `Tag`, `SenseGroup`, `SenseGroupTag`, `Sense`, `SenseNote`, `SenseLanguageSource`, `SenseAppliesToForm`, `SenseReference`, `FormRule`, `DeinflectionRule`, `SearchTerm`/`SearchTermFts` | 82M |
| `sumatora_gloss_{lang}.db` | minimal `Sense` (join stub) + `SenseGloss`(lang-filtered)/`GlossSearchFts` only — no `Entry`/`EntryForm` | 21M (eng) |
| `sumatora_kanji.db` | `Entry`(`kanji`), `EntryForm`, `KanjiEntry`, `KanjiReading`, `KanjiMeaning`, `SearchTerm`/`SearchTermFts` | 2.8M |
| `sumatora_pitch.db` | `Entry`/`EntryForm` (pitch-linked only), `PitchAccent`, `PitchPattern`, `FormPitch` | 15M |
| `sumatora_examples_{lang}.db` | `Example`(lang-filtered), `ExampleSegment`, `EntryExample` | 2.4M (eng) |
| `sumatora_names.db` (optional) | `Entry`(`name`), `EntryForm`, `NameTranslation`, `EntryTag`/`Tag`, `SearchTerm`/`SearchTermFts` | ~124M |
| `sumatora_search_suffix.db` (optional) | `SearchTerm` (word-only) + `SearchSuffix` | ~88M |

Minimum useful English install (`core` + `gloss_eng`) ≈ 293MB uncompressed /
103MB gz — this is the "heavy" the pre-install question is about.

Cross-pack joins use `entry_id`/`sense_id` directly when packs come from the
same release (the normal case — `split-sumatora-packs.py` copies from one
monolithic build). `Sense.entry_source_key`/`source_ord` and
`EntryExample.entry_source_key`/`sense_source_ord` exist as a stable fallback
join key for the edge case of mismatched pack versions (e.g. a user updates
`core` but not `gloss_eng` yet) — not needed for the first pass, worth
revisiting once per-pack independent updates are exposed in the UI.
Bookmarks should key off `Entry.source_key` (JMdict seq as text), matching the
Android app's own bookmark join and this app's existing `seq`-keyed model —
migration-friendly.

## Phases

**Phase A — data layer migration** (done)
`catalogue.ts` fetches the real `dictionaries.xml` from
`raw.githubusercontent.com` (no proxy needed) and rewrites each pack's
download URL through the CORS proxy; `downloader.ts` verifies sha256 after
decompression; `sqlite.worker.ts` attaches `sumatora_core.db` as main plus
`sumatora_gloss_{lang}.db` per installed language and rebuilds `search()`
around `SearchTerm`/`SearchTermFts` (forward) and `GlossSearchFts` (reverse).

**Phase B — rich search list** (done; parity with Android's `word_card.xml`)
`EntrySummary` (replacing the old flat `SearchResult`) carries the primary
form with `FormFuriganaSegment`-derived furigana (native `<ruby>`/`<rt>` via
`FuriganaText.tsx`), alternate writings/readings, and sense groups with
globally-numbered glosses. Tag chips are colored by `Tag.category`
(`tagColors.ts`) with labels resolved by the DB — `jmdictEntities.ts`'s static
map is gone. Bookmarks now store a frozen `EntrySummary` snapshot instead of
flat fields (IndexedDB bumped to v4; old bookmark rows are cleared on
upgrade — no released users yet, so no compat was promised across this
change). Per-kanji tap targets (for Phase D's kanji popup) are not wired up
yet — that's part of Phase C/D, not this pass.

**Phase C — entry detail view** (done, with two items deferred)
`EntryDetailSheet.tsx` is a full-screen overlay (bottom-sheet-style, as
planned) fetched by `seq` via a new `entryDetail` worker message. Ships: the
pivoted alternate-forms table (`schema-v2.md`'s exact recipe, correctly
omitted for trivial cases — including the one-writing-form-and-no-kanji edge
case found during testing, where a ∅-only table would've been pure noise),
per-sense `SenseNote`, `SenseReference` (xref/antonym with tap-to-jump via
pre-resolved `target_entry_id` → `source_key`, plus a `seq[]` navigation stack
in `App.tsx` for back/close), `SenseLanguageSource`, and the priority star.
Bookmarking from the sheet reuses the existing add/remove path via a new
`entrySummary` worker message (fetches the same `EntrySummary` shape a search
result uses, keyed by `seq`). Verified live: forms table, antonym round-trip
(アーバン ↔ ルーラル jump and back), and bookmark toggle all confirmed against
real data with zero console errors.

**Deferred, not done**: pitch-accent badges and per-sense/entry-level
examples — both require attaching `sumatora_pitch.db` /
`sumatora_examples_{lang}.db`, which aren't surfaced in the install UI yet
(`DictionaryManager.tsx` still only lists `core`/`gloss` packs). Also deferred:
`SenseAppliesToForm`-based "Restricted to: ..." labels on sense groups — needs
the matched `form_id` from search, which the current search→detail flow
doesn't thread through (detail is fetched by `seq` alone). Revisit these
either as a Phase C follow-up or folded into Phase D (which needs `pitch`/
optional-pack install UI anyway for its own reasons).

**Phase D — kanji detail popup** (done)
`sumatora_kanji.db` is now surfaced in `DictionaryManager.tsx` as an optional
add-on and attached (alias `"kanji"`) in `initDb` when installed. Every kanji
character in a headword (`FuriganaText.tsx`, in both the search list and the
entry detail sheet) is individually clickable — resolves to the first CJK
character in its segment, since segments are almost always one kanji each —
and opens `KanjiDetailPopup.tsx` (strokes/grade/JLPT/frequency/on/kun/nanori/
meanings via a new `kanjiInfo` worker message), layered above the entry
detail sheet. Before the pack is installed, tapping a kanji shows an install
nudge instead of an error. Also fixed a latent bug found along the way:
`DownloadProgress` was keyed by `lang`, and core/kanji/pitch/suffix/names all
share `lang: ''` — renamed the field to `key` and pass `filename` instead,
which is unique per pack.

Verified live: install nudge before the pack exists, real KANJIDIC2 data
(食: eat/food, ショク・ジキ, く.う・た.べる…, 9 strokes, Grade 2, N4, freq 328)
after installing, and correct popup layering above the full-screen detail
sheet — zero console errors throughout.

**Phase E — pre-install search** (done)

Ships across both repos:

- **`SumatoraIndex`** (`release-dictionaries.py`, uncommitted local edit —
  needs your review before commit/push): each pack now also gets published
  as an uncompressed copy (`<pack>.db` alongside the existing `<pack>.db.gz`),
  with `plain_uri`/`plain_sha256` added to the `dictionaries.xml` manifest.
  Verified by actually running the modified script against real pack data.
- **A vendored HTTP-Range VFS** (`src/db/httpVfs.ts`), adapted from
  `mmomtchev/sqlite-wasm-http`'s `installSyncHttpVfs` (ISC license, full
  notice retained in the file header). That library bundles its own copy of
  the official SQLite WASM build and only exposes this via its own
  worker-thread API; this port instead registers directly onto the `sqlite3`
  instance `sqlite.worker.ts` already initializes via
  `@sqlite.org/sqlite-wasm` (the same official distribution), so **no second
  WASM copy is needed** and a remote HTTP-attached pack can sit in the same
  db connection as local OPFS-attached ones — every existing query function
  (`assembleEntry`, `assembleEntryDetail`, `assembleKanjiInfo`, …) works
  against remote data completely unchanged.
- **Per-pack local-or-remote sourcing**: `catalogue.ts` parses `plain_uri`;
  `useDbInit.ts` decides independently per pack (core/gloss/backupGloss/
  kanji) whether to read it from local OPFS or fall back to the manifest's
  remote plain `.db`; `sqlite.worker.ts`'s `initDb` opens/attaches each pack
  accordingly (`PackSource` type). A pack switches from remote to local
  automatically the moment the user installs it — no special-casing needed
  in the UI beyond the `isRemote`-driven banner (below).
- **Online-mode indicator**: `SearchPage.tsx` shows "Searching online —
  install dictionaries in Settings for offline use" whenever any active pack
  (core or the active gloss language) is remote.
- **CORS proxy** (`cors-proxy/worker.js` + `wrangler.toml` + `README.md`, not
  deployed — no cloud credentials available, needs you to run
  `wrangler deploy` under your own account): a minimal stateless Cloudflare
  Worker forwarding `GET`/`HEAD`/`Range` to an allowlisted set of GitHub asset
  hosts and adding CORS headers. Its logic was fully validated locally (in
  Node, without deploying) against a real GitHub Release asset: correct
  `206`, correct `Range` forwarding, correct CORS headers, and correct 403
  rejection of a disallowed host.

**A real bug found and fixed during verification**: my first port of the VFS
crashed every open with `RuntimeError: null function`. Root cause was two
separate mistakes — (1) several IO-method stubs (`xLock`, `xUnlock`, `xSync`,
`xTruncate`, `xWrite`, `xDeviceCharacteristics`, `xFileControl`) were declared
with fewer parameters than the real C signature, and `installVfs` generates
each WASM function-table entry from the JS function's declared arity, so an
under-declared parameter list produces a `call_indirect` signature mismatch;
(2) `xOpen` never constructed the `sqlite3_file` struct at the file handle
and wired its `$pMethods` field to the io-methods vtable, so any later call
through that handle traps on a null vtable pointer. Both are exactly the kind
of thing that type-checks fine and only breaks at the WASM call boundary —
caught only by actually running it.

**Verified live, with a completely fresh IndexedDB/OPFS (zero packs
installed)**: the app skipped the "install the Core Index" gate entirely,
showed the online-mode banner, and a real search for 食べる returned
correct furigana/tags/glosses — identical output to the fully-local case —
by fetching only the SQLite pages actually touched (~150 requests, mostly
4KB page reads and a couple of 2-byte page-size probes) against a 238MB core
+ 65MB gloss_eng, over **99.8% less data than downloading either file**.
Then installing the core pack alone produced a correct mixed state (local
core + remote gloss, banner still showing); installing the gloss pack too
made the banner disappear and search continue seamlessly on the local path.

**Phase F — gitender-based remote rendering** (done)

Phase E's remote-search VFS still reconstructed each result via the same SQL
joins the local path uses (`assembleEntry`/`assembleEntryDetail`), just over
HTTP Range requests instead of OPFS — correct, but expensive: ~150 small page
reads to render *one* entry. `gitender` (a sibling repo `SumatoraIndex`
already publishes — pre-rendered per-entry JSON keyed by JMdict `seq`, split
into a language-neutral `entries/{shard}/{seq}.json` and a per-language
`translations/{lang}/{shard}/{seq}.json`) needs none of that: one ~1.5KB
static fetch per file, served by `raw.githubusercontent.com`, which already
sends `Access-Control-Allow-Origin: *` — no CORS proxy dependency for
rendering at all, unlike the pack bytes themselves.

`src/db/gitender.ts` fetches and assembles gitender's JSON into the exact
same `EntrySummary`/`EntryDetail` shapes the SQL path produces, so
`EntryCard`/`EntryDetailSheet` needed zero changes. `sqlite.worker.ts` now
tracks each pack's local/remote state (already tracked per-pack via
`PackSource`) and, only when **both** core and the active gloss pack are
remote, swaps rendering over to gitender for `search`/`entryDetail`/
`entrySummary` — the FTS match itself still has to touch the remote core
pack (gitender has no search index, only pre-rendered content), but that's
now the only thing that does. Falls back to the SQL path per-result if
gitender doesn't have a given seq yet (release gap) or a fetch times out
(8s cap, so a stalled connection can never hang search indefinitely).

Verified live, fresh IndexedDB/OPFS, zero packs installed: アーバン's antonym
round-trip (→ ルーラル) rendered correctly from gitender alone; 食べる's
furigana/tags/multiple sense groups matched the local-path output exactly.
A full 18-result search cost 86 total range-requests combined — previously
that was the cost of rendering *one* entry.

**Known gaps introduced by this phase** (remote-only; the local/SQL path is
unaffected and still matches Android exactly):

- **Forms-table badges are simplified.** gitender's `formsTable` cells carry
  only a `primary`/`common`/`rare` heuristic, not the real `FormTag`-derived
  tag codes (ateji, irregular-okurigana, irregular-kana-usage, etc.) the SQL
  path shows and Android also shows. `gitender.ts`'s `convertFormsTable` maps
  `rare` to the same amber-flagged cell real tag codes use and
  `primary`/`common` to the plain checkmark, so the table still reads
  sensibly, but a user searching before installing anything sees less detail
  in this one spot than after installing (or than Android always shows).
  Fixing this for real requires `sumatora-to-git.py` to also export the
  per-form `FormTag` rows — not done as part of this phase.
- **Mixed local/remote pack states stay on the unaffected SQL path, not
  gitender.** E.g. core installed but the gloss pack not yet (a real,
  already-supported Phase E state). gitender is keyed by `seq`/display
  `number`, while the SQL path's local half naturally keys by `sense_id` —
  bridging the two would need `Sense.display_number` lookups against
  whichever pack is local, which wasn't built. Rare in practice (a user
  installing packs independently in that specific order), fully functional
  today, just not optimized for data usage the way the fully-remote case now
  is. Revisit if usage data ever shows this combination is common.
- Pitch accent, examples, and `SenseAppliesToForm` restriction labels are in
  gitender's export already (see `SumatoraIndex/sumatora-to-git.py`) but
  still unconsumed here, same as the pre-existing SQL-path deferral from
  Phase C/D — no new gap, just not yet closed either way.

## Open questions (not blocking Phase A)

- Entry Detail as a modal/bottom-sheet overlay (closer to Android's UX) vs. a
  pushed route — default to bottom-sheet-style overlay, revisit once Phase B
  ships and it's visible in context.
- Whether bookmarks should store a frozen render snapshot (today's behavior)
  or re-key on `entry_id`/`source_key` and re-fetch live at render time.
- Deinflection (matching conjugated forms back to a dictionary form) isn't
  implemented client-side yet (only kana normalization exists in
  `romkan.ts`); schema v2's `FormRule`/`DeinflectionRule` tables are ready for
  it whenever it's tackled, but it's not required for parity on search/entry
  display and isn't part of this plan.
