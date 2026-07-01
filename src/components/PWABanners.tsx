import { useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { useInstallPrompt } from '../hooks/useInstallPrompt'

export default function PWABanners() {
  const { needRefresh: [needRefresh], offlineReady: [offlineReady, setOfflineReady], updateServiceWorker } = useRegisterSW()
  const { canInstall, install, dismiss } = useInstallPrompt()
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
      {/* Update available banner — shown below header, pushes content */}
      {needRefresh && (
        <div className="flex items-center justify-between border-b border-amber-700 bg-amber-900/80 px-4 py-2 text-sm text-amber-200">
          <span>Update available</span>
          <button
            onClick={() => updateServiceWorker(true)}
            className="ml-4 rounded bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-500"
          >
            Reload
          </button>
        </div>
      )}

      {/* Install banner — shown above tab bar as sticky bottom strip */}
      {canInstall && (
        <div className="flex items-center justify-between border-t border-indigo-700 bg-indigo-900/90 px-4 py-2 text-sm text-indigo-200">
          <div>
            <p className="font-medium text-indigo-100">Add to Home Screen</p>
            <p className="text-xs text-indigo-400">Install for offline use</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={dismiss}
              className="rounded px-3 py-1.5 text-xs text-indigo-400 hover:text-indigo-200"
            >
              Not now
            </button>
            <button
              onClick={install}
              className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
            >
              Install
            </button>
          </div>
        </div>
      )}

      {/* Offline ready toast — bottom-right corner */}
      {showOfflineToast && (
        <div className="pointer-events-none fixed bottom-20 right-4 z-50 rounded-lg bg-slate-700 px-4 py-2 text-sm text-slate-200 shadow-lg">
          Ready for offline use
        </div>
      )}
    </>
  )
}
