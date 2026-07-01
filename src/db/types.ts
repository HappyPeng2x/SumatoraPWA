export type SqlValue = string | number | null
export type QueryRow = Record<string, SqlValue>

export interface SearchResult {
  seq: number
  readingsPrio: string | null
  readings: string | null
  writingsPrio: string | null
  writings: string | null
  pos: string | null
  gloss: string | null
  lang: string
}

// Messages sent from main thread to the SQLite worker
export type ToWorker =
  | { id: string; type: 'ping' }
  | { id: string; type: 'hasFile'; payload: { filename: string } }
  | { id: string; type: 'writeFile'; payload: { filename: string; data: ArrayBuffer } }
  | { id: string; type: 'deleteFile'; payload: { filename: string } }
  | { id: string; type: 'open'; payload: { filename: string } }
  | { id: string; type: 'attach'; payload: { alias: string; filename: string } }
  | { id: string; type: 'detach'; payload: { alias: string } }
  | { id: string; type: 'query'; payload: { sql: string; params?: SqlValue[] } }
  | { id: string; type: 'close' }
  | { id: string; type: 'initDb'; payload: { lang: string; backupLang?: string } }
  | { id: string; type: 'search'; payload: { term: string; limit?: number } }

// Messages sent from worker back to main thread
export type FromWorker =
  | { id: string; ok: true; result: unknown }
  | { id: string; ok: false; error: string }

export interface DictMeta {
  lang: string               // 'jmdict', 'eng', 'ger', …
  type: 'main' | 'translation'
  description: string
  uri: string                // full .db.gz URL
  version: number
  date: number
}

export interface InstalledDict extends DictMeta {
  installedAt: number        // Date.now()
}

export interface Bookmark {
  seq: number
  addedAt: number
  tags: string[]
  readingsPrio: string | null
  readings: string | null
  writingsPrio: string | null
  writings: string | null
  pos: string | null
  gloss: string | null
  lang: string
}

export interface DownloadProgress {
  lang: string
  phase: 'downloading' | 'decompressing' | 'writing' | 'done' | 'error'
  downloadedBytes: number
  totalBytes: number         // -1 if unknown
  error?: string
}
