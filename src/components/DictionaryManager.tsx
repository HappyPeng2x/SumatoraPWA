import { useDictionaries } from '../hooks/useDictionaries'
import type { DictMeta, DownloadProgress } from '../db/types'

function ProgressBar({ p }: { p: DownloadProgress }) {
  const pct =
    p.totalBytes > 0 ? Math.round((p.downloadedBytes / p.totalBytes) * 100) : null

  const label =
    p.phase === 'downloading' ? (pct !== null ? `${pct}%` : 'Downloading…') :
    p.phase === 'decompressing' ? 'Decompressing…' :
    p.phase === 'writing' ? 'Writing to storage…' :
    p.phase === 'error' ? `Error: ${p.error}` : ''

  return (
    <div className="mt-1">
      {p.phase !== 'error' && (
        <div className="h-1.5 w-full rounded-full bg-slate-600">
          <div
            className="h-1.5 rounded-full bg-indigo-400 transition-all"
            style={{ width: pct !== null ? `${pct}%` : '100%', animation: pct === null ? 'pulse 1s infinite' : undefined }}
          />
        </div>
      )}
      <p className={`mt-0.5 text-xs ${p.phase === 'error' ? 'text-red-400' : 'text-slate-400'}`}>
        {label}
      </p>
    </div>
  )
}

function DictRow({
  meta,
  isInstalled,
  progress,
  onInstall,
  onUninstall,
}: {
  meta: DictMeta
  isInstalled: boolean
  progress?: DownloadProgress
  onInstall: (m: DictMeta) => void
  onUninstall: (lang: string) => void
}) {
  const isDownloading = !!progress && progress.phase !== 'done'

  return (
    <div className="border-b border-slate-700 p-3 last:border-0">
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-200">{meta.description}</span>
            {meta.type === 'main' && (
              <span className="rounded bg-slate-700 px-1.5 py-0.5 text-xs text-slate-400">required</span>
            )}
            {isInstalled && !isDownloading && (
              <span className="rounded bg-emerald-900 px-1.5 py-0.5 text-xs text-emerald-400">installed</span>
            )}
          </div>
          <p className="text-xs text-slate-500">{meta.lang}.db</p>
        </div>

        <div className="flex gap-1">
          {!isInstalled && !isDownloading && (
            <button
              onClick={() => onInstall(meta)}
              className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
            >
              Install
            </button>
          )}
          {isInstalled && !isDownloading && (
            <button
              onClick={() => onUninstall(meta.lang)}
              className="rounded border border-slate-600 px-3 py-1.5 text-xs text-slate-400 hover:border-red-500 hover:text-red-400"
            >
              Remove
            </button>
          )}
          {isDownloading && (
            <span className="px-3 py-1.5 text-xs text-slate-500">Installing…</span>
          )}
        </div>
      </div>

      {progress && <ProgressBar p={progress} />}
    </div>
  )
}

export default function DictionaryManager() {
  const { catalogue, installed, progress, loading, install, uninstall } = useDictionaries()

  const jmdict = catalogue.find((d) => d.lang === 'jmdict')!
  const translations = catalogue.filter((d) => d.type === 'translation')

  return (
    <div>
      {loading && (
        <div className="py-4 text-center text-sm text-slate-500">Loading…</div>
      )}

      {!loading && (
        <>
          {/* Dev note about local file server */}
          <div className="mb-3 rounded-lg border border-amber-800 bg-amber-900/20 p-3 text-xs text-amber-400">
            <strong>Dev note:</strong> To install dictionaries, run a local file server from the Android assets directory:
            <code className="mt-1 block rounded bg-slate-800 px-2 py-1 font-mono text-slate-300">
              cd ~/StudioProjects/SumatoraDictionary/app/src/main/assets/dictionaries && python3 -m http.server 8000
            </code>
            The Vite dev server proxies <code className="text-slate-300">/dictionaries/*</code> → <code className="text-slate-300">localhost:8000</code>.
          </div>

          {/* Core index */}
          <section className="mb-4">
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">Core Index</h4>
            <div className="rounded-lg border border-slate-700 bg-slate-800">
              <DictRow
                meta={jmdict}
                isInstalled={!!installed['jmdict']}
                progress={progress['jmdict']}
                onInstall={install}
                onUninstall={uninstall}
              />
            </div>
          </section>

          {/* Translation databases */}
          <section>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Translation Databases
            </h4>
            {!installed['jmdict'] && (
              <p className="mb-2 text-xs text-slate-500">Install the core index first.</p>
            )}
            <div className="rounded-lg border border-slate-700 bg-slate-800">
              {translations.map((meta) => (
                <DictRow
                  key={meta.lang}
                  meta={meta}
                  isInstalled={!!installed[meta.lang]}
                  progress={progress[meta.lang]}
                  onInstall={install}
                  onUninstall={uninstall}
                />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
