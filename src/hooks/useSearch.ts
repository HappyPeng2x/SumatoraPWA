import { useState, useEffect, useRef, useCallback } from 'react'
import type { EntrySummary } from '../db/types'
import { DbService } from '../db/DbService'
import { getCachedSearch, saveCachedSearch } from '../db/DictionaryStore'

const SEARCH_DEBOUNCE_MS = 100
// Matches how many result cards fit on screen without scrolling -- fetching
// more up front is wasted work regardless of how fast the query is.
const ONLINE_PAGE_SIZE = 12
const LOCAL_LIMIT = 30
const MAX_ONLINE_RESULTS = 54
const JAPANESE_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u

interface SearchContext {
  ready: boolean
  isRemote: boolean
  releaseVersion: number
  lang: string
  backupLang: string | null
}

function persistentKey(term: string, limit: number, context: SearchContext): string {
  return [
    context.releaseVersion,
    context.lang,
    context.backupLang ?? '',
    limit,
    term,
  ].join('\0')
}

function reportTiming(detail: Record<string, unknown>): void {
  window.dispatchEvent(new CustomEvent('sumatora:search-performance', { detail }))
  console.debug('[search performance]', detail)
}

export function useSearch(term: string, context: SearchContext) {
  const [results, setResults] = useState<EntrySummary[]>([])
  const [loading, setLoading] = useState(false)
  const [refining, setRefining] = useState(false)
  const [onlineLimit, setOnlineLimit] = useState(ONLINE_PAGE_SIZE)
  const generationRef = useRef(0)

  useEffect(() => {
    setOnlineLimit(ONLINE_PAGE_SIZE)
  }, [term])

  const limit = context.isRemote ? onlineLimit : LOCAL_LIMIT

  useEffect(() => {
    const trimmed = term.trim()
    if (!context.ready || !trimmed) {
      setResults([])
      setLoading(false)
      setRefining(false)
      return
    }

    const generation = ++generationRef.current
    setLoading(true)
    setRefining(false)

    const timer = setTimeout(async () => {
      const started = performance.now()
      const cacheKey = persistentKey(trimmed, limit, context)
      let displayedForward = false
      try {
        if (context.isRemote && context.releaseVersion > 0) {
          const cached = await getCachedSearch(cacheKey)
          if (cached && generationRef.current === generation) {
            setResults(cached)
            setLoading(false)
            reportTiming({
              term: trimmed, limit, source: 'persistent-cache',
              firstResultMs: performance.now() - started,
              resultCount: cached.length,
            })
            return
          }
        }

        if (context.isRemote) {
          const forward = await DbService.get().search(trimmed, limit, 'forward')
          if (generationRef.current !== generation) return

          displayedForward = forward.length > 0
          if (displayedForward) {
            setResults(forward)
            setLoading(false)
          }
          reportTiming({
            term: trimmed, limit, source: 'remote-forward',
            firstResultMs: performance.now() - started,
            resultCount: forward.length,
          })

          // Japanese queries have no useful translation-tier matches. A full
          // forward page also leaves no room for a slower reverse tier.
          if (JAPANESE_RE.test(trimmed) || forward.length >= limit) {
            if (context.releaseVersion > 0) {
              void saveCachedSearch(cacheKey, forward).catch(() => {})
            }
            return
          }

          setRefining(true)
          const complete = await DbService.get().search(trimmed, limit, 'all')
          if (generationRef.current !== generation) return
          setResults(complete)
          setRefining(false)
          if (context.releaseVersion > 0) {
            void saveCachedSearch(cacheKey, complete).catch(() => {})
          }
          reportTiming({
            term: trimmed, limit, source: 'remote-complete',
            totalMs: performance.now() - started,
            resultCount: complete.length,
          })
          return
        }

        const local = await DbService.get().search(trimmed, limit, 'all')
        if (generationRef.current === generation) {
          setResults(local)
          reportTiming({
            term: trimmed, limit, source: 'local',
            firstResultMs: performance.now() - started,
            resultCount: local.length,
          })
        }
      } catch {
        if (generationRef.current === generation && !displayedForward) setResults([])
      } finally {
        if (generationRef.current === generation) {
          setLoading(false)
          setRefining(false)
        }
      }
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      generationRef.current++
      clearTimeout(timer)
      setLoading(false)
      setRefining(false)
    }
  }, [
    term, context.ready, context.isRemote, context.releaseVersion,
    context.lang, context.backupLang, limit,
  ])

  const loadMore = useCallback(() => {
    setOnlineLimit((current) => Math.min(current + ONLINE_PAGE_SIZE, MAX_ONLINE_RESULTS))
  }, [])

  return {
    results,
    loading,
    refining,
    loadMore,
    canLoadMore: context.isRemote && results.length >= limit && limit < MAX_ONLINE_RESULTS,
  }
}
