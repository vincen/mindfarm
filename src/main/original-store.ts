import { randomUUID } from 'node:crypto'
import { extensionForMime, isOriginalName } from '@shared/original'

/** Original bytes for documents that have not been saved yet, keyed by window id. */
const stores = new Map<number, Map<string, Uint8Array>>()

export function rememberOriginal(winId: number, mime: string, bytes: Uint8Array): string | null {
  const extension = extensionForMime(mime)
  if (!extension) return null
  const name = `${randomUUID()}.${extension}`
  let bucket = stores.get(winId)
  if (!bucket) {
    bucket = new Map()
    stores.set(winId, bucket)
  }
  bucket.set(name, bytes)
  return name
}

export function recallOriginal(winId: number, name: string): Uint8Array | undefined {
  if (!isOriginalName(name)) return undefined
  return stores.get(winId)?.get(name)
}

export function forgetOriginals(winId: number): void {
  stores.delete(winId)
}
