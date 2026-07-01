import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { InstalledDict } from './types'

interface Schema extends DBSchema {
  dicts: {
    key: string
    value: InstalledDict
  }
  settings: {
    key: string
    value: string
  }
}

let dbPromise: Promise<IDBPDatabase<Schema>> | null = null

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<Schema>('sumatora', 1, {
      upgrade(db) {
        db.createObjectStore('dicts', { keyPath: 'lang' })
        db.createObjectStore('settings')
      },
    })
  }
  return dbPromise
}

export async function getInstalledDicts(): Promise<InstalledDict[]> {
  const db = await getDB()
  return db.getAll('dicts')
}

export async function getInstalledDict(lang: string): Promise<InstalledDict | undefined> {
  const db = await getDB()
  return db.get('dicts', lang)
}

export async function saveInstalledDict(dict: InstalledDict): Promise<void> {
  const db = await getDB()
  await db.put('dicts', dict)
}

export async function removeInstalledDict(lang: string): Promise<void> {
  const db = await getDB()
  await db.delete('dicts', lang)
}

export async function getSetting(key: string): Promise<string | undefined> {
  const db = await getDB()
  return db.get('settings', key)
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDB()
  await db.put('settings', value, key)
}
