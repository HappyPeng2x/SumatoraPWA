import { useState, useEffect, useCallback } from 'react'
import { addBookmark, removeBookmark, getBookmarkedSeqs } from '../db/BookmarkStore'
import type { SearchResult } from '../db/types'

export interface BookmarkState {
  bookmarkedSeqs: Set<number>
  toggleBookmark: (result: SearchResult) => Promise<void>
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

  const toggleBookmark = useCallback(async (result: SearchResult) => {
    if (bookmarkedSeqs.has(result.seq)) {
      await removeBookmark(result.seq)
    } else {
      await addBookmark(result)
    }
  }, [bookmarkedSeqs])

  return { bookmarkedSeqs, toggleBookmark }
}
