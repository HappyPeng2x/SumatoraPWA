export default function SearchPage() {
  return (
    <div className="flex flex-1 flex-col">
      {/* Search bar */}
      <div className="border-b border-slate-700 bg-slate-800 p-3">
        <input
          type="search"
          placeholder="Search in Japanese, romaji, or English…"
          className="w-full rounded-lg bg-slate-700 px-4 py-2.5 text-slate-100 placeholder-slate-400 outline-none focus:ring-2 focus:ring-indigo-500"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
        />
      </div>

      {/* Results area */}
      <div className="flex flex-1 items-center justify-center text-slate-500">
        <div className="text-center">
          <div className="ja mb-2 text-4xl text-slate-600">辞書</div>
          <p className="text-sm">Type to search the dictionary</p>
        </div>
      </div>
    </div>
  )
}
