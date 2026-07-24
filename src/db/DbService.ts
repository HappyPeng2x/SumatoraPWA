import type { ToWorker, FromWorker, QueryRow, SqlValue, EntrySummary, EntryDetail, KanjiInfo, PackSource } from './types'

type PendingCall = {
  resolve: (v: unknown) => void
  reject: (e: Error) => void
}

let instance: DbService | null = null

export class DbService {
  private worker: Worker
  private pending = new Map<string, PendingCall>()
  private seq = 0

  private constructor() {
    this.worker = new Worker(
      new URL('./sqlite.worker.ts', import.meta.url),
      { type: 'module' },
    )
    this.worker.onmessage = (e: MessageEvent<FromWorker>) => {
      const msg = e.data
      const call = this.pending.get(msg.id)
      if (!call) return
      this.pending.delete(msg.id)
      if (msg.ok) {
        call.resolve(msg.result)
      } else {
        call.reject(new Error(msg.error))
      }
    }
    this.worker.onerror = (e) => {
      console.error('[DbService] worker error', e)
    }
  }

  static get(): DbService {
    if (!instance) instance = new DbService()
    return instance
  }

  private send(msg: ToWorker, transfer?: Transferable[]): Promise<unknown> {
    return new Promise((resolve, reject) => {
      this.pending.set(msg.id, { resolve, reject })
      if (transfer?.length) {
        this.worker.postMessage(msg, transfer)
      } else {
        this.worker.postMessage(msg)
      }
    })
  }

  private nextId() {
    return String(++this.seq)
  }

  ping() {
    return this.send({ id: this.nextId(), type: 'ping' }) as Promise<{ vfsList: string[] }>
  }

  hasFile(filename: string) {
    return this.send({ id: this.nextId(), type: 'hasFile', payload: { filename } }) as Promise<boolean>
  }

  /** Transfers the ArrayBuffer to the worker (zero-copy). Do not use `data` after calling this. */
  writeFile(filename: string, data: ArrayBuffer) {
    return this.send(
      { id: this.nextId(), type: 'writeFile', payload: { filename, data } },
      [data],
    ) as Promise<{ filename: string; bytes: number }>
  }

  deleteFile(filename: string) {
    return this.send({ id: this.nextId(), type: 'deleteFile', payload: { filename } }) as Promise<boolean>
  }

  open(filename: string) {
    return this.send({ id: this.nextId(), type: 'open', payload: { filename } }) as Promise<{ filename: string }>
  }

  attach(alias: string, filename: string) {
    return this.send({ id: this.nextId(), type: 'attach', payload: { alias, filename } }) as Promise<unknown>
  }

  detach(alias: string) {
    return this.send({ id: this.nextId(), type: 'detach', payload: { alias } }) as Promise<boolean>
  }

  query(sql: string, params?: SqlValue[]) {
    return this.send({ id: this.nextId(), type: 'query', payload: { sql, params } }) as Promise<QueryRow[]>
  }

  close() {
    return this.send({ id: this.nextId(), type: 'close' }) as Promise<boolean>
  }

  initDb(opts: { lang: string; backupLang?: string; core: PackSource; gloss: PackSource; backupGloss?: PackSource; kanji?: PackSource }) {
    return this.send({ id: this.nextId(), type: 'initDb', payload: opts }) as Promise<{ lang: string; backupLang: string | null }>
  }

  search(term: string, limit?: number) {
    return this.send({ id: this.nextId(), type: 'search', payload: { term, limit } }) as Promise<EntrySummary[]>
  }

  entryDetail(seq: number) {
    return this.send({ id: this.nextId(), type: 'entryDetail', payload: { seq } }) as Promise<EntryDetail>
  }

  /** Fetches the same EntrySummary shape a search result uses, for bookmarking a specific seq (e.g. from the detail view). */
  entrySummary(seq: number) {
    return this.send({ id: this.nextId(), type: 'entrySummary', payload: { seq } }) as Promise<EntrySummary>
  }

  /** null when the kanji pack isn't installed/attached, or the character isn't in KANJIDIC2. */
  kanjiInfo(character: string) {
    return this.send({ id: this.nextId(), type: 'kanjiInfo', payload: { character } }) as Promise<KanjiInfo | null>
  }
}
