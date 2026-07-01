/// <reference lib="webworker" />
import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import type { Sqlite3Static } from '@sqlite.org/sqlite-wasm'
import type { ToWorker, FromWorker, SqlValue, QueryRow } from './types'

type OO1 = Sqlite3Static['oo1']
type AnyDB = InstanceType<OO1['DB']>

let sqlite3: Sqlite3Static | null = null
let db: AnyDB | null = null

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
        // Fallback: read bytes from OPFS, open in-memory
        const root = await navigator.storage.getDirectory()
        const fh = await root.getFileHandle(filename)
        const file = await fh.getFile()
        const buf = new Uint8Array(await file.arrayBuffer())
        db = new sqlite3!.oo1.DB({ filename: ':memory:', flags: 'c' })
        // Use byte-level open: sqlite3 can open from a Uint8Array
        db.close()
        db = new sqlite3!.oo1.DB(buf as unknown as string, 'r')
      }
      return { filename }
    }

    case 'attach': {
      const { alias, filename } = msg.payload
      const hasOpfs = sqlite3!.capi.sqlite3_vfs_find('opfs')
      if (hasOpfs) {
        db!.exec(`ATTACH DATABASE 'file:/${filename}?vfs=opfs&mode=ro' AS "${alias}"`)
      } else {
        // In-memory fallback: load bytes and attach via temp path (not ideal but works)
        const root = await navigator.storage.getDirectory()
        const fh = await root.getFileHandle(filename)
        const file = await fh.getFile()
        const bytes = new Uint8Array(await file.arrayBuffer())
        // Create a VFS file the in-memory SQLite can attach
        sqlite3!.capi.sqlite3_js_vfs_create_file('unix', `/${filename}`, bytes)
        db!.exec(`ATTACH DATABASE '/${filename}' AS "${alias}"`)
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
      return true
  }
}
