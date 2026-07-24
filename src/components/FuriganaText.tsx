import { Fragment } from 'react'
import type { FuriganaSegment } from '../db/types'

const CJK_RE = /[一-鿿㐀-䶿]/

// Segments are usually one kanji character each, so this picks the right
// target for the common case; a rare multi-kanji segment sharing one ruby
// resolves to its first character only — a known, minor simplification.
function firstKanji(text: string): string | null {
  for (const ch of text) {
    if (CJK_RE.test(ch)) return ch
  }
  return null
}

function Clickable({ text, onClick }: { text: string; onClick: () => void }) {
  // Kanji spans are often nested inside a larger clickable area (e.g. a
  // search result's "open detail" button) — stop propagation so tapping a
  // character opens the kanji popup instead of also triggering the parent.
  return (
    <span
      onClick={(e) => { e.stopPropagation(); onClick() }}
      className="cursor-pointer hover:text-indigo-300"
      role="button"
      tabIndex={0}
    >
      {text}
    </span>
  )
}

interface Props {
  text: string
  segments: FuriganaSegment[] | null
  className?: string
  onKanjiClick?: (char: string) => void
}

/** Renders FormFuriganaSegment rows as native <ruby>/<rt> — falls back to plain text when there's nothing to annotate. */
export default function FuriganaText({ text, segments, className, onKanjiClick }: Props) {
  if (!segments) {
    const kanji = onKanjiClick ? firstKanji(text) : null
    return (
      <span className={className}>
        {kanji ? <Clickable text={text} onClick={() => onKanjiClick!(kanji)} /> : text}
      </span>
    )
  }
  return (
    <ruby className={className}>
      {segments.map((s, i) => {
        const kanji = onKanjiClick ? firstKanji(s.base) : null
        return (
          <Fragment key={i}>
            {kanji ? <Clickable text={s.base} onClick={() => onKanjiClick!(kanji)} /> : s.base}
            {s.ruby && <rt>{s.ruby}</rt>}
          </Fragment>
        )
      })}
    </ruby>
  )
}
