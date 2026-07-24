import { useState, useEffect } from 'react'
import { DbService } from '../db/DbService'
import type { KanjiInfo } from '../db/types'

interface Props {
  character: string
  hasKanjiPack: boolean
  onClose: () => void
}

function jlptLabel(jlpt: number): string {
  return `N${jlpt}`
}

function gradeLabel(grade: number): string {
  if (grade >= 1 && grade <= 6) return `Grade ${grade} (kyōiku)`
  if (grade === 8) return 'Jōyō (secondary school)'
  if (grade >= 9) return 'Jinmeiyō'
  return `Grade ${grade}`
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-2">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-sm text-slate-200">{children}</p>
    </div>
  )
}

export default function KanjiDetailPopup({ character, hasKanjiPack, onClose }: Props) {
  const [info, setInfo] = useState<KanjiInfo | null | undefined>(undefined)

  useEffect(() => {
    if (!hasKanjiPack) { setInfo(null); return }
    let cancelled = false
    setInfo(undefined)
    DbService.get().kanjiInfo(character).then((i) => { if (!cancelled) setInfo(i) })
    return () => { cancelled = true }
  }, [character, hasKanjiPack])

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div
        className="max-h-[80vh] w-full max-w-sm overflow-y-auto rounded-t-xl border border-slate-700 bg-slate-900 p-4 sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <span className="ja text-4xl text-slate-100">{character}</span>
          <button onClick={onClose} className="rounded px-2 py-1 text-slate-400 hover:bg-slate-700" aria-label="Close">✕</button>
        </div>

        {!hasKanjiPack && (
          <p className="mt-3 text-sm text-slate-400">
            Install the <strong className="text-slate-300">Kanji Data</strong> pack in Settings to see stroke count, grade, JLPT level, readings, and meanings for this character.
          </p>
        )}

        {hasKanjiPack && info === undefined && (
          <p className="mt-3 text-sm text-slate-500">Loading…</p>
        )}

        {hasKanjiPack && info === null && (
          <p className="mt-3 text-sm text-slate-500">No KANJIDIC2 data for this character.</p>
        )}

        {info && (
          <>
            {info.meanings.length > 0 && <Field label="Meaning">{info.meanings.join('; ')}</Field>}
            {info.onReadings.length > 0 && <Field label="On'yomi">{info.onReadings.join('、')}</Field>}
            {info.kunReadings.length > 0 && <Field label="Kun'yomi">{info.kunReadings.join('、')}</Field>}
            {info.nanoriReadings.length > 0 && <Field label="Nanori">{info.nanoriReadings.join('、')}</Field>}
            {info.strokes != null && <Field label="Strokes">{info.strokes}</Field>}
            {info.grade != null && <Field label="Grade">{gradeLabel(info.grade)}</Field>}
            {info.jlpt != null && <Field label="JLPT">{jlptLabel(info.jlpt)}</Field>}
            {info.frequency != null && <Field label="Frequency rank">{info.frequency}</Field>}
          </>
        )}
      </div>
    </div>
  )
}
