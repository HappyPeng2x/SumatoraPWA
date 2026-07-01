import { useState, useRef, useEffect } from 'react'

interface Props {
  tags: string[]
  onSave: (tags: string[]) => void
  onCancel: () => void
}

export default function TagEditor({ tags, onSave, onCancel }: Props) {
  const [current, setCurrent] = useState<string[]>(tags)
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  function addTag() {
    const trimmed = input.trim().replace(/\s+/g, '-')
    if (trimmed && !current.includes(trimmed)) {
      setCurrent(prev => [...prev, trimmed])
    }
    setInput('')
  }

  function removeTag(tag: string) {
    setCurrent(prev => prev.filter(t => t !== tag))
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTag()
    } else if (e.key === 'Backspace' && !input && current.length > 0) {
      setCurrent(prev => prev.slice(0, -1))
    } else if (e.key === 'Escape') {
      onCancel()
    }
  }

  return (
    <div className="mt-2 rounded-lg border border-indigo-700 bg-slate-800 p-2">
      <div className="mb-2 flex flex-wrap gap-1">
        {current.map(tag => (
          <span key={tag} className="flex items-center gap-1 rounded-full bg-indigo-900 px-2 py-0.5 text-xs text-indigo-300">
            {tag}
            <button
              onClick={() => removeTag(tag)}
              className="text-indigo-400 hover:text-white"
              aria-label={`Remove ${tag}`}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <input
        ref={inputRef}
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => { if (input.trim()) addTag() }}
        placeholder="Add tag, press Enter…"
        className="w-full rounded bg-slate-700 px-2 py-1.5 text-sm text-slate-100 placeholder-slate-500 outline-none focus:ring-1 focus:ring-indigo-500"
      />
      <div className="mt-2 flex justify-end gap-2">
        <button onClick={onCancel} className="px-3 py-1 text-xs text-slate-400 hover:text-slate-200">
          Cancel
        </button>
        <button
          onClick={() => onSave(current)}
          className="rounded bg-indigo-600 px-3 py-1 text-xs text-white hover:bg-indigo-500"
        >
          Save
        </button>
      </div>
    </div>
  )
}
