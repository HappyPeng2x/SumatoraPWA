import type { EntrySummary, Tag } from '../db/types'
import { tagChipClasses } from '../db/tagColors'
import FuriganaText from './FuriganaText'

export function TagChip({ tag }: { tag: Tag }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${tagChipClasses(tag.category)}`} title={tag.label}>
      {tag.code}
    </span>
  )
}

interface Props {
  entry: EntrySummary
  isBookmarked?: boolean
  onToggleBookmark?: (entry: EntrySummary) => void
  onOpenDetail?: (seq: number) => void
  onKanjiClick?: (char: string) => void
  tags?: string[]
}

export default function EntryCard({ entry, isBookmarked, onToggleBookmark, onOpenDetail, onKanjiClick, tags }: Props) {
  const { primaryForm, alternateWritings, alternateReadings, senseGroups } = entry

  return (
    <div className="border-b border-slate-700 px-4 py-3 last:border-0">
      {/* Headword row with bookmark star */}
      <div className="flex items-start gap-2">
        {/* Not a <button>: kanji characters inside are independently clickable
            (opens the kanji popup), which HTML disallows nesting inside a real button. */}
        <div
          onClick={onOpenDetail ? () => onOpenDetail(entry.seq) : undefined}
          onKeyDown={onOpenDetail ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenDetail(entry.seq) } } : undefined}
          role={onOpenDetail ? 'button' : undefined}
          tabIndex={onOpenDetail ? 0 : undefined}
          className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5 text-left"
        >
          <FuriganaText
            text={primaryForm.text}
            segments={primaryForm.furigana}
            className="ja text-xl font-medium text-slate-100"
            onKanjiClick={onKanjiClick}
          />
          {alternateWritings.slice(0, 3).map((w, i) => (
            <FuriganaText key={i} text={w.text} segments={w.furigana} className="ja text-sm text-slate-500" onKanjiClick={onKanjiClick} />
          ))}
          {alternateReadings.slice(0, 3).map((r, i) => (
            <span key={i} className="ja text-sm text-slate-400">{r}</span>
          ))}
        </div>
        {onToggleBookmark && (
          <button
            onClick={() => onToggleBookmark(entry)}
            className={`mt-0.5 flex-shrink-0 text-lg leading-none transition-colors ${isBookmarked ? 'text-amber-400' : 'text-slate-600 hover:text-slate-400'}`}
            aria-label={isBookmarked ? 'Remove bookmark' : 'Add bookmark'}
          >
            {isBookmarked ? '★' : '☆'}
          </button>
        )}
      </div>

      {/* Sense groups: tag chips + globally-numbered glosses, dimmed when a group fell back to a backup language */}
      {senseGroups.map((group, gi) => (
        <div key={gi} className="mt-1">
          {group.tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              {group.tags.map((t, i) => <TagChip key={i} tag={t} />)}
            </div>
          )}
          {group.glosses.length > 0 && (
            <ol
              start={group.glosses[0].displayNumber}
              className="mt-0.5 list-inside list-decimal space-y-0.5"
            >
              {group.glosses.map((g) => (
                <li key={g.displayNumber} className={`text-sm ${group.usedBackupLang ? 'text-slate-400' : 'text-slate-300'}`}>
                  {g.text}
                </li>
              ))}
            </ol>
          )}
        </div>
      ))}

      {/* User tags (bookmarks only) */}
      {tags && tags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {tags.map((tag, i) => (
            <span key={i} className="rounded-full bg-accent-900 px-2 py-0.5 text-xs text-accent-300">
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
