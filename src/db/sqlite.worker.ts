/// <reference lib="webworker" />
import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import type { Sqlite3Static } from '@sqlite.org/sqlite-wasm'
import type { ToWorker, FromWorker, SqlValue, QueryRow, SearchResult } from './types'
import { toKatakana, toHepburn } from './romkan'

type OO1 = Sqlite3Static['oo1']
type AnyDB = InstanceType<OO1['DB']>

let sqlite3: Sqlite3Static | null = null
let db: AnyDB | null = null
let currentLang: string | null = null
let currentBackupLang: string | null = null

// sqlite3InitModule's published type says no args, but the Emscripten module
// accepts a Module overrides object. Cast to accept the locateFile option.
const initFn = sqlite3InitModule as (opts: Record<string, unknown>) => Promise<Sqlite3Static>

const ready = initFn({
  locateFile: (file: string) => `/${file}`,
  print: (s: string) => console.log('[sqlite]', s),
  printErr: (s: string) => console.error('[sqlite]', s),
}).then((s) => {
  sqlite3 = s
})

self.onmessage = async (e: MessageEvent<ToWorker>) => {
  const msg = e.data
  try {
    await ready
    const result = await dispatch(msg)
    self.postMessage({ id: msg.id, ok: true, result } satisfies FromWorker)
  } catch (err) {
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
      const { lang, backupLang } = msg.payload

      // jmdict.db is always the MAIN schema; lang.db is ATTACHed as "{lang}".
      // SQL uses main.DictionaryEntry / main.DictionaryIndex for jmdict tables.
      const hasOpfs = sqlite3!.capi.sqlite3_vfs_find('opfs')

      if (hasOpfs) {
        try {
          // OPFS VFS available: open jmdict.db as main (reads only needed pages)
          db = new sqlite3!.oo1.OpfsDb('/jmdict.db', 'r')
          db.exec(`ATTACH DATABASE 'file:/${lang}.db?vfs=opfs&mode=ro' AS "${lang}"`)
          if (backupLang) {
            try {
              db.exec(`ATTACH DATABASE 'file:/${backupLang}.db?vfs=opfs&mode=ro' AS "${backupLang}"`)
              currentBackupLang = backupLang
            } catch { /* backup not installed — silently skip */ }
          }
        } catch {
          // OPFS VFS registered but file I/O failed — fall through to POSIX
          db?.close()
          db = null
          currentBackupLang = null
        }
      }

      if (!db) {
        // POSIX fallback: load bytes from OPFS file API, create files in unix VFS
        const root = await navigator.storage.getDirectory()
        const jmBytes = new Uint8Array(await (await (await root.getFileHandle('jmdict.db')).getFile()).arrayBuffer())
        const langBytes = new Uint8Array(await (await (await root.getFileHandle(`${lang}.db`)).getFile()).arrayBuffer())

        type CapiExt = { sqlite3_js_posix_create_file(filename: string, data: Uint8Array): void }
        const capiExt = sqlite3!.capi as unknown as CapiExt

        // Write bytes into Emscripten's POSIX layer so the 'unix' VFS can open them
        capiExt.sqlite3_js_posix_create_file('/jmdict.db', jmBytes)
        capiExt.sqlite3_js_posix_create_file(`/${lang}.db`, langBytes)

        // Open read-write so SQLite can create WAL sidecar files in Emscripten FS
        // (sidecar files are in-memory only — the original OPFS copy is never modified)
        db = new sqlite3!.oo1.DB({ filename: '/jmdict.db', flags: 'rw', vfs: 'unix' })
        db.exec(`ATTACH DATABASE '/${lang}.db' AS "${lang}"`)

        if (backupLang) {
          try {
            const backupBytes = new Uint8Array(await (await (await root.getFileHandle(`${backupLang}.db`)).getFile()).arrayBuffer())
            capiExt.sqlite3_js_posix_create_file(`/${backupLang}.db`, backupBytes)
            db.exec(`ATTACH DATABASE '/${backupLang}.db' AS "${backupLang}"`)
            currentBackupLang = backupLang
          } catch { /* backup not installed — silently skip */ }
        }
      }

      currentLang = lang
      return { lang, backupLang: currentBackupLang }
    }

    case 'search': {
      if (!db || !currentLang) throw new Error('DB not initialized. Call initDb first.')
      const { term, limit = 30 } = msg.payload
      const seen = new Map<number, SearchResult>()
      const t = term.trim()
      if (!t) return []
      const kata = toKatakana(toHepburn(t))

      // Forward search: per-entry fallback — each entry shows primary lang if it
      // has a translation, otherwise falls back to backup lang within the same row.
      searchForward(db, currentLang, currentBackupLang, t, kata, seen, limit)

      // Gloss (reverse) search: primary fills first, backup fills remaining slots.
      glossFts5Step(db, currentLang, t,       seen, limit)
      glossFts5Step(db, currentLang, t + '*', seen, limit)
      if (currentBackupLang && seen.size < limit) {
        glossFts5Step(db, currentBackupLang, t,       seen, limit)
        glossFts5Step(db, currentBackupLang, t + '*', seen, limit)
      }

      return Array.from(seen.values())
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

function rowToResult(row: QueryRow): SearchResult {
  return {
    seq: row['seq'] as number,
    readingsPrio: row['readingsPrio'] as string | null,
    readings: row['readings'] as string | null,
    writingsPrio: row['writingsPrio'] as string | null,
    writings: row['writings'] as string | null,
    pos: row['pos'] as string | null,
    gloss: row['gloss'] as string | null,
    lang: row['lang'] as string,
  }
}

function addRows(rows: QueryRow[], seen: Map<number, SearchResult>, limit: number) {
  for (const row of rows) {
    const r = rowToResult(row)
    if (!seen.has(r.seq)) seen.set(r.seq, r)
    if (seen.size >= limit) break
  }
}

// Search a column of the FTS5 DictionaryIndex (contentless).
// matchTerm may include a trailing '*' for prefix search.
function fts5Step(
  db: AnyDB, lang: string, col: string, matchTerm: string,
  seen: Map<number, SearchResult>, limit: number
) {
  if (seen.size >= limit) return
  try {
    const sql = `
      SELECT main.DictionaryEntry.seq,
             main.DictionaryEntry.readingsPrio, main.DictionaryEntry.readings,
             main.DictionaryEntry.writingsPrio, main.DictionaryEntry.writings,
             main.DictionaryEntry.pos,
             json_group_array("${lang}".DictionaryTranslation.gloss) AS gloss,
             '${lang}' AS lang
      FROM main.DictionaryEntry
      JOIN "${lang}".DictionaryTranslation
        ON "${lang}".DictionaryTranslation.seq = main.DictionaryEntry.seq
      WHERE main.DictionaryEntry.seq IN (
        SELECT rowid FROM main.DictionaryIndex WHERE ${col} MATCH ?
      )
      GROUP BY main.DictionaryEntry.seq
      LIMIT ${limit - seen.size}`
    addRows(queryRows(db, sql, [matchTerm]), seen, limit)
  } catch { /* skip on FTS error or no match */ }
}

// Search the FTS5 DictionaryTranslationIndex (content table backed by DictionaryTranslation).
function glossFts5Step(
  db: AnyDB, lang: string, matchTerm: string,
  seen: Map<number, SearchResult>, limit: number
) {
  if (seen.size >= limit) return
  try {
    const sql = `
      SELECT main.DictionaryEntry.seq,
             main.DictionaryEntry.readingsPrio, main.DictionaryEntry.readings,
             main.DictionaryEntry.writingsPrio, main.DictionaryEntry.writings,
             main.DictionaryEntry.pos,
             json_group_array(allGloss.gloss) AS gloss,
             '${lang}' AS lang
      FROM main.DictionaryEntry
      JOIN "${lang}".DictionaryTranslation AS allGloss
        ON allGloss.seq = main.DictionaryEntry.seq
      WHERE main.DictionaryEntry.seq IN (
        SELECT dt.seq
        FROM "${lang}".DictionaryTranslation AS dt
        WHERE dt.rowid IN (
          SELECT rowid FROM "${lang}".DictionaryTranslationIndex WHERE gloss MATCH ?
        )
      )
      GROUP BY main.DictionaryEntry.seq
      LIMIT ${limit - seen.size}`
    addRows(queryRows(db, sql, [matchTerm]), seen, limit)
  } catch { /* skip on FTS error or no match */ }
}

// Like fts5Step but for each matched entry shows primaryLang gloss when available,
// falling back to backupLang gloss. Uses EXISTS to avoid json_group_array empty-array issue.
function fts5StepFallback(
  db: AnyDB, primaryLang: string, backupLang: string, col: string, matchTerm: string,
  seen: Map<number, SearchResult>, limit: number
) {
  if (seen.size >= limit) return
  try {
    const sql = `
      SELECT main.DictionaryEntry.seq,
             main.DictionaryEntry.readingsPrio, main.DictionaryEntry.readings,
             main.DictionaryEntry.writingsPrio, main.DictionaryEntry.writings,
             main.DictionaryEntry.pos,
             CASE WHEN EXISTS(
               SELECT 1 FROM "${primaryLang}".DictionaryTranslation
               WHERE seq = main.DictionaryEntry.seq
             )
             THEN (SELECT json_group_array(gloss) FROM "${primaryLang}".DictionaryTranslation
                   WHERE seq = main.DictionaryEntry.seq)
             ELSE (SELECT json_group_array(gloss) FROM "${backupLang}".DictionaryTranslation
                   WHERE seq = main.DictionaryEntry.seq)
             END AS gloss,
             CASE WHEN EXISTS(
               SELECT 1 FROM "${primaryLang}".DictionaryTranslation
               WHERE seq = main.DictionaryEntry.seq
             ) THEN '${primaryLang}' ELSE '${backupLang}' END AS lang
      FROM main.DictionaryEntry
      WHERE main.DictionaryEntry.seq IN (
        SELECT rowid FROM main.DictionaryIndex WHERE ${col} MATCH ?
      )
      AND (
        EXISTS(SELECT 1 FROM "${primaryLang}".DictionaryTranslation WHERE seq = main.DictionaryEntry.seq)
        OR EXISTS(SELECT 1 FROM "${backupLang}".DictionaryTranslation WHERE seq = main.DictionaryEntry.seq)
      )
      LIMIT ${limit - seen.size}`
    addRows(queryRows(db, sql, [matchTerm]), seen, limit)
  } catch { /* skip on FTS error or no match */ }
}

// Run the 12 forward (kana/writing) FTS5 steps. With backupLang, each entry
// shows the primary lang gloss when available, backup lang otherwise.
function searchForward(
  db: AnyDB, primaryLang: string, backupLang: string | null,
  t: string, kata: string, seen: Map<number, SearchResult>, limit: number
) {
  const step = backupLang
    ? (col: string, term: string) => fts5StepFallback(db, primaryLang, backupLang, col, term, seen, limit)
    : (col: string, term: string) => fts5Step(db, primaryLang, col, term, seen, limit)

  step('writingsPrio',            t)
  step('readingsPrioKana',        kata)
  step('writings',                t)
  step('readingsKana',            kata)
  step('writingsPrio',            t    + '*')
  step('readingsPrioKana',        kata + '*')
  step('writings',                t    + '*')
  step('readingsKana',            kata + '*')
  step('writingsPrioParts',       t    + '*')
  step('readingsPrioKanaParts',   kata + '*')
  step('writingsParts',           t    + '*')
  step('readingsKanaParts',       kata + '*')
}
