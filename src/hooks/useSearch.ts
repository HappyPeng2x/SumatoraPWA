import { useState, useEffect, useRef } from 'react'
import type { EntrySummary } from '../db/types'
import { DbService } from '../db/DbService'

// Latest-search-wins coalescing in DbService prevents rapid input from
// building a remote-query backlog, so this can stay short and responsive.
const SEARCH_DEBOUNCE_MS = 100

export function useSearch(term: string, ready: boolean) {
  const [results, setResults] = useState<EntrySummary[]>([])
  const [loading, setLoading] = useState(false)
  const generationRef = useRef(0)

  useEffect(() => {
    const trimmed = term.trim()
    if (!ready || !trimmed) {
      setResults([])
      setLoading(false)
      return
    }

    const generation = ++generationRef.current
    setLoading(true)

    const timer = setTimeout(async () => {
      try {
        const r = await DbService.get().search(trimmed)
        if (generationRef.current === generation) setResults(r)
      } catch {
        if (generationRef.current === generation) setResults([])
      } finally {
        if (generationRef.current === generation) setLoading(false)
      }
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      generationRef.current++
      clearTimeout(timer)
      setLoading(false)
    }
  }, [term, ready])

  return { results, loading }
}
