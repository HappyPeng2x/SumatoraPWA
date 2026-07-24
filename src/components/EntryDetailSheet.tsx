import { useState, useEffect } from 'react'
import { DbService } from '../db/DbService'
import type { EntryDetail, FormsTable } from '../db/types'
import FuriganaText from './FuriganaText'
import { TagChip } from './EntryCard'

interface Props {
  seq: number
  isBookmarked: boolean
  onToggleBookmark: (seq: number) => void
  onClose: () => void
  onBack?: () => void
  onNavigate: (seq: number) => void
  onKanjiClick?: (char: string) => void
}

function FormsTableView({ table }: { table: FormsTable }) {
  const hasKanaOnly = table.kanaOnlyReadings.length > 0
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="border-collapse text-sm">
        <thead>
          <tr>
            <th className="border border-slate-700 px-2 py-1"></th>
            {table.writingColumns.map((c) => (
              <th key={c} className="ja border border-slate-700 px-2 py-1 font-normal text-slate-300">{c}</th>
            ))}
            {hasKanaOnly && <th className="border border-slate-700 px-2 py-1 text-slate-500">∅</th>}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => (
            <tr key={row.reading}>
              <td className="ja border border-slate-700 px-2 py-1 text-slate-300">{row.reading}</td>
              {row.cells.map((cell, i) => (
                <td key={i} className="border border-slate-700 px-2 py-1 text-center text-xs">
                  {cell === null ? '' : cell.length === 0 ? <span className="text-emerald-400">✓</span> : (
                    <span className="text-amber-400" title={cell.map((b) => b.label).join(', ')}>
                      {cell.map((b) => b.code).join(',')}
                    </span>
                  )}
                </td>
              ))}
              {hasKanaOnly && <td className="border border-slate-700 px-2 py-1" />}
            </tr>
          ))}
          {table.kanaOnlyReadings.map((r) => (
            <tr key={r}>
              <td className="ja border border-slate-700 px-2 py-1 text-slate-300">{r}</td>
              {table.writingColumns.map((_, i) => <td key={i} className="border border-slate-700 px-2 py-1" />)}
              <td className="border border-slate-700 px-2 py-1 text-center text-emerald-400">✓</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** An extra info box with a colored left border — used for notes/xrefs/antonyms/language-source, matching Android's per-kind border colors. */
function InfoBox({ color, label, children }: { color: string; label: string; children: React.ReactNode }) {
  return (
    <div className={`mt-1.5 border-l-2 ${color} pl-2 text-xs italic text-slate-400`}>
      <span className="not-italic font-medium text-slate-500">{label}: </span>
      {children}
    </div>
  )
}

function XrefList({ items, onNavigate }: { items: { displayText: string; targetSeq: number | null }[]; onNavigate: (seq: number) => void }) {
  return (
    <>
      {items.map((x, i) => (
        <span key={i}>
          {i > 0 && ', '}
          {x.targetSeq != null ? (
            <button className="underline hover:text-slate-200" onClick={() => onNavigate(x.targetSeq!)}>{x.displayText}</button>
          ) : x.displayText}
        </span>
      ))}
    </>
  )
}

export default function EntryDetailSheet({ seq, isBookmarked, onToggleBookmark, onClose, onBack, onNavigate, onKanjiClick }: Props) {
  const [detail, setDetail] = useState<EntryDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setDetail(null)
    setError(null)
    DbService.get().entryDetail(seq)
      .then((d) => { if (!cancelled) setDetail(d) })
      .catch((err) => { if (!cancelled) setError(String(err)) })
    return () => { cancelled = true }
  }, [seq])

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900" style={{ paddingTop: 'var(--safe-top)' }}>
      <div className="flex items-center gap-2 border-b border-slate-700 bg-slate-800 px-3 py-2">
        {onBack && (
          <button onClick={onBack} className="rounded px-2 py-1 text-slate-300 hover:bg-slate-700" aria-label="Back">←</button>
        )}
        <div className="flex-1" />
        <button onClick={onClose} className="rounded px-2 py-1 text-slate-300 hover:bg-slate-700" aria-label="Close">✕</button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {error && <p className="text-sm text-red-400">{error}</p>}
        {!detail && !error && <p className="text-sm text-slate-500">Loading…</p>}

        {detail && (
          <>
            <div className="flex items-start gap-2">
              <FuriganaText
                text={detail.primaryForm.text}
                segments={detail.primaryForm.furigana}
                className="ja text-2xl font-medium text-slate-100"
                onKanjiClick={onKanjiClick}
              />
              {detail.isPriority && <span className="mt-1 text-amber-400" title="Common word">★</span>}
              <div className="flex-1" />
              <button
                onClick={() => onToggleBookmark(seq)}
                className={`mt-1 text-xl leading-none transition-colors ${isBookmarked ? 'text-amber-400' : 'text-slate-600 hover:text-slate-400'}`}
                aria-label={isBookmarked ? 'Remove bookmark' : 'Add bookmark'}
              >
                {isBookmarked ? '★' : '☆'}
              </button>
            </div>

            {detail.formsTable && <FormsTableView table={detail.formsTable} />}

            {detail.senseGroups.map((group, gi) => (
              <div key={gi} className="mt-4">
                {group.tags.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1">
                    {group.tags.map((t, i) => <TagChip key={i} tag={t} />)}
                  </div>
                )}
                {group.senses.map((sense, si) => (
                  <div key={si} className="mt-1.5 border-b border-slate-800 pb-1.5 last:border-0">
                    <p className={`text-sm ${sense.usedBackupLang ? 'text-slate-400' : 'text-slate-200'}`}>
                      {sense.glossText}
                    </p>
                    {sense.notes.map((n, i) => (
                      <InfoBox key={i} color="border-sky-700" label="Note">{n}</InfoBox>
                    ))}
                    {sense.languageSources.map((ls, i) => (
                      <InfoBox key={i} color="border-fuchsia-700" label="Language of Origin">
                        {ls.lang}{ls.text ? `: ${ls.text}` : ''}{ls.isWasei ? ' (wasei)' : ''}
                      </InfoBox>
                    ))}
                    {sense.xrefs.length > 0 && (
                      <InfoBox color="border-emerald-700" label="See also">
                        <XrefList items={sense.xrefs} onNavigate={onNavigate} />
                      </InfoBox>
                    )}
                    {sense.antonyms.length > 0 && (
                      <InfoBox color="border-rose-700" label="Antonym">
                        <XrefList items={sense.antonyms} onNavigate={onNavigate} />
                      </InfoBox>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
