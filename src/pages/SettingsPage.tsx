import { Suspense, lazy } from 'react'

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
            <select className="w-full rounded bg-slate-700 px-3 py-2 text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500">
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
          </div>
          <div className="p-3">
            <label className="mb-1 block text-sm text-slate-300">Backup language</label>
            <select className="w-full rounded bg-slate-700 px-3 py-2 text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="">None</option>
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
          </div>
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
          <button className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-left text-sm text-slate-300 hover:bg-slate-700">
            Export bookmarks (JSON)
          </button>
          <button className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-left text-sm text-slate-300 hover:bg-slate-700">
            Import bookmarks (JSON)
          </button>
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">About</h3>
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-3 text-sm text-slate-400">
          <p>Sumatora Dictionary</p>
          <p className="mt-1 text-xs">Dictionary data: JMDict (James Breen / EDRDG)</p>
          <p className="mt-0.5 text-xs">License: GPL v3</p>
        </div>
      </section>
    </div>
  )
}
