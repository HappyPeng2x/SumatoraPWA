import type { ToWorker, FromWorker, QueryRow, SqlValue } from './types'

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
}
