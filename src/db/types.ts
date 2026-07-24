export type SqlValue = string | number | null
export type QueryRow = Record<string, SqlValue>

// schema-v2's Tag: category is one of pos/misc/field/dialect/form/name_type/source.
// label is pre-resolved by SumatoraIndex — clients don't maintain their own entity map.
export interface Tag {
  code: string
  category: string
  label: string
}

// One FormFuriganaSegment row. ruby is null for a plain (non-annotated) span,
// e.g. okurigana between kanji, or a kana-only form with no ruby at all.
export interface FuriganaSegment {
  base: string
  ruby: string | null
}

export interface FormSummary {
  text: string
  furigana: FuriganaSegment[] | null
}

export interface GlossItem {
  text: string
  displayNumber: number
}

// One SenseGroup: its combined pos/misc/field/dialect tags, and its numbered
// glosses (numbering is global across the entry, matching Android's ①②③).
export interface SenseGroupSummary {
  tags: Tag[]
  glosses: GlossItem[]
  usedBackupLang: boolean
}

// A fully assembled, renderable dictionary entry — used for both live search
// results and bookmarked entries (bookmarks store a frozen snapshot of this).
export interface EntrySummary {
  seq: number                        // Entry.source_key (JMdict seq) as a number
  primaryForm: FormSummary
  alternateWritings: FormSummary[]
  alternateReadings: string[]        // kana-only forms other than the primary reading
  senseGroups: SenseGroupSummary[]
  lang: string
}

export interface FormTierBadge {
  code: string
  label: string
}

// Pivoted alternate-forms table (schema-v2.md's recipe): columns are distinct
// writing forms, rows are readings that bridge to at least one of them, plus
// a separate kanaOnlyReadings bucket for readings with no kanji bridge (the
// "∅" column). null when the entry has one trivial writing/reading pair —
// clients should omit the table entirely in that case.
export interface FormsTable {
  writingColumns: string[]
  rows: { reading: string; cells: (FormTierBadge[] | null)[] }[]
  kanaOnlyReadings: string[]
}

export interface XrefItem {
  displayText: string
  targetSeq: number | null   // null when the reference didn't resolve to a known entry
}

export interface LanguageSourceItem {
  lang: string
  text: string | null
  isFull: boolean
  isWasei: boolean
}

export interface SenseDetail {
  glossText: string
  usedBackupLang: boolean
  notes: string[]
  xrefs: XrefItem[]
  antonyms: XrefItem[]
  languageSources: LanguageSourceItem[]
}

export interface SenseGroupDetail {
  tags: Tag[]
  senses: SenseDetail[]
}

// Full entry detail, fetched by seq on demand (not part of the search-list
// payload). Pitch accent and examples are deferred — they live in optional
// packs (sumatora_pitch.db / sumatora_examples_{lang}.db) not yet surfaced
// in the install UI; see ui-parity-and-remote-search-plan.md.
export interface EntryDetail {
  seq: number
  primaryForm: FormSummary
  isPriority: boolean
  formsTable: FormsTable | null
  senseGroups: SenseGroupDetail[]
}

// KANJIDIC2 detail for one character, from the optional sumatora_kanji.db
// pack. null fields mean KANJIDIC2 didn't have that data for this character.
// Meanings are always lang='eng' in the generator regardless of the
// installed gloss language (kanjidic2-to-sumatora-db.py hardcodes this).
export interface KanjiInfo {
  character: string
  strokes: number | null
  grade: number | null
  jlpt: number | null
  frequency: number | null
  onReadings: string[]
  kunReadings: string[]
  nanoriReadings: string[]
  meanings: string[]
}

// Messages sent from main thread to the SQLite worker
export type ToWorker =
  | { id: string; type: 'ping' }
  | { id: string; type: 'hasFile'; payload: { filename: string } }
  | { id: string; type: 'writeFile'; payload: { filename: string; data: ArrayBuffer } }
  | { id: string; type: 'deleteFile'; payload: { filename: string } }
  | { id: string; type: 'open'; payload: { filename: string } }
  | { id: string; type: 'attach'; payload: { alias: string; filename: string } }
  | { id: string; type: 'detach'; payload: { alias: string } }
  | { id: string; type: 'query'; payload: { sql: string; params?: SqlValue[] } }
  | { id: string; type: 'close' }
  | { id: string; type: 'initDb'; payload: {
      lang: string
      backupLang?: string
      core: PackSource
      gloss: PackSource
      backupGloss?: PackSource
      kanji?: PackSource
    } }
  | { id: string; type: 'search'; payload: { term: string; limit?: number } }
  | { id: string; type: 'entryDetail'; payload: { seq: number } }
  | { id: string; type: 'entrySummary'; payload: { seq: number } }
  | { id: string; type: 'kanjiInfo'; payload: { character: string } }

// Messages sent from worker back to main thread
export type FromWorker =
  | { id: string; ok: true; result: unknown }
  | { id: string; ok: false; error: string }

// Matches SumatoraIndex's schema-v2 release pack types (split-sumatora-packs.py).
// 'core' is the required language-neutral index; 'gloss' is a per-language
// translation pack. kanji/pitch/tatoeba/names/suffix are optional add-ons not
// yet surfaced in the install UI (Phase C/D).
export type PackType = 'core' | 'gloss' | 'kanji' | 'pitch' | 'tatoeba' | 'names' | 'suffix'

export interface DictMeta {
  type: PackType
  lang: string               // '' for core/kanji/pitch/suffix/names; e.g. 'eng' for gloss/tatoeba
  description: string
  uri: string                // gzip release asset URL (possibly rewritten through a CORS proxy)
  plainUri: string | null    // uncompressed release asset URL, for remote HTTP-Range queries ahead of local install (Phase E); null on manifests published before that pipeline change
  filename: string           // local OPFS filename, e.g. 'sumatora_core.db'
  sha256: string
  version: number
  date: number
}

// Where to read one pack from: a local OPFS file, or (Phase E) a remote
// plain .db URL queried live over HTTP Range requests via the "http" VFS.
export type PackSource =
  | { local: true; filename: string }
  | { local: false; url: string }

export interface InstalledDict extends DictMeta {
  installedAt: number        // Date.now()
}

// A bookmark stores a frozen snapshot of the entry as it looked when saved
// (same semantics as the pre-Phase-B flat schema, just a richer payload) —
// not a live entry_id reference, so it keeps working even if the backing
// dictionary pack is later removed or updated.
export interface Bookmark {
  seq: number
  addedAt: number
  tags: string[]
  entry: EntrySummary
}

export interface DownloadProgress {
  key: string                // meta.filename — unique per pack, unlike lang (core/kanji/pitch/suffix/names all share lang='')
  phase: 'downloading' | 'decompressing' | 'writing' | 'done' | 'error'
  downloadedBytes: number
  totalBytes: number         // -1 if unknown
  error?: string
}
