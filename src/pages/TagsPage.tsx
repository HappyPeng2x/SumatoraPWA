import { useState, useEffect, useMemo, useCallback } from 'react'
import { getBookmarks } from '../db/BookmarkStore'
import type { Bookmark } from '../db/types'

interface Props {
  onSelectTag: (tag: string) => void
}

export default function TagsPage({ onSelectTag }: Props) {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])

  const loadBookmarks = useCallback(async () => {
    setBookmarks(await getBookmarks())
  }, [])

  useEffect(() => {
    loadBookmarks()
    const handler = () => loadBookmarks()
    window.addEventListener('sumatora:bookmarks-changed', handler)
    return () => window.removeEventListener('sumatora:bookmarks-changed', handler)
  }, [loadBookmarks])

  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>()
    bookmarks.forEach(b => {
      b.tags.forEach(tag => counts.set(tag, (counts.get(tag) ?? 0) + 1))
    })
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [bookmarks])

  if (tagCounts.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="text-center">
          <div className="mb-2 text-4xl text-slate-600">🏷</div>
          <p className="text-sm text-slate-500">No tags yet</p>
          <p className="mt-1 text-xs text-slate-600">Add tags to your bookmarks to organize them</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto p-4">
      <div className="flex flex-wrap gap-2">
        {tagCounts.map(([tag, count]) => (
          <button
            key={tag}
            onClick={() => onSelectTag(tag)}
            className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700 active:bg-slate-600"
          >
            <span>{tag}</span>
            <span className="rounded-full bg-slate-700 px-1.5 py-0.5 text-xs text-slate-400">{count}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
