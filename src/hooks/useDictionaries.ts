import { useEffect, useReducer, useCallback } from 'react'
import { fetchCatalogue } from '../db/catalogue'
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
  catalogue: DictMeta[]
  installed: Record<string, InstalledDict>
  progress: Record<string, DownloadProgress>
  loading: boolean
}

type Action =
  | { type: 'LOADED'; catalogue: DictMeta[]; installed: InstalledDict[] }
  | { type: 'PROGRESS'; progress: DownloadProgress }
  | { type: 'INSTALLED'; dict: InstalledDict }
  | { type: 'REMOVED'; filename: string }

function reducer(state: DictState, action: Action): DictState {
  switch (action.type) {
    case 'LOADED':
      return {
        ...state,
        loading: false,
        catalogue: action.catalogue,
        installed: Object.fromEntries(action.installed.map((d) => [d.filename, d])),
      }
    case 'PROGRESS': {
      const progress = { ...state.progress, [action.progress.key]: action.progress }
      if (action.progress.phase === 'done' || action.progress.phase === 'error') {
        const clean = { ...progress }
        if (action.progress.phase === 'done') delete clean[action.progress.key]
        return { ...state, progress: clean }
      }
      return { ...state, progress }
    }
    case 'INSTALLED':
      return { ...state, installed: { ...state.installed, [action.dict.filename]: action.dict } }
    case 'REMOVED': {
      const installed = { ...state.installed }
      delete installed[action.filename]
      return { ...state, installed }
    }
  }
}

export function useDictionaries() {
  const [state, dispatch] = useReducer(reducer, {
    catalogue: [],
    installed: {},
    progress: {},
    loading: true,
  })

  // Load the release manifest and installed dicts from IndexedDB on mount
  useEffect(() => {
    Promise.all([fetchCatalogue(), getInstalledDicts()]).then(([catalogue, installed]) =>
      dispatch({ type: 'LOADED', catalogue, installed }),
    )
  }, [])

  const install = useCallback(async (meta: DictMeta) => {
    const db = DbService.get()
    const onProgress = (p: DownloadProgress) => dispatch({ type: 'PROGRESS', progress: p })

    try {
      // Download + verify + decompress
      const data = await downloadAndDecompress(meta.uri, meta.filename, onProgress, meta.sha256)

      // Write to OPFS via worker
      onProgress({ key: meta.filename, phase: 'writing', downloadedBytes: data.byteLength, totalBytes: data.byteLength })
      await db.writeFile(meta.filename, data)

      // Record in IndexedDB
      const record: InstalledDict = { ...meta, installedAt: Date.now() }
      await saveInstalledDict(record)
      dispatch({ type: 'INSTALLED', dict: record })
      window.dispatchEvent(new CustomEvent('sumatora:dicts-changed'))
      onProgress({ key: meta.filename, phase: 'done', downloadedBytes: data.byteLength, totalBytes: data.byteLength })
    } catch (err) {
      onProgress({
        key: meta.filename,
        phase: 'error',
        downloadedBytes: 0,
        totalBytes: -1,
        error: String(err),
      })
    }
  }, [])

  const uninstall = useCallback(async (filename: string) => {
    const existing = await getInstalledDict(filename)
    if (!existing) return
    const db = DbService.get()
    try {
      await db.deleteFile(filename)
    } catch {
      // File might already be gone; proceed
    }
    await removeInstalledDict(filename)
    dispatch({ type: 'REMOVED', filename })
    window.dispatchEvent(new CustomEvent('sumatora:dicts-changed'))
  }, [])

  return { ...state, install, uninstall }
}
