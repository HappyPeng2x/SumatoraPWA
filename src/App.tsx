import { useState } from 'react'
import TabBar from './components/TabBar'
import SearchPage from './pages/SearchPage'
import BookmarksPage from './pages/BookmarksPage'
import TagsPage from './pages/TagsPage'
import SettingsPage from './pages/SettingsPage'

export type Tab = 'search' | 'bookmarks' | 'tags' | 'settings'

const PAGE_TITLES: Record<Tab, string> = {
  search: 'Sumatora',
  bookmarks: 'Bookmarks',
  tags: 'Tags',
  settings: 'Settings',
}

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('search')

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

      {/* Page content */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {activeTab === 'search' && <SearchPage />}
        {activeTab === 'bookmarks' && <BookmarksPage />}
        {activeTab === 'tags' && <TagsPage />}
        {activeTab === 'settings' && <SettingsPage />}
      </main>

      {/* Bottom tab bar */}
      <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  )
}
