import { useState, useRef, useCallback } from 'react'
import { useSearch } from '../hooks/useSearch'
import EntryCard from '../components/EntryCard'
import type { DbInitState } from '../hooks/useDbInit'
import type { EntrySummary } from '../db/types'

interface Props {
  dbState: DbInitState
  bookmarkedSeqs: Set<number>
  toggleBookmark: (entry: EntrySummary) => Promise<void>
  onOpenDetail: (seq: number) => void
  onKanjiClick: (char: string) => void
}

export default function SearchPage({ dbState, bookmarkedSeqs, toggleBookmark, onOpenDetail, onKanjiClick }: Props) {
  const [term, setTerm] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const { results, loading } = useSearch(term, dbState.ready)

  const handleClear = useCallback(() => {
    setTerm('')
    inputRef.current?.focus()
  }, [])

  const isEmpty = !term.trim()

  function emptyHint() {
    if (dbState.error) {
      return (
        <div className="text-center text-sm text-red-400">
          <p>Error initializing database:</p>
          <p className="mt-1 text-xs">{dbState.error}</p>
        </div>
      )
    }
    if (dbState.noJmdict) {
      return (
        <div className="text-center text-sm text-slate-500">
          <div className="ja mb-2 text-4xl text-slate-700">辞書</div>
          <p>Install the <strong className="text-slate-400">Core Index</strong> in Settings to search.</p>
        </div>
      )
    }
    if (dbState.noLang) {
      return (
        <div className="text-center text-sm text-slate-500">
          <div className="ja mb-2 text-4xl text-slate-700">辞書</div>
          <p>Install a <strong className="text-slate-400">Translation Database</strong> in Settings to search.</p>
        </div>
      )
    }
    if (!dbState.ready) {
      return (
        <div className="text-center text-sm text-slate-500">
          <div className="mb-2 text-4xl text-slate-700">…</div>
          <p>Loading dictionary…</p>
        </div>
      )
    }
    return (
      <div className="text-center text-sm text-slate-500">
        <div className="ja mb-2 text-4xl text-slate-600">辞書</div>
        <p>Type to search the dictionary</p>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Online-mode indicator: searching a remote pack rather than a local install (Phase E) */}
      {dbState.ready && dbState.isRemote && (
        <div className="border-b border-sky-800 bg-sky-900/30 px-3 py-1.5 text-center text-xs text-sky-300">
          Searching online — install dictionaries in Settings for offline use.
        </div>
      )}

      {/* Search bar */}
      <div className="border-b border-slate-700 bg-slate-800 px-3 py-2">
        <div className="relative">
          <input
            ref={inputRef}
            type="search"
            value={term}
            onChange={e => setTerm(e.target.value)}
            placeholder="Search in Japanese, romaji, or English…"
            className="w-full rounded-lg bg-slate-700 py-2.5 pl-4 pr-10 text-slate-100 placeholder-slate-400 outline-none focus:ring-2 focus:ring-indigo-500"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            disabled={!dbState.ready}
          />
          {term && (
            <button
              onClick={handleClear}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
              aria-label="Clear"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Results area */}
      <div className="flex flex-1 flex-col overflow-y-auto">
        {isEmpty ? (
          <div className="flex flex-1 items-center justify-center p-8">
            {emptyHint()}
          </div>
        ) : loading ? (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
            Searching…
          </div>
        ) : results.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
            No results for <span className="ja ml-1 font-medium text-slate-400">{term}</span>
          </div>
        ) : (
          <div className="bg-slate-900">
            {results.map(r => (
              <EntryCard
                key={r.seq}
                entry={r}
                isBookmarked={bookmarkedSeqs.has(r.seq)}
                onToggleBookmark={toggleBookmark}
                onOpenDetail={onOpenDetail}
                onKanjiClick={onKanjiClick}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
