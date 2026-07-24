import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { InstalledDict, Bookmark } from './types'

interface Schema extends DBSchema {
  dicts: {
    key: string
    value: InstalledDict
  }
  settings: {
    key: string
    value: string
  }
  bookmarks: {
    key: number
    value: Bookmark
    indexes: { addedAt: number; tags: string }
  }
}

let dbPromise: Promise<IDBPDatabase<Schema>> | null = null

export function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<Schema>('sumatora', 4, {
      upgrade(db, oldVersion, _newVersion, tx) {
        if (oldVersion < 1) {
          db.createObjectStore('dicts', { keyPath: 'lang' })
          db.createObjectStore('settings')
        }
        if (oldVersion < 2) {
          const store = db.createObjectStore('bookmarks', { keyPath: 'seq' })
          store.createIndex('addedAt', 'addedAt')
          store.createIndex('tags', 'tags', { multiEntry: true })
        }
        if (oldVersion < 3) {
          // Multiple schema-v2 pack types can now share the same lang (e.g.
          // gloss_eng and tatoeba_eng), so 'dicts' is keyed by filename instead.
          // Old installs used the legacy flat schema's file names (jmdict.db,
          // eng.db, ...), which no longer match any current pack — clear so the
          // app re-prompts for a (schema-v2) install. Bookmarks are untouched:
          // they only store cached display text plus the JMdict seq number,
          // which is unaffected by this migration.
          db.deleteObjectStore('dicts')
          db.createObjectStore('dicts', { keyPath: 'filename' })
        }
        if (oldVersion < 4) {
          // Bookmark.entry replaces the old flat readingsPrio/readings/pos/gloss
          // fields with a structured EntrySummary snapshot (Phase B) — old
          // records don't have that shape, so clear rather than crash on render.
          // This app has no released users yet; no export/import compat is
          // promised across this change.
          tx.objectStore('bookmarks').clear()
        }
      },
    })
  }
  return dbPromise
}

export async function getInstalledDicts(): Promise<InstalledDict[]> {
  const db = await getDB()
  return db.getAll('dicts')
}

export async function getInstalledDict(filename: string): Promise<InstalledDict | undefined> {
  const db = await getDB()
  return db.get('dicts', filename)
}

export async function saveInstalledDict(dict: InstalledDict): Promise<void> {
  const db = await getDB()
  await db.put('dicts', dict)
}

export async function removeInstalledDict(filename: string): Promise<void> {
  const db = await getDB()
  await db.delete('dicts', filename)
}

export async function getSetting(key: string): Promise<string | undefined> {
  const db = await getDB()
  return db.get('settings', key)
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDB()
  await db.put('settings', value, key)
}
