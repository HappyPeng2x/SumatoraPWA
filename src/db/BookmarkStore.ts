import { getDB } from './DictionaryStore'
import type { Bookmark, SearchResult } from './types'

export async function getBookmarks(): Promise<Bookmark[]> {
  const db = await getDB()
  return db.getAllFromIndex('bookmarks', 'addedAt')
}

export async function getBookmarkedSeqs(): Promise<Set<number>> {
  const db = await getDB()
  const keys = await db.getAllKeys('bookmarks')
  return new Set(keys)
}

export async function addBookmark(result: SearchResult): Promise<void> {
  const db = await getDB()
  const existing = await db.get('bookmarks', result.seq)
  const bookmark: Bookmark = {
    seq: result.seq,
    addedAt: existing?.addedAt ?? Date.now(),
    tags: existing?.tags ?? [],
    readingsPrio: result.readingsPrio,
    readings: result.readings,
    writingsPrio: result.writingsPrio,
    writings: result.writings,
    pos: result.pos,
    gloss: result.gloss,
    lang: result.lang,
  }
  await db.put('bookmarks', bookmark)
  window.dispatchEvent(new CustomEvent('sumatora:bookmarks-changed'))
}

export async function removeBookmark(seq: number): Promise<void> {
  const db = await getDB()
  await db.delete('bookmarks', seq)
  window.dispatchEvent(new CustomEvent('sumatora:bookmarks-changed'))
}

export async function updateBookmarkTags(seq: number, tags: string[]): Promise<void> {
  const db = await getDB()
  const existing = await db.get('bookmarks', seq)
  if (!existing) return
  await db.put('bookmarks', { ...existing, tags })
  window.dispatchEvent(new CustomEvent('sumatora:bookmarks-changed'))
}

export async function exportBookmarks(): Promise<Bookmark[]> {
  return getBookmarks()
}

export async function importBookmarks(data: Bookmark[]): Promise<void> {
  const db = await getDB()
  const tx = db.transaction('bookmarks', 'readwrite')
  await Promise.all(data.map(b => tx.store.put(b)))
  await tx.done
  window.dispatchEvent(new CustomEvent('sumatora:bookmarks-changed'))
}
