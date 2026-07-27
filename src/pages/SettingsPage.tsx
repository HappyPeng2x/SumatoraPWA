import { Suspense, lazy, useState, useEffect, useRef } from 'react'
import { getSetting, setSetting } from '../db/DictionaryStore'
import { exportBookmarks, importBookmarks } from '../db/BookmarkStore'
import { THEMES, applyTheme, getStoredTheme } from '../theme'

const DictionaryManager = lazy(() => import('../components/DictionaryManager'))

const LANGUAGES = [
  { code: 'eng', label: 'English' },
  { code: 'ger', label: 'German' },
  { code: 'rus', label: 'Russian' },
  { code: 'spa', label: 'Spanish' },
  { code: 'dut', label: 'Dutch' },
  { code: 'hun', label: 'Hungarian' },
  { code: 'swe', label: 'Swedish' },
  { code: 'fre', label: 'French' },
  { code: 'slv', label: 'Slovenian' },
]

export default function SettingsPage() {
  const [primaryLang, setPrimaryLang] = useState('eng')
  const [backupLang, setBackupLang] = useState('')
  const [theme, setTheme] = useState(getStoredTheme)
  const importInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    Promise.all([getSetting('lang'), getSetting('backupLang')]).then(([lang, backup]) => {
      if (lang) setPrimaryLang(lang)
      if (backup !== undefined) setBackupLang(backup ?? '')
    })
  }, [])

  function handlePrimaryChange(lang: string) {
    setPrimaryLang(lang)
    setSetting('lang', lang)
    if (backupLang === lang) {
      setBackupLang('')
      setSetting('backupLang', '')
    }
    window.dispatchEvent(new CustomEvent('sumatora:lang-changed'))
  }

  function handleBackupChange(lang: string) {
    setBackupLang(lang)
    setSetting('backupLang', lang)
    window.dispatchEvent(new CustomEvent('sumatora:lang-changed'))
  }

  function handleThemeChange(id: string) {
    setTheme(id)
    applyTheme(id)
  }

  async function handleExport() {
    const data = await exportBookmarks()
    const json = JSON.stringify(data, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sumatora-bookmarks-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      if (!Array.isArray(data)) throw new Error('Expected an array')
      await importBookmarks(data)
    } catch (err) {
      alert(`Import failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto p-4 text-slate-200">
      <h2 className="mb-4 text-lg font-semibold text-slate-100">Settings</h2>

      <section className="mb-6">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Dictionary Language
        </h3>
        <div className="rounded-lg border border-slate-700 bg-slate-800">
          <div className="border-b border-slate-700 p-3">
            <label className="mb-1 block text-sm text-slate-300">Primary language</label>
            <select
              value={primaryLang}
              onChange={e => handlePrimaryChange(e.target.value)}
              className="w-full rounded bg-slate-700 px-3 py-2 text-slate-100 outline-none focus:ring-2 focus:ring-accent-500"
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
          </div>
          <div className="p-3">
            <label className="mb-1 block text-sm text-slate-300">Backup language</label>
            <select
              value={backupLang}
              onChange={e => handleBackupChange(e.target.value)}
              className="w-full rounded bg-slate-700 px-3 py-2 text-slate-100 outline-none focus:ring-2 focus:ring-accent-500"
            >
              <option value="">None</option>
              {LANGUAGES.filter(l => l.code !== primaryLang).map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="mb-6">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Appearance
        </h3>
        <div className="grid grid-cols-4 gap-2">
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => handleThemeChange(t.id)}
              aria-pressed={theme === t.id}
              className={`flex flex-col items-center gap-1.5 rounded-lg border p-2.5 transition-colors ${
                theme === t.id
                  ? 'border-accent-500 bg-slate-800'
                  : 'border-slate-700 bg-slate-800 hover:border-slate-600'
              }`}
            >
              <span
                className="h-7 w-7 rounded-full ring-2 ring-slate-900 ring-offset-2 ring-offset-slate-800"
                style={{ background: `linear-gradient(135deg, ${t.swatch[0]}, ${t.swatch[1]})` }}
              />
              <span className={`text-xs ${theme === t.id ? 'text-slate-100' : 'text-slate-400'}`}>
                {t.label}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="mb-6">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Dictionaries
        </h3>
        <Suspense fallback={<div className="py-4 text-center text-sm text-slate-500">Loading…</div>}>
          <DictionaryManager />
        </Suspense>
      </section>

      <section className="mb-6">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Bookmarks
        </h3>
        <div className="flex flex-col gap-2">
          <button
            onClick={handleExport}
            className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-left text-sm text-slate-300 hover:bg-slate-700"
          >
            Export bookmarks (JSON)
          </button>
          <button
            onClick={() => importInputRef.current?.click()}
            className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-left text-sm text-slate-300 hover:bg-slate-700"
          >
            Import bookmarks (JSON)
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleImport}
          />
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">About</h3>
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-3 text-sm text-slate-400">
          <p>Sumatora Dictionary</p>
          <p className="mt-1 text-xs">Dictionary data: JMDict (James Breen / EDRDG)</p>
          <p className="mt-0.5 text-xs">
            Application license:{' '}
            <a
              href="https://github.com/HappyPeng2x/SumatoraPWA/blob/master/LICENSE"
              target="_blank"
              rel="noreferrer"
              className="text-accent-400 underline hover:text-accent-300"
            >
              GNU AGPL v3
            </a>
          </p>
          <p className="mt-0.5 text-xs">
            <a
              href="https://github.com/HappyPeng2x/SumatoraPWA"
              target="_blank"
              rel="noreferrer"
              className="text-accent-400 underline hover:text-accent-300"
            >
              Corresponding source code
            </a>
          </p>
        </div>
      </section>
    </div>
  )
}
