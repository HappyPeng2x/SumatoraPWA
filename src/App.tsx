import { useState, useCallback } from 'react'
import TabBar from './components/TabBar'
import SearchPage from './pages/SearchPage'
import BookmarksPage from './pages/BookmarksPage'
import TagsPage from './pages/TagsPage'
import SettingsPage from './pages/SettingsPage'
import HeaderIndicators from './components/HeaderIndicators'
import EntryDetailSheet from './components/EntryDetailSheet'
import KanjiDetailPopup from './components/KanjiDetailPopup'
import { useDbInit } from './hooks/useDbInit'
import { useBookmarks } from './hooks/useBookmarks'
import { DbService } from './db/DbService'

export type Tab = 'search' | 'bookmarks' | 'tags' | 'settings'

const PAGE_TITLES: Record<Tab, string> = {
  search: 'Sumatora',
  bookmarks: 'Bookmarks',
  tags: 'Tags',
  settings: 'Settings',
}

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('search')
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [detailStack, setDetailStack] = useState<number[]>([])
  const [kanjiChar, setKanjiChar] = useState<string | null>(null)
  const [searchActive, setSearchActive] = useState(false)
  const dbState = useDbInit()
  const { bookmarkedSeqs, toggleBookmark } = useBookmarks()

  function handleTabChange(tab: Tab) {
    if (tab !== 'bookmarks') setSelectedTag(null)
    setActiveTab(tab)
  }

  function handleSelectTag(tag: string) {
    setSelectedTag(tag)
    setActiveTab('bookmarks')
  }

  const openDetail = useCallback((seq: number) => {
    setDetailStack((s) => [...s, seq])
  }, [])

  // The detail sheet only has a seq, not a full EntrySummary (its own fetch
  // returns the richer EntryDetail shape) — fetch a snapshot on demand to
  // reuse the same add/remove logic every other bookmark toggle uses.
  const toggleBookmarkBySeq = useCallback(async (seq: number) => {
    const entry = await DbService.get().entrySummary(seq)
    await toggleBookmark(entry)
  }, [toggleBookmark])

  return (
    <div
      className="flex flex-col bg-slate-900 text-slate-100"
      style={{
        height: '100%',
        paddingTop: 'var(--safe-top)',
      }}
    >
      {/* Header: logo/title on the left, status icons and actions on the
          right, all in one row instead of stacked banners pushing content
          down. */}
      <header className="flex items-center gap-2 border-b border-slate-700 bg-slate-800 px-3 py-2.5">
        <img src="/logo-header.png" alt="" className="h-7 w-7 shrink-0 rounded-full" />
        <h1 className="flex-1 truncate text-base font-semibold tracking-wide text-slate-100">
          {PAGE_TITLES[activeTab]}
        </h1>
        <HeaderIndicators
          isRemote={dbState.ready && dbState.isRemote}
          searchActive={activeTab === 'search' && searchActive}
          onGoToSettings={() => handleTabChange('settings')}
        />
      </header>

      {/* Page content */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {activeTab === 'search' && (
          <SearchPage
            dbState={dbState}
            bookmarkedSeqs={bookmarkedSeqs}
            toggleBookmark={toggleBookmark}
            onOpenDetail={openDetail}
            onKanjiClick={setKanjiChar}
            onActivityChange={setSearchActive}
          />
        )}
        {activeTab === 'bookmarks' && (
          <BookmarksPage
            bookmarkedSeqs={bookmarkedSeqs}
            toggleBookmark={toggleBookmark}
            onOpenDetail={openDetail}
            onKanjiClick={setKanjiChar}
            selectedTag={selectedTag}
            onSelectTag={handleSelectTag}
            onClearTag={() => setSelectedTag(null)}
          />
        )}
        {activeTab === 'tags' && (
          <TagsPage onSelectTag={handleSelectTag} />
        )}
        {activeTab === 'settings' && <SettingsPage />}
      </main>

      {/* Bottom tab bar */}
      <TabBar activeTab={activeTab} onTabChange={handleTabChange} />

      {/* Entry detail overlay, with a seq navigation stack for xref/antonym jumps */}
      {detailStack.length > 0 && (
        <EntryDetailSheet
          seq={detailStack[detailStack.length - 1]}
          isBookmarked={bookmarkedSeqs.has(detailStack[detailStack.length - 1])}
          onToggleBookmark={toggleBookmarkBySeq}
          onClose={() => setDetailStack([])}
          onBack={detailStack.length > 1 ? () => setDetailStack((s) => s.slice(0, -1)) : undefined}
          onNavigate={openDetail}
          onKanjiClick={setKanjiChar}
        />
      )}

      {/* Kanji detail popup, layered above the entry detail sheet */}
      {kanjiChar && (
        <KanjiDetailPopup
          character={kanjiChar}
          hasKanjiPack={dbState.hasKanji}
          onClose={() => setKanjiChar(null)}
        />
      )}
    </div>
  )
}
