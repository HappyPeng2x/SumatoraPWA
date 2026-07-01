import { useState, useEffect, useRef } from 'react'
import type { SearchResult } from '../db/types'
import { DbService } from '../db/DbService'

export function useSearch(term: string, ready: boolean) {
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const abortRef = useRef(false)

  useEffect(() => {
    const trimmed = term.trim()
    if (!ready || !trimmed) {
      setResults([])
      setLoading(false)
      return
    }

    abortRef.current = false
    setLoading(true)

    const timer = setTimeout(async () => {
      try {
        const r = await DbService.get().search(trimmed)
        if (!abortRef.current) setResults(r)
      } catch {
        if (!abortRef.current) setResults([])
      } finally {
        if (!abortRef.current) setLoading(false)
      }
    }, 250)

    return () => {
      abortRef.current = true
      clearTimeout(timer)
      setLoading(false)
    }
  }, [term, ready])

  return { results, loading }
}
