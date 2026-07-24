import { useState, useEffect, useMemo, useCallback } from 'react'
import { getBookmarks, updateBookmarkTags } from '../db/BookmarkStore'
import EntryCard from '../components/EntryCard'
import TagEditor from '../components/TagEditor'
import type { Bookmark, EntrySummary } from '../db/types'

interface Props {
  bookmarkedSeqs: Set<number>
  toggleBookmark: (entry: EntrySummary) => Promise<void>
  onOpenDetail: (seq: number) => void
  onKanjiClick: (char: string) => void
  selectedTag: string | null
  onSelectTag: (tag: string) => void
  onClearTag: () => void
}

function matchesFilter(b: Bookmark, text: string): boolean {
  if (!text) return true
  const q = text.toLowerCase()
  const { entry } = b
  const fields = [
    entry.primaryForm.text,
    ...entry.alternateWritings.map(w => w.text),
    ...entry.alternateReadings,
    ...entry.senseGroups.flatMap(g => g.glosses.map(gl => gl.text)),
  ]
  return fields.some(f => f.toLowerCase().includes(q)) ||
    b.tags.some(t => t.toLowerCase().includes(q))
}

export default function BookmarksPage({ bookmarkedSeqs, toggleBookmark, onOpenDetail, onKanjiClick, selectedTag, onSelectTag, onClearTag }: Props) {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [filterText, setFilterText] = useState('')
  const [editingSeq, setEditingSeq] = useState<number | null>(null)

  const loadBookmarks = useCallback(async () => {
    setBookmarks(await getBookmarks())
  }, [])

  useEffect(() => {
    loadBookmarks()
    const handler = () => loadBookmarks()
    window.addEventListener('sumatora:bookmarks-changed', handler)
    return () => window.removeEventListener('sumatora:bookmarks-changed', handler)
  }, [loadBookmarks])

  const allTags = useMemo(() => {
    const tagSet = new Set<string>()
    bookmarks.forEach(b => b.tags.forEach(t => tagSet.add(t)))
    return [...tagSet].sort()
  }, [bookmarks])

  const filtered = useMemo(() => {
    return bookmarks
      .filter(b => !selectedTag || b.tags.includes(selectedTag))
      .filter(b => matchesFilter(b, filterText))
  }, [bookmarks, selectedTag, filterText])

  async function handleSaveTags(seq: number, tags: string[]) {
    await updateBookmarkTags(seq, tags)
    setEditingSeq(null)
  }

  const isEmpty = bookmarks.length === 0

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Filter bar */}
      <div className="border-b border-slate-700 bg-slate-800 px-3 py-2">
        <input
          type="search"
          value={filterText}
          onChange={e => setFilterText(e.target.value)}
          placeholder="Filter bookmarks…"
          className="w-full rounded-lg bg-slate-700 px-4 py-2.5 text-slate-100 placeholder-slate-400 outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {/* Tag filter chips */}
      {(allTags.length > 0 || selectedTag) && (
        <div className="flex gap-1.5 overflow-x-auto border-b border-slate-700 bg-slate-800 px-3 py-2">
          {selectedTag && (
            <button
              onClick={onClearTag}
              className="flex-shrink-0 rounded-full bg-indigo-600 px-3 py-1 text-xs font-medium text-white"
            >
              {selectedTag} ×
            </button>
          )}
          {allTags.filter(t => t !== selectedTag).map(tag => (
            <button
              key={tag}
              onClick={() => onSelectTag(tag)}
              className="flex-shrink-0 rounded-full border border-slate-600 bg-slate-800 px-3 py-1 text-xs text-slate-300 hover:bg-slate-700"
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="flex flex-1 flex-col overflow-y-auto">
        {isEmpty ? (
          <div className="flex flex-1 items-center justify-center p-8">
            <div className="text-center">
              <div className="mb-2 text-4xl text-slate-600">★</div>
              <p className="text-sm text-slate-500">No bookmarks yet</p>
              <p className="mt-1 text-xs text-slate-600">Tap the star on a search result to save it</p>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
            No bookmarks match your filter
          </div>
        ) : (
          <div className="bg-slate-900">
            {filtered.map(b => (
              <div key={b.seq}>
                <div className="relative">
                  <EntryCard
                    entry={b.entry}
                    isBookmarked={bookmarkedSeqs.has(b.seq)}
                    onToggleBookmark={toggleBookmark}
                    onOpenDetail={onOpenDetail}
                    onKanjiClick={onKanjiClick}
                    tags={b.tags}
                  />
                  {/* Tag edit button */}
                  <button
                    onClick={() => setEditingSeq(editingSeq === b.seq ? null : b.seq)}
                    className="absolute bottom-3 right-3 rounded bg-slate-700 px-2 py-0.5 text-xs text-slate-400 hover:bg-slate-600 hover:text-slate-200"
                    aria-label="Edit tags"
                  >
                    {editingSeq === b.seq ? 'Cancel' : 'Tags'}
                  </button>
                </div>
                {editingSeq === b.seq && (
                  <div className="border-b border-slate-700 bg-slate-850 px-4 pb-3">
                    <TagEditor
                      tags={b.tags}
                      onSave={tags => handleSaveTags(b.seq, tags)}
                      onCancel={() => setEditingSeq(null)}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
