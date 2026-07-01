import type { DownloadProgress } from './types'

/**
 * Fetches a .db.gz URL, decompresses it, and returns the raw database bytes.
 * Calls onProgress throughout so the UI can show a progress bar.
 */
export async function downloadAndDecompress(
  url: string,
  lang: string,
  onProgress: (p: DownloadProgress) => void,
): Promise<ArrayBuffer> {
  onProgress({ lang, phase: 'downloading', downloadedBytes: 0, totalBytes: -1 })

  const response = await fetch(url)
  if (!response.ok) {
    const err = `HTTP ${response.status} fetching ${url}`
    onProgress({ lang, phase: 'error', downloadedBytes: 0, totalBytes: -1, error: err })
    throw new Error(err)
  }

  const totalBytes = Number(response.headers.get('content-length') ?? -1)
  const reader = response.body!.getReader()

  // Collect compressed chunks while reporting download progress
  const chunks: Uint8Array[] = []
  let downloadedBytes = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    downloadedBytes += value.byteLength
    onProgress({ lang, phase: 'downloading', downloadedBytes, totalBytes })
  }

  // Concatenate into one buffer
  const compressed = new Uint8Array(downloadedBytes)
  let offset = 0
  for (const chunk of chunks) {
    compressed.set(chunk, offset)
    offset += chunk.byteLength
  }

  onProgress({ lang, phase: 'decompressing', downloadedBytes, totalBytes })

  // Decompress with native DecompressionStream
  const ds = new DecompressionStream('gzip')
  const writer = ds.writable.getWriter()
  writer.write(compressed)
  writer.close()

  const decompressedChunks: Uint8Array[] = []
  const decompReader = ds.readable.getReader()
  while (true) {
    const { done, value } = await decompReader.read()
    if (done) break
    decompressedChunks.push(value)
  }

  const totalDecompressed = decompressedChunks.reduce((s, c) => s + c.byteLength, 0)
  const decompressed = new Uint8Array(totalDecompressed)
  offset = 0
  for (const chunk of decompressedChunks) {
    decompressed.set(chunk, offset)
    offset += chunk.byteLength
  }

  return decompressed.buffer
}
