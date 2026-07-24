import { useState, useEffect, useCallback } from 'react'
import { addBookmark, removeBookmark, getBookmarkedSeqs } from '../db/BookmarkStore'
import type { EntrySummary } from '../db/types'

export interface BookmarkState {
  bookmarkedSeqs: Set<number>
  toggleBookmark: (entry: EntrySummary) => Promise<void>
}

export function useBookmarks(): BookmarkState {
  const [bookmarkedSeqs, setBookmarkedSeqs] = useState<Set<number>>(new Set())

  const refresh = useCallback(async () => {
    setBookmarkedSeqs(await getBookmarkedSeqs())
  }, [])

  useEffect(() => {
    refresh()
    const handler = () => refresh()
    window.addEventListener('sumatora:bookmarks-changed', handler)
    return () => window.removeEventListener('sumatora:bookmarks-changed', handler)
  }, [refresh])

  const toggleBookmark = useCallback(async (entry: EntrySummary) => {
    if (bookmarkedSeqs.has(entry.seq)) {
      await removeBookmark(entry.seq)
    } else {
      await addBookmark(entry)
    }
  }, [bookmarkedSeqs])

  return { bookmarkedSeqs, toggleBookmark }
}
