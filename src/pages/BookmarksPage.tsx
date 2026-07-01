export default function BookmarksPage() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-slate-700 bg-slate-800 p-3">
        <input
          type="search"
          placeholder="Filter bookmarks…"
          className="w-full rounded-lg bg-slate-700 px-4 py-2.5 text-slate-100 placeholder-slate-400 outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>
      <div className="flex flex-1 items-center justify-center text-slate-500">
        <div className="text-center">
          <div className="mb-2 text-4xl text-slate-600">★</div>
          <p className="text-sm">No bookmarks yet</p>
        </div>
      </div>
    </div>
  )
}
