import { useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { useInstallPrompt } from '../hooks/useInstallPrompt'

interface Props {
  isRemote: boolean
  searchActive: boolean
  onGoToSettings: () => void
}

// Small icon/indicator cluster for the header bar, replacing what used to be
// three separately-stacked banners (update-available, add-to-home-screen,
// searching-online) pushing the page content down at once.
export default function HeaderIndicators({ isRemote, searchActive, onGoToSettings }: Props) {
  const { needRefresh: [needRefresh], offlineReady: [offlineReady, setOfflineReady], updateServiceWorker } = useRegisterSW()
  const { canInstall, install } = useInstallPrompt()
  const [showOfflineToast, setShowOfflineToast] = useState(false)

  useEffect(() => {
    if (offlineReady) {
      setShowOfflineToast(true)
      const timer = setTimeout(() => {
        setShowOfflineToast(false)
        setOfflineReady(false)
      }, 4000)
      return () => clearTimeout(timer)
    }
  }, [offlineReady, setOfflineReady])

  return (
    <>
      <div className="flex shrink-0 items-center gap-1">
        {searchActive && (
          <span
            className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-slate-600 border-t-accent-400"
            role="status"
            aria-label="Searching"
            title="Searching…"
          />
        )}
        {isRemote && (
          <button
            onClick={onGoToSettings}
            className="rounded-full p-1.5 text-base leading-none text-sky-400 hover:bg-slate-700"
            aria-label="Searching online — install dictionaries in Settings for offline use"
            title="Searching online — install dictionaries in Settings for offline use"
          >
            ☁
          </button>
        )}
        {needRefresh && (
          <button
            onClick={() => updateServiceWorker(true)}
            className="rounded-full p-1.5 text-base leading-none text-amber-400 hover:bg-slate-700"
            aria-label="Update available — tap to reload"
            title="Update available — tap to reload"
          >
            ⟳
          </button>
        )}
        {canInstall && (
          <button
            onClick={install}
            className="rounded-full p-1.5 text-base leading-none text-accent-400 hover:bg-slate-700"
            aria-label="Install Sumatora"
            title="Install Sumatora"
          >
            ⬇︎
          </button>
        )}
      </div>

      {showOfflineToast && (
        <div className="pointer-events-none fixed bottom-20 right-4 z-50 rounded-lg bg-slate-700 px-4 py-2 text-sm text-slate-200 shadow-lg">
          Ready for offline use
        </div>
      )}
    </>
  )
}
