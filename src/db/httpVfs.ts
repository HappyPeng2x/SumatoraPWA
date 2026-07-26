/**
 * Read-only SQLite VFS that serves pages via HTTP Range requests, so a
 * remote .db file can be queried without downloading it. See
 * ui-parity-and-remote-search-plan.md ("Phase E").
 *
 * Adapted from mmomtchev/sqlite-wasm-http's installSyncHttpVfs
 * (src/vfs-sync-http.ts): https://github.com/mmomtchev/sqlite-wasm-http
 *
 * That library bundles its own copy of the official SQLite WASM build and
 * exposes this only via its own worker-thread API. This is a direct port of
 * its core VFS algorithm (page-aligned Range reads, LRU page cache with
 * super-page merging) adapted to register onto the sqlite3 instance
 * sqlite.worker.ts already initializes via @sqlite.org/sqlite-wasm (the same
 * official distribution) — so no second WASM copy is needed, and local
 * OPFS-attached packs and remote HTTP-attached packs can share one db
 * connection. The upstream method this calls was renamed between SQLite WASM
 * releases (setVfsPostOpenSql -> setVfsPostOpenCallback); everything else is
 * the same algorithm, just re-typed against this project's conventions
 * instead of @sqlite.org/sqlite-wasm's (undocumented, untyped) internals.
 *
 * ISC License — Copyright (c) 2023-2024 Momtchil Momtchev <momtchil@momtchev.com>
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 */
import { LRUCache } from 'lru-cache'
import type { Sqlite3Static } from '@sqlite.org/sqlite-wasm'

export interface HttpVfsOptions {
  timeout?: number              // ms, sqlite3_busy_timeout (default 20000)
  maxPageSize?: number          // reject files whose page size exceeds this (default 65536)
  maxMergeBytes?: number        // cap on one super-page fetch (default 256KB — see below)
  cacheSize?: number            // max cached bytes per open file (default 4MB)
  headers?: Record<string, string>
}

const DEFAULTS: Required<HttpVfsOptions> = {
  timeout: 20000,
  maxPageSize: 65536,
  maxMergeBytes: 256 * 1024,
  // The dedicated web-search pack is ~24 MB. Keeping most of its hot FTS
  // pages resident makes incremental prefixes and backspacing effectively
  // local while staying well below the memory cost of the old core pack.
  cacheSize: 16 * 1024 * 1024,
  headers: {},
}

type FileHandle = symbol

interface OpenFile {
  url: string
  size: bigint
  pageSize: number
  // Cache values are either the page bytes themselves, or (when part of a
  // merged multi-page "super-page" download) the page number holding the
  // shared Uint8Array — mirrors the upstream cache-merging algorithm.
  cache: LRUCache<number, Uint8Array | number>
}

// None of this low-level surface is in @sqlite.org/sqlite-wasm's public
// .d.ts (same situation as the sqlite3_js_posix_create_file cast already
// used elsewhere in sqlite.worker.ts) — minimal ad-hoc typings only.
interface VfsStruct {
  pointer: number
  $iVersion: number
  $szOsFile: number
  $mxPathname: number
  $zName: number
  $xDlOpen: null; $xDlError: null; $xDlSym: null; $xDlClose: null
}
interface IoMethodsStruct { pointer: number }
interface Capi {
  sqlite3_vfs: new () => VfsStruct
  sqlite3_file: (new (fid: FileHandle) => { $pMethods: number }) & { structInfo: { sizeof: number } }
  sqlite3_io_methods: new () => IoMethodsStruct
  SQLITE_OK: number; SQLITE_NOTFOUND: number; SQLITE_IOERR: number; SQLITE_TOOBIG: number
  SQLITE_READONLY: number; SQLITE_CANTOPEN: number; SQLITE_ERROR: number
  SQLITE_IOCAP_IMMUTABLE: number; SQLITE_FCNTL_SYNC: number; SQLITE_OPEN_READONLY: number
  sqlite3_busy_timeout(pDb: number, ms: number): number
  sqlite3_exec(pDb: number, sql: string[], cb: number, arg: number, errmsg: number): number
}
interface Wasm {
  allocCString(s: string): number
  poke(ptr: number, value: number | bigint, type: string): void
  cstrToJs(ptr: number): string
  cstrncpy(dest: number, src: number, n: number): number
  heap8u(): Uint8Array
}
interface Sqlite3Internal {
  capi: Capi
  wasm: Wasm
  vfs: { installVfs(opt: unknown): void }
  oo1: { DB: { dbCtorHelper: { setVfsPostOpenCallback(pVfs: number, cb: (pDb: number, sqlite3: Sqlite3Internal) => void): void } } }
}

function fetchRangeSync(url: string, headers: Record<string, string>, start: number, endInclusive: number): Uint8Array {
  const xhr = new XMLHttpRequest()
  xhr.open('GET', url, false) // synchronous — required: VFS xRead must be synchronous, and this only runs in a Worker
  for (const [h, v] of Object.entries(headers)) xhr.setRequestHeader(h, v)
  xhr.setRequestHeader('Range', `bytes=${start}-${endInclusive}`)
  xhr.responseType = 'arraybuffer'
  xhr.send()
  if (xhr.status !== 206 && xhr.status !== 200) throw new Error(`HTTP ${xhr.status} fetching ${url}`)
  if (!(xhr.response instanceof ArrayBuffer)) throw new Error(`Invalid HTTP response for ${url}`)
  return new Uint8Array(xhr.response)
}

/** Registers a read-only "http" VFS on `sqlite3`. Call once per worker before opening/attaching any file: URL. */
export function installHttpVfs(sqlite3: Sqlite3Static, options?: HttpVfsOptions): void {
  const opts = { ...DEFAULTS, ...options }
  const s3 = sqlite3 as unknown as Sqlite3Internal
  const capi = s3.capi
  const wasm = s3.wasm
  const openFiles = new Map<FileHandle, OpenFile>()
  // SQLite commonly probes xAccess and then opens the same immutable URL.
  // Share metadata/pages by URL so that sequence costs one HEAD rather than
  // two and reopening/reattaching does not throw away already fetched pages.
  const filesByUrl = new Map<string, OpenFile>()

  const httpVfs = new capi.sqlite3_vfs()
  const httpIoMethods = new capi.sqlite3_io_methods()

  httpVfs.$iVersion = 1
  httpVfs.$szOsFile = capi.sqlite3_file.structInfo.sizeof
  httpVfs.$mxPathname = 1024
  httpVfs.$zName = wasm.allocCString('http')
  httpVfs.$xDlOpen = httpVfs.$xDlError = httpVfs.$xDlSym = httpVfs.$xDlClose = null

  const ioMethods = {
    xCheckReservedLock(_fid: FileHandle, out: number): number {
      wasm.poke(out, 0, 'i32')
      return capi.SQLITE_OK
    },
    xClose(fid: FileHandle): number {
      if (!openFiles.has(fid)) return capi.SQLITE_NOTFOUND
      openFiles.delete(fid)
      return capi.SQLITE_OK
    },
    xDeviceCharacteristics(_fid: FileHandle): number {
      return capi.SQLITE_IOCAP_IMMUTABLE
    },
    xFileControl(_fid: FileHandle, op: number, _arg: number): number {
      return op === capi.SQLITE_FCNTL_SYNC ? capi.SQLITE_OK : capi.SQLITE_NOTFOUND
    },
    xFileSize(fid: FileHandle, out: number): number {
      const entry = openFiles.get(fid)
      if (!entry) return capi.SQLITE_NOTFOUND
      wasm.poke(out, entry.size, 'i64')
      return capi.SQLITE_OK
    },
    // These four intentionally keep their full C-signature arity (even though
    // the body ignores every parameter): installVfs generates each method's
    // WASM function-table entry from the JS function's declared arity, so an
    // under-declared parameter list produces a call_indirect signature
    // mismatch at the C call site — a real bug caught during Phase E testing.
    xLock(_fid: FileHandle, _lock: number): number { return capi.SQLITE_OK },
    xUnlock(_fid: FileHandle, _lock: number): number { return capi.SQLITE_OK },
    xSync(_fid: FileHandle, _flags: number): number { return capi.SQLITE_OK },
    xTruncate(_fid: FileHandle, _size: number): number { return capi.SQLITE_OK },
    xWrite(_fid: FileHandle, _src: number, _n: number, _offset: bigint): number { return capi.SQLITE_READONLY },
    // Mirrors the upstream cache-merging xRead: cache misses download either
    // one page, or — when the immediately preceding page is already cached —
    // a "super-page" double the size of the previous download, up to
    // maxPageSize-worth of merging. Halves round-trips for sequential scans
    // (e.g. FTS5 walking a b-tree) without any change to correctness.
    xRead(fid: FileHandle, dest: number, n: number, offsetBig: bigint): number {
      const entry = openFiles.get(fid)
      if (!entry) return capi.SQLITE_NOTFOUND
      const offset = Number(offsetBig)
      try {
        if (!entry.pageSize) {
          // Page size lives in 2 big-endian bytes at file offset 16 (SQLite file format).
          const header = fetchRangeSync(entry.url, opts.headers, 16, 17)
          let pageSize = (header[0] << 8) | header[1]
          if (pageSize === 1) pageSize = 65536 // per the file format spec
          if (pageSize > opts.maxPageSize) {
            throw new Error(`${entry.url}: page size ${pageSize} exceeds configured maximum ${opts.maxPageSize}`)
          }
          entry.pageSize = pageSize
        }

        const pageSize = BigInt(entry.pageSize)
        const len = BigInt(n)
        const page = offsetBig / pageSize
        let pageStart = page * pageSize
        if (pageStart + pageSize < offsetBig + len) {
          throw new Error(`Read ${offset}:${n} spans a page boundary (pageSize=${entry.pageSize})`)
        }

        let data = entry.cache.get(Number(page))
        if (typeof data === 'number') {
          // Points at the super-page holding this page's bytes.
          const superPage = data
          const superData = entry.cache.get(superPage)
          if (superData instanceof Uint8Array) {
            pageStart = BigInt(superPage) * pageSize
            data = superData
          } else {
            data = undefined
          }
        }

        if (data === undefined) {
          let chunkSize = entry.pageSize
          const prevRaw = Number(page) > 0 ? entry.cache.get(Number(page) - 1) : undefined
          const prev = typeof prevRaw === 'number' ? entry.cache.get(prevRaw) : prevRaw
          if (prev instanceof Uint8Array) {
            // Uncapped doubling (the upstream algorithm this is ported from
            // has the same characteristic) can snowball a long run of
            // sequential misses — common during the initial schema/index
            // probe on a cold cache — into a single request of hundreds of
            // MB, defeating the entire point of range-based access. Capped
            // here at maxMergeBytes; found via live measurement, not theory.
            chunkSize = Math.min(prev.byteLength * 2, opts.maxMergeBytes)
          }

          const pages = chunkSize / entry.pageSize
          data = fetchRangeSync(entry.url, opts.headers, Number(pageStart), Number(pageStart) + chunkSize - 1)
          entry.cache.set(Number(page), data)
          for (let i = Number(page) + 1; i < Number(page) + pages; i++) entry.cache.set(i, Number(page))
        }

        const pageOffset = Number(offsetBig - pageStart)
        wasm.heap8u().set(data.subarray(pageOffset, pageOffset + n), dest)
        return capi.SQLITE_OK
      } catch (e) {
        console.error(`http VFS: xRead failed for ${entry.url}`, e)
        return capi.SQLITE_IOERR
      }
    },
  }

  const vfsMethods = {
    xAccess(vfs: number, name: number, flags: number, out: number): number {
      if ((flags & capi.SQLITE_OPEN_READONLY) === 0) {
        wasm.poke(out, 0, 'i32')
        return capi.SQLITE_OK
      }
      const fid = Symbol()
      const r = vfsMethods.xOpen(vfs, name, fid, flags, out)
      if (r === capi.SQLITE_OK) {
        ioMethods.xClose(fid)
        wasm.poke(out, 1, 'i32')
      } else {
        wasm.poke(out, 0, 'i32')
      }
      return capi.SQLITE_OK
    },
    xCurrentTime(_vfs: number, out: number): number {
      wasm.poke(out, 2440587.5 + Date.now() / 86400000, 'double')
      return capi.SQLITE_OK
    },
    xCurrentTimeInt64(_vfs: number, out: number): number {
      wasm.poke(out, BigInt(Math.round(2440587.5 * 86400000)) + BigInt(Date.now()), 'i64')
      return capi.SQLITE_OK
    },
    xDelete(_vfs: number, _name: number, _syncDir: number): number { return capi.SQLITE_READONLY },
    xFullPathname(_vfs: number, name: number, nOut: number, pOut: number): number {
      const i = wasm.cstrncpy(pOut, name, nOut)
      return i < nOut ? capi.SQLITE_OK : capi.SQLITE_CANTOPEN
    },
    xGetLastError(_vfs: number, _nOut: number, _pOut: number): number { return capi.SQLITE_OK },
    xOpen(_vfs: number, name: number, fid: FileHandle, _flags: number, pOutFlags: number): number {
      if (name === 0 || typeof name !== 'number') {
        console.error('http VFS does not support anonymous files')
        return capi.SQLITE_CANTOPEN
      }
      const url = wasm.cstrToJs(name)
      try {
        let entry = filesByUrl.get(url)
        if (!entry) {
          const xhr = new XMLHttpRequest()
          xhr.open('HEAD', url, false)
          for (const [h, v] of Object.entries(opts.headers)) xhr.setRequestHeader(h, v)
          xhr.send()
          if (xhr.status < 200 || xhr.status >= 300) throw new Error(`HTTP ${xhr.status}`)
          if (xhr.getResponseHeader('Accept-Ranges') !== 'bytes') {
            console.warn(`http VFS: ${url} does not advertise 'Accept-Ranges: bytes' — Range requests may not work`)
          }
          entry = {
            url,
            size: BigInt(xhr.getResponseHeader('Content-Length') ?? '0'),
            pageSize: 0,
            cache: new LRUCache<number, Uint8Array | number>({
              maxSize: opts.cacheSize,
              sizeCalculation: (v) => (v instanceof Uint8Array ? v.byteLength : 8),
            }),
          }
          filesByUrl.set(url, entry)
        }
        // Critical: wires up the sqlite3_file struct SQLite already allocated
        // at `fid` so it knows which io_methods vtable to dispatch xRead/
        // xClose/etc through. Omitting this leaves pMethods null, so any
        // later call through this handle traps as "null function" — the bug
        // that took most of this debugging session to find.
        const sq3File = new capi.sqlite3_file(fid)
        sq3File.$pMethods = httpIoMethods.pointer
        openFiles.set(fid, entry)
      } catch (e) {
        console.error(`http VFS: xOpen failed for ${url}`, e)
        return capi.SQLITE_CANTOPEN
      }
      wasm.poke(pOutFlags, capi.SQLITE_OPEN_READONLY, 'i32')
      return capi.SQLITE_OK
    },
  }

  s3.vfs.installVfs({
    io: { struct: httpIoMethods, methods: ioMethods },
    vfs: { struct: httpVfs, methods: vfsMethods },
  })

  s3.oo1.DB.dbCtorHelper.setVfsPostOpenCallback(httpVfs.pointer, (pDb, inner) => {
    inner.capi.sqlite3_busy_timeout(pDb, opts.timeout)
    inner.capi.sqlite3_exec(pDb, ['PRAGMA journal_mode=DELETE;', 'PRAGMA cache_size=0;'], 0, 0, 0)
  })
}
