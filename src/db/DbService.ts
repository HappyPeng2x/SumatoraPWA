import type { ToWorker, FromWorker, QueryRow, SqlValue, EntrySummary, EntryDetail, KanjiInfo, PackSource } from './types'

type PendingCall = {
  resolve: (v: unknown) => void
  reject: (e: Error) => void
}

let instance: DbService | null = null

export class DbService {
  private worker!: Worker
  private pending = new Map<string, PendingCall>()
  private seq = 0
  private searchRunning = false
  private queuedSearch: {
    term: string
    limit?: number
    scope: 'forward' | 'all'
    resolve: (results: EntrySummary[]) => void
    reject: (error: Error) => void
  } | null = null
  private lastInitDb: {
    lang: string
    backupLang?: string
    core: PackSource
    gloss: PackSource
    webSearch?: PackSource
    webGloss?: PackSource
    backupGloss?: PackSource
    backupWebGloss?: PackSource
    kanji?: PackSource
  } | null = null

  // Compiled once, shared across worker restarts via structured clone (the
  // browser internally shares compiled code between clones — effectively
  // zero-cost). Only compiled; instantiation still happens per worker.
  private static wasmModule: WebAssembly.Module | null = null

  private static async getWasmModule(): Promise<WebAssembly.Module> {
    if (DbService.wasmModule) return DbService.wasmModule
    const response = await fetch('/sqlite3.wasm')
    if (!response.ok) throw new Error(`Failed to fetch sqlite3.wasm: ${response.status}`)
    DbService.wasmModule = await WebAssembly.compile(await response.arrayBuffer())
    return DbService.wasmModule
  }

  private constructor() {
    void this.createWorker()
  }

  static get(): DbService {
    if (!instance) instance = new DbService()
    return instance
  }

  // Creates a fresh worker and sends it the compiled WASM module as the first
  // message. Returns when the worker has initialized (WASM ready, VFS set up).
  private async createWorker(): Promise<void> {
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

    // Send the pre-compiled WASM module via structured clone. Not transferred
    // (ownership retained) — the browser shares compiled code between clones.
    const module = await DbService.getWasmModule()
    this.worker.postMessage({ id: 'wasm', type: 'initWasm', wasmModule: module } satisfies ToWorker)
  }

  // Terminates the current worker (killing any in-flight synchronous XHRs in
  // the HTTP VFS), creates a fresh one, and replays initDb so subsequent
  // messages can execute immediately. All pending promises are rejected.
  //
  // Creates the new worker before terminating the old one: the old worker's
  // thread stays blocked on XHR while the main thread sets up the replacement
  // in parallel. If creation fails, the old worker is kept and the error
  // propagates — callers should resolve/reject the queued search so the UI
  // never hangs.
  private async restartWorker(): Promise<void> {
    // Reject every pending call — the old worker will never respond for these.
    for (const [, call] of this.pending) {
      call.reject(new Error('Worker restarted'))
    }
    this.pending.clear()

    const oldWorker = this.worker
    try {
      await this.createWorker()
    } catch (err) {
      // createWorker failed — reinstate the old worker's pending map so
      // in-flight calls (if any are still alive) can still resolve. The old
      // worker is still running — it just had its pending calls cleared above.
      console.error('[DbService] worker restart failed, keeping old worker:', err)
      throw err
    }

    // New worker is ready — safe to kill the old one (and its XHRs).
    oldWorker.terminate()

    // Replay the last initDb so the new worker has the same packs attached.
    if (this.lastInitDb) {
      await this.send({
        id: this.nextId(),
        type: 'initDb',
        payload: this.lastInitDb,
      })
    }
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

  initDb(opts: {
    lang: string
    backupLang?: string
    core: PackSource
    gloss: PackSource
    webSearch?: PackSource
    webGloss?: PackSource
    backupGloss?: PackSource
    backupWebGloss?: PackSource
    kanji?: PackSource
  }) {
    this.lastInitDb = opts
    return this.send({ id: this.nextId(), type: 'initDb', payload: opts }) as Promise<{ lang: string; backupLang: string | null }>
  }

  // Enqueues a search, resolving the previous queued search with [] if the
  // user has typed again before the current one finished. When a search is
  // already running in the worker, the worker is terminated and restarted so
  // the new term can start immediately instead of waiting for the old query
  // (which may be blocked on synchronous HTTP VFS reads).
  search(term: string, limit?: number, scope: 'forward' | 'all' = 'all') {
    return new Promise<EntrySummary[]>((resolve, reject) => {
      // Discard any already-obsolete queued search.
      if (this.queuedSearch) this.queuedSearch.resolve([])
      this.queuedSearch = { term, limit, scope, resolve, reject }

      if (this.searchRunning) {
        // Kill the in-flight search by restarting the worker, then drain.
        this.searchRunning = false
        void this.restartWorker().then(() => {
          void this.drainSearchQueue()
        }).catch((err) => {
          console.error('[DbService] restart failed, rejecting queued search:', err)
          if (this.queuedSearch) {
            this.queuedSearch.reject(err instanceof Error ? err : new Error(String(err)))
            this.queuedSearch = null
          }
        })
      } else {
        void this.drainSearchQueue()
      }
    })
  }

  private async drainSearchQueue(): Promise<void> {
    if (this.searchRunning) return
    this.searchRunning = true
    try {
      while (this.queuedSearch) {
        const next = this.queuedSearch
        this.queuedSearch = null
        try {
          const results = await this.send({
            id: this.nextId(), type: 'search',
            payload: { term: next.term, limit: next.limit, scope: next.scope },
          }) as EntrySummary[]
          next.resolve(results)
        } catch (error) {
          next.reject(error instanceof Error ? error : new Error(String(error)))
        }
      }
    } finally {
      this.searchRunning = false
      // A request may have arrived between the final loop check and clearing
      // searchRunning.
      if (this.queuedSearch) void this.drainSearchQueue()
    }
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
