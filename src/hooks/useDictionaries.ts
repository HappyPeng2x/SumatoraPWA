import { useEffect, useReducer, useCallback } from 'react'
import { CATALOGUE } from '../db/catalogue'
import { DbService } from '../db/DbService'
import {
  getInstalledDicts,
  getInstalledDict,
  saveInstalledDict,
  removeInstalledDict,
} from '../db/DictionaryStore'
import { downloadAndDecompress } from '../db/downloader'
import type { InstalledDict, DownloadProgress, DictMeta } from '../db/types'

export interface DictState {
  installed: Record<string, InstalledDict>
  progress: Record<string, DownloadProgress>
  loading: boolean
}

type Action =
  | { type: 'LOADED'; installed: InstalledDict[] }
  | { type: 'PROGRESS'; progress: DownloadProgress }
  | { type: 'INSTALLED'; dict: InstalledDict }
  | { type: 'REMOVED'; lang: string }

function reducer(state: DictState, action: Action): DictState {
  switch (action.type) {
    case 'LOADED':
      return {
        ...state,
        loading: false,
        installed: Object.fromEntries(action.installed.map((d) => [d.lang, d])),
      }
    case 'PROGRESS': {
      const progress = { ...state.progress, [action.progress.lang]: action.progress }
      if (action.progress.phase === 'done' || action.progress.phase === 'error') {
        const clean = { ...progress }
        if (action.progress.phase === 'done') delete clean[action.progress.lang]
        return { ...state, progress: clean }
      }
      return { ...state, progress }
    }
    case 'INSTALLED':
      return { ...state, installed: { ...state.installed, [action.dict.lang]: action.dict } }
    case 'REMOVED': {
      const installed = { ...state.installed }
      delete installed[action.lang]
      return { ...state, installed }
    }
  }
}

export function useDictionaries() {
  const [state, dispatch] = useReducer(reducer, {
    installed: {},
    progress: {},
    loading: true,
  })

  // Load installed dicts from IndexedDB on mount
  useEffect(() => {
    getInstalledDicts().then((dicts) => dispatch({ type: 'LOADED', installed: dicts }))
  }, [])

  const install = useCallback(async (meta: DictMeta) => {
    const db = DbService.get()
    const onProgress = (p: DownloadProgress) => dispatch({ type: 'PROGRESS', progress: p })

    try {
      // Download + decompress
      const data = await downloadAndDecompress(meta.uri, meta.lang, onProgress)

      // Write to OPFS via worker
      onProgress({ lang: meta.lang, phase: 'writing', downloadedBytes: data.byteLength, totalBytes: data.byteLength })
      const filename = `${meta.lang}.db`
      await db.writeFile(filename, data)

      // Record in IndexedDB
      const record: InstalledDict = { ...meta, installedAt: Date.now() }
      await saveInstalledDict(record)
      dispatch({ type: 'INSTALLED', dict: record })
      window.dispatchEvent(new CustomEvent('sumatora:dicts-changed'))
      onProgress({ lang: meta.lang, phase: 'done', downloadedBytes: data.byteLength, totalBytes: data.byteLength })
    } catch (err) {
      onProgress({
        lang: meta.lang,
        phase: 'error',
        downloadedBytes: 0,
        totalBytes: -1,
        error: String(err),
      })
    }
  }, [])

  const uninstall = useCallback(async (lang: string) => {
    const existing = await getInstalledDict(lang)
    if (!existing) return
    const db = DbService.get()
    try {
      await db.deleteFile(`${lang}.db`)
    } catch {
      // File might already be gone; proceed
    }
    await removeInstalledDict(lang)
    dispatch({ type: 'REMOVED', lang })
    window.dispatchEvent(new CustomEvent('sumatora:dicts-changed'))
  }, [])

  return { ...state, catalogue: CATALOGUE, install, uninstall }
}
