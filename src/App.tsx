import { useState } from 'react'
import TabBar from './components/TabBar'
import SearchPage from './pages/SearchPage'
import BookmarksPage from './pages/BookmarksPage'
import TagsPage from './pages/TagsPage'
import SettingsPage from './pages/SettingsPage'
import PWABanners from './components/PWABanners'
import { useDbInit } from './hooks/useDbInit'
import { useBookmarks } from './hooks/useBookmarks'

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

  return (
    <div
      className="flex flex-col bg-slate-900 text-slate-100"
      style={{
        height: '100%',
        paddingTop: 'var(--safe-top)',
      }}
    >
      {/* Header */}
      <header className="flex items-center border-b border-slate-700 bg-slate-800 px-4 py-3">
        <h1 className="text-base font-semibold tracking-wide text-slate-100">
          {PAGE_TITLES[activeTab]}
        </h1>
      </header>

      <PWABanners />

      {/* Page content */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {activeTab === 'search' && (
          <SearchPage
            dbState={dbState}
            bookmarkedSeqs={bookmarkedSeqs}
            toggleBookmark={toggleBookmark}
          />
        )}
        {activeTab === 'bookmarks' && (
          <BookmarksPage
            bookmarkedSeqs={bookmarkedSeqs}
            toggleBookmark={toggleBookmark}
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
    </div>
  )
}
