/// <reference lib="webworker" />
import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import type { Sqlite3Static } from '@sqlite.org/sqlite-wasm'
import type {
  ToWorker, FromWorker, SqlValue, QueryRow, EntrySummary, FormSummary, FuriganaSegment, Tag,
  SenseGroupSummary, GlossItem, EntryDetail, FormsTable, FormTierBadge, SenseGroupDetail,
  SenseDetail, XrefItem, LanguageSourceItem, KanjiInfo,
} from './types'
import { toKatakana, toHepburn } from './romkan'
import { installHttpVfs } from './httpVfs'
import { fetchEntryDetailFromGitender, fetchEntrySummaryFromGitender } from './gitender'
import type { PackSource } from './types'

type OO1 = Sqlite3Static['oo1']
type AnyDB = InstanceType<OO1['DB']>

let sqlite3: Sqlite3Static | null = null
let db: AnyDB | null = null
let currentLang: string | null = null
let currentBackupLang: string | null = null
let currentHasKanji = false
// Tracked per-pack (see PackSource) so rendering can prefer gitender's
// pre-rendered JSON over reconstructing an entry from dozens of SQLite page
// reads, but only once both the structure pack (core) and the active gloss
// pack are remote -- see useGitenderPath() and gitender.ts's header comment.
let currentCoreRemote = false
let currentGlossRemote = false
let currentBackupGlossRemote = false

// True only when both core and the active gloss language are served
// remotely (Phase E, nothing installed yet). Mixed local/remote combinations
// (e.g. core installed but gloss pack not yet) keep using the existing SQL
// path unchanged -- rare in practice, and already fully functional, just not
// optimized for data usage the way the fully-remote case now is.
function useGitenderPath(): boolean {
  return currentCoreRemote && currentGlossRemote
}

// sqlite3InitModule's published type says no args, but the Emscripten module
// accepts a Module overrides object. Cast to accept the locateFile option.
const initFn = sqlite3InitModule as (opts: Record<string, unknown>) => Promise<Sqlite3Static>

const ready = initFn({
  locateFile: (file: string) => `/${file}`,
  print: (s: string) => console.log('[sqlite]', s),
  printErr: (s: string) => console.error('[sqlite]', s),
}).then((s) => {
  sqlite3 = s
  // Registers the "http" VFS (Phase E) so a pack not installed locally can be
  // queried directly over HTTP Range requests instead — see httpVfs.ts.
  installHttpVfs(s)
})

// Appends ?vfs=http (or &vfs=http if the URL already has a query string —
// e.g. once routed through the CORS proxy's ?url=... param) for use in a raw
// ATTACH DATABASE string, which unlike the oo1.DB constructor has no separate
// `vfs` option and must encode it into the filename URI itself.
function httpAttachUri(url: string): string {
  const sep = url.includes('?') ? '&' : '?'
  return `file:${encodeURI(url)}${sep}vfs=http`
}

// Opens one PackSource as the MAIN schema: local OPFS, local POSIX-fallback
// (bytes already written to Emscripten's FS by the caller), or Phase E's
// remote http VFS.
async function openMain(source: PackSource, hasOpfs: boolean): Promise<AnyDB> {
  if (!source.local) {
    return new sqlite3!.oo1.DB({ filename: `file:${encodeURI(source.url)}`, flags: 'r', vfs: 'http' })
  }
  if (hasOpfs) {
    return new sqlite3!.oo1.OpfsDb(`/${source.filename}`, 'r')
  }
  const root = await navigator.storage.getDirectory()
  const bytes = new Uint8Array(await (await (await root.getFileHandle(source.filename)).getFile()).arrayBuffer())
  type CapiExt = { sqlite3_js_posix_create_file(filename: string, data: Uint8Array): void }
  const capiExt = sqlite3!.capi as unknown as CapiExt
  capiExt.sqlite3_js_posix_create_file(`/${source.filename}`, bytes)
  // Open read-write so SQLite can create WAL sidecar files in Emscripten FS
  // (sidecar files are in-memory only — the original OPFS copy is never modified)
  return new sqlite3!.oo1.DB({ filename: `/${source.filename}`, flags: 'rw', vfs: 'unix' })
}

// ATTACHes one PackSource under `alias`, same three cases as openMain.
async function attachSource(db: AnyDB, alias: string, source: PackSource, hasOpfs: boolean): Promise<void> {
  if (!source.local) {
    db.exec(`ATTACH DATABASE '${httpAttachUri(source.url)}' AS "${alias}"`)
    return
  }
  if (hasOpfs) {
    db.exec(`ATTACH DATABASE 'file:/${source.filename}?vfs=opfs&mode=ro' AS "${alias}"`)
    return
  }
  const root = await navigator.storage.getDirectory()
  const bytes = new Uint8Array(await (await (await root.getFileHandle(source.filename)).getFile()).arrayBuffer())
  type CapiExt = { sqlite3_js_posix_create_file(filename: string, data: Uint8Array): void }
  const capiExt = sqlite3!.capi as unknown as CapiExt
  capiExt.sqlite3_js_posix_create_file(`/${source.filename}`, bytes)
  db.exec(`ATTACH DATABASE '/${source.filename}' AS "${alias}"`)
}

self.onmessage = async (e: MessageEvent<ToWorker>) => {
  const msg = e.data
  try {
    await ready
    const result = await dispatch(msg)
    self.postMessage({ id: msg.id, ok: true, result } satisfies FromWorker)
  } catch (err) {
    console.error(`[sqlite] ${msg.type} failed:`, err)
    self.postMessage({ id: msg.id, ok: false, error: String(err) } satisfies FromWorker)
  }
}

async function dispatch(msg: ToWorker): Promise<unknown> {
  switch (msg.type) {
    case 'ping':
      return { vfsList: sqlite3!.capi.sqlite3_js_vfs_list() }

    case 'hasFile': {
      const root = await navigator.storage.getDirectory()
      try {
        await root.getFileHandle(msg.payload.filename)
        return true
      } catch {
        return false
      }
    }

    case 'writeFile': {
      const { filename, data } = msg.payload
      const root = await navigator.storage.getDirectory()
      const fh = await root.getFileHandle(filename, { create: true })
      const writable = await fh.createWritable()
      await writable.write(data)
      await writable.close()
      return { filename, bytes: data.byteLength }
    }

    case 'deleteFile': {
      const root = await navigator.storage.getDirectory()
      await root.removeEntry(msg.payload.filename)
      return true
    }

    case 'open': {
      db?.close()
      db = null
      const { filename } = msg.payload
      const hasOpfs = sqlite3!.capi.sqlite3_vfs_find('opfs')
      if (hasOpfs) {
        // OPFS VFS: opens directly from disk — no full load into memory
        db = new sqlite3!.oo1.OpfsDb(`/${filename}`, 'r')
      } else {
        // Fallback: expose bytes via unix VFS
        const root = await navigator.storage.getDirectory()
        const fh = await root.getFileHandle(filename)
        const file = await fh.getFile()
        const buf = new Uint8Array(await file.arrayBuffer())
        sqlite3!.capi.sqlite3_js_vfs_create_file('unix', `/${filename}`, buf)
        db = new sqlite3!.oo1.DB({ filename: `/${filename}`, flags: 'r' })
      }
      return { filename }
    }

    case 'attach': {
      const { alias, filename } = msg.payload
      const hasOpfs = sqlite3!.capi.sqlite3_vfs_find('opfs')
      if (hasOpfs) {
        db!.exec(`ATTACH DATABASE 'file:/${filename}?vfs=opfs&mode=ro' AS "${alias}"`)
      } else {
        // In-memory fallback: deserialize bytes into attached schema
        const root = await navigator.storage.getDirectory()
        const bytes = new Uint8Array(await (await (await root.getFileHandle(filename)).getFile()).arrayBuffer())
        type WasmApi = { allocFromTypedArray(ta: Uint8Array): number }
        type CapiApi = { sqlite3_deserialize(db: number, schema: string, data: number, szDb: number, szBuf: number, flags: number): number }
        const wasm = sqlite3!.wasm as unknown as WasmApi
        const capi = sqlite3!.capi as unknown as CapiApi
        db!.exec(`ATTACH DATABASE ':memory:' AS "${alias}"`)
        const ptr = wasm.allocFromTypedArray(bytes)
        capi.sqlite3_deserialize((db as unknown as { pointer: number }).pointer, alias, ptr, bytes.length, bytes.length, 0x0001)
      }
      return { alias, filename }
    }

    case 'detach':
      db!.exec(`DETACH DATABASE "${msg.payload.alias}"`)
      return true

    case 'query': {
      if (!db) throw new Error('No database open.')
      const { sql, params } = msg.payload
      const rows: QueryRow[] = []
      db.exec({
        sql,
        bind: (params ?? []) as SqlValue[],
        rowMode: 'object',
        // The type definition is narrower than the runtime behaviour;
        // cast the row to QueryRow which is what rowMode:'object' actually gives us.
        callback: (row: unknown) => { rows.push(row as QueryRow) },
      })
      return rows
    }

    case 'close':
      db?.close()
      db = null
      currentLang = null
      return true

    case 'initDb': {
      db?.close()
      db = null
      currentLang = null
      currentBackupLang = null
      currentHasKanji = false
      currentCoreRemote = false
      currentGlossRemote = false
      currentBackupGlossRemote = false
      const { lang, backupLang, core, gloss, backupGloss, kanji } = msg.payload
      currentCoreRemote = !core.local
      currentGlossRemote = !gloss.local
      currentBackupGlossRemote = backupGloss ? !backupGloss.local : false

      // main.Entry / main.EntryForm / main.Sense / main.SearchTerm are the
      // language-neutral index (core); "{lang}".SenseGloss is translations;
      // "kanji".KanjiEntry/KanjiReading/KanjiMeaning is kanji lookups. Each
      // pack independently comes from local OPFS or (Phase E) a remote plain
      // .db queried live over HTTP Range requests — see PackSource.
      const hasOpfs = sqlite3!.capi.sqlite3_vfs_find('opfs')

      if (hasOpfs) {
        try {
          db = await openMain(core, true)
          await attachSource(db, lang, gloss, true)
          if (backupGloss) {
            try {
              await attachSource(db, backupLang!, backupGloss, true)
              currentBackupLang = backupLang!
            } catch { /* backup not available — silently skip */ }
          }
          if (kanji) {
            try {
              await attachSource(db, 'kanji', kanji, true)
              currentHasKanji = true
            } catch { /* kanji pack not available — silently skip */ }
          }
        } catch (e) {
          // OPFS VFS registered but local file I/O failed — fall through to POSIX
          console.warn('[sqlite] OPFS-path initDb failed, falling back to POSIX/http:', e)
          db?.close()
          db = null
          currentBackupLang = null
          currentHasKanji = false
        }
      }

      if (!db) {
        db = await openMain(core, false)
        await attachSource(db, lang, gloss, false)
        if (backupGloss) {
          try {
            await attachSource(db, backupLang!, backupGloss, false)
            currentBackupLang = backupLang!
          } catch { /* backup not available — silently skip */ }
        }
        if (kanji) {
          try {
            await attachSource(db, 'kanji', kanji, false)
            currentHasKanji = true
          } catch { /* kanji pack not available — silently skip */ }
        }
      }

      currentLang = lang
      return { lang, backupLang: currentBackupLang }
    }

    case 'search': {
      if (!db || !currentLang) throw new Error('DB not initialized. Call initDb first.')
      const { term, limit = 30 } = msg.payload
      const t = term.trim()
      if (!t) return []
      const kata = toKatakana(toHepburn(t))

      // Ordered, deduped list of matched entry_id, built up tier by tier
      // (exact writing/kana, then prefix, then reverse gloss search) —
      // mirrors the old flat-schema search's tiering, now against
      // schema-v2's SearchTerm/SearchTermFts (forward) and
      // GlossSearchFts/SenseGloss (reverse).
      const seen = new Set<number>()
      const order: number[] = []

      forwardStep(db, matchToken(t, false), seen, order, limit)
      forwardStep(db, matchToken(kata, false), seen, order, limit)
      forwardStep(db, matchToken(t, true), seen, order, limit)
      forwardStep(db, matchToken(kata, true), seen, order, limit)

      glossStep(db, currentLang, matchToken(t, false), seen, order, limit)
      glossStep(db, currentLang, matchToken(t, true), seen, order, limit)
      if (currentBackupLang && order.length < limit) {
        glossStep(db, currentBackupLang, matchToken(t, false), seen, order, limit)
        glossStep(db, currentBackupLang, matchToken(t, true), seen, order, limit)
      }

      const limited = order.slice(0, limit)

      // Fully-remote case (Phase E, nothing installed): the FTS match above
      // still has to touch the remote core pack, but rendering no longer
      // does -- swap dozens of small page-read requests per result for one
      // tiny pre-rendered JSON fetch per result instead.
      if (useGitenderPath()) {
        const seqs = seqsForEntryIds(db, limited)
        const backupLang = currentBackupGlossRemote ? currentBackupLang : null
        const results = await Promise.all(
          seqs.map((seq) => fetchEntrySummaryFromGitender(seq, currentLang!, backupLang)),
        )
        // gitender doesn't have this seq yet (e.g. a release gap), or its
        // fetch timed out -- fall back to SQL assembly for that one result
        // rather than dropping it.
        return results.map((r, i) => r ?? assembleEntry(db!, limited[i], currentLang!, currentBackupLang))
      }

      return limited.map((entryId) => assembleEntry(db!, entryId, currentLang!, currentBackupLang))
    }

    case 'entryDetail': {
      if (!db || !currentLang) throw new Error('DB not initialized. Call initDb first.')
      if (useGitenderPath()) {
        const backupLang = currentBackupGlossRemote ? currentBackupLang : null
        const detail = await fetchEntryDetailFromGitender(msg.payload.seq, currentLang, backupLang)
        if (detail) return detail
      }
      const [row] = queryRows(db, `SELECT entry_id FROM main.Entry WHERE source_key = ?`, [String(msg.payload.seq)])
      if (!row) throw new Error(`Entry not found: ${msg.payload.seq}`)
      return assembleEntryDetail(db, row['entry_id'] as number, msg.payload.seq, currentLang, currentBackupLang)
    }

    case 'entrySummary': {
      if (!db || !currentLang) throw new Error('DB not initialized. Call initDb first.')
      if (useGitenderPath()) {
        const backupLang = currentBackupGlossRemote ? currentBackupLang : null
        const summary = await fetchEntrySummaryFromGitender(msg.payload.seq, currentLang, backupLang)
        if (summary) return summary
      }
      const [row] = queryRows(db, `SELECT entry_id FROM main.Entry WHERE source_key = ?`, [String(msg.payload.seq)])
      if (!row) throw new Error(`Entry not found: ${msg.payload.seq}`)
      return assembleEntry(db, row['entry_id'] as number, currentLang, currentBackupLang)
    }

    case 'kanjiInfo': {
      if (!db) throw new Error('DB not initialized. Call initDb first.')
      if (!currentHasKanji) return null
      return assembleKanjiInfo(db, msg.payload.character)
    }
  }
}

function queryRows(db: AnyDB, sql: string, params: SqlValue[]): QueryRow[] {
  const rows: QueryRow[] = []
  db.exec({
    sql,
    bind: params as SqlValue[],
    rowMode: 'object',
    callback: (row: unknown) => { rows.push(row as QueryRow) },
  })
  return rows
}

// Batch-resolves entry_id -> Entry.source_key (the JMdict seq gitender
// addresses files by), preserving the input order. One cheap primary-key
// lookup instead of the many joined queries assembleEntry would otherwise
// need per result.
function seqsForEntryIds(db: AnyDB, entryIds: number[]): number[] {
  if (entryIds.length === 0) return []
  const placeholders = entryIds.map(() => '?').join(',')
  const rows = queryRows(
    db, `SELECT entry_id, source_key FROM main.Entry WHERE entry_id IN (${placeholders})`, entryIds,
  )
  const bySeqId = new Map<number, number>()
  for (const r of rows) bySeqId.set(r['entry_id'] as number, Number(r['source_key']))
  return entryIds.map((id) => bySeqId.get(id)!)
}

// Wraps a term as an FTS5 quoted-phrase token (safe against special
// characters), optionally as a prefix query ("foo"*).
function matchToken(term: string, prefix: boolean): string {
  const escaped = term.replace(/"/g, '""')
  return prefix ? `"${escaped}"*` : `"${escaped}"`
}

// Forward (writing/kana/romaji) search over core.SearchTerm/SearchTermFts.
function forwardStep(
  db: AnyDB, matchTerm: string,
  seen: Set<number>, order: number[], limit: number,
) {
  if (order.length >= limit) return
  try {
    const sql = `
      SELECT st.entry_id AS entry_id, MAX(st.priority) AS priority, MAX(st.score) AS score
      FROM main.SearchTerm st
      WHERE st.script IN ('writing', 'kana', 'romaji')
        AND st.search_id IN (
          SELECT rowid FROM main.SearchTermFts WHERE normalized MATCH ?
        )
      GROUP BY st.entry_id
      ORDER BY priority DESC, score DESC
      LIMIT ?`
    const rows = queryRows(db, sql, [matchTerm, limit - order.length])
    for (const row of rows) {
      const id = row['entry_id'] as number
      if (!seen.has(id)) { seen.add(id); order.push(id) }
    }
  } catch { /* skip on FTS error or no match */ }
}

// Reverse (translation) search: {lang}.GlossSearchFts -> {lang}.SenseGloss
// -> main.Sense (by sense_id, valid when the gloss pack is from the same
// SumatoraIndex release as core — see ui-parity-and-remote-search-plan.md).
function glossStep(
  db: AnyDB, lang: string, matchTerm: string,
  seen: Set<number>, order: number[], limit: number,
) {
  if (order.length >= limit) return
  try {
    const sql = `
      SELECT DISTINCT s.entry_id AS entry_id
      FROM "${lang}".SenseGloss sg
      JOIN main.Sense s ON s.sense_id = sg.sense_id
      WHERE sg.rowid IN (
        SELECT rowid FROM "${lang}".GlossSearchFts WHERE text MATCH ?
      )
      LIMIT ?`
    const rows = queryRows(db, sql, [matchTerm, limit - order.length])
    for (const row of rows) {
      const id = row['entry_id'] as number
      if (!seen.has(id)) { seen.add(id); order.push(id) }
    }
  } catch { /* skip on FTS error or no match */ }
}

// FormFuriganaSegment rows for one form_id, in display order. null when the
// form has none (e.g. a bare kana headword with nothing to annotate).
function furiganaFor(db: AnyDB, formId: number): FuriganaSegment[] | null {
  const rows = queryRows(
    db,
    `SELECT base, ruby FROM main.FormFuriganaSegment WHERE form_id = ? ORDER BY ord`,
    [formId],
  )
  if (rows.length === 0) return null
  return rows.map((r) => ({ base: r['base'] as string, ruby: r['ruby'] as string | null }))
}

// Assembles one fully-structured EntrySummary from schema-v2 tables for a
// matched entry_id: the primary form (with furigana), alternate writings and
// readings, and sense groups with their tags and globally-numbered glosses.
function assembleEntry(db: AnyDB, entryId: number, lang: string, backupLang: string | null): EntrySummary {
  const [entryRow] = queryRows(db, `SELECT source_key FROM main.Entry WHERE entry_id = ?`, [entryId])
  const seq = Number(entryRow?.['source_key'] ?? entryId)

  const forms = queryRows(
    db,
    `SELECT form_id, form_type, text, reading, is_primary FROM main.EntryForm
     WHERE entry_id = ? AND is_search_only = 0 ORDER BY ord`,
    [entryId],
  )

  const primaryRow = forms.find((f) => f['is_primary'] === 1) ?? forms[0]
  const primaryFormId = primaryRow ? (primaryRow['form_id'] as number) : null
  const primaryText = primaryRow ? (primaryRow['text'] as string) : ''
  const primaryFurigana = primaryFormId != null ? furiganaFor(db, primaryFormId) : null
  const primaryReadingText = (primaryRow?.['reading'] as string | null)
    ?? (primaryFurigana ? primaryFurigana.map((s) => s.ruby ?? s.base).join('') : primaryText)

  const writingTexts: string[] = []
  const readingTexts: string[] = []
  const firstFormIdFor = new Map<string, number>()
  for (const f of forms) {
    const text = f['text'] as string
    const formId = f['form_id'] as number
    if (f['form_type'] === 'writing') {
      if (!writingTexts.includes(text)) { writingTexts.push(text); firstFormIdFor.set(text, formId) }
    } else if (!readingTexts.includes(text)) {
      readingTexts.push(text)
    }
  }

  const alternateWritings: FormSummary[] = writingTexts
    .filter((t) => t !== primaryText)
    .map((t) => ({ text: t, furigana: furiganaFor(db, firstFormIdFor.get(t)!) }))
  const alternateReadings = readingTexts.filter((t) => t !== primaryReadingText && t !== primaryText)

  const groupRows = queryRows(db, `SELECT sense_group_id FROM main.SenseGroup WHERE entry_id = ? ORDER BY ord`, [entryId])

  let glossCounter = 0
  const senseGroups: SenseGroupSummary[] = groupRows
    .map((g) => assembleSenseGroup(db, g['sense_group_id'] as number, lang, backupLang, (n) => { glossCounter += n; return glossCounter }))
    .filter((g) => g.glosses.length > 0)

  return {
    seq,
    primaryForm: { text: primaryText, furigana: primaryFurigana },
    alternateWritings,
    alternateReadings,
    senseGroups,
    lang,
  }
}

function assembleSenseGroup(
  db: AnyDB, senseGroupId: number, lang: string, backupLang: string | null,
  nextNumber: (n: number) => number,
): SenseGroupSummary {
  const tagRows = queryRows(
    db,
    `SELECT t.code AS code, t.category AS category, t.label AS label
     FROM main.SenseGroupTag sgt JOIN main.Tag t ON t.tag_id = sgt.tag_id
     WHERE sgt.sense_group_id = ? ORDER BY t.sort_order`,
    [senseGroupId],
  )
  const tags: Tag[] = tagRows.map((r) => ({ code: r['code'] as string, category: r['category'] as string, label: r['label'] as string }))

  const senseRows = queryRows(db, `SELECT sense_id FROM main.Sense WHERE sense_group_id = ? ORDER BY ord`, [senseGroupId])

  function glossesIn(glossLang: string): string[] {
    const items: string[] = []
    for (const s of senseRows) {
      const rows = queryRows(
        db,
        `SELECT text FROM "${glossLang}".SenseGloss WHERE sense_id = ? AND gloss_type = 'main' ORDER BY ord`,
        [s['sense_id'] as number],
      )
      if (rows.length === 0) continue
      items.push(rows.map((r) => r['text'] as string).join('; '))
    }
    return items
  }

  let glossTexts = glossesIn(lang)
  let usedBackupLang = false
  if (glossTexts.length === 0 && backupLang) {
    glossTexts = glossesIn(backupLang)
    usedBackupLang = true
  }
  const glosses: GlossItem[] = glossTexts.map((text) => ({ text, displayNumber: nextNumber(1) }))

  return { tags, glosses, usedBackupLang }
}

// Assembles the full EntryDetail for one entry_id, fetched by seq on demand
// (not part of the search-list payload — see ui-parity-and-remote-search-plan.md,
// Phase C). Pitch accent and examples are deferred: they live in optional
// packs not yet surfaced in the install UI.
function assembleEntryDetail(db: AnyDB, entryId: number, seq: number, lang: string, backupLang: string | null): EntryDetail {
  const forms = queryRows(
    db,
    `SELECT form_id, form_type, text, reading, is_common, is_primary FROM main.EntryForm
     WHERE entry_id = ? AND is_search_only = 0 ORDER BY ord`,
    [entryId],
  )
  const primaryRow = forms.find((f) => f['is_primary'] === 1) ?? forms[0]
  const primaryFormId = primaryRow ? (primaryRow['form_id'] as number) : null
  const primaryText = primaryRow ? (primaryRow['text'] as string) : ''
  const primaryFurigana = primaryFormId != null ? furiganaFor(db, primaryFormId) : null
  const isPriority = primaryRow ? primaryRow['is_common'] === 1 : false

  const formsTable = buildFormsTable(db, forms)

  const groupRows = queryRows(db, `SELECT sense_group_id FROM main.SenseGroup WHERE entry_id = ? ORDER BY ord`, [entryId])
  const senseGroups = groupRows
    .map((g) => assembleSenseGroupDetail(db, g['sense_group_id'] as number, lang, backupLang))
    .filter((g) => g.senses.length > 0)

  return {
    seq,
    primaryForm: { text: primaryText, furigana: primaryFurigana },
    isPriority,
    formsTable,
    senseGroups,
  }
}

// Pivots EntryForm rows into the alternate-forms table per schema-v2.md's
// recipe: writing forms become columns, readings that bridge to at least one
// of them become rows, and kana-only readings with no kanji bridge go in
// their own bucket instead of a fabricated "∅" row. Returns null for the
// trivial one-writing/one-reading case — clients should omit the table then.
function buildFormsTable(db: AnyDB, forms: QueryRow[]): FormsTable | null {
  const writingRows = forms.filter((f) => f['form_type'] === 'writing')
  const writingColumns: string[] = []
  for (const f of writingRows) {
    const text = f['text'] as string
    if (!writingColumns.includes(text)) writingColumns.push(text)
  }

  const bridgingReadings = new Set<string>()
  for (const f of writingRows) {
    const r = f['reading'] as string | null
    if (r) bridgingReadings.add(r)
  }

  const readingRows = forms.filter((f) => f['form_type'] === 'reading')
  const kanaOnlyReadings: string[] = []
  for (const f of readingRows) {
    const text = f['text'] as string
    if (!bridgingReadings.has(text) && !kanaOnlyReadings.includes(text)) kanaOnlyReadings.push(text)
  }

  // No kanji forms at all -> nothing to pivot against, table would be pure noise.
  // One kanji form and no bare-kana readings -> same trivial case as before.
  if (writingColumns.length === 0) return null
  if (writingColumns.length === 1 && kanaOnlyReadings.length === 0) return null

  const rows = Array.from(bridgingReadings).sort().map((reading) => {
    const cells = writingColumns.map((col) => {
      const match = writingRows.find((f) => f['text'] === col && f['reading'] === reading)
      if (!match) return null
      const formId = match['form_id'] as number
      const tagRows = queryRows(
        db,
        `SELECT t.code AS code, t.label AS label FROM main.FormTag ft
         JOIN main.Tag t ON t.tag_id = ft.tag_id WHERE ft.form_id = ?`,
        [formId],
      )
      const badges: FormTierBadge[] = tagRows.map((r) => ({ code: r['code'] as string, label: r['label'] as string }))
      return badges
    })
    return { reading, cells }
  })

  return { writingColumns, rows, kanaOnlyReadings }
}

function assembleSenseGroupDetail(db: AnyDB, senseGroupId: number, lang: string, backupLang: string | null): SenseGroupDetail {
  const tagRows = queryRows(
    db,
    `SELECT t.code AS code, t.category AS category, t.label AS label
     FROM main.SenseGroupTag sgt JOIN main.Tag t ON t.tag_id = sgt.tag_id
     WHERE sgt.sense_group_id = ? ORDER BY t.sort_order`,
    [senseGroupId],
  )
  const tags: Tag[] = tagRows.map((r) => ({ code: r['code'] as string, category: r['category'] as string, label: r['label'] as string }))

  const senseRows = queryRows(db, `SELECT sense_id FROM main.Sense WHERE sense_group_id = ? ORDER BY ord`, [senseGroupId])
  const senses = senseRows
    .map((s) => assembleSenseDetail(db, s['sense_id'] as number, lang, backupLang))
    .filter((s) => s.glossText.length > 0)

  return { tags, senses }
}

function assembleSenseDetail(db: AnyDB, senseId: number, lang: string, backupLang: string | null): SenseDetail {
  function glossIn(glossLang: string): string {
    const rows = queryRows(
      db,
      `SELECT text FROM "${glossLang}".SenseGloss WHERE sense_id = ? AND gloss_type = 'main' ORDER BY ord`,
      [senseId],
    )
    return rows.map((r) => r['text'] as string).join('; ')
  }

  let glossText = glossIn(lang)
  let usedBackupLang = false
  if (!glossText && backupLang) {
    glossText = glossIn(backupLang)
    usedBackupLang = true
  }

  const notes = queryRows(db, `SELECT text FROM main.SenseNote WHERE sense_id = ? ORDER BY ord`, [senseId])
    .map((r) => r['text'] as string)

  const refRows = queryRows(
    db,
    `SELECT sr.reference_type AS reference_type, sr.display_text AS display_text, e.source_key AS target_seq
     FROM main.SenseReference sr
     LEFT JOIN main.Entry e ON e.entry_id = sr.target_entry_id
     WHERE sr.sense_id = ? ORDER BY sr.ord`,
    [senseId],
  )
  function toXref(r: QueryRow): XrefItem {
    const targetSeq = r['target_seq']
    return { displayText: r['display_text'] as string, targetSeq: targetSeq != null ? Number(targetSeq) : null }
  }
  const xrefs = refRows.filter((r) => r['reference_type'] === 'xref').map(toXref)
  const antonyms = refRows.filter((r) => r['reference_type'] === 'antonym').map(toXref)

  const languageSources: LanguageSourceItem[] = queryRows(
    db,
    `SELECT lang, text, is_full, is_wasei FROM main.SenseLanguageSource WHERE sense_id = ? ORDER BY ord`,
    [senseId],
  ).map((r) => ({
    lang: r['lang'] as string,
    text: r['text'] as string | null,
    isFull: r['is_full'] === 1,
    isWasei: r['is_wasei'] === 1,
  }))

  return { glossText, usedBackupLang, notes, xrefs, antonyms, languageSources }
}

// KANJIDIC2 lookup from the optional "kanji" attached pack. Meanings are
// always lang='eng' in the generator (see kanjidic2-to-sumatora-db.py),
// regardless of which gloss language is installed.
function assembleKanjiInfo(db: AnyDB, character: string): KanjiInfo | null {
  const [entryRow] = queryRows(
    db,
    `SELECT strokes, grade, jlpt, frequency FROM "kanji".KanjiEntry WHERE character = ?`,
    [character],
  )
  if (!entryRow) return null

  const readingRows = queryRows(
    db,
    `SELECT reading_type, text FROM "kanji".KanjiReading WHERE character = ? ORDER BY reading_type, ord`,
    [character],
  )
  const onReadings = readingRows.filter((r) => r['reading_type'] === 'on').map((r) => r['text'] as string)
  const kunReadings = readingRows.filter((r) => r['reading_type'] === 'kun').map((r) => r['text'] as string)
  const nanoriReadings = readingRows.filter((r) => r['reading_type'] === 'nanori').map((r) => r['text'] as string)

  const meanings = queryRows(
    db,
    `SELECT text FROM "kanji".KanjiMeaning WHERE character = ? AND lang = 'eng' ORDER BY ord`,
    [character],
  ).map((r) => r['text'] as string)

  return {
    character,
    strokes: entryRow['strokes'] as number | null,
    grade: entryRow['grade'] as number | null,
    jlpt: entryRow['jlpt'] as number | null,
    frequency: entryRow['frequency'] as number | null,
    onReadings,
    kunReadings,
    nanoriReadings,
    meanings,
  }
}
