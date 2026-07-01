import type { SearchResult, Bookmark } from '../db/types'
import { JMDICT_ENTITIES } from '../db/jmdictEntities'

function parsePosArray(pos: string | null): string[] {
  if (!pos) return []
  try {
    const parsed = JSON.parse(pos)
    if (Array.isArray(parsed)) {
      const flat = (parsed as unknown[]).flatMap(x => Array.isArray(x) ? x : [x])
      return [...new Set(flat.filter((x): x is string => typeof x === 'string'))]
    }
  } catch { /* fall through */ }
  return pos.split(/[,\s]+/).filter(Boolean)
}

function parseGlossArray(gloss: string | null): string[] {
  if (!gloss) return []
  try {
    const parsed = JSON.parse(gloss)
    if (Array.isArray(parsed)) return parsed.filter((g): g is string => typeof g === 'string' && g.length > 0)
  } catch { /* fall through */ }
  return gloss ? [gloss] : []
}

function splitSpace(s: string | null): string[] {
  if (!s) return []
  return s.split(' ').filter(Boolean)
}

function PosTag({ code }: { code: string }) {
  const label = JMDICT_ENTITIES[code] ?? code
  return (
    <span className="rounded bg-slate-700 px-1.5 py-0.5 text-xs text-slate-400" title={label}>
      {code}
    </span>
  )
}

interface Props {
  result: SearchResult | Bookmark
  primaryLang?: string
  isBookmarked?: boolean
  onToggleBookmark?: (result: SearchResult | Bookmark) => void
  tags?: string[]
}

export default function EntryCard({ result, primaryLang, isBookmarked, onToggleBookmark, tags }: Props) {
  const writings = [...splitSpace(result.writingsPrio), ...splitSpace(result.writings)]
  const readings = [...splitSpace(result.readingsPrio), ...splitSpace(result.readings)]
  const posArray = parsePosArray(result.pos)
  const glosses = parseGlossArray(result.gloss)

  const hasWritings = writings.length > 0
  const primaryForm = hasWritings ? writings[0] : (readings[0] ?? '')
  const secondaryForms = hasWritings ? readings : readings.slice(1)
  const extraForms = hasWritings ? writings.slice(1) : []
  const isBackup = primaryLang !== undefined && result.lang !== primaryLang

  const effectiveTags = tags ?? ('tags' in result && Array.isArray((result as Bookmark).tags) ? (result as Bookmark).tags : [])

  return (
    <div className={`border-b border-slate-700 px-4 py-3 last:border-0${isBackup ? ' opacity-70' : ''}`}>
      {/* Headword row with bookmark star */}
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="ja text-xl font-medium text-slate-100">{primaryForm}</span>
          {secondaryForms.slice(0, 3).map((r, i) => (
            <span key={i} className="ja text-sm text-slate-400">{r}</span>
          ))}
          {extraForms.slice(0, 2).map((w, i) => (
            <span key={i} className="ja text-sm text-slate-500">{w}</span>
          ))}
        </div>
        {onToggleBookmark && (
          <button
            onClick={() => onToggleBookmark(result)}
            className={`mt-0.5 flex-shrink-0 text-lg leading-none transition-colors ${isBookmarked ? 'text-amber-400' : 'text-slate-600 hover:text-slate-400'}`}
            aria-label={isBookmarked ? 'Remove bookmark' : 'Add bookmark'}
          >
            {isBookmarked ? '★' : '☆'}
          </button>
        )}
      </div>

      {/* POS tags + backup language badge */}
      {(posArray.length > 0 || isBackup) && (
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {posArray.map((code, i) => <PosTag key={i} code={code} />)}
          {isBackup && (
            <span className="rounded bg-slate-700 px-1.5 py-0.5 text-xs text-slate-500">
              {result.lang}
            </span>
          )}
        </div>
      )}

      {/* Glosses */}
      {glosses.length > 0 && (
        <ol className="mt-1 list-inside list-decimal space-y-0.5">
          {glosses.map((g, i) => (
            <li key={i} className={`text-sm ${isBackup ? 'text-slate-400' : 'text-slate-300'}`}>{g}</li>
          ))}
        </ol>
      )}

      {/* Tags */}
      {effectiveTags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {effectiveTags.map((tag, i) => (
            <span key={i} className="rounded-full bg-indigo-900 px-2 py-0.5 text-xs text-indigo-300">
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
