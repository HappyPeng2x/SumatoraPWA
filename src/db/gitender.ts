// Fetches pre-rendered entry JSON from the `gitender` repo (see
// SumatoraIndex/sumatora-to-git.py) and assembles it into the exact same
// EntrySummary/EntryDetail shapes the SQL-based assembleEntry/assembleEntryDetail
// produce in sqlite.worker.ts — so downstream components (EntryCard,
// EntryDetailSheet) need zero changes regardless of which path built the data.
//
// Used only when a pack is remote (Phase E, pre-install search): rendering a
// result from one ~1.5KB static JSON fetch (served by raw.githubusercontent.com,
// which already sends Access-Control-Allow-Origin: * — no CORS proxy needed)
// is drastically cheaper than reconstructing the same entry via dozens of
// SQLite page reads over HTTP Range requests against the remote core pack.
// Forward matching now uses SumatoraIndex's compact web-search pack when the
// current release provides it; old manifests fall back to the remote core.
// Gitender itself has no search index, only pre-rendered content by seq.
import type {
  EntryDetail, EntrySummary, FormSummary, FormsTable, FuriganaSegment, GlossItem,
  LanguageSourceItem, SenseDetail, SenseGroupDetail, SenseGroupSummary, Tag, XrefItem,
} from './types'

const GITENDER_BASE = 'https://raw.githubusercontent.com/HappyPeng2x/gitender/main'
// Must match SHARD_SIZE in SumatoraIndex/sumatora-to-git.py.
const SHARD_SIZE = 10000

interface GitenderForm {
  text: string
  type: 'writing' | 'reading'
  reading: string | null
  isPrimary: boolean
  isCommon: boolean
  furigana?: FuriganaSegment[]
  // pitch accent is exported but not yet consumed here — see
  // ui-parity-and-remote-search-plan.md's pitch-accent deferral, matching
  // the existing SQL-based assembleEntry/assembleEntryDetail scope.
}

interface GitenderXref {
  text: string
  targetSeq?: number
  targetSenseNumber?: number
}

interface GitenderSense {
  number: number
  senseId: number
  notes?: string[]
  xrefs?: GitenderXref[]
  antonyms?: GitenderXref[]
  languageSources?: LanguageSourceItem[]
  // appliesToForms/example are exported but not yet consumed — same
  // deferral as the SQL path (SenseDetail has no field for either yet).
}

interface GitenderSenseGroup {
  tags: Tag[]
  senses: GitenderSense[]
}

interface GitenderFormsTable {
  columns: string[]
  rows: string[]
  cells: Record<string, Record<string, 'primary' | 'common' | 'rare' | null>>
  nokanji: string[]
}

interface GitenderEntry {
  seq: number
  entry_id: number
  forms: GitenderForm[]
  senseGroups: GitenderSenseGroup[]
  formsTable: GitenderFormsTable | null
}

interface GitenderTranslationSense {
  number: number
  glosses: string[]
}

interface GitenderTranslation {
  seq: number
  lang: string
  senses: GitenderTranslationSense[]
}

function shardOf(seq: number): number {
  return Math.floor(seq / SHARD_SIZE)
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    // A stalled/very slow connection must never hang search or entry-detail
    // forever -- bound the wait and let the caller fall back to the SQL
    // path (still available, since the remote core pack is already
    // attached) instead of leaving the UI stuck on "Searching…".
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    return await res.json() as T
  } catch {
    return null
  }
}

// Tiny in-memory caches: entries/translations are effectively immutable
// within a release, and a search-result render followed by opening its
// detail view (or vice versa) shouldn't re-fetch the same small JSON twice.
const entryCache = new Map<number, Promise<GitenderEntry | null>>()
const translationCache = new Map<string, Promise<GitenderTranslation | null>>()

function fetchGitenderEntry(seq: number): Promise<GitenderEntry | null> {
  let p = entryCache.get(seq)
  if (!p) {
    p = fetchJson<GitenderEntry>(`${GITENDER_BASE}/entries/${shardOf(seq)}/${seq}.json`)
    entryCache.set(seq, p)
  }
  return p
}

function fetchGitenderTranslation(seq: number, lang: string): Promise<GitenderTranslation | null> {
  const key = `${lang}:${seq}`
  let p = translationCache.get(key)
  if (!p) {
    p = fetchJson<GitenderTranslation>(`${GITENDER_BASE}/translations/${lang}/${shardOf(seq)}/${seq}.json`)
    translationCache.set(key, p)
  }
  return p
}

function primaryFormOf(forms: GitenderForm[]): GitenderForm | undefined {
  return forms.find((f) => f.isPrimary) ?? forms[0]
}

function toXrefItem(x: GitenderXref): XrefItem {
  return { displayText: x.text, targetSeq: x.targetSeq ?? null }
}

// gitender's formsTable badge is a simplified primary/common/rare heuristic,
// not the FormTag-derived tag codes (ateji, irregular-kana, ...) the SQL path
// shows — that per-form tag detail isn't in gitender's export yet. 'rare'
// maps to the same amber-flagged cell the SQL path uses for real tag flags;
// primary/common map to the plain checkmark (an ordinary, unflagged match).
function convertFormsTable(t: GitenderFormsTable | null): FormsTable | null {
  if (!t) return null
  // gitender's own "trivial table" check differs from buildFormsTable's (it
  // keeps a table when nokanji is non-empty even with zero writing columns,
  // e.g. a kana-only word like アーバン) -- reapply the SQL path's exact
  // omission rule here so local and remote modes agree on when to show
  // nothing rather than a one-row table that's pure noise.
  if (t.columns.length === 0) return null
  if (t.columns.length === 1 && t.nokanji.length === 0) return null
  const rows = t.rows.map((reading) => {
    const cellsForReading = t.cells[reading] ?? {}
    const cells = t.columns.map((col) => {
      const badge = cellsForReading[col]
      if (badge == null) return null
      if (badge === 'rare') return [{ code: 'rare', label: 'uncommon reading for this writing' }]
      return []
    })
    return { reading, cells }
  })
  return { writingColumns: t.columns, rows, kanaOnlyReadings: t.nokanji }
}

/** Fetches and assembles one EntrySummary straight from gitender — no DB query at all. */
export async function fetchEntrySummaryFromGitender(
  seq: number, lang: string, backupLang: string | null,
): Promise<EntrySummary | null> {
  const [entry, translation, backupTranslation] = await Promise.all([
    fetchGitenderEntry(seq),
    fetchGitenderTranslation(seq, lang),
    backupLang ? fetchGitenderTranslation(seq, backupLang) : Promise.resolve(null),
  ])
  if (!entry) return null
  return buildEntrySummary(entry, translation, backupTranslation, lang)
}

/** Fetches and assembles one EntryDetail straight from gitender — no DB query at all. */
export async function fetchEntryDetailFromGitender(
  seq: number, lang: string, backupLang: string | null,
): Promise<EntryDetail | null> {
  const [entry, translation, backupTranslation] = await Promise.all([
    fetchGitenderEntry(seq),
    fetchGitenderTranslation(seq, lang),
    backupLang ? fetchGitenderTranslation(seq, backupLang) : Promise.resolve(null),
  ])
  if (!entry) return null
  return buildEntryDetail(entry, translation, backupTranslation)
}

function buildEntrySummary(
  entry: GitenderEntry, translation: GitenderTranslation | null,
  backupTranslation: GitenderTranslation | null, lang: string,
): EntrySummary {
  const forms = entry.forms
  const primary = primaryFormOf(forms)
  const primaryText = primary?.text ?? ''
  const primaryFurigana = primary?.furigana ?? null
  const primaryReadingText = primary?.reading
    ?? (primaryFurigana ? primaryFurigana.map((s) => s.ruby ?? s.base).join('') : primaryText)

  const writingTexts: string[] = []
  const readingTexts: string[] = []
  const furiganaForWriting = new Map<string, FuriganaSegment[] | null>()
  for (const f of forms) {
    if (f.type === 'writing') {
      if (!writingTexts.includes(f.text)) {
        writingTexts.push(f.text)
        furiganaForWriting.set(f.text, f.furigana ?? null)
      }
    } else if (!readingTexts.includes(f.text)) {
      readingTexts.push(f.text)
    }
  }

  const alternateWritings: FormSummary[] = writingTexts
    .filter((t) => t !== primaryText)
    .map((t) => ({ text: t, furigana: furiganaForWriting.get(t) ?? null }))
  const alternateReadings = readingTexts.filter((t) => t !== primaryReadingText && t !== primaryText)

  const glossesByNumber = new Map<number, string[]>()
  for (const s of translation?.senses ?? []) glossesByNumber.set(s.number, s.glosses)
  const backupGlossesByNumber = new Map<number, string[]>()
  for (const s of backupTranslation?.senses ?? []) backupGlossesByNumber.set(s.number, s.glosses)

  // Matches assembleSenseGroup's group-level (not per-sense) backup fallback:
  // retry the whole group under backupLang only if lang produced zero glosses
  // across every sense in the group.
  let glossCounter = 0
  const senseGroups: SenseGroupSummary[] = entry.senseGroups
    .map((g): SenseGroupSummary => {
      let glossTexts = collectGlossTexts(g, glossesByNumber)
      let usedBackupLang = false
      if (glossTexts.length === 0 && backupTranslation) {
        glossTexts = collectGlossTexts(g, backupGlossesByNumber)
        usedBackupLang = glossTexts.length > 0
      }
      const glosses: GlossItem[] = glossTexts.map((text) => ({ text, displayNumber: ++glossCounter }))
      return { tags: g.tags, glosses, usedBackupLang }
    })
    .filter((g) => g.glosses.length > 0)

  return {
    seq: entry.seq,
    primaryForm: { text: primaryText, furigana: primaryFurigana },
    alternateWritings,
    alternateReadings,
    senseGroups,
    lang,
  }
}

function collectGlossTexts(group: GitenderSenseGroup, glossesByNumber: Map<number, string[]>): string[] {
  const texts: string[] = []
  for (const s of group.senses) {
    const glosses = glossesByNumber.get(s.number)
    if (glosses && glosses.length > 0) texts.push(glosses.join('; '))
  }
  return texts
}

function buildEntryDetail(
  entry: GitenderEntry, translation: GitenderTranslation | null,
  backupTranslation: GitenderTranslation | null,
): EntryDetail {
  const forms = entry.forms
  const primary = primaryFormOf(forms)
  const primaryText = primary?.text ?? ''
  const primaryFurigana = primary?.furigana ?? null
  const isPriority = primary?.isCommon ?? false

  const glossesByNumber = new Map<number, string[]>()
  for (const s of translation?.senses ?? []) glossesByNumber.set(s.number, s.glosses)
  const backupGlossesByNumber = new Map<number, string[]>()
  for (const s of backupTranslation?.senses ?? []) backupGlossesByNumber.set(s.number, s.glosses)

  // Matches assembleSenseDetail's per-sense (not per-group) backup fallback.
  const senseGroups: SenseGroupDetail[] = entry.senseGroups
    .map((g): SenseGroupDetail => {
      const senses: SenseDetail[] = g.senses
        .map((s): SenseDetail => {
          let glosses = glossesByNumber.get(s.number) ?? []
          let usedBackupLang = false
          if (glosses.length === 0 && backupTranslation) {
            glosses = backupGlossesByNumber.get(s.number) ?? []
            usedBackupLang = glosses.length > 0
          }
          return {
            glossText: glosses.join('; '),
            usedBackupLang,
            notes: s.notes ?? [],
            xrefs: (s.xrefs ?? []).map(toXrefItem),
            antonyms: (s.antonyms ?? []).map(toXrefItem),
            languageSources: s.languageSources ?? [],
          }
        })
        .filter((s) => s.glossText.length > 0)
      return { tags: g.tags, senses }
    })
    .filter((g) => g.senses.length > 0)

  return {
    seq: entry.seq,
    primaryForm: { text: primaryText, furigana: primaryFurigana },
    isPriority,
    formsTable: convertFormsTable(entry.formsTable),
    senseGroups,
  }
}
