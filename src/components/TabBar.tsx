import type { Tab } from '../App'

interface TabBarProps {
  activeTab: Tab
  onTabChange: (tab: Tab) => void
}

const tabs: { id: Tab; label: string; icon: string }[] = [
  { id: 'search', label: 'Search', icon: '🔍' },
  { id: 'bookmarks', label: 'Bookmarks', icon: '★' },
  { id: 'tags', label: 'Tags', icon: '🏷' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
]

export default function TabBar({ activeTab, onTabChange }: TabBarProps) {
  return (
    <nav
      className="flex border-t border-slate-700 bg-slate-900"
      style={{ paddingBottom: 'var(--safe-bottom)' }}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={[
            'flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-xs transition-colors',
            activeTab === tab.id
              ? 'text-accent-400'
              : 'text-slate-400 hover:text-slate-200',
          ].join(' ')}
        >
          <span className="text-xl leading-none">{tab.icon}</span>
          <span>{tab.label}</span>
        </button>
      ))}
    </nav>
  )
}
